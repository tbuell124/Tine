import React, { useMemo } from "react";
import {
  Canvas,
  Circle,
  Group,
  Line,
  PaintStyle,
  Path,
  Skia,
  StrokeCap,
  StrokeJoin,
  Text,
  TileMode,
  vec,
  type SkFont,
  type SkPaint,
  type SkPath,
} from "@shopify/react-native-skia";

export type InnerWheelProps = {
  /** Diameter of the wheel in logical pixels. */
  size?: number;
  /** Rotation in radians applied to the entire wheel. */
  rotation?: number;
  /** When true, renders knurled pegs along the major detent markers. */
  showDetentPegs?: boolean;
};

const FULL_CIRCLE = Math.PI * 2;
const START_ANGLE = -Math.PI / 2;
const MIN_CENTS = -50;
const MAX_CENTS = 50;
const TICK_STEP = 5;
const LABEL_STEP = 10;

const polarToCartesian = (
  center: number,
  radius: number,
  angle: number,
): { x: number; y: number } => ({
  x: center + radius * Math.cos(angle),
  y: center + radius * Math.sin(angle),
});

const buildSweepBrushPaint = (center: number, radius: number): SkPaint => {
  // Dense sweep gradient to emulate a fine brushed-metal surface.
  const stops = new Array(64).fill(null).map((_, index) => index / 63);
  const colors = stops.map((stop) => {
    const modulation = 0.5 + 0.5 * Math.sin(stop * Math.PI * 12);
    const shade = Math.round(110 + modulation * 90);
    return Skia.Color(`rgb(${shade}, ${shade}, ${shade})`);
  });
  const shader = Skia.Shader.MakeSweepGradient(vec(center, center), colors, stops, TileMode.Mirror);
  const paint = Skia.Paint();
  paint.setShader(shader);
  paint.setAntiAlias(true);
  return paint;
};

