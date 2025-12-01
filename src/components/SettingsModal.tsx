import React from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Slider from '@react-native-community/slider';

import {
  SENSITIVITY_PRESETS,
  useTuner,
  type TunerSettings,
  type SensitivityRange,
} from '@state/TunerStateContext';

const A4_MIN = 415;
const A4_MAX = 466;
const LOCK_THRESHOLD_MIN = 1;
const LOCK_THRESHOLD_MAX = 8;
const LOCK_THRESHOLD_STEP = 0.5;
const LOCK_DWELL_MIN = 0.2;
const LOCK_DWELL_MAX = 1.5;
const LOCK_DWELL_STEP = 0.05;
const SENSITIVITY_OPTIONS: SensitivityRange[] = SENSITIVITY_PRESETS.map(
  (preset) => preset.range,
);

const sliderTheme = {
  minimumTrackTint: '#6366F1',
  maximumTrackTint: '#CBD5F5',
  thumbTint: '#4C51BF'
};

type EditableSettings = Pick<
  TunerSettings,
  | 'a4Calibration'
  | 'sensitivityRange'
  | 'sensitivityProfile'
  | 'lockThreshold'
  | 'lockDwellTime'
>;

const toEditable = (settings: TunerSettings): EditableSettings => ({
  a4Calibration: settings.a4Calibration,
  sensitivityRange: settings.sensitivityRange,
  sensitivityProfile: settings.sensitivityProfile,
  lockThreshold: settings.lockThreshold,
  lockDwellTime: settings.lockDwellTime
});

