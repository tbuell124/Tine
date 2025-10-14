#include <jni.h>
#include <android/log.h>
#include <oboe/Oboe.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "../../../../src/native/dsp/YinPitchDetector.h"

#define LOG_TAG "PitchDetector"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

using tine::dsp::PitchResult;
using tine::dsp::YinPitchDetector;

namespace {

JavaVM* g_vm = nullptr;

class PitchDetector : public oboe::AudioStreamCallback {
public:
    PitchDetector(JNIEnv* env, jobject dispatcher)
        : m_dispatcher(env->NewGlobalRef(dispatcher)) {
        if (m_dispatcher == nullptr) {
            throw std::runtime_error("Failed to create global ref for dispatcher");
        }
        jclass clazz = env->GetObjectClass(dispatcher);
        m_emitMethod = env->GetMethodID(
            clazz,
            "emitPitchEvent",
            "(ZDDDDLjava/lang/String;)V");
        env->DeleteLocalRef(clazz);
        if (m_emitMethod == nullptr) {
            throw std::runtime_error("Dispatcher missing emitPitchEvent method");
        }
        m_accumulator.resize(m_analysisFrameCount);
    }

    ~PitchDetector() override {
        stop();
        if (m_dispatcher != nullptr) {
            JNIEnv* env = nullptr;
            if (g_vm != nullptr && g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_OK) {
                env->DeleteGlobalRef(m_dispatcher);
            }
        }
    }

    bool start(int32_t bufferSize, double threshold) {
        std::lock_guard<std::mutex> lock(m_stateMutex);
        if (m_running.load()) {
            return true;
        }

        m_analysisFrameCount = std::max<int32_t>(256, bufferSize);
        m_hopFrameCount = std::max<int32_t>(m_analysisFrameCount / 2, 1);
        m_threshold = std::clamp(threshold, 0.001, 0.999);

        oboe::AudioStreamBuilder builder;
        builder.setDirection(oboe::Direction::Input)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setInputPreset(oboe::InputPreset::VoicePerformance)
            ->setChannelCount(1)
            ->setSampleRate(48000)
            ->setFormat(oboe::AudioFormat::Float)
            ->setCallback(this)
            ->setFramesPerCallback(m_hopFrameCount);

        oboe::Result result = builder.openStream(m_stream);
        if (result != oboe::Result::OK || m_stream == nullptr) {
            LOGE("Failed to open input stream: %s", oboe::convertToText(result));
            m_stream.reset();
            return false;
        }

        m_sampleRate = static_cast<double>(m_stream->getSampleRate());
        m_detector = std::make_unique<YinPitchDetector>(m_sampleRate, static_cast<std::size_t>(m_analysisFrameCount), m_threshold);
        m_accumulator.assign(static_cast<std::size_t>(m_analysisFrameCount), 0.0f);
        m_accumulatorSize = 0;

        result = m_stream->requestStart();
        if (result != oboe::Result::OK) {
            LOGE("Failed to start stream: %s", oboe::convertToText(result));
            m_stream->close();
            m_stream.reset();
            return false;
        }

        m_running.store(true);
        LOGI("Pitch detector started at %.2f Hz, buffer %d", m_sampleRate, m_analysisFrameCount);
        return true;
    }

    bool stop() {
        std::lock_guard<std::mutex> lock(m_stateMutex);
        if (!m_running.exchange(false)) {
            return false;
        }

        if (m_stream) {
            m_stream->requestStop();
            m_stream->close();
            m_stream.reset();
        }
        m_detector.reset();
        m_accumulatorSize = 0;
        return true;
    }

    void setThreshold(double threshold) {
        const double clamped = std::clamp(threshold, 0.001, 0.999);
        m_threshold = clamped;
        if (m_detector) {
            m_detector->setThreshold(clamped);
        }
    }

