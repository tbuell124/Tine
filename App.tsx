import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Canvas, Circle, interpolateColors, useClockValue, useComputedValue } from '@shopify/react-native-skia';

// AnimatedBox demonstrates a draggable element implemented with Reanimated and Gesture Handler.
const AnimatedBox: React.FC = () => {
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      // Update the shared values while the gesture is active.
      translationX.value = event.translationX;
      translationY.value = event.translationY;
    })
    .onEnd(() => {
      // When the gesture ends, spring back to the origin for a playful effect.
      translationX.value = withSpring(0);
      translationY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.draggable, animatedStyle]}>
        <Text style={styles.draggableText}>Drag me</Text>
      </Animated.View>
    </GestureDetector>
  );
};

// SkiaPulse renders a pulsing circle using react-native-skia as a smoke test for the graphics engine.
const SkiaPulse: React.FC = () => {
  const clock = useClockValue();

  const animatedColor = useComputedValue(() => {
    const progress = (clock.current % 2000) / 2000;
    return interpolateColors(
      progress,
      [0, 0.5, 1],
      ['#2563eb', '#7c3aed', '#2563eb'],
    );
  }, [clock]);

  const animatedRadius = useComputedValue(() => {
    const progress = (clock.current % 1000) / 1000;
    return 40 + 10 * Math.sin(progress * Math.PI * 2);
  }, [clock]);

  return (
    <Canvas style={styles.canvas}>
      <Circle cx={75} cy={75} r={animatedRadius} color={animatedColor} />
    </Canvas>
  );
};

const App: React.FC = () => (
  <GestureHandlerRootView style={styles.root}>
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Tine React Native Starter</Text>
        <Text style={styles.subtitle}>
          This Expo starter integrates Gesture Handler, Reanimated, and Skia out of the box.
        </Text>
        <AnimatedBox />
        <SkiaPulse />
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  </GestureHandlerRootView>
);

export default App;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#334155',
  },
  draggable: {
    width: 160,
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  draggableText: {
    color: '#0f172a',
    fontWeight: '500',
  },
  canvas: {
    width: 150,
    height: 150,
  },
});
