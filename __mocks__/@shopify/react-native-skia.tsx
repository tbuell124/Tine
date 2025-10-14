import React from 'react';
import { View } from 'react-native';

const createMockComponent = (displayName: string) => {
  const Component: React.FC<any> = ({ children, ...props }) => (
    <View {...props} accessibilityLabel={displayName}>
      {children}
    </View>
  );
  Component.displayName = displayName;
  return Component;
};

const createMockPath = () => ({
  addArc: jest.fn(),
  lineTo: jest.fn(),
  moveTo: jest.fn(),
  close: jest.fn(),
});

const createMockPaint = () => ({
  setShader: jest.fn(),
  setStyle: jest.fn(),
  setStrokeWidth: jest.fn(),
  setStrokeJoin: jest.fn(),
  setStrokeCap: jest.fn(),
  setAntiAlias: jest.fn(),
  setColor: jest.fn(),
  setBlendMode: jest.fn(),
});

const createMockCanvas = () => ({
  drawCircle: jest.fn(),
  drawPath: jest.fn(),
  drawLine: jest.fn(),
  drawText: jest.fn(),
  drawPicture: jest.fn(),
});

export const Canvas = createMockComponent('Canvas');
export const Group = createMockComponent('Group');
export const Circle = createMockComponent('Circle');
export const Picture = createMockComponent('Picture');

export const PaintStyle = {
  Fill: 'fill',
  Stroke: 'stroke',
} as const;

export const BlendMode = {
  Screen: 'screen',
} as const;

export const StrokeCap = {
  Round: 'round',
} as const;

export const StrokeJoin = {
  Round: 'round',
} as const;

export const TileMode = {
  Clamp: 'clamp',
  Mirror: 'mirror',
} as const;

export const vec = (x: number, y: number) => ({ x, y });

export const Skia = {
  Path: {
    Make: createMockPath,
  },
  Paint: createMockPaint,
  Color: (value: string) => value,
  Shader: {
    MakeLinearGradient: jest.fn(() => ({})),
    MakeRadialGradient: jest.fn(() => ({})),
    MakeSweepGradient: jest.fn(() => ({})),
  },
  XYWHRect: (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  }),
  PictureRecorder: () => ({
    beginRecording: jest.fn(() => createMockCanvas()),
    finishRecordingAsPicture: jest.fn(() => ({ kind: 'picture' })),
  }),
  Font: jest.fn(() => ({
    measureText: jest.fn(() => ({ width: 0 })),
    getSize: jest.fn(() => 0),
  })),
  Typeface: {
    MakeDefault: jest.fn(() => ({})),
  },
  RuntimeEffect: {
    Make: jest.fn(() => ({
      makeShaderWithChildren: jest.fn(() => ({})),
    })),
  },
};

export type SkFont = ReturnType<typeof Skia.Font>;
export type SkPaint = ReturnType<typeof createMockPaint>;
export type SkPath = ReturnType<typeof createMockPath>;
export type SkCanvas = ReturnType<typeof createMockCanvas>;
export type SkPicture = { kind: string };
