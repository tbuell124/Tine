import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';

import { SettingsModal } from '@components/SettingsModal';
import { TunerScreen } from '@components/TunerScreen';
import { NotificationProvider, NotificationSurface } from '@state/NotificationContext';
import { TunerProvider } from '@state/TunerStateContext';

export default function App(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <NotificationProvider>
        <TunerProvider>
          <View style={styles.container}>
            <StatusBar style="light" />
            <TunerScreen />
            <SettingsModal />
            <NotificationSurface />
          </View>
        </TunerProvider>
      </NotificationProvider>
    </GestureHandlerRootView>
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
