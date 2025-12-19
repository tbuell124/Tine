import React from 'react';
import { StyleSheet, View } from 'react-native';

type TuningForkLogoProps = {
  /** Overall footprint of the logo in logical pixels. */
  size?: number;
  /** Accent color so the mark can harmonize with light/dark splash palettes. */
  color?: string;
};

export function TuningForkLogo({
  size = 120,
  color = '#38bdf8',
}: TuningForkLogoProps): JSX.Element {
  // Derive ratios once so all pieces of the fork remain proportional at any size.
  const prongWidth = size * 0.18;
  const prongHeight = size * 0.55;
  const gapWidth = size * 0.22;
  const connectorHeight = size * 0.12;
  const stemWidth = size * 0.16;
  const stemHeight = size * 0.28;
  const resonatorSize = size * 0.26;
  const borderThickness = size * 0.04;

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <View style={[styles.prongsContainer, { height: prongHeight }]}>
        <View
          style={[
            styles.prong,
            {
              width: prongWidth,
              height: prongHeight,
              backgroundColor: color,
              borderTopLeftRadius: prongWidth,
              borderTopRightRadius: prongWidth,
            },
          ]}
        />
        <View style={{ width: gapWidth }} />
        <View
          style={[
            styles.prong,
            {
              width: prongWidth,
              height: prongHeight,
              backgroundColor: color,
              borderTopLeftRadius: prongWidth,
              borderTopRightRadius: prongWidth,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.connector,
          {
            width: prongWidth * 2 + gapWidth,
            height: connectorHeight,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.stem,
          {
            width: stemWidth,
            height: stemHeight,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.resonator,
          {
            width: resonatorSize,
            height: resonatorSize,
            borderRadius: resonatorSize / 2,
            borderColor: color,
            borderWidth: borderThickness,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  prongsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  prong: {
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  connector: {
    marginTop: 4,
    borderRadius: 999,
  },
  stem: {
    marginTop: 4,
    borderRadius: 999,
  },
  resonator: {
    marginTop: 10,
  },
});
