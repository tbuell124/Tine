// Placeholder stub for low-latency AudioRecord setup.
// This file is not wired into the build; copy the core into the native module
// when integrating the detector. Targets: PERFORMANCE_MODE_LOW_LATENCY,
// minimal buffer size, and mono 16-bit PCM.

package com.tine.tuner.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build

object AudioRecordStub {
    data class Config(
        val sampleRate: Int = 44_100,
        val channelConfig: Int = AudioFormat.CHANNEL_IN_MONO,
        val audioFormat: Int = AudioFormat.ENCODING_PCM_16BIT
    )

    fun buildLowLatency(config: Config = Config()): AudioRecord {
        val minBuffer = AudioRecord.getMinBufferSize(
            config.sampleRate,
            config.channelConfig,
            config.audioFormat
        )
        val bufferSize = if (minBuffer > 0) minBuffer else config.sampleRate / 10

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.UNPROCESSED)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(config.audioFormat)
                        .setSampleRate(config.sampleRate)
                        .setChannelMask(config.channelConfig)
                        .build()
                )
                .setBufferSizeInBytes(bufferSize)
        } else {
            // Fallback for older devices.
            return AudioRecord(
                MediaRecorder.AudioSource.DEFAULT,
                config.sampleRate,
                config.channelConfig,
                config.audioFormat,
                bufferSize
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setPerformanceMode(AudioRecord.PERFORMANCE_MODE_LOW_LATENCY)
                .setAudioPlaybackCaptureConfig(
                    AudioRecord.Builder()
                        .build()
                        .captureConfig
                )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build()
            )
        }

        return builder.build()
    }
}
