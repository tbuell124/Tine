package com.tine.pitchdetector

/**
 * Interface implemented in Kotlin to receive pitch events emitted from the
 * native C++ layer via JNI. The native layer invokes [emitPitchEvent] on the
 * audio processing thread whenever a new analysis result is available.
 */
internal interface PitchEventDispatcher {
    /**
     * Forward the latest pitch detection result to JavaScript.
     *
     * @param isValid True if the estimated pitch passed the YIN probability gate.
     * @param frequency Estimated fundamental frequency in Hertz.
     * @param midi Pitch converted to a MIDI note number.
     * @param cents Cent deviation from the nearest equal tempered note.
     * @param probability YIN periodicity probability in the range [0, 1].
     * @param noteName Friendly string representation of the nearest musical note.
     */
    fun emitPitchEvent(
        isValid: Boolean,
        frequency: Double,
        midi: Double,
        cents: Double,
        probability: Double,
        noteName: String,
    )
}
