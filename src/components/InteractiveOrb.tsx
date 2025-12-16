import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedGestureHandler } from 'react-native-reanimated';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent
} from 'react-native-gesture-handler';

import { useSkiaCircle } from '@hooks/useSkiaCircle';

const CIRCLE_RADIUS = 48;

/**
 * InteractiveOrb renders the Skia canvas and gesture handler wiring that powers the
 * draggable gradient orb showcased on the home screen.
 */
const InteractiveOrbComponent: React.FC = () => {
  // Track the circle center inside Skia's value system for zero-copy updates.
  const circle = useSkiaCircle({ x: 160, y: 160 });

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
    </View>
  );
};

export const InteractiveOrb = React.memo(InteractiveOrbComponent);

InteractiveOrb.displayName = 'InteractiveOrb';

export default InteractiveOrb;

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
  }
});
