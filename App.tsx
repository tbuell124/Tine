import { TunerScreen } from '@components/TunerScreen';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
});
