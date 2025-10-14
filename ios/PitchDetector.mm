#import "PitchDetector.h"

#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridge.h>
#import <React/RCTLog.h>
#import <React/RCTUtils.h>
#import <ReactCommon/TurboModuleUtils.h>

#include <algorithm>
#include <mutex>
#include <vector>

#import "../src/native/dsp/YinPitchDetector.h"

using namespace tine::dsp;

static NSString *const kPitchEventName = @"onPitchData";
static const double kDefaultThreshold = 0.15;
static const AVAudioFrameCount kDefaultBufferSize = 2048;

@interface PitchDetector () {
    AVAudioEngine *_audioEngine;
    AVAudioFormat *_processingFormat;
    dispatch_queue_t _processingQueue;
    std::unique_ptr<YinPitchDetector> _detector;
    std::vector<float> _sampleAccumulator;
    std::mutex _stateMutex;
    AVAudioFrameCount _analysisFrameCount;
    AVAudioFrameCount _hopFrameCount;
    double _sampleRate;
    double _threshold;
    BOOL _hasListeners;
    BOOL _isRunning;
}
@end

@implementation PitchDetector

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (instancetype)init
{
    if (self = [super init]) {
        _processingQueue = dispatch_queue_create("com.tine.pitch.detector", DISPATCH_QUEUE_SERIAL);
        _analysisFrameCount = kDefaultBufferSize;
        _hopFrameCount = kDefaultBufferSize / 2;
        _sampleRate = 48000.0;
        _threshold = kDefaultThreshold;
        _hasListeners = NO;
        _isRunning = NO;
    }
    return self;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[kPitchEventName];
}

- (void)startObserving
{
    _hasListeners = YES;
}

- (void)stopObserving
{
    _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::ObjCTurboModule>(params);
}

- (void)invalidate
{
    [self stopInternal];
    [super invalidate];
}

#pragma mark - Exported API

RCT_EXPORT_METHOD(start:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    if (resolve == nil || reject == nil) {
        return;
    }

    dispatch_async(_processingQueue, ^{
        if (self->_isRunning) {
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(@{ "sampleRate": @(self->_sampleRate),
                           "bufferSize": @(self->_analysisFrameCount) });
            });
            return;
        }

        NSNumber *bufferSizeValue = options[@"bufferSize"];
        NSNumber *thresholdValue = options[@"threshold"];

        AVAudioFrameCount requestedBufferSize = bufferSizeValue != nil ? (AVAudioFrameCount)bufferSizeValue.unsignedIntValue : kDefaultBufferSize;
        requestedBufferSize = std::max<AVAudioFrameCount>(256, requestedBufferSize);
        double requestedThreshold = thresholdValue != nil ? thresholdValue.doubleValue : kDefaultThreshold;
        requestedThreshold = std::clamp(requestedThreshold, 0.001, 0.999);

        NSError *sessionError = nil;
        if (![self configureAudioSession:&sessionError preferredBufferSize:requestedBufferSize]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"E_AUDIO_SESSION", sessionError.localizedDescription ?: @"Failed to configure audio session", sessionError);
            });
            return;
        }

        NSError *engineError = nil;
        if (![self startEngineWithBufferSize:requestedBufferSize threshold:requestedThreshold error:&engineError]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"E_AUDIO_ENGINE", engineError.localizedDescription ?: @"Failed to start audio engine", engineError);
            });
            return;
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            resolve(@{ "sampleRate": @(self->_sampleRate),
                       "bufferSize": @(self->_analysisFrameCount),
                       "threshold": @(self->_threshold) });
        });
    });
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(_processingQueue, ^{
        if (!self->_isRunning) {
            if (resolve) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    resolve(@(NO));
                });
            }
            return;
        }

        [self stopInternal];

        if (resolve) {
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(@(YES));
            });
        }
    });
}

RCT_EXPORT_METHOD(setThreshold:(NSNumber *)thresholdValue)
{
    if (thresholdValue == nil) {
        return;
    }

    const double clamped = std::clamp(thresholdValue.doubleValue, 0.001, 0.999);

    dispatch_async(_processingQueue, ^{
        self->_threshold = clamped;
        if (self->_detector) {
            self->_detector->setThreshold(clamped);
        }
    });
}

#pragma mark - Audio lifecycle

- (BOOL)configureAudioSession:(NSError **)outError preferredBufferSize:(AVAudioFrameCount)bufferSize
{
    AVAudioSession *session = [AVAudioSession sharedInstance];

    if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                   withOptions:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionMixWithOthers
                         error:outError]) {
        return NO;
    }

    if (![session setMode:AVAudioSessionModeMeasurement error:outError]) {
        return NO;
    }

    const double preferredSampleRate = 48000.0;
    if (![session setPreferredSampleRate:preferredSampleRate error:outError]) {
        return NO;
    }

    const double preferredDuration = (double)bufferSize / preferredSampleRate;
    if (![session setPreferredIOBufferDuration:preferredDuration error:outError]) {
        return NO;
    }

    if (![session setActive:YES error:outError]) {
        return NO;
    }

    _sampleRate = session.sampleRate;
    if (_sampleRate <= 0.0) {
        _sampleRate = preferredSampleRate;
    }

    return YES;
}

