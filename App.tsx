import { TunerScreen } from '@components/TunerScreen';
import {
  Lato_400Regular,
  Lato_600SemiBold,
  Lato_700Bold,
  Lato_900Black,
} from '@expo-google-fonts/lato';
import { useFonts } from 'expo-font';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App(): JSX.Element {
  useFonts({
    LatoRegular: Lato_400Regular,
    LatoSemiBold: Lato_600SemiBold,
    LatoBold: Lato_700Bold,
    LatoBlack: Lato_900Black,
  });

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
    backgroundColor: '#050607',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#050607',
  },
});
