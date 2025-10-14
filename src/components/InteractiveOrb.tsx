import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent
} from 'react-native-gesture-handler';

import { useSkiaCircle } from '@hooks/useSkiaCircle';

const CIRCLE_RADIUS = 48;

const AnimatedText = Animated.createAnimatedComponent(Animated.Text);

/**
 * InteractiveOrb renders the Skia canvas and gesture handler wiring that powers the
 * draggable gradient orb showcased on the home screen.
 */
export const InteractiveOrb: React.FC = () => {
  // Track the circle center inside Skia's value system for zero-copy updates.
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

  // Gesture handler updates the Skia circle through `runOnJS` so the canvas reacts
  // immediately to user input.
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
    <View style={styles.container}>
      <PanGestureHandler onGestureEvent={handleGesture}>
        <View style={styles.canvasContainer}>
          <Canvas style={styles.canvas}>
            <Circle cx={circle.x} cy={circle.y} r={CIRCLE_RADIUS}>
              <LinearGradient start={vec(0, 0)} end={vec(320, 320)} colors={["#6366F1", "#22D3EE"]} />
            </Circle>
          </Canvas>
        </View>
      </PanGestureHandler>
      <AnimatedText entering={FadeIn.delay(120)} exiting={FadeOut} style={[styles.instructions, animatedInfoStyle]}>
        Drag anywhere on the canvas to move the gradient orb.
      </AnimatedText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center'
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
