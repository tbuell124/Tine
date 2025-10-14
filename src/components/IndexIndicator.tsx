import React, { useMemo } from "react";
import {
  BlurStyle,
  Canvas,
  Circle,
  Group,
  MaskFilter,
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
import { type TuningState } from "../theme";
import { recordPicture } from "@utils/skia";

export type IndexIndicatorProps = {
  /** Overall rendered size of the indicator overlay in logical pixels. */
  size?: number;
  /** Base tint applied to the anodised aluminium surface. */
  tintColor?: string;
  /** Accent tint applied to the glow and status ring. */
  accentColor?: string;
  /** When true, renders a soft glow to reinforce the lock state. */
  locked?: boolean;
  /** Current tuning state to drive colour intensity. */
  status?: TuningState;
};

export const DEFAULT_INDICATOR_TINT = "#f4d35e";
const LOCK_LABEL = "IN TUNE";

const STATUS_VISUALS: Record<
  TuningState,
  { glowAlpha: number; ringAlpha: number; strokeScale: number }
> = {
  locked: { glowAlpha: 0.6, ringAlpha: 1, strokeScale: 0.12 },
  near: { glowAlpha: 0.45, ringAlpha: 0.9, strokeScale: 0.11 },
  approaching: { glowAlpha: 0.35, ringAlpha: 0.75, strokeScale: 0.1 },
  far: { glowAlpha: 0.25, ringAlpha: 0.65, strokeScale: 0.095 },
};

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

const buildGlowPaint = (radius: number, accentColor: string, alpha: number): SkPaint => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(mixTint(accentColor, true, 0.35)));
  paint.setAlphaf(alpha);
  paint.setMaskFilter(MaskFilter.MakeBlur(BlurStyle.Normal, radius * 0.18, true));
  return paint;
};

const buildBadgeFont = (size: number): SkFont => {
  const typefaceFactory = (Skia.Typeface as { MakeDefault?: () => unknown }).MakeDefault;
  const typeface = typeof typefaceFactory === "function" ? typefaceFactory() : undefined;
  return Skia.Font(typeface, size);
};

const buildStatusRingPaint = (
  center: number,
  outerRadius: number,
  accentColor: string,
  strokeScale: number,
  alpha: number,
): SkPaint => {
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeSweepGradient(
    vec(center, center),
    [
      mixTint(accentColor, true, 0.65),
      accentColor,
      mixTint(accentColor, false, 0.35),
      mixTint(accentColor, true, 0.65),
    ].map((color) => Skia.Color(color)),
    [0, 0.35, 0.7, 1],
    TileMode.Clamp,
  );
  paint.setShader(shader);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(outerRadius * strokeScale);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setAlphaf(alpha);
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

const IndexIndicatorComponent: React.FC<IndexIndicatorProps> = ({
  size = 320,
  tintColor = DEFAULT_INDICATOR_TINT,
  accentColor,
  locked = false,
  status,
}) => {
  const center = size / 2;
  const outerRadius = size * 0.46;
  const bezelOuterRadius = outerRadius + size * 0.015;
  const bezelInnerRadius = outerRadius - size * 0.02;

  const resolvedStatus: TuningState = status ?? (locked ? "locked" : "far");
  const resolvedAccent = accentColor ?? tintColor;
  const { glowAlpha, ringAlpha, strokeScale } = STATUS_VISUALS[resolvedStatus];

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
    () => (glowAlpha > 0 ? buildGlowPaint(outerRadius, resolvedAccent, glowAlpha) : undefined),
    [glowAlpha, outerRadius, resolvedAccent],
  );

  const statusRingRadius = outerRadius * 0.78;
  const statusRingPaint = useMemo(
    () =>
      ringAlpha > 0
        ? buildStatusRingPaint(center, statusRingRadius, resolvedAccent, strokeScale, ringAlpha)
        : undefined,
    [center, resolvedAccent, ringAlpha, statusRingRadius, strokeScale],
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

  const basePicture = useMemo(
    () =>
      recordPicture(size, size, (canvas) => {
        canvas.drawCircle(center, center, bezelOuterRadius, bezelHighlightPaint);
        canvas.drawCircle(center, center, bezelInnerRadius, bezelShadowPaint);
        canvas.drawCircle(center, center, outerRadius, surfacePaint);
        canvas.drawPath(highlightPath, highlightPaint);

        if (locked && badgeFillPaint && badgeStrokePaint) {
          canvas.drawPath(badgeLayout.path, badgeFillPaint);
          canvas.drawPath(badgeLayout.path, badgeStrokePaint);

          const badgeShadowTextPaint = Skia.Paint();
          badgeShadowTextPaint.setColor(Skia.Color("rgba(255, 255, 255, 0.55)"));
          badgeShadowTextPaint.setAntiAlias(true);

          const badgeTextPaint = Skia.Paint();
          badgeTextPaint.setColor(Skia.Color("rgba(15, 23, 42, 0.95)"));
          badgeTextPaint.setAntiAlias(true);

          canvas.drawText(
            LOCK_LABEL,
            badgeLayout.textX + size * 0.002,
            badgeLayout.textY + size * 0.002,
            badgeShadowTextPaint,
            badgeFont,
          );
          canvas.drawText(LOCK_LABEL, badgeLayout.textX, badgeLayout.textY, badgeTextPaint, badgeFont);
        }
      }),
    [
      size,
      center,
      bezelOuterRadius,
      bezelInnerRadius,
      outerRadius,
      bezelHighlightPaint,
      bezelShadowPaint,
      surfacePaint,
      highlightPath,
      highlightPaint,
      locked,
      badgeFillPaint,
      badgeStrokePaint,
      badgeLayout,
      badgeFont,
    ],
  );

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        {glowPaint ? (
          <Circle cx={center} cy={center} r={outerRadius * 1.04} paint={glowPaint} />
        ) : null}

        <Picture picture={basePicture} />

        {statusRingPaint ? (
          <Circle cx={center} cy={center} r={statusRingRadius} paint={statusRingPaint} />
        ) : null}
      </Group>
    </Canvas>
  );
};

const IndexIndicator = React.memo(
  IndexIndicatorComponent,
  (prev, next) =>
    prev.size === next.size &&
    prev.tintColor === next.tintColor &&
    prev.accentColor === next.accentColor &&
    prev.locked === next.locked &&
    prev.status === next.status,
);

IndexIndicator.displayName = "IndexIndicator";

export { IndexIndicator };

export default IndexIndicator;