- (BOOL)startEngineWithBufferSize:(AVAudioFrameCount)bufferSize
                        threshold:(double)threshold
                             error:(NSError **)outError
{
    _audioEngine = [[AVAudioEngine alloc] init];
    AVAudioInputNode *inputNode = _audioEngine.inputNode;
    if (inputNode == nil) {
        if (outError) {
            *outError = [NSError errorWithDomain:@"PitchDetector" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"Input node unavailable"}];
        }
        return NO;
    }

    _analysisFrameCount = bufferSize;
    _hopFrameCount = std::max<AVAudioFrameCount>(1, bufferSize / 2);
    _threshold = threshold;
    _sampleAccumulator.clear();
    _sampleAccumulator.reserve(bufferSize * 2);

    _processingFormat = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32
                                                          sampleRate:_sampleRate
                                                            channels:1
                                                         interleaved:NO];
    if (_processingFormat == nil) {
        if (outError) {
            *outError = [NSError errorWithDomain:@"PitchDetector" code:-2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to create processing format"}];
        }
        return NO;
    }

    _detector = std::make_unique<YinPitchDetector>(_sampleRate, _analysisFrameCount, _threshold);

    __weak typeof(self) weakSelf = self;
    [inputNode removeTapOnBus:0];
    if ([inputNode respondsToSelector:@selector(setVoiceProcessingEnabled:error:)]) {
        [inputNode setVoiceProcessingEnabled:NO error:nil];
    }
    [inputNode installTapOnBus:0
                     bufferSize:_analysisFrameCount
                         format:_processingFormat
                          block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
        [weakSelf handleAudioBuffer:buffer];
    }];

    [_audioEngine prepare];
    if (![_audioEngine startAndReturnError:outError]) {
        [inputNode removeTapOnBus:0];
        _detector.reset();
        _audioEngine = nil;
        return NO;
    }

    _isRunning = YES;
    return YES;
}

- (void)stopInternal
{
    if (!_isRunning) {
        return;
    }

    if (_audioEngine != nil) {
        AVAudioInputNode *inputNode = _audioEngine.inputNode;
        if (inputNode != nil) {
            [inputNode removeTapOnBus:0];
        }
        [_audioEngine stop];
        [_audioEngine reset];
        _audioEngine = nil;
    }

    _detector.reset();

    {
        std::lock_guard<std::mutex> lock(_stateMutex);
        _sampleAccumulator.clear();
    }

    [[AVAudioSession sharedInstance] setActive:NO
                                   withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation
                                         error:nil];

    _isRunning = NO;
}

- (void)handleAudioBuffer:(AVAudioPCMBuffer *)buffer
{
    if (!_detector || !_hasListeners) {
        return;
    }

    const AVAudioFrameCount frameLength = buffer.frameLength;
    if (frameLength == 0) {
        return;
    }

    const float *channelData = buffer.floatChannelData[0];
    if (channelData == nullptr) {
        return;
    }

    std::vector<PitchResult> results;
    results.reserve(2);

    {
        std::lock_guard<std::mutex> lock(_stateMutex);
        _sampleAccumulator.insert(_sampleAccumulator.end(), channelData, channelData + frameLength);

        while (_sampleAccumulator.size() >= _analysisFrameCount) {
            PitchResult result = _detector->processBuffer(_sampleAccumulator.data(), _analysisFrameCount);
            results.push_back(result);

            const std::size_t hop = static_cast<std::size_t>(_hopFrameCount);
            if (hop >= _sampleAccumulator.size()) {
                _sampleAccumulator.clear();
                break;
            }
            _sampleAccumulator.erase(_sampleAccumulator.begin(), _sampleAccumulator.begin() + hop);
        }
    }

    if (results.empty()) {
        return;
    }

    for (const PitchResult &result : results) {
        NSMutableDictionary *payload = [NSMutableDictionary dictionaryWithCapacity:6];
        payload[@"isValid"] = @(result.isValid);
        payload[@"frequency"] = @(result.frequency);
        payload[@"midi"] = @(result.midi);
        payload[@"cents"] = @(result.cents);
        payload[@"probability"] = @(result.probability);
        if (!result.noteName.empty()) {
            payload[@"noteName"] = [NSString stringWithUTF8String:result.noteName.c_str()];
        } else {
            payload[@"noteName"] = @"";
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            if (self->_hasListeners) {
                [self sendEventWithName:kPitchEventName body:payload];
            }
        });
    }
}

@end
