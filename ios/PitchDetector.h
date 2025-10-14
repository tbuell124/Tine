#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTTurboModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * @brief Native TurboModule that streams microphone audio through the YIN pitch
 * detector and emits pitch events to JavaScript.
 */
@interface PitchDetector : RCTEventEmitter <RCTTurboModule>

/**
 * @brief Start capturing microphone audio and emitting pitch events.
 * @param options Dictionary containing optional tuning parameters such as
 *        `bufferSize` (analysis window in frames) and `threshold` (YIN
 *        confidence gate).
 * @param resolve Promise resolver invoked when the detector is running.
 * @param reject Promise rejecter invoked when startup fails.
 */
- (void)start:(NSDictionary *)options
     resolver:(RCTPromiseResolveBlock)resolve
     rejecter:(RCTPromiseRejectBlock)reject;

/**
 * @brief Stop the detector and tear down the audio graph.
 * @param resolve Promise resolver invoked once the detector has stopped.
 * @param reject Promise rejecter invoked when teardown fails.
 */
- (void)stop:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject;

/**
 * @brief Update the YIN probability threshold at runtime.
 * @param threshold Value between 0.0 and 1.0.
 */
- (void)setThreshold:(NSNumber *)threshold;

@end

NS_ASSUME_NONNULL_END
