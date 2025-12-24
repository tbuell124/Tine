#import "PitchDetectorModule.h"

#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridge.h>
#import <React/RCTConvert.h>
#import <React/RCTLog.h>

#include <atomic>
#include <memory>
#include <vector>

#include "../../native/cpp/FloatRingBuffer.hpp"
#include "../../native/cpp/YinPitchDetector.hpp"

using tine::dsp::FloatRingBuffer;
using tine::dsp::PitchResult;
using tine::dsp::YinPitchDetector;

static const char *const kEventName = "onPitchData";
static const double kPreferredSampleRate = 48000.0;
static const double kPreferredIOBufferFrames = 256.0;
static const NSUInteger kDefaultBufferSize = 2048;
static const double kDefaultThreshold = 0.12;

@interface PitchDetectorModule ()

@property (nonatomic, strong) AVAudioEngine *engine;
@property (nonatomic, strong) AVAudioFormat *streamFormat;
@end

@implementation PitchDetectorModule {
  dispatch_queue_t _processingQueue;
  std::atomic<bool> _running;
  std::unique_ptr<FloatRingBuffer> _ringBuffer;
  std::unique_ptr<YinPitchDetector> _detector;
  std::vector<float> _scratchBuffer;
  double _sampleRate;
  NSUInteger _bufferSize;
  double _threshold;
  std::atomic<bool> _tapInstalled;
  dispatch_source_t _drainTimer;
}

RCT_EXPORT_MODULE(PitchDetector);

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (instancetype)init {
  if (self = [super init]) {
    _running.store(false);
    _tapInstalled.store(false);
    _processingQueue = dispatch_queue_create("com.tine.pitchdetector", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[ [NSString stringWithUTF8String:kEventName] ];
}

- (void)invalidate {
  [super invalidate];
  if (_running.load()) {
    [self stopInternal];
  }
}

RCT_REMAP_METHOD(start,
                 startWithOptions:(NSDictionary *)options
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  if (_running.load()) {
    resolve(@{
      @"sampleRate" : @(_sampleRate),
      @"bufferSize" : @(_bufferSize),
      @"threshold" : @(_threshold),
    });
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    AVAudioSession *session = [AVAudioSession sharedInstance];

    double preferredSampleRate = kPreferredSampleRate;
    NSNumber *bufferSizeValue = options[@"bufferSize"];
    NSNumber *thresholdValue = options[@"threshold"];
    NSNumber *sampleRateValue = options[@"sampleRate"];

    self->_bufferSize = bufferSizeValue != nil ? MAX(256, bufferSizeValue.unsignedIntegerValue)
                                               : kDefaultBufferSize;
    self->_threshold = thresholdValue != nil ? thresholdValue.doubleValue : kDefaultThreshold;
    if (sampleRateValue != nil && sampleRateValue.doubleValue > 0) {
      preferredSampleRate = MIN(MAX(sampleRateValue.doubleValue, 8000.0), 48000.0);
    }

    if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                 withOptions:AVAudioSessionCategoryOptionAllowBluetooth |
                             AVAudioSessionCategoryOptionDefaultToSpeaker
                       error:&error]) {
      reject(@"audio_session_error", @"Failed to set audio session category", error);
      return;
    }

    if (![session setMode:AVAudioSessionModeMeasurement error:&error]) {
      reject(@"audio_session_error", @"Failed to set audio session mode", error);
      return;
    }

    if (![session setPreferredSampleRate:preferredSampleRate error:&error]) {
      RCTLogWarn(@"[PitchDetector] Unable to set preferred sample rate: %@", error);
    }

    NSTimeInterval preferredDuration =
        (kPreferredIOBufferFrames / (preferredSampleRate > 0 ? preferredSampleRate : kPreferredSampleRate));
    if (![session setPreferredIOBufferDuration:preferredDuration error:&error]) {
      RCTLogWarn(@"[PitchDetector] Unable to set preferred IO buffer duration: %@", error);
    }

    if (![session setActive:YES error:&error]) {
      reject(@"audio_session_error", @"Failed to activate audio session", error);
      return;
    }

    self->_sampleRate = session.sampleRate;
    if (self->_sampleRate <= 0) {
      self->_sampleRate = kPreferredSampleRate;
    }

    [self configureEngineWithReject:reject resolve:resolve];
  });
}

