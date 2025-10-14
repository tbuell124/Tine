package com.tine.pitchdetector

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import java.util.concurrent.atomic.AtomicBoolean

/**
 * React Native module that bridges microphone pitch detection to JavaScript.
 *
 * The heavy lifting is done by the native C++ implementation located in
 * `android/app/src/main/cpp/PitchDetector.cpp`. The module exposes a simple API
 * to start/stop analysis and to tweak the YIN probability threshold at runtime.
 */
@ReactModule(name = PitchDetectorModule.NAME)
class PitchDetectorModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener, TurboModule {

    private val hasListeners = AtomicBoolean(false)
    private val eventDispatcher = object : PitchEventDispatcher {
        override fun emitPitchEvent(
            isValid: Boolean,
            frequency: Double,
            midi: Double,
            cents: Double,
            probability: Double,
            noteName: String,
        ) {
            if (!hasListeners.get()) {
                return
            }

            val map = Arguments.createMap().apply {
                putBoolean("isValid", isValid)
                putDouble("frequency", frequency)
                putDouble("midi", midi)
                putDouble("cents", cents)
                putDouble("probability", probability)
                putString("noteName", noteName)
            }

            reactApplicationContext
                .getJSModule(RCTDeviceEventEmitter::class.java)
                .emit(EVENT_NAME, map)
        }
    }

    private var nativeHandle: Long = 0L

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        ensureLibraryLoaded()
    }

    override fun onCatalystInstanceDestroy() {
        stopInternal()
        if (nativeHandle != 0L) {
            nativeDestroy(nativeHandle)
            nativeHandle = 0L
        }
        reactApplicationContext.removeLifecycleEventListener(this)
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod
    fun start(options: com.facebook.react.bridge.ReadableMap?, promise: Promise) {
        ensureLibraryLoaded()
        if (nativeHandle == 0L) {
            nativeHandle = nativeCreate(eventDispatcher)
            if (nativeHandle == 0L) {
                promise.reject("E_NATIVE_ALLOC", "Failed to allocate native detector")
                return
            }
        }

        val bufferSize = options?.getInt("bufferSize") ?: DEFAULT_BUFFER_SIZE
        val threshold = options?.getDouble("threshold") ?: DEFAULT_THRESHOLD

        val clampedThreshold = threshold.coerceIn(0.001, 0.999)
        val started = nativeStart(nativeHandle, bufferSize.coerceAtLeast(256), clampedThreshold)
        if (!started) {
            promise.reject("E_AUDIO_START", "Failed to start microphone stream")
            return
        }

        val result = Arguments.createMap().apply {
            putDouble("sampleRate", nativeGetSampleRate(nativeHandle))
            putInt("bufferSize", nativeGetBufferSize(nativeHandle))
            putDouble("threshold", nativeGetThreshold(nativeHandle))
        }

        promise.resolve(result)
    }

    @ReactMethod
    fun stop(promise: Promise) {
        val stopped = stopInternal()
        promise.resolve(stopped)
    }

    @ReactMethod
    fun setThreshold(threshold: Double) {
        if (nativeHandle == 0L) {
            return
        }
        nativeSetThreshold(nativeHandle, threshold.coerceIn(0.001, 0.999))
    }

    @ReactMethod
    fun addListener(eventName: String) {
        if (eventName == EVENT_NAME) {
            hasListeners.set(true)
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        if (count <= 0) {
            return
        }
        hasListeners.set(false)
    }

    override fun onHostResume() {
        // No-op. Clients control start/stop explicitly.
    }

    override fun onHostPause() {
        // Stop streaming to release the microphone when the app is backgrounded.
        stopInternal()
    }

    override fun onHostDestroy() {
        stopInternal()
    }

    private fun stopInternal(): Boolean {
        if (nativeHandle == 0L) {
            return false
        }
        val stopped = nativeStop(nativeHandle)
        return stopped
    }

    companion object {
        const val NAME = "PitchDetector"
        private const val EVENT_NAME = "onPitchData"
        private const val DEFAULT_BUFFER_SIZE = 2048
        private const val DEFAULT_THRESHOLD = 0.15

        @Volatile
        private var libraryLoaded = false

        private fun ensureLibraryLoaded() {
            if (!libraryLoaded) {
                synchronized(PitchDetectorModule::class.java) {
                    if (!libraryLoaded) {
                        System.loadLibrary("pitchdetector")
                        libraryLoaded = true
                    }
                }
            }
        }
    }

    private external fun nativeCreate(dispatcher: PitchEventDispatcher): Long
    private external fun nativeDestroy(handle: Long)
    private external fun nativeStart(handle: Long, bufferSize: Int, threshold: Double): Boolean
    private external fun nativeStop(handle: Long): Boolean
    private external fun nativeSetThreshold(handle: Long, threshold: Double)
    private external fun nativeGetSampleRate(handle: Long): Double
    private external fun nativeGetBufferSize(handle: Long): Int
    private external fun nativeGetThreshold(handle: Long): Double
}
