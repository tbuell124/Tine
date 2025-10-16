#include "YinPitchDetector.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace tine::dsp {

namespace {
constexpr double MIN_THRESHOLD = 0.001;
constexpr double MAX_THRESHOLD = 0.999;

constexpr const char* NOTE_NAMES[] = {
    "C",  "C#", "D",  "D#", "E",  "F",
    "F#", "G",  "G#", "A",  "A#", "B",
};
constexpr std::size_t NOTE_NAMES_COUNT = sizeof(NOTE_NAMES) / sizeof(NOTE_NAMES[0]);

double clamp(double value, double min, double max) {
    return std::min(std::max(value, min), max);
}

}  // namespace

YinPitchDetector::YinPitchDetector(double sampleRate, std::size_t bufferSize, double threshold)
    : m_sampleRate(sampleRate),
      m_bufferSize(bufferSize),
      m_maxLag(bufferSize / 2),
      m_threshold(clamp(threshold, MIN_THRESHOLD, MAX_THRESHOLD)),
      m_difference(m_maxLag + 1, 0.0),
      m_cumulative(m_maxLag + 1, 0.0) {}

PitchResult YinPitchDetector::processBuffer(const float* samples, std::size_t numSamples) {
    PitchResult empty{};
    empty.isValid = false;

    if (!samples || numSamples < m_bufferSize || m_maxLag < 2 || m_sampleRate <= 0) {
        m_lastResult = empty;
        return m_lastResult;
    }

    computeDifference(samples);
    computeCumulativeMeanNormalized();

    double probability = 0.0;
    std::size_t tau = absoluteThreshold(probability);
    if (tau == 0) {
        m_lastResult = empty;
        return m_lastResult;
    }

    double refinedTau = static_cast<double>(tau);
    if (tau > 1 && tau < m_maxLag) {
        refinedTau = parabolicInterpolation(tau, m_cumulative);
    }

    if (refinedTau <= 0.0) {
        m_lastResult = empty;
        return m_lastResult;
    }

    const double frequency = m_sampleRate / refinedTau;
    if (!std::isfinite(frequency) || frequency <= 0.0) {
        m_lastResult = empty;
        return m_lastResult;
    }

    const double midi = midiFromFrequency(frequency);
    const double nearestMidi = std::round(midi);
    const double cents = (midi - nearestMidi) * 100.0;

    PitchResult result{};
    result.isValid = probability > 0.0;
    result.frequency = frequency;
    result.midi = midi;
    result.cents = cents;
    result.probability = clamp(probability, 0.0, 1.0);
    result.noteName = noteNameFromMidi(nearestMidi);

    m_lastResult = result;
    return m_lastResult;
}

void YinPitchDetector::setThreshold(double threshold) noexcept {
    m_threshold = clamp(threshold, MIN_THRESHOLD, MAX_THRESHOLD);
}

void YinPitchDetector::computeDifference(const float* samples) {
    std::fill(m_difference.begin(), m_difference.end(), 0.0);

    for (std::size_t tau = 1; tau <= m_maxLag; ++tau) {
        double sum = 0.0;
        for (std::size_t i = 0; i < m_bufferSize - tau; ++i) {
            const double delta = static_cast<double>(samples[i]) - static_cast<double>(samples[i + tau]);
            sum += delta * delta;
        }
        m_difference[tau] = sum;
    }

    m_difference[0] = 0.0;
}

void YinPitchDetector::computeCumulativeMeanNormalized() {
    m_cumulative[0] = 1.0;
    double runningSum = 0.0;

    for (std::size_t tau = 1; tau <= m_maxLag; ++tau) {
        runningSum += m_difference[tau];
        if (runningSum == 0.0) {
            m_cumulative[tau] = 1.0;
        } else {
            m_cumulative[tau] = (m_difference[tau] * static_cast<double>(tau)) / runningSum;
        }
    }
}

std::size_t YinPitchDetector::absoluteThreshold(double& probability) const {
    for (std::size_t tau = 2; tau < m_cumulative.size(); ++tau) {
        if (m_cumulative[tau] < m_threshold) {
            while (tau + 1 < m_cumulative.size() && m_cumulative[tau + 1] < m_cumulative[tau]) {
                ++tau;
            }
            probability = 1.0 - m_cumulative[tau];
            return tau;
        }
    }

    double minValue = std::numeric_limits<double>::infinity();
    std::size_t candidate = 0;

    for (std::size_t tau = 2; tau < m_cumulative.size(); ++tau) {
        if (m_cumulative[tau] < minValue) {
            minValue = m_cumulative[tau];
            candidate = tau;
        }
    }

    if (std::isfinite(minValue)) {
        probability = 1.0 - minValue;
    } else {
        probability = 0.0;
        candidate = 0;
    }

    return candidate;
}

double YinPitchDetector::parabolicInterpolation(std::size_t tau, const std::vector<double>& values) {
    if (tau == 0 || tau + 1 >= values.size()) {
        return static_cast<double>(tau);
    }

    const double x0 = static_cast<double>(tau - 1);
    const double x1 = static_cast<double>(tau);
    const double x2 = static_cast<double>(tau + 1);

    const double y0 = values[tau - 1];
    const double y1 = values[tau];
    const double y2 = values[tau + 1];

    const double denominator = (y0 - 2.0 * y1 + y2);
    if (std::fabs(denominator) < 1e-12) {
        return x1;
    }

    const double offset = (y0 - y2) / (2.0 * denominator);
    return x1 + offset;
}

double YinPitchDetector::midiFromFrequency(double frequency) {
    return 69.0 + 12.0 * std::log2(frequency / 440.0);
}

std::string YinPitchDetector::noteNameFromMidi(double midi) {
    const int midiInt = static_cast<int>(std::lround(midi));
    const int noteIndex = ((midiInt % 12) + 12) % 12;
    return NOTE_NAMES[noteIndex % static_cast<int>(NOTE_NAMES_COUNT)];
}

}  // namespace tine::dsp
