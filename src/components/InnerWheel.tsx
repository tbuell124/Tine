import React, { useMemo } from "react";
import {
  Canvas,
  Circle,
  Group,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
  type SkFont,
  type SkPaint,
  type SkPath,
} from "@shopify/react-native-skia";

import { useSpecularHighlight } from "@hooks/useSpecularHighlight";

import { createSpecularHighlightPaint } from "./shaders/specularHighlight";
import { recordPicture } from "@utils/skia";

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

const InnerWheelComponent: React.FC<InnerWheelProps> = ({
  size = 220,
  rotation = 0,
  showDetentPegs = false,
}) => {
  const center = size / 2;
  const outerRadius = size * 0.48;
  const innerRadius = size * 0.32;
  const labelRadius = size * 0.27;
  const diamondRadius = size * 0.4;

  const specularHighlight = useSpecularHighlight(rotation, {
    minWidth: 0.09,
    maxWidth: 0.2,
    minIntensity: 0.4,
    maxIntensity: 0.9,
    tiltReference: 0.65,
  });

  const brushPaint = useMemo(() => buildSweepBrushPaint(center, outerRadius), [center, outerRadius]);
  const shadowPaint = useMemo(() => buildRadialShadowPaint(center, outerRadius), [center, outerRadius]);
  const specularHighlightPaint = useMemo(() => {
    const noiseScale = 9 + specularHighlight.tiltStrength * 6 + size / 90;
    return createSpecularHighlightPaint({
      center: [center, center],
      innerRadius: innerRadius * 0.15,
      outerRadius,
      highlightAngle: specularHighlight.localAngle,
      arcWidth: specularHighlight.width,
      intensity: specularHighlight.intensity,
      noiseScale,
    });
  }, [center, innerRadius, outerRadius, size, specularHighlight]);
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

  const staticPicture = useMemo(
    () =>
      recordPicture(size, size, (canvas) => {
        canvas.drawCircle(center, center, outerRadius, brushPaint);
        canvas.drawCircle(center, center, outerRadius, shadowPaint);

        const majorTickPaint = Skia.Paint();
        majorTickPaint.setStyle(PaintStyle.Stroke);
        majorTickPaint.setStrokeWidth(size * 0.008);
        majorTickPaint.setStrokeCap(StrokeCap.Round);
        majorTickPaint.setColor(Skia.Color("rgba(0,0,0,0.55)"));
        majorTickPaint.setAntiAlias(true);

        const minorTickPaint = Skia.Paint();
        minorTickPaint.setStyle(PaintStyle.Stroke);
        minorTickPaint.setStrokeWidth(size * 0.0045);
        minorTickPaint.setStrokeCap(StrokeCap.Round);
        minorTickPaint.setColor(Skia.Color("rgba(0,0,0,0.32)"));
        minorTickPaint.setAntiAlias(true);

        tickData.forEach(({ outerPoint, innerPoint, isMajor }) => {
          const paint = isMajor ? majorTickPaint : minorTickPaint;
          canvas.drawLine(outerPoint.x, outerPoint.y, innerPoint.x, innerPoint.y, paint);
        });

        if (knurledPegData.length > 0) {
          const pegPaint = Skia.Paint();
          pegPaint.setStyle(PaintStyle.Stroke);
          pegPaint.setStrokeWidth(size * 0.009);
          pegPaint.setStrokeCap(StrokeCap.Round);
          pegPaint.setColor(Skia.Color("rgba(255,255,255,0.28)"));
          pegPaint.setAntiAlias(true);

          knurledPegData.forEach(({ segments }) => {
            segments.forEach(({ start, end }) => {
              canvas.drawLine(start.x, start.y, end.x, end.y, pegPaint);
            });
          });
        }

        const labelShadowPaint = Skia.Paint();
        labelShadowPaint.setColor(Skia.Color("rgba(255,255,255,0.25)"));
        labelShadowPaint.setAntiAlias(true);

        const labelPaint = Skia.Paint();
        labelPaint.setColor(Skia.Color("rgba(0,0,0,0.7)"));
        labelPaint.setAntiAlias(true);

        labels.forEach(({ text, x, y }) => {
          canvas.drawText(text, x + size * 0.002, y + size * 0.002, labelShadowPaint, font);
          canvas.drawText(text, x, y, labelPaint, font);
        });

        const diamondFillPaint = Skia.Paint();
        diamondFillPaint.setColor(Skia.Color("#0f172a"));
        diamondFillPaint.setAntiAlias(true);

        const diamondStrokePaint = Skia.Paint();
        diamondStrokePaint.setStyle(PaintStyle.Stroke);
        diamondStrokePaint.setStrokeWidth(size * 0.006);
        diamondStrokePaint.setColor(Skia.Color("#ffffff"));
        diamondStrokePaint.setAntiAlias(true);

        canvas.drawPath(zeroDiamond, diamondFillPaint);
        canvas.drawPath(zeroDiamond, diamondStrokePaint);

        canvas.drawCircle(center, center, outerRadius, outerChamferPaint);
        canvas.drawCircle(center, center, innerRadius, innerChamferPaint);
      }),
    [
      size,
      center,
      outerRadius,
      innerRadius,
      brushPaint,
      shadowPaint,
      tickData,
      knurledPegData,
      labels,
      font,
      zeroDiamond,
      outerChamferPaint,
      innerChamferPaint,
    ],
  );

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group origin={vec(center, center)} transform={[{ rotate: rotation }]}>
        <Picture picture={staticPicture} />
        {specularHighlightPaint ? (
          <Circle cx={center} cy={center} r={outerRadius} paint={specularHighlightPaint} />
        ) : null}
      </Group>
    </Canvas>
  );
};

const InnerWheel = React.memo(
  InnerWheelComponent,
  (prev, next) =>
    prev.size === next.size &&
    prev.rotation === next.rotation &&
    prev.showDetentPegs === next.showDetentPegs,
);

InnerWheel.displayName = "InnerWheel";

export { InnerWheel };

export default InnerWheel;