- (void)configureEngineWithReject:(RCTPromiseRejectBlock)reject
                          resolve:(RCTPromiseResolveBlock)resolve {
  self.engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *inputNode = self.engine.inputNode;
  if (!inputNode) {
    reject(@"audio_input_missing", @"Input node unavailable on this device", nil);
    return;
  }

  AVAudioFormat *format =
      [[AVAudioFormat alloc] initStandardFormatWithSampleRate:_sampleRate channels:1];
  self.streamFormat = format;

  _ringBuffer = std::make_unique<FloatRingBuffer>(_bufferSize * 4);
  _detector = std::make_unique<YinPitchDetector>(_sampleRate, _bufferSize, _threshold);
  _scratchBuffer.assign(_bufferSize, 0.0f);

  __weak typeof(self) weakSelf = self;
  [inputNode removeTapOnBus:0];
  [inputNode installTapOnBus:0
                  bufferSize:512
                      format:format
                       block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
                         [weakSelf handleAudioBuffer:buffer];
                       }];

  NSError *error = nil;
  [self.engine prepare];
  if (![self.engine startAndReturnError:&error]) {
    [self teardownAudioSession];
    reject(@"engine_start_error", @"Failed to start AVAudioEngine", error);
    return;
  }

  _tapInstalled.store(true);
  [self startDrainTimer];
  _running.store(true);

  resolve(@{
    @"sampleRate" : @(_sampleRate),
    @"bufferSize" : @(_bufferSize),
    @"threshold" : @(_threshold),
  });
}

- (void)startDrainTimer {
  if (_drainTimer != nil) {
    dispatch_source_cancel(_drainTimer);
    _drainTimer = nil;
  }

  const double intervalSeconds = (double)_bufferSize / _sampleRate;
  const uint64_t intervalNanos = (uint64_t)(intervalSeconds * NSEC_PER_SEC);

  dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, _processingQueue);
  dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, intervalNanos), intervalNanos,
                            intervalNanos / 4);

  __weak typeof(self) weakSelf = self;
  dispatch_source_set_event_handler(timer, ^{
    [weakSelf drainAndProcess];
  });

  _drainTimer = timer;
  dispatch_resume(timer);
}

- (void)handleAudioBuffer:(AVAudioPCMBuffer *)buffer {
  if (!_ringBuffer) {
    return;
  }

  const AVAudioFrameCount frameLength = buffer.frameLength;
  if (frameLength == 0) {
    return;
  }

  const float *channel = buffer.floatChannelData[0];
  if (!channel) {
    return;
  }

  const std::size_t written = _ringBuffer->write(channel, frameLength);
  if (written < frameLength) {
    static std::atomic<bool> logOnce{false};
    bool alreadyLogged = logOnce.exchange(true);
    if (!alreadyLogged) {
      RCTLogWarn(@"[PitchDetector] Ring buffer overrun (dropped %u frames)", frameLength - written);
    }
  }
}

- (void)drainAndProcess {
  if (!_ringBuffer || !_detector || !_running.load()) {
    return;
  }

  const std::size_t framesRead = _ringBuffer->read(_scratchBuffer.data(), _bufferSize);
  if (framesRead < _bufferSize) {
    return;
  }

  PitchResult result = _detector->processBuffer(_scratchBuffer.data(), _bufferSize);
  [self emitResult:result];
}

- (void)emitResult:(const PitchResult &)result {
  NSString *noteName = nil;
  if (!result.noteName.empty()) {
    noteName = [NSString stringWithUTF8String:result.noteName.c_str()];
  }

  NSDictionary *payload = @{
    @"isValid" : @(result.isValid),
    @"frequency" : @(result.frequency),
    @"midi" : @(result.midi),
    @"cents" : @(result.cents),
    @"probability" : @(result.probability),
    @"noteName" : noteName ?: [NSNull null],
  };

  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:[NSString stringWithUTF8String:kEventName] body:payload];
  });
}

- (void)stopInternal {
  _running.store(false);

  if (_drainTimer != nil) {
    dispatch_source_cancel(_drainTimer);
    _drainTimer = nil;
  }

  if (_tapInstalled.load()) {
    AVAudioInputNode *inputNode = self.engine.inputNode;
    if (inputNode) {
      [inputNode removeTapOnBus:0];
    }
    _tapInstalled.store(false);
  }

  if (self.engine && self.engine.isRunning) {
    [self.engine stop];
  }

  [self teardownAudioSession];

  _ringBuffer.reset();
  _detector.reset();
  _scratchBuffer.clear();
}

- (void)teardownAudioSession {
  NSError *error = nil;
  AVAudioSession *session = [AVAudioSession sharedInstance];
  if ([session isOtherAudioPlaying]) {
    [session setCategory:AVAudioSessionCategoryAmbient error:nil];
  }
  [session setActive:NO
        withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
              error:&error];
  if (error) {
    RCTLogWarn(@"[PitchDetector] Failed to deactivate audio session: %@", error);
  }
}

RCT_REMAP_METHOD(stop,
                 stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  if (!_running.load()) {
    resolve(@(YES));
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopInternal];
    resolve(@(YES));
  });
}

RCT_EXPORT_METHOD(setThreshold:(double)threshold) {
  _threshold = threshold;
  if (_detector) {
    _detector->setThreshold(threshold);
  }
}

@end
