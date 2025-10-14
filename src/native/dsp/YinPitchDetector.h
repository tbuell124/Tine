#ifndef TINE_NATIVE_DSP_YINPITCHDETECTOR_H
#define TINE_NATIVE_DSP_YINPITCHDETECTOR_H

#include <cstddef>
#include <string>
#include <vector>

namespace tine::dsp {

/**
 * @brief Result structure returned by the YIN pitch detector.
 */
struct PitchResult {
    bool isValid {false};          ///< True if the detector found a stable pitch.
    double frequency {0.0};        ///< Estimated fundamental frequency in Hertz.
    double midi {0.0};             ///< Pitch translated to MIDI note number.
    double cents {0.0};            ///< Cents offset from the nearest equal tempered note.
    std::string noteName;          ///< Friendly name of the nearest musical note.
    double probability {0.0};      ///< YIN aperiodicity probability estimate (1 - CMND value).
};

/**
 * @brief YIN based pitch detector implementation.
 *
 * This class implements the YIN algorithm as described on pitchdetect.org,
 * including the squared difference function, cumulative mean normalized
 * difference (CMND), and parabolic interpolation to refine the detected lag.
 */
class YinPitchDetector {
public:
    /**
     * @brief Construct a new YIN pitch detector.
     * @param sampleRate Sampling rate of the audio stream in Hertz.
     * @param bufferSize Number of samples processed in a single analysis window.
     * @param threshold Probability threshold (commonly ~0.1) used to decide
     *        whether a pitch candidate is considered reliable.
     */
    YinPitchDetector(double sampleRate, std::size_t bufferSize, double threshold = 0.1);

    /**
     * @brief Feed a buffer of audio samples into the detector.
     *
     * The buffer must contain @p bufferSize samples provided during
     * construction. The samples are expected to be normalized floating point
     * values in the range [-1.0, 1.0].
     *
     * @param samples Pointer to the first audio sample.
     * @param numSamples Number of samples available in @p samples.
     * @return PitchResult containing the latest pitch estimation. The result
     *         will have `isValid == false` when no reliable pitch is found.
     */
    PitchResult processBuffer(const float* samples, std::size_t numSamples);

    /**
     * @return The most recent pitch detection result.
     */
    [[nodiscard]] const PitchResult& getLastResult() const noexcept { return m_lastResult; }

    /**
     * @brief Update the detection threshold.
     */
    void setThreshold(double threshold) noexcept;

    /**
     * @return Current detection threshold.
     */
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

} // namespace tine::dsp

#endif // TINE_NATIVE_DSP_YINPITCHDETECTOR_H
