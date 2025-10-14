import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Canvas, Circle, LinearGradient, vec, useValue } from '@shopify/react-native-skia';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  runOnJS
} from 'react-native-reanimated';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerGestureEvent
} from 'react-native-gesture-handler';

const CIRCLE_RADIUS = 48;

const AnimatedText = Animated.createAnimatedComponent(Text);

type CircleCenter = { x: number; y: number };

// Simple helper that encapsulates the mutable Skia values for the circle center.
const useSkiaCircle = (initial: CircleCenter) => {
  const x = useValue(initial.x);
  const y = useValue(initial.y);

  const update = React.useCallback(
    (next: CircleCenter) => {
      x.current = next.x;
      y.current = next.y;
    },
    [x, y]
  );

  return { x, y, update } as const;
};

export default function App(): JSX.Element {
  // Track the circle center in the Skia canvas.
  const circle = useSkiaCircle({ x: 160, y: 160 });
  // Shared value controls the informational text fade-in animation.
  const infoOpacity = useSharedValue(0);

  React.useEffect(() => {
    infoOpacity.value = withSpring(1, { damping: 15, stiffness: 120 });
  }, [infoOpacity]);

  // Bind the shared value to a React Native Reanimated style.
  const animatedInfoStyle = useAnimatedStyle(() => ({
    opacity: infoOpacity.value
  }));

  // Gesture handler updates the Skia circle through `runOnJS` so the canvas
  // reacts immediately to user input.
  const handleGesture = useAnimatedGestureHandler<PanGestureHandlerGestureEvent>(
    {
      onStart: (event) => {
        runOnJS(circle.update)({ x: event.x, y: event.y });
      },
      onActive: (event) => {
        runOnJS(circle.update)({ x: event.x, y: event.y });
      }
    },
    [circle]
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        <StatusBar style="dark" />
        <PanGestureHandler onGestureEvent={handleGesture}>
          <Animated.View style={styles.canvasContainer}>
            <Canvas style={styles.canvas}>
              <Circle cx={circle.x} cy={circle.y} r={CIRCLE_RADIUS}>
                <LinearGradient start={vec(0, 0)} end={vec(320, 320)} colors={["#6366F1", "#22D3EE"]} />
              </Circle>
            </Canvas>
          </Animated.View>
        </PanGestureHandler>
        <AnimatedText
          entering={FadeIn.delay(120)}
          exiting={FadeOut}
          style={[styles.instructions, animatedInfoStyle]}
        >
          Drag anywhere on the canvas to move the gradient orb.
        </AnimatedText>
      </View>
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
  canvasContainer: {
    width: 320,
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  canvas: {
    flex: 1
  },
  instructions: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600'
  }
});
