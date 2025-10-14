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
  StrokeCap,
  StrokeJoin,
  Text,
  TileMode,
  vec,
  type SkFont,
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

export const DEFAULT_INDICATOR_TINT = "#f4d35e";
const LOCK_LABEL = "IN TUNE";

type BadgeLayout = {
  path: SkPath;
  rect: { x: number; y: number; width: number; height: number };
  textX: number;
  textY: number;
};

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

const buildBadgeFont = (size: number): SkFont => {
  const typefaceFactory = (Skia.Typeface as { MakeDefault?: () => unknown }).MakeDefault;
  const typeface = typeof typefaceFactory === "function" ? typefaceFactory() : undefined;
  return Skia.Font(typeface, size);
};

const buildLockRingPaint = (
  center: number,
  outerRadius: number,
  tintColor: string,
): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeSweepGradient(
    vec(center, center),
    [
      mixTint(tintColor, true, 0.85),
      mixTint(tintColor, true, 0.35),
      mixTint(tintColor, false, 0.05),
      mixTint(tintColor, true, 0.85),
    ].map((color) => Skia.Color(color)),
    [0, 0.35, 0.7, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(outerRadius * 0.12);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setAntiAlias(true);
  return paint;
};

const buildBadgeLayout = (
  center: number,
  outerRadius: number,
  size: number,
  font: SkFont,
): BadgeLayout => {
  const width = size * 0.44;
  const height = size * 0.16;
  const top = center + outerRadius * 0.08;
  const left = center - width / 2;
  const rect = { x: left, y: top, width, height };
  const path = Skia.Path.Make();
  path.addRoundRect(
    Skia.XYWHRect(rect.x, rect.y, rect.width, rect.height),
    height / 2.6,
    height / 2.6,
  );

  const metrics = font.measureText(LOCK_LABEL);
  const textWidth = metrics?.width ?? 0;
  const textHeight = font.getSize();
  const textX = center - textWidth / 2;
  const textY = rect.y + rect.height / 2 + textHeight / 3;

  return { path, rect, textX, textY };
};

const buildBadgeFillPaint = (tintColor: string, layout: BadgeLayout): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeLinearGradient(
    vec(layout.rect.x, layout.rect.y),
    vec(layout.rect.x, layout.rect.y + layout.rect.height),
    [mixTint(tintColor, true, 0.7), mixTint(tintColor, false, 0.05)].map((color) =>
      Skia.Color(color),
    ),
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  paint.setAlphaf(0.92);
  paint.setAntiAlias(true);
  return paint;
};

const buildBadgeStrokePaint = (tintColor: string, layout: BadgeLayout): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(mixTint(tintColor, false, 0.2)));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(layout.rect.height * 0.08, 1.5));
  paint.setAntiAlias(true);
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

const buildPipShadowPaint = (pipLength: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color("rgba(15,23,42,0.45)"));
  paint.setMaskFilter(MaskFilter.MakeBlur(BlurStyle.Normal, pipLength * 0.18, true));
  paint.setAntiAlias(true);
  return paint;
};

const buildPipPath = (
  center: number,
  outerRadius: number,
  pipLength: number,
  pipWidth: number,
): SkPath => {
  const top = center - outerRadius - pipLength * 0.1;
  const bottom = top + pipLength;
  const left = center - pipWidth / 2;
  const right = center + pipWidth / 2;

  const path = Skia.Path.Make();
  path.moveTo(center, top);
  path.quadTo(right, top + pipLength * 0.35, center, bottom);
  path.quadTo(left, top + pipLength * 0.35, center, top);
  path.close();
  return path;
};

const buildPipFillPaint = (tintColor: string, pipLength: number): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeLinearGradient(
    vec(0, 0),
    vec(0, pipLength),
    [mixTint(tintColor, true, 0.65), mixTint(tintColor, false, 0.35)].map((color) =>
      Skia.Color(color),
    ),
    [0, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  paint.setAntiAlias(true);
  return paint;
};

const buildPipStrokePaint = (pipLength: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(pipLength * 0.08, 1.4));
  paint.setColor(Skia.Color("rgba(0,0,0,0.35)"));
  paint.setAntiAlias(true);
  return paint;
};

const buildPipHighlightPaint = (pipLength: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(pipLength * 0.05, 1));
  paint.setColor(Skia.Color("rgba(255,255,255,0.6)"));
  paint.setAntiAlias(true);
  return paint;
};

export const IndexIndicator: React.FC<IndexIndicatorProps> = ({
  size = 320,
  tintColor = DEFAULT_INDICATOR_TINT,
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

  const lockRingRadius = outerRadius * 0.78;
  const lockRingPaint = useMemo(
    () => (locked ? buildLockRingPaint(center, lockRingRadius, tintColor) : undefined),
    [center, lockRingRadius, locked, tintColor],
  );

  const badgeFont = useMemo(() => buildBadgeFont(size * 0.11), [size]);
  const badgeLayout = useMemo(
    () => buildBadgeLayout(center, outerRadius, size, badgeFont),
    [badgeFont, center, outerRadius, size],
  );
  const badgeFillPaint = useMemo(
    () => (locked ? buildBadgeFillPaint(tintColor, badgeLayout) : undefined),
    [badgeLayout, locked, tintColor],
  );
  const badgeStrokePaint = useMemo(
    () => (locked ? buildBadgeStrokePaint(tintColor, badgeLayout) : undefined),
    [badgeLayout, locked, tintColor],
  );

  const highlightPath = useMemo(
    () => buildHighlightPath(center, outerRadius),
    [center, outerRadius],
  );
  const highlightPaint = useMemo(() => buildHighlightPaint(), []);

  const pipLength = size * 0.18;
  const pipWidth = size * 0.11;
  const pipPath = useMemo(
    () => buildPipPath(center, outerRadius, pipLength, pipWidth),
    [center, outerRadius, pipLength, pipWidth],
  );
  const pipFillPaint = useMemo(
    () => buildPipFillPaint(tintColor, pipLength),
    [pipLength, tintColor],
  );
  const pipStrokePaint = useMemo(() => buildPipStrokePaint(pipLength), [pipLength]);
  const pipHighlightPaint = useMemo(() => buildPipHighlightPaint(pipLength), [pipLength]);
  const pipShadowPaint = useMemo(() => buildPipShadowPaint(pipLength), [pipLength]);

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

        {/* Fixed pip at 12 o'clock */}
        <Group>
          <Path path={pipPath} paint={pipShadowPaint} />
          <Path path={pipPath} paint={pipFillPaint} />
          <Path path={pipPath} paint={pipStrokePaint} />
          <Path path={pipPath} paint={pipHighlightPaint} />
        </Group>

        {locked && lockRingPaint ? (
          <Circle cx={center} cy={center} r={lockRingRadius} paint={lockRingPaint} />
        ) : null}

        {locked && badgeFillPaint && badgeStrokePaint ? (
          <Group>
            <Path path={badgeLayout.path} paint={badgeFillPaint} />
            <Path path={badgeLayout.path} paint={badgeStrokePaint} />
            <Text
              x={badgeLayout.textX + size * 0.002}
              y={badgeLayout.textY + size * 0.002}
              text={LOCK_LABEL}
              font={badgeFont}
              color="rgba(255, 255, 255, 0.55)"
            />
            <Text
              x={badgeLayout.textX}
              y={badgeLayout.textY}
              text={LOCK_LABEL}
              font={badgeFont}
              color="rgba(15, 23, 42, 0.95)"
            />
          </Group>
        ) : null}
      </Group>
    </Canvas>
  );
};

export default IndexIndicator;
