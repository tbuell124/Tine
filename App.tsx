import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';

import { TunerScreen } from '@components/TunerScreen';
import { NotificationSurface } from '@components/NotificationSurface';
import { TunerProvider } from '@state/TunerStateContext';
import { NotificationProvider } from '@state/NotificationContext';

export default function App(): JSX.Element {
  return (
    <NotificationProvider>
      <GestureHandlerRootView style={styles.root}>
        <TunerProvider>
          <View style={styles.container}>
            <TunerScreen />
            <NotificationSurface />
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