    double sampleRate() const noexcept { return m_sampleRate; }
    int32_t bufferSize() const noexcept { return m_analysisFrameCount; }
    double threshold() const noexcept { return m_threshold; }

    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream* /*stream*/,
        void* audioData,
        int32_t numFrames) override {
        if (!m_running.load()) {
            return oboe::DataCallbackResult::Stop;
        }

        const float* input = static_cast<const float*>(audioData);
        int32_t framesRemaining = numFrames;
        while (framesRemaining > 0) {
            const int32_t space = m_analysisFrameCount - m_accumulatorSize;
            const int32_t framesToCopy = std::min(space, framesRemaining);
            if (framesToCopy > 0) {
                std::memcpy(
                    m_accumulator.data() + m_accumulatorSize,
                    input,
                    static_cast<std::size_t>(framesToCopy) * sizeof(float));
                m_accumulatorSize += framesToCopy;
                input += framesToCopy;
                framesRemaining -= framesToCopy;
            }

            if (m_accumulatorSize >= m_analysisFrameCount && m_detector) {
                const PitchResult result = m_detector->processBuffer(
                    m_accumulator.data(),
                    static_cast<std::size_t>(m_analysisFrameCount));
                emitPitchResult(result);

                if (m_hopFrameCount < m_analysisFrameCount) {
                    const int32_t remaining = m_analysisFrameCount - m_hopFrameCount;
                    if (remaining > 0) {
                        std::memmove(
                            m_accumulator.data(),
                            m_accumulator.data() + m_hopFrameCount,
                            static_cast<std::size_t>(remaining) * sizeof(float));
                    }
                    m_accumulatorSize = remaining;
                } else {
                    m_accumulatorSize = 0;
                }
            } else {
                break;
            }
        }

        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(oboe::AudioStream* /*stream*/, oboe::Result error) override {
        LOGE("Stream error after close: %s", oboe::convertToText(error));
        m_running.store(false);
    }

private:
    void emitPitchResult(const PitchResult& result) {
        if (m_dispatcher == nullptr || g_vm == nullptr) {
            return;
        }

        JNIEnv* env = nullptr;
        bool didAttach = false;
        if (g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
            if (g_vm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
                LOGE("Failed to attach audio thread to JVM");
                return;
            }
            didAttach = true;
        }

        jstring noteName = env->NewStringUTF(result.noteName.c_str());
        env->CallVoidMethod(
            m_dispatcher,
            m_emitMethod,
            static_cast<jboolean>(result.isValid),
            static_cast<jdouble>(result.frequency),
            static_cast<jdouble>(result.midi),
            static_cast<jdouble>(result.cents),
            static_cast<jdouble>(result.probability),
            noteName);
        if (env->ExceptionCheck()) {
            env->ExceptionDescribe();
            env->ExceptionClear();
        }
        env->DeleteLocalRef(noteName);

        if (didAttach) {
            g_vm->DetachCurrentThread();
        }
    }

    std::mutex m_stateMutex;
    std::shared_ptr<oboe::AudioStream> m_stream;
    std::unique_ptr<YinPitchDetector> m_detector;
    std::vector<float> m_accumulator;
    int32_t m_accumulatorSize {0};
    int32_t m_analysisFrameCount {2048};
    int32_t m_hopFrameCount {1024};
    double m_sampleRate {48000.0};
    double m_threshold {0.15};
    std::atomic<bool> m_running {false};

    jobject m_dispatcher {nullptr};
    jmethodID m_emitMethod {nullptr};
};

PitchDetector* fromHandle(jlong handle) {
    return reinterpret_cast<PitchDetector*>(handle);
}

} // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeCreate(
    JNIEnv* env,
    jobject /*thiz*/,
    jobject dispatcher) {
    if (dispatcher == nullptr) {
        return 0;
    }

    try {
        auto* detector = new PitchDetector(env, dispatcher);
        return reinterpret_cast<jlong>(detector);
    } catch (const std::exception& ex) {
        LOGE("nativeCreate exception: %s", ex.what());
        return 0;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeDestroy(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle) {
    auto* detector = fromHandle(handle);
    delete detector;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeStart(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jint bufferSize,
    jdouble threshold) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return JNI_FALSE;
    }
    return detector->start(bufferSize, threshold) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeStop(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return JNI_FALSE;
    }
    return detector->stop() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeSetThreshold(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jdouble threshold) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return;
    }
    detector->setThreshold(threshold);
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeGetSampleRate(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return 0.0;
    }
    return detector->sampleRate();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeGetBufferSize(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return 0;
    }
    return detector->bufferSize();
}

extern "C" JNIEXPORT jdouble JNICALL
Java_com_tine_pitchdetector_PitchDetectorModule_nativeGetThreshold(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle) {
    auto* detector = fromHandle(handle);
    if (detector == nullptr) {
        return 0.0;
    }
    return detector->threshold();
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
    g_vm = vm;
    return JNI_VERSION_1_6;
}
