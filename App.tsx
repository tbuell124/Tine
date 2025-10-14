import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { InteractiveOrb } from '@components/InteractiveOrb';
import { SettingsModal } from '@components/SettingsModal';
import { TunerProvider } from '@state/TunerStateContext';

export default function App(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <TunerProvider>
        <View style={styles.container}>
          <StatusBar style="dark" />
          <SettingsModal />
          <InteractiveOrb />
        </View>
      </TunerProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 24
  }
});
