#include "YinPitchDetector.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <sstream>

namespace tine::dsp {

namespace {
constexpr double kMinThreshold = 0.001;
constexpr double kMaxThreshold = 0.999;
}

YinPitchDetector::YinPitchDetector(double sampleRate, std::size_t bufferSize, double threshold)
    : m_sampleRate(sampleRate),
      m_bufferSize(bufferSize),
      m_maxLag(bufferSize / 2),
      m_threshold(std::clamp(threshold, kMinThreshold, kMaxThreshold)),
      m_difference(m_maxLag + 1, 0.0),
      m_cumulative(m_maxLag + 1, 1.0) {
    m_lastResult = {};
}

void YinPitchDetector::setThreshold(double threshold) noexcept {
    m_threshold = std::clamp(threshold, kMinThreshold, kMaxThreshold);
}

PitchResult YinPitchDetector::processBuffer(const float* samples, std::size_t numSamples) {
    PitchResult result;

    if (samples == nullptr || numSamples < m_bufferSize || m_maxLag < 2 || m_sampleRate <= 0.0) {
        m_lastResult = result;
        return m_lastResult;
    }

    computeDifference(samples);
    computeCumulativeMeanNormalized();

    double probability = 0.0;
    std::size_t tau = absoluteThreshold(probability);

    if (tau == 0) {
        m_lastResult = result;
        return m_lastResult;
    }

    double refinedTau = static_cast<double>(tau);
    if (tau > 1 && tau < m_maxLag) {
        refinedTau = parabolicInterpolation(tau, m_cumulative);
    }

    if (refinedTau <= 0.0) {
        m_lastResult = result;
        return m_lastResult;
    }

    const double frequency = m_sampleRate / refinedTau;
    if (!std::isfinite(frequency) || frequency <= 0.0) {
        m_lastResult = result;
        return m_lastResult;
    }

    const double midi = midiFromFrequency(frequency);
    const double nearestMidi = std::round(midi);
    const double cents = (midi - nearestMidi) * 100.0;

    result.isValid = probability > 0.0;
    result.frequency = frequency;
    result.midi = midi;
    result.cents = cents;
    result.noteName = noteNameFromMidi(nearestMidi);
    result.probability = std::clamp(probability, 0.0, 1.0);

    m_lastResult = result;
    return m_lastResult;
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
            m_cumulative[tau] = m_difference[tau] * static_cast<double>(tau) / runningSum;
        }
    }
}

std::size_t YinPitchDetector::absoluteThreshold(double& probability) const {
    std::size_t candidate = 0;
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
    if (tau == 0 || tau >= values.size() - 1) {
        return static_cast<double>(tau);
    }

    const double s0 = values[tau - 1];
    const double s1 = values[tau];
    const double s2 = values[tau + 1];

    const double denominator = (s0 + s2) - 2.0 * s1;
    if (denominator == 0.0) {
        return static_cast<double>(tau);
    }

    const double adjustment = 0.5 * (s0 - s2) / denominator;
    return static_cast<double>(tau) + adjustment;
}

double YinPitchDetector::midiFromFrequency(double frequency) {
    if (frequency <= 0.0) {
        return 0.0;
    }
    return 69.0 + 12.0 * std::log2(frequency / 440.0);
}

std::string YinPitchDetector::noteNameFromMidi(double midi) {
    if (!std::isfinite(midi)) {
        return {};
    }

    static constexpr std::array<const char*, 12> kNoteNames = {
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
    };

    const int roundedMidi = static_cast<int>(std::lround(midi));
    const int noteIndex = ((roundedMidi % 12) + 12) % 12;
    const int octave = (roundedMidi / 12) - 1;

    std::ostringstream oss;
    oss << kNoteNames[noteIndex] << octave;
    return oss.str();
}

} // namespace tine::dsp
