import React, { useMemo } from "react";
import {
  BlurStyle,
  Canvas,
  Circle,
  Group,
  MaskFilter,
  PaintStyle,
  Path,
  Skia,
  TileMode,
  vec,
  type SkPaint,
  type SkPath,
} from "@shopify/react-native-skia";

export type IndexIndicatorProps = {
  /** Overall rendered size of the indicator overlay in logical pixels. */
  size?: number;
  /** Base tint applied to the anodised aluminium surface. */
  tintColor?: string;
  /** When true, renders a soft glow to reinforce the lock state. */
  locked?: boolean;
};

const DEFAULT_TINT = "#f4d35e";

/**
 * Mixes the provided tint toward either white or black to generate shading colours.
 */
const mixTint = (color: string, towardsWhite: boolean, factor: number): string => {
  const rgba = Skia.ColorToRGBA(Skia.Color(color));
  const target = towardsWhite ? 255 : 0;
  const mixChannel = (channel: number): number =>
    Math.round(channel + (target - channel) * factor);

  const red = mixChannel(rgba.r);
  const green = mixChannel(rgba.g);
  const blue = mixChannel(rgba.b);
  const alpha = Math.max(0, Math.min(1, rgba.a / 255));

  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
};

const buildSurfacePaint = (center: number, radius: number, tintColor: string): SkPaint => {
  // Gentle radial gradient to emulate brushed anodised aluminium with tint.
  const shader = Skia.Shader.MakeRadialGradient(
    vec(center, center),
    radius,
    [
      mixTint(tintColor, true, 0.45),
      mixTint(tintColor, true, 0.1),
      mixTint(tintColor, false, 0.25),
    ].map((color) => Skia.Color(color)),
    [0, 0.6, 1],
    TileMode.Clamp,
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  return paint;
};

const buildBezelPaint = (color: string, strokeWidth: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(strokeWidth);
  paint.setAntiAlias(true);
  return paint;
};

const buildGlowPaint = (radius: number, tintColor: string): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(mixTint(tintColor, true, 0.35)));
  paint.setAlphaf(0.55);
  paint.setMaskFilter(MaskFilter.MakeBlur(BlurStyle.Normal, radius * 0.18, true));
  return paint;
};

const buildPipPath = (center: number, outerRadius: number, size: number): SkPath => {
  const pipHeight = size * 0.16;
  const pipWidth = size * 0.12;
  const startY = center - outerRadius - pipHeight * 0.04;

  const path = Skia.Path.Make();
  path.moveTo(center, startY);
  path.quadTo(center + pipWidth / 2, startY + pipHeight * 0.45, center, startY + pipHeight);
  path.quadTo(center - pipWidth / 2, startY + pipHeight * 0.45, center, startY);
  path.close();
  return path;
};

const buildPipPaint = (tintColor: string): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeLinearGradient(
    vec(0, 0),
    vec(0, 1),
    [mixTint(tintColor, true, 0.6), mixTint(tintColor, false, 0.2)].map((color) => Skia.Color(color)),
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  return paint;
};

const buildHighlightPath = (center: number, outerRadius: number): SkPath => {
  const highlightWidth = outerRadius * 1.65;
  const highlightHeight = outerRadius * 0.85;
  const path = Skia.Path.Make();
  path.addRoundRect(
    Skia.XYWHRect(
      center - highlightWidth / 2,
      center - outerRadius * 0.95,
      highlightWidth,
      highlightHeight,
    ),
    outerRadius * 0.35,
    outerRadius * 0.35,
  );
  return path;
};

const buildHighlightPaint = (): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeLinearGradient(
    vec(0, 0),
    vec(0, 1),
    ["rgba(255, 255, 255, 0.45)", "rgba(255, 255, 255, 0)"]
      .map((color) => Skia.Color(color)),
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  return paint;
};

export const IndexIndicator: React.FC<IndexIndicatorProps> = ({
  size = 320,
  tintColor = DEFAULT_TINT,
  locked = false,
}) => {
  const center = size / 2;
  const outerRadius = size * 0.46;
  const bezelOuterRadius = outerRadius + size * 0.015;
  const bezelInnerRadius = outerRadius - size * 0.02;

  const surfacePaint = useMemo(
    () => buildSurfacePaint(center, outerRadius, tintColor),
    [center, outerRadius, tintColor],
  );

  const bezelHighlightPaint = useMemo(
    () => buildBezelPaint("#ffffff70", size * 0.012),
    [size],
  );
  const bezelShadowPaint = useMemo(
    () => buildBezelPaint("#00000055", size * 0.01),
    [size],
  );

  const glowPaint = useMemo(
    () => (locked ? buildGlowPaint(outerRadius, tintColor) : undefined),
    [locked, outerRadius, tintColor],
  );

  const pipPath = useMemo(
    () => buildPipPath(center, outerRadius, size),
    [center, outerRadius, size],
  );
  const pipPaint = useMemo(() => buildPipPaint(tintColor), [tintColor]);

  const highlightPath = useMemo(
    () => buildHighlightPath(center, outerRadius),
    [center, outerRadius],
  );
  const highlightPaint = useMemo(() => buildHighlightPaint(), []);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        {locked && glowPaint ? (
          <Circle cx={center} cy={center} r={outerRadius * 1.04} paint={glowPaint} />
        ) : null}

        {/* Micro-bezel outer ring */}
        <Circle cx={center} cy={center} r={bezelOuterRadius} paint={bezelHighlightPaint} />
        <Circle cx={center} cy={center} r={bezelInnerRadius} paint={bezelShadowPaint} />

        {/* Tinted indicator surface */}
        <Circle cx={center} cy={center} r={outerRadius} paint={surfacePaint} />

        {/* Glass reflection overlay */}
        <Path path={highlightPath} paint={highlightPaint} />

        {/* Fixed twelve o'clock pip */}
        <Path path={pipPath} paint={pipPaint} />
        <Circle
          cx={center}
          cy={center - outerRadius + size * 0.055}
          r={size * 0.022}
          color={mixTint(tintColor, true, 0.55)}
        />
        <Circle
          cx={center}
          cy={center - outerRadius + size * 0.055}
          r={size * 0.022}
          color="rgba(0, 0, 0, 0.25)"
          style="stroke"
          strokeWidth={size * 0.004}
        />
      </Group>
    </Canvas>
  );
};

export default IndexIndicator;
