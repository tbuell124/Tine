import type { Spec } from '../PitchDetectorNativeModule';

describe('PitchDetector native module resolution', () => {
  const originalTurboProxy = (globalThis as any).__turboModuleProxy;
  const restoreMocks = () => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    (globalThis as any).__turboModuleProxy = originalTurboProxy;
  };

  afterEach(() => {
    restoreMocks();
  });

  it('falls back to a safe shim when the native module is unavailable', async () => {
    jest.resetModules();
    (globalThis as any).__turboModuleProxy = null;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.doMock('react-native', () => ({
      NativeModules: {},
      Platform: { OS: 'ios' },
      TurboModuleRegistry: { getEnforcing: jest.fn(() => undefined) }
    }));

    const module = await import('../PitchDetectorNativeModule');
    const { default: spec, LINKING_ERROR, isPitchDetectorModuleAvailable } = module;

    expect(isPitchDetectorModuleAvailable).toBe(false);

    await expect(spec.start()).rejects.toThrow(LINKING_ERROR);
    await expect(spec.stop()).resolves.toBe(false);
    spec.setThreshold(0.5);

    expect(warnSpy).toHaveBeenCalledWith(LINKING_ERROR);
  });

  it('uses the real native implementation when available', async () => {
    jest.resetModules();
    (globalThis as any).__turboModuleProxy = null;

    const startMock = jest.fn().mockResolvedValue({
      sampleRate: 48000,
      bufferSize: 2048,
      threshold: 0.15
    });
    const stopMock = jest.fn().mockResolvedValue(true);
    const setThresholdMock = jest.fn();

    jest.doMock('react-native', () => ({
      NativeModules: {
        PitchDetector: {
          start: startMock,
          stop: stopMock,
          setThreshold: setThresholdMock
        } satisfies Spec
      },
      Platform: { OS: 'ios' },
      TurboModuleRegistry: { getEnforcing: jest.fn(() => undefined) }
    }));

    const module = await import('../PitchDetectorNativeModule');
    const { default: spec, isPitchDetectorModuleAvailable } = module;

    expect(isPitchDetectorModuleAvailable).toBe(true);

    await expect(spec.start()).resolves.toEqual({
      sampleRate: 48000,
      bufferSize: 2048,
      threshold: 0.15
    });
    await expect(spec.stop()).resolves.toBe(true);
    spec.setThreshold(0.25);

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(setThresholdMock).toHaveBeenCalledWith(0.25);
  });
});
