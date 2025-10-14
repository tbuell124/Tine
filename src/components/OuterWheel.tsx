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

export type OuterWheelProps = {
  /**
   * Diameter of the wheel in logical pixels.
   * The component scales proportionally from this value.
   */
  size?: number;
  /**
   * Rotation in radians applied around the wheel's center.
   */
  rotation?: number;
};

const NOTE_LABELS = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

const SEGMENT_COUNT = NOTE_LABELS.length;
const FULL_CIRCLE = Math.PI * 2;

const radiansToDegrees = (value: number): number => (value * 180) / Math.PI;

const polarToCartesian = (
  center: number,
  radius: number,
  angle: number,
): { x: number; y: number } => ({
  x: center + radius * Math.cos(angle),
  y: center + radius * Math.sin(angle),
});

const buildSegmentPaths = (
  center: number,
  innerRadius: number,
  outerRadius: number,
): { path: SkPath; midAngle: number }[] => {
  const sweep = FULL_CIRCLE / SEGMENT_COUNT;
  const outerRect = Skia.XYWHRect(
    center - outerRadius,
    center - outerRadius,
    outerRadius * 2,
    outerRadius * 2,
  );
  const innerRect = Skia.XYWHRect(
    center - innerRadius,
    center - innerRadius,
    innerRadius * 2,
    innerRadius * 2,
  );

  return new Array(SEGMENT_COUNT).fill(null).map((_, index) => {
    const startAngle = -Math.PI / 2 + index * sweep;
    const midAngle = startAngle + sweep / 2;
    const path = Skia.Path.Make();
    const startDeg = radiansToDegrees(startAngle);
    const sweepDeg = radiansToDegrees(sweep);

    path.addArc(outerRect, startDeg, sweepDeg);

    const innerEnd = polarToCartesian(center, innerRadius, startAngle + sweep);
    path.lineTo(innerEnd.x, innerEnd.y);
    path.addArc(innerRect, startDeg + sweepDeg, -sweepDeg);
    path.close();

    return { path, midAngle };
  });
};

const buildBrushedPaint = (
  center: number,
  radius: number,
): SkPaint => {
  const shader = Skia.Shader.MakeLinearGradient(
    vec(center - radius, center - radius),
    vec(center + radius, center + radius),
    ["#b5b5b5", "#e0e0e0", "#888888", "#dcdcdc", "#9a9a9a"].map((color) =>
      Skia.Color(color),
    ),
    [0, 0.2, 0.45, 0.7, 1],
    TileMode.Mirror,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  return paint;
};

const buildRadialHighlightPaint = (
  center: number,
  radius: number,
): SkPaint => {
  const shader = Skia.Shader.MakeRadialGradient(
    vec(center, center),
    radius,
    ["#ffffff26", "#00000040"].map((color) => Skia.Color(color)),
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
  paint.setStrokeWidth(strokeWidth);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setStrokeCap(StrokeCap.Round);
  return paint;
};

const buildLabelFont = (size: number): SkFont => {
  const typefaceFactory = (Skia.Typeface as { MakeDefault?: () => unknown }).MakeDefault;
  const typeface = typeof typefaceFactory === "function" ? typefaceFactory() : undefined;
  return Skia.Font(typeface, size);
};

export const OuterWheel: React.FC<OuterWheelProps> = ({ size = 320, rotation = 0 }) => {
  const center = size / 2;
  const outerRadius = size * 0.48;
  const innerRadius = size * 0.35;
  const chamferInnerRadius = size * 0.33;

  const segmentPaths = useMemo(
    () => buildSegmentPaths(center, innerRadius, outerRadius),
    [center, innerRadius, outerRadius],
  );

  const brushedPaint = useMemo(() => buildBrushedPaint(center, outerRadius), [center, outerRadius]);

  const radialHighlightPaint = useMemo(
    () => buildRadialHighlightPaint(center, outerRadius),
    [center, outerRadius],
  );

  const outerChamferPaint = useMemo(
    () => buildChamferPaint("#ffffff40", size * 0.01),
    [size],
  );
  const innerChamferPaint = useMemo(
    () => buildChamferPaint("#00000055", size * 0.012),
    [size],
  );

  const font = useMemo(() => buildLabelFont(size * 0.075), [size]);

  const labelData = useMemo(() => {
    return segmentPaths.map(({ midAngle }, index) => {
      const radius = (innerRadius + outerRadius) / 2;
      const position = polarToCartesian(center, radius, midAngle);
      const text = NOTE_LABELS[index];
      const metrics = font?.measureText(text);
      const textWidth = metrics ? metrics.width : 0;
      const textHeight = font ? font.getSize() : 0;
      return {
        text,
        x: position.x - textWidth / 2,
        y: position.y + textHeight / 3,
      };
    });
  }, [segmentPaths, innerRadius, outerRadius, center, font]);

  const notchData = useMemo(() => {
    const sweep = FULL_CIRCLE / SEGMENT_COUNT;
    const startOffset = -Math.PI / 2;
    return new Array(SEGMENT_COUNT).fill(null).map((_, index) => {
      const angle = startOffset + index * sweep;
      const outerPoint = polarToCartesian(center, outerRadius, angle);
      const innerPoint = polarToCartesian(center, innerRadius, angle);
      const insetOuter = polarToCartesian(center, outerRadius + size * 0.005, angle);
      return {
        outerPoint,
        innerPoint,
        insetOuter,
      };
    });
  }, [center, innerRadius, outerRadius, size]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group origin={vec(center, center)} transform={[{ rotate: rotation }]}>
        <Circle cx={center} cy={center} r={outerRadius} paint={brushedPaint} />
        <Circle cx={center} cy={center} r={outerRadius} paint={radialHighlightPaint} />

        {segmentPaths.map(({ path }, index) => {
          const intensity = 0.15 + (index % 2 === 0 ? 0.1 : 0);
          const fillColor = `rgba(0, 0, 0, ${intensity})`;
          return <Path key={`segment-${index}`} path={path} color={fillColor} />;
        })}

        <Circle cx={center} cy={center} r={outerRadius} paint={outerChamferPaint} />
        <Circle cx={center} cy={center} r={chamferInnerRadius} paint={innerChamferPaint} />

        {notchData.map(({ outerPoint, innerPoint, insetOuter }, index) => (
          <React.Fragment key={`notch-${index}`}>
            <Line
              p1={vec(outerPoint.x, outerPoint.y)}
              p2={vec(innerPoint.x, innerPoint.y)}
              strokeWidth={size * 0.008}
              color="rgba(0,0,0,0.35)"
            />
            <Line
              p1={vec(insetOuter.x, insetOuter.y)}
              p2={vec(outerPoint.x, outerPoint.y)}
              strokeWidth={size * 0.006}
              color="rgba(255,255,255,0.25)"
            />
          </React.Fragment>
        ))}

        {labelData.map(({ text, x, y }, index) => (
          <React.Fragment key={`label-${index}`}>
            <Text x={x + size * 0.0025} y={y + size * 0.0025} text={text} font={font} color="rgba(255,255,255,0.2)" />
            <Text x={x} y={y} text={text} font={font} color="rgba(0,0,0,0.65)" />
          </React.Fragment>
        ))}
      </Group>
    </Canvas>
  );
};

export default OuterWheel;
