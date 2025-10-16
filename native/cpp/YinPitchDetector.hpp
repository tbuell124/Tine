#ifndef TINE_NATIVE_DSP_YINPITCHDETECTOR_HPP
#define TINE_NATIVE_DSP_YINPITCHDETECTOR_HPP

#include <cstddef>
#include <string>
#include <vector>

namespace tine::dsp {

struct PitchResult {
    bool isValid{false};
    double frequency{0.0};
    double midi{0.0};
    double cents{0.0};
    std::string noteName;
    double probability{0.0};
};

class YinPitchDetector {
public:
    YinPitchDetector(double sampleRate, std::size_t bufferSize, double threshold = 0.1);

    PitchResult processBuffer(const float* samples, std::size_t numSamples);

    [[nodiscard]] const PitchResult& getLastResult() const noexcept { return m_lastResult; }

    void setThreshold(double threshold) noexcept;

    [[nodiscard]] double getThreshold() const noexcept { return m_threshold; }

private:
    double m_sampleRate;
    std::size_t m_bufferSize;
    std::size_t m_maxLag;
    double m_threshold;

    std::vector<double> m_difference;
    std::vector<double> m_cumulative;

    PitchResult m_lastResult;

    void computeDifference(const float* samples);
    void computeCumulativeMeanNormalized();
    std::size_t absoluteThreshold(double& probability) const;
    static double parabolicInterpolation(std::size_t tau, const std::vector<double>& values);
    static double midiFromFrequency(double frequency);
    static std::string noteNameFromMidi(double midi);
};

}  // namespace tine::dsp

#endif  // TINE_NATIVE_DSP_YINPITCHDETECTOR_HPP