export const SettingsModal: React.FC = () => {
  const {
    state: { settings },
    actions
  } = useTuner();
  const [visible, setVisible] = React.useState(false);
  const [draft, setDraft] = React.useState<EditableSettings>(toEditable(settings));

  React.useEffect(() => {
    if (visible) {
      setDraft(toEditable(settings));
    }
  }, [visible, settings]);

  const sensitivityIndex = React.useMemo(() => {
    const presetIndex = SENSITIVITY_PRESETS.findIndex(
      (preset) => preset.id === draft.sensitivityProfile,
    );
    if (presetIndex !== -1) {
      return presetIndex;
    }

    const rangeIndex = SENSITIVITY_OPTIONS.indexOf(draft.sensitivityRange);
    return rangeIndex === -1 ? 1 : rangeIndex;
  }, [draft.sensitivityProfile, draft.sensitivityRange]);
  const selectedPreset = React.useMemo(
    () => SENSITIVITY_PRESETS[sensitivityIndex] ?? SENSITIVITY_PRESETS[1],
    [sensitivityIndex],
  );

  const openModal = React.useCallback(() => {
    setVisible(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setVisible(false);
    setDraft(toEditable(settings));
  }, [settings]);

  const handleSave = React.useCallback(() => {
    actions.updateSettings(draft);
    setVisible(false);
  }, [actions, draft]);

  return (
    <>
      <View pointerEvents="box-none" style={styles.launcherContainer}>
        <Pressable
          onPress={openModal}
          style={styles.launcherButton}
          accessibilityRole="button"
          accessibilityLabel="Open tuner settings"
        >
          <Text style={styles.launcherLabel}>Settings</Text>
        </Pressable>
      </View>
      <Modal
        animationType="slide"
        transparent
        visible={visible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessibilityRole="button" />
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Tuning Settings</Text>
              <View style={styles.settingBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.settingLabel}>A4 Calibration</Text>
                  <Text style={styles.settingValue}>{`${Math.round(draft.a4Calibration)} Hz`}</Text>
                </View>
                <Slider
                  value={draft.a4Calibration}
                  minimumValue={A4_MIN}
                  maximumValue={A4_MAX}
                  step={1}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, a4Calibration: Math.round(value) }))
                  }
                  minimumTrackTintColor={sliderTheme.minimumTrackTint}
                  maximumTrackTintColor={sliderTheme.maximumTrackTint}
                  thumbTintColor={sliderTheme.thumbTint}
                />
              </View>
              <View style={styles.settingBlock}>
                <View style={styles.labelRow}>
                  <View style={styles.labelStack}>
                    <Text style={styles.settingLabel}>Detection Profile</Text>
                    <Text style={styles.settingSubLabel}>{`±${selectedPreset.range}¢ • ${selectedPreset.bufferSize} buffer • p>${selectedPreset.probabilityThreshold.toFixed(2)}`}</Text>
                  </View>
                  <Text style={styles.settingValue}>{selectedPreset.label}</Text>
                </View>
                <Slider
                  value={sensitivityIndex}
                  minimumValue={0}
                  maximumValue={SENSITIVITY_OPTIONS.length - 1}
                  step={1}
                  onValueChange={(value) => {
                    const index = Math.round(value) as number;
                    const preset = SENSITIVITY_PRESETS[index] ?? SENSITIVITY_PRESETS[1];
                    setDraft((prev) => ({
                      ...prev,
                      sensitivityRange: preset.range,
                      sensitivityProfile: preset.id,
                    }));
                  }}
                  minimumTrackTintColor={sliderTheme.minimumTrackTint}
                  maximumTrackTintColor={sliderTheme.maximumTrackTint}
                  thumbTintColor={sliderTheme.thumbTint}
                />
              </View>
              <View style={styles.settingBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.settingLabel}>Lock Threshold</Text>
                  <Text style={styles.settingValue}>{`±${draft.lockThreshold.toFixed(1)}¢`}</Text>
                </View>
                <Slider
                  value={draft.lockThreshold}
                  minimumValue={LOCK_THRESHOLD_MIN}
                  maximumValue={LOCK_THRESHOLD_MAX}
                  step={LOCK_THRESHOLD_STEP}
                  onValueChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      lockThreshold: Math.round(value * 10) / 10
                    }))
                  }
                  minimumTrackTintColor={sliderTheme.minimumTrackTint}
                  maximumTrackTintColor={sliderTheme.maximumTrackTint}
                  thumbTintColor={sliderTheme.thumbTint}
                />
              </View>
              <View style={styles.settingBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.settingLabel}>Lock Dwell Time</Text>
                  <Text style={styles.settingValue}>{`${draft.lockDwellTime.toFixed(2)} s`}</Text>
                </View>
                <Slider
                  value={draft.lockDwellTime}
                  minimumValue={LOCK_DWELL_MIN}
                  maximumValue={LOCK_DWELL_MAX}
                  step={LOCK_DWELL_STEP}
                  onValueChange={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      lockDwellTime: Math.round(value * 100) / 100
                    }))
                  }
                  minimumTrackTintColor={sliderTheme.minimumTrackTint}
                  maximumTrackTintColor={sliderTheme.maximumTrackTint}
                  thumbTintColor={sliderTheme.thumbTint}
                />
              </View>
              <View style={styles.actionsRow}>
                <Pressable onPress={closeModal} style={styles.cancelButton} accessibilityRole="button">
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSave} style={styles.saveButton} accessibilityRole="button">
                  <Text style={styles.saveLabel}>Save</Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  launcherContainer: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10
  },
  launcherButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.6)'
  },
  launcherLabel: {
    color: '#E2E8F0',
    fontWeight: '600',
    letterSpacing: 0.25
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A'
  },
  settingBlock: {
    gap: 8
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155'
  },
  settingSubLabel: {
    fontSize: 12,
    color: '#475569'
  },
  labelStack: {
    gap: 2
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A'
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(226, 232, 240, 0.8)'
  },
  cancelLabel: {
    color: '#1E293B',
    fontWeight: '600'
  },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#4F46E5'
  },
  saveLabel: {
    color: '#F8FAFC',
    fontWeight: '700'
  }
});

export default SettingsModal;
