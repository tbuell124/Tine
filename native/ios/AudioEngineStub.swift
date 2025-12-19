// Placeholder stub for low-latency AVAudioSession + AVAudioEngine setup.
// Not wired into the build; copy into the native detector module when integrating.
// Configures playAndRecord, preferred sample rate, and IO buffer duration.

import AVFoundation

enum AudioEngineStub {
  static func configureSession(
    sampleRate: Double = 44_100,
    ioBufferDuration: TimeInterval = 0.008
  ) throws {
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker])
    try session.setPreferredSampleRate(sampleRate)
    try session.setPreferredIOBufferDuration(ioBufferDuration)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
  }

  static func makeEngine(sampleRate: Double = 44_100, ioBufferDuration: TimeInterval = 0.008) throws -> AVAudioEngine {
    try configureSession(sampleRate: sampleRate, ioBufferDuration: ioBufferDuration)

    let engine = AVAudioEngine()
    let input = engine.inputNode
    let format = input.inputFormat(forBus: 0)

    input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, time in
      // TODO: forward buffer.floatChannelData to YIN/FFT-YIN/HPS estimator.
      _ = time
      _ = buffer
    }

    try engine.start()
    return engine
  }
}