const buildRadialShadowPaint = (center: number, radius: number): SkPaint => {
  const shader = Skia.Shader.MakeRadialGradient(
    vec(center, center),
    radius,
    ["#ffffff22", "#00000066"].map((color) => Skia.Color(color)),
    [0, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  return paint;
};

const buildChamferPaint = (color: string, strokeWidth: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeWidth(strokeWidth);
  return paint;
};

const buildFont = (size: number): SkFont => {
  const typefaceFactory = (Skia.Typeface as { MakeDefault?: () => unknown }).MakeDefault;
  const typeface = typeof typefaceFactory === "function" ? typefaceFactory() : undefined;
  return Skia.Font(typeface, size);
};

const buildDiamondPath = (
  center: number,
  radius: number,
  angle: number,
  size: number,
): SkPath => {
  const position = polarToCartesian(center, radius, angle);
  const path = Skia.Path.Make();
  path.moveTo(position.x, position.y - size / 2);
  path.lineTo(position.x + size / 2, position.y);
  path.lineTo(position.x, position.y + size / 2);
  path.lineTo(position.x - size / 2, position.y);
  path.close();
  return path;
};

export const InnerWheel: React.FC<InnerWheelProps> = ({
  size = 220,
  rotation = 0,
  showDetentPegs = false,
}) => {
  const center = size / 2;
  const outerRadius = size * 0.48;
  const innerRadius = size * 0.32;
  const labelRadius = size * 0.27;
  const diamondRadius = size * 0.4;

  const brushPaint = useMemo(() => buildSweepBrushPaint(center, outerRadius), [center, outerRadius]);
  const shadowPaint = useMemo(() => buildRadialShadowPaint(center, outerRadius), [center, outerRadius]);
  const outerChamferPaint = useMemo(() => buildChamferPaint("#ffffff2a", size * 0.01), [size]);
  const innerChamferPaint = useMemo(() => buildChamferPaint("#00000055", size * 0.012), [size]);
  const font = useMemo(() => buildFont(size * 0.07), [size]);

  const tickData = useMemo(() => {
    const totalSteps = Math.round((MAX_CENTS - MIN_CENTS) / TICK_STEP);
    return new Array(totalSteps + 1).fill(null).map((_, index) => {
      const cents = MIN_CENTS + index * TICK_STEP;
      const ratio = (cents - MIN_CENTS) / (MAX_CENTS - MIN_CENTS);
      const angle = START_ANGLE + ratio * FULL_CIRCLE;
      const isMajor = cents % LABEL_STEP === 0;
      return {
        cents,
        angle,
        outerPoint: polarToCartesian(center, outerRadius, angle),
        innerPoint: polarToCartesian(
          center,
          isMajor ? outerRadius - size * 0.1 : outerRadius - size * 0.07,
          angle,
        ),
        isMajor,
      };
    });
  }, [center, outerRadius, size]);

  const labels = useMemo(() => {
    const totalSteps = Math.round((MAX_CENTS - MIN_CENTS) / LABEL_STEP);
    return new Array(totalSteps + 1).fill(null).map((_, index) => {
      const cents = MIN_CENTS + index * LABEL_STEP;
      const ratio = (cents - MIN_CENTS) / (MAX_CENTS - MIN_CENTS);
      const angle = START_ANGLE + ratio * FULL_CIRCLE;
      const position = polarToCartesian(center, labelRadius, angle);
      const text = `${cents > 0 ? "+" : ""}${cents}`;
      const metrics = font.measureText(text);
      const textWidth = metrics?.width ?? 0;
      const textHeight = font.getSize();
      return {
        text,
        x: position.x - textWidth / 2,
        y: position.y + textHeight / 3,
        angle,
      };
    });
  }, [center, font, labelRadius]);

  const zeroDiamond = useMemo(() => {
    const zeroTick = tickData.find((tick) => tick.cents === 0);
    const angle = zeroTick?.angle ?? START_ANGLE;
    return buildDiamondPath(center, diamondRadius, angle, size * 0.05);
  }, [center, diamondRadius, size, tickData]);

  const knurledPegData = useMemo(() => {
    if (!showDetentPegs) {
      return [] as {
        key: string;
        segments: { start: { x: number; y: number }; end: { x: number; y: number } }[];
      }[];
    }

    const angleOffsets = [-0.8, 0, 0.8].map((degrees) => (degrees * Math.PI) / 180);
    return labels.map(({ angle, text }) => {
      const segments = angleOffsets.map((offset) => ({
        start: polarToCartesian(center, outerRadius + size * 0.008, angle + offset),
        end: polarToCartesian(center, outerRadius - size * 0.045, angle + offset),
      }));
      return { key: text, segments };
    });
  }, [center, labels, outerRadius, showDetentPegs, size]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group origin={vec(center, center)} transform={[{ rotate: rotation }]}>
        <Circle cx={center} cy={center} r={outerRadius} paint={brushPaint} />
        <Circle cx={center} cy={center} r={outerRadius} paint={shadowPaint} />

        {tickData.map(({ outerPoint, innerPoint, isMajor, cents }) => (
          <Line
            key={`tick-${cents}`}
            p1={vec(outerPoint.x, outerPoint.y)}
            p2={vec(innerPoint.x, innerPoint.y)}
            strokeWidth={isMajor ? size * 0.008 : size * 0.0045}
            color={isMajor ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.32)"}
            cap={StrokeCap.Round}
          />
        ))}

        {knurledPegData.map(({ key, segments }) => (
          <React.Fragment key={`peg-${key}`}>
            {segments.map(({ start, end }, index) => (
              <Line
                key={`peg-${key}-${index}`}
                p1={vec(start.x, start.y)}
                p2={vec(end.x, end.y)}
                strokeWidth={size * 0.009}
                color="rgba(255,255,255,0.28)"
                cap={StrokeCap.Round}
              />
            ))}
          </React.Fragment>
        ))}

        <Circle cx={center} cy={center} r={outerRadius} paint={outerChamferPaint} />
        <Circle cx={center} cy={center} r={innerRadius} paint={innerChamferPaint} />

        {labels.map(({ text, x, y }) => (
          <React.Fragment key={`label-${text}`}>
            <Text x={x + size * 0.002} y={y + size * 0.002} text={text} font={font} color="rgba(255,255,255,0.25)" />
            <Text x={x} y={y} text={text} font={font} color="rgba(0,0,0,0.7)" />
          </React.Fragment>
        ))}

        <Path path={zeroDiamond} color="#0f172a" />
        <Path path={zeroDiamond} color="#ffffff" style="stroke" strokeWidth={size * 0.006} />
      </Group>
    </Canvas>
  );
};

export default InnerWheel;
