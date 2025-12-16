import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';

import { TunerScreen } from '@components/TunerScreen';

export default function App(): JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        <TunerScreen />
      </View>
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
