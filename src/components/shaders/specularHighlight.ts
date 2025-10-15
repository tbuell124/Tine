import { BlendMode, Skia, type RuntimeEffect, type SkPaint } from "@shopify/react-native-skia";

export interface SpecularHighlightUniforms {
  center: [number, number];
  innerRadius: number;
  outerRadius: number;
  highlightAngle: number;
  arcWidth: number;
  intensity: number;
  noiseScale: number;
}

const SPECULAR_SOURCE = `
uniform float2 u_center;
uniform float u_innerRadius;
uniform float u_outerRadius;
uniform float u_highlightAngle;
uniform float u_arcWidth;
uniform float u_intensity;
uniform float u_noiseScale;

const float TWO_PI = 6.28318530718;

float gaussian(float x, float sigma) {
  float t = x / max(sigma, 0.0001);
  return exp(-0.5 * t * t);
}

float angleDiff(float a, float b) {
  float diff = abs(a - b);
  return min(diff, TWO_PI - diff);
}

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float brushedNoise(float angle, float radial, float scale) {
  float swirl = sin(angle * scale * 6.0 + radial * scale * 9.0) * 0.5 + 0.5;
  float rings = sin(radial * scale * 18.0 + angle * 2.0) * 0.5 + 0.5;
  float random = hash21(float2(angle * scale, radial * scale));
  return mix(mix(swirl, rings, 0.5), random, 0.25);
}

half4 main(float2 xy) {
  float2 delta = xy - u_center;
  float dist = length(delta);
  if (dist <= u_innerRadius || dist >= u_outerRadius) {
    return half4(0.0);
  }

  float angle = atan(delta.y, delta.x);
  float diff = angleDiff(angle, u_highlightAngle);
  float highlight = gaussian(diff, max(u_arcWidth, 0.0005));

  float radial = clamp((dist - u_innerRadius) / max(u_outerRadius - u_innerRadius, 0.0001), 0.0, 1.0);
  float noise = brushedNoise(angle, radial, u_noiseScale);
  float specular = highlight * u_intensity * (0.75 + noise * 0.5);
  float base = pow(highlight, 0.65) * 0.35;

  half3 baseColor = half3(0.78, 0.8, 0.85) * (base + noise * 0.08);
  half3 specColor = half3(1.0, 1.0, 1.0) * specular;

  float alpha = clamp(specular * 1.15 + base * 0.4, 0.0, 1.0);
  return half4(baseColor + specColor, alpha);
}
`;

let cachedEffect: RuntimeEffect | null | undefined;

const getEffect = (): RuntimeEffect | null => {
  if (cachedEffect !== undefined) {
    return cachedEffect;
  }

  cachedEffect = Skia.RuntimeEffect.Make(SPECULAR_SOURCE);
  return cachedEffect;
};

export const createSpecularHighlightPaint = (
  uniforms: SpecularHighlightUniforms,
): SkPaint | null => {
  const effect = getEffect();
  if (!effect) {
    return null;
  }

  const uniformValues = [
    uniforms.center[0],
    uniforms.center[1],
    uniforms.innerRadius,
    uniforms.outerRadius,
    uniforms.highlightAngle,
    uniforms.arcWidth,
    uniforms.intensity,
    uniforms.noiseScale,
  ];

  const shader = effect.makeShaderWithChildren(uniformValues, []);

  if (!shader) {
    return null;
  }

  const paint = Skia.Paint();
  paint.setShader(shader);
  paint.setBlendMode(BlendMode.Screen);
  paint.setAntiAlias(true);
  return paint;
};
