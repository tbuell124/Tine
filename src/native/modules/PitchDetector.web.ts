import { YinPitchDetector } from '@native/dsp/YinPitchDetector';
import { midiToNoteName } from '@utils/music';
import { PitchSmoother } from '@utils/yinSmoothing';

import type { PitchEvent, StartOptions, StartResult } from './specs/pitchTypes';
import { getWebWorkletDataUrl, getWebWorkletUrl } from './web/workletUrl';

type Listener = (event: PitchEvent) => void;

type Subscription = {
  remove: () => void;
};

const webListeners = new Set<Listener>();
const webSmoother = new PitchSmoother(15, 0.15);
let webThreshold = 0.12;

const toPitchEvent = (
  frequency: number | null,
  confidence: number,
  timestamp: number,
  levelDb?: number | null,
): PitchEvent => {
  if (!frequency || frequency <= 0 || confidence <= 0) {
    return {
      isValid: false,
      frequency: 0,
      midi: NaN,
      cents: 0,
      probability: confidence,
      noteName: '',
      levelDb: Number.isFinite(levelDb) ? (levelDb as number) : undefined,
      timestamp,
    };
  }
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearestMidi = Math.round(midi);
  const refFreq = 440 * Math.pow(2, (nearestMidi - 69) / 12);
  const cents = 1200 * Math.log2(frequency / refFreq);
  const noteName = midiToNoteName(nearestMidi, 'sharp');
  return {
    isValid: true,
    frequency,
    midi,
    cents,
    probability: confidence,
    noteName,
    levelDb: Number.isFinite(levelDb) ? (levelDb as number) : undefined,
    timestamp,
  };
};

let webCtx: AudioContext | null = null;
let webWorklet: AudioWorkletNode | null = null;
let webProcessor: ScriptProcessorNode | null = null;
let webDetector: YinPitchDetector | null = null;
let webSource: MediaStreamAudioSourceNode | null = null;
let webStream: MediaStream | null = null;
let resumeHandler: (() => void) | null = null;
let testTone: OscillatorNode | null = null;
let testToneGain: GainNode | null = null;
let hasPlayedTestTone = false;

