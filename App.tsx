import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';

import { NotificationSurface } from '@components/NotificationSurface';
import { DebugLogOverlay } from '@components/DebugLogOverlay';
import { SettingsModal } from '@components/SettingsModal';
import { TunerScreen } from '@components/TunerScreen';
import { TunerProvider } from '@state/TunerStateContext';
import { NotificationProvider } from '@state/NotificationContext';

export default function App(): JSX.Element {
  return (
    <NotificationProvider>
      <GestureHandlerRootView style={styles.root}>
        <TunerProvider>
          <View style={styles.container}>
            <StatusBar style="light" />
            <TunerScreen />
            <SettingsModal />
            <NotificationSurface />
            <DebugLogOverlay />
          </View>
        </TunerProvider>
      </GestureHandlerRootView>
    </NotificationProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020617'
  },
  container: {
    flex: 1,
    backgroundColor: '#020617'
  }
});
