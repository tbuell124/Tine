import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { InteractiveOrb } from '@components/InteractiveOrb';
import { SettingsModal } from '@components/SettingsModal';
import { TunerProvider } from '@state/TunerStateContext';
import { TuningForkLogo } from '@components/TuningForkLogo';

export default function App(): JSX.Element {
  // Track whether the splash animation is currently visible to gate rendering of the tuner UI.
  const [showSplash, setShowSplash] = useState(true);

  // Animated value drives the fade-in / fade-out opacity transitions for the splash overlay.
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Compute palette values once to keep styling deterministic and aligned with the existing UI tones.
  const palette = useMemo(
    () => ({
      background: '#0f172a',
      accent: '#38bdf8',
      text: '#e2e8f0'
    }),
    []
  );

  useEffect(() => {
    // Kick off a simple fade in ➝ hold ➝ fade out sequence when the app boots.
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      }),
      Animated.delay(500),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true
      })
    ]).start(() => {
      // Once the animation completes, remove the splash overlay so the tuner becomes interactive.
      setShowSplash(false);
    });
  }, [fadeAnim]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <TunerProvider>
        <View style={styles.container}>
          <StatusBar style="dark" />
          <SettingsModal />
          <InteractiveOrb />
        </View>
        {showSplash ? (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.splashContainer,
              { backgroundColor: palette.background, opacity: fadeAnim }
            ]}
          >
            <View style={styles.logoWrapper}>
              <View style={[styles.glow, { backgroundColor: palette.accent }]} />
              <TuningForkLogo size={140} color={palette.accent} />
            </View>
            <Text style={[styles.splashTitle, { color: palette.text }]}>Tine</Text>
            <Text style={[styles.splashSubtitle, { color: palette.text }]}>Reactive Pitch Precision</Text>
          </Animated.View>
        ) : null}
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
  },
  splashContainer: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoWrapper: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  glow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.18,
    borderRadius: 100,
    transform: [{ scale: 1.2 }]
  },
  splashTitle: {
    marginTop: 24,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: 3
  },
  splashSubtitle: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.72,
    letterSpacing: 1.5
  }
});