export async function start(options: StartOptions = {}): Promise<StartResult> {
  if (webCtx) {
    return {
      sampleRate: webCtx.sampleRate,
      bufferSize: options.bufferSize ?? 4096,
      threshold: options.threshold ?? webThreshold,
    };
  }

  const bufferSize = options.bufferSize ?? 4096;
  webThreshold = options.threshold ?? 0.12;
  const preferredSampleRate = options.sampleRate ?? 44100;
  const estimatorRequested = options.estimator ?? 'yin';
  const estimator = estimatorRequested === 'neural-hybrid' ? 'yin' : estimatorRequested;

  try {
    webCtx = new AudioContext({ sampleRate: preferredSampleRate });
  } catch {
    webCtx = new AudioContext();
  }
  const gain = webCtx.createGain();
  gain.gain.value = 0;

  try {
    let useWorklet = true;
    try {
      await webCtx.audioWorklet.addModule(getWebWorkletUrl());
    } catch {
      try {
        await webCtx.audioWorklet.addModule(getWebWorkletDataUrl());
      } catch {
        useWorklet = false;
      }
    }
    webStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    webSource = webCtx.createMediaStreamSource(webStream);
    if (useWorklet) {
      webWorklet = new AudioWorkletNode(webCtx, 'yin-worklet-processor', {
        processorOptions: {
          bufferSize,
          threshold: webThreshold,
          sampleRate: preferredSampleRate,
          estimator,
        },
      });
      webWorklet.port.onmessage = (event) => {
        const payload = event.data as {
          frequency: number;
          probability: number;
          timestamp: number;
          levelDb?: number;
        };
        const { frequency, confidence } = webSmoother.add({
          frequency: payload.frequency,
          probability: payload.probability,
          timestamp: payload.timestamp,
        });
        const evt = toPitchEvent(frequency, confidence, payload.timestamp, payload.levelDb);
        webListeners.forEach((listener) => {
          listener(evt);
        });
      };

      webSource.connect(webWorklet);
      webWorklet.connect(gain);
    } else {
      webDetector = new YinPitchDetector(webCtx.sampleRate, bufferSize, webThreshold);
      webProcessor = webCtx.createScriptProcessor(bufferSize, 1, 1);
      let agcGain = 1;
      const agcTargetRms = 0.02;
      const agcAlpha = 0.04;
      const limiterThreshold = 0.95;
      webProcessor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        if (!input || input.numberOfChannels === 0 || !webDetector) {
          return;
        }
        const channel = input.getChannelData(0);
        let rmsSum = 0;
        for (let i = 0; i < channel.length; i += 1) {
          const sample = channel[i];
          rmsSum += sample * sample;
        }
        const rms = Math.sqrt(rmsSum / channel.length);
        const desiredGain = rms > 0 ? agcTargetRms / rms : agcGain;
        agcGain = agcGain + (desiredGain - agcGain) * agcAlpha;
        const normalized = new Float32Array(channel.length);
        for (let i = 0; i < channel.length; i += 1) {
          let sample = channel[i] * agcGain;
          if (sample > limiterThreshold) {
            sample = limiterThreshold + (sample - limiterThreshold) * 0.25;
          } else if (sample < -limiterThreshold) {
            sample = -limiterThreshold + (sample + limiterThreshold) * 0.25;
          }
          normalized[i] = sample;
        }
        const result = webDetector.processBuffer(normalized, normalized.length);
        if (!result.isValid || !Number.isFinite(result.frequency)) {
          const timestamp = webCtx ? webCtx.currentTime * 1000 : Date.now();
          let normRmsSum = 0;
          for (let i = 0; i < normalized.length; i += 1) {
            normRmsSum += normalized[i] * normalized[i];
          }
          const normRms = Math.sqrt(normRmsSum / normalized.length);
          const levelDb = normRms > 0 ? 20 * Math.log10(normRms) : -120;
          const evt = toPitchEvent(0, 0, timestamp, levelDb);
          webListeners.forEach((listener) => {
            listener(evt);
          });
          return;
        }
        const timestamp = webCtx ? webCtx.currentTime * 1000 : Date.now();
        const { frequency, confidence } = webSmoother.add({
          frequency: result.frequency,
          probability: result.probability,
          timestamp,
        });
        let normRmsSum = 0;
        for (let i = 0; i < normalized.length; i += 1) {
          normRmsSum += normalized[i] * normalized[i];
        }
        const normRms = Math.sqrt(normRmsSum / normalized.length);
        const levelDb = normRms > 0 ? 20 * Math.log10(normRms) : -120;
        const evt = toPitchEvent(frequency, confidence, timestamp, levelDb);
        webListeners.forEach((listener) => {
          listener(evt);
        });
      };

      webSource.connect(webProcessor);
      webProcessor.connect(gain);
    }
    gain.connect(webCtx.destination);

    if (!hasPlayedTestTone) {
      const toneGain = webCtx.createGain();
      toneGain.gain.value = 0.2;
      const oscillator = webCtx.createOscillator();
      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      oscillator.connect(toneGain);
      if (webWorklet) {
        toneGain.connect(webWorklet);
      } else if (webProcessor) {
        toneGain.connect(webProcessor);
      }
      oscillator.start();
      testTone = oscillator;
      testToneGain = toneGain;
      hasPlayedTestTone = true;
      setTimeout(() => {
        try {
          testTone?.stop();
        } catch {
          // Ignore stop errors.
        }
        testTone?.disconnect();
        testToneGain?.disconnect();
        testTone = null;
        testToneGain = null;
      }, 2000);
    }

    if (webCtx.state !== 'running') {
      try {
        await webCtx.resume();
      } catch {
        // Resume requires a user gesture on some browsers.
      }
    }

    if (webCtx.state !== 'running' && typeof document !== 'undefined') {
      if (!resumeHandler) {
        resumeHandler = () => {
          if (!webCtx) {
            return;
          }
          webCtx
            .resume()
            .catch(() => {})
            .finally(() => {
              if (webCtx?.state === 'running') {
                if (resumeHandler) {
                  document.removeEventListener('pointerdown', resumeHandler);
                  document.removeEventListener('keydown', resumeHandler);
                }
                resumeHandler = null;
              }
            });
        };
        document.addEventListener('pointerdown', resumeHandler, { once: true });
        document.addEventListener('keydown', resumeHandler, { once: true });
      }
    }
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    sampleRate: webCtx.sampleRate,
    bufferSize,
    threshold: webThreshold,
    estimator: estimatorRequested,
    neuralReady: false,
  };
}

export async function stop(): Promise<boolean> {
  try {
    if (testTone) {
      try {
        testTone.stop();
      } catch {
        // Ignore stop errors.
      }
      testTone.disconnect();
      testTone = null;
    }
    if (testToneGain) {
      testToneGain.disconnect();
      testToneGain = null;
    }
    if (webStream) {
      webStream.getTracks().forEach((t) => {
        t.stop();
      });
      webStream = null;
    }
    if (webSource) {
      webSource.disconnect();
      webSource = null;
    }
    if (webWorklet) {
      webWorklet.disconnect();
      webWorklet = null;
    }
    if (webProcessor) {
      webProcessor.disconnect();
      webProcessor.onaudioprocess = null;
      webProcessor = null;
    }
    webDetector = null;
    if (webCtx) {
      await webCtx.close();
      webCtx = null;
    }
    if (resumeHandler && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', resumeHandler);
      document.removeEventListener('keydown', resumeHandler);
      resumeHandler = null;
    }
    webListeners.clear();
    return true;
  } catch {
    return false;
  }
}

export function setThreshold(threshold: number): void {
  webThreshold = threshold;
  if (webDetector) {
    webDetector.setThreshold(threshold);
  }
}

export function addPitchListener(listener: Listener): Subscription {
  webListeners.add(listener);
  return {
    remove: () => {
      webListeners.delete(listener);
    },
  };
}

export function removeAllListeners(): void {
  webListeners.clear();
}

export default {
  start,
  stop,
  setThreshold,
  addPitchListener,
  removeAllListeners,
};
