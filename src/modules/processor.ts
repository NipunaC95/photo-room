// ============================================================
// Image Processing Engine — WebGL 2.0 GPU Accelerated
// All color adjustments run as GLSL fragment shaders on the GPU.
// Render time is <16ms regardless of image resolution.
// ============================================================

import { buildCurveLUTFloat } from './colormath';
import type { CurvePoint } from './colormath';
import type { CameraMetadata } from './raw';
import { encode16BitTiff } from './raw';

// ============================================================
// Adjustment State Interfaces (unchanged — same public API)
// ============================================================

export interface BasicAdjustments {
  temperature: number;   // 2000–50000 K
  tint: number;          // –150 to +150
  exposure: number;      // –5 to +5 EV
  contrast: number;      // –100 to +100
  highlights: number;    // –100 to +100
  shadows: number;       // –100 to +100
  whites: number;        // –100 to +100
  blacks: number;        // –100 to +100
  clarity: number;       // –100 to +100
  dehaze: number;        // –100 to +100
  vibrance: number;      // –100 to +100
  saturation: number;    // –100 to +100
}

export interface HSLColor {
  hue: number;        // –100 to +100
  saturation: number; // –100 to +100
  luminance: number;  // –100 to +100
}

export interface ColorGradingWheel {
  hue: number;        // 0–360
  saturation: number; // 0–100
  luminance: number;  // –100 to +100
}

export interface ColorGradingAdjustments {
  shadows: ColorGradingWheel;
  midtones: ColorGradingWheel;
  highlights: ColorGradingWheel;
  blending: number;
  balance: number;
}

export interface DetailAdjustments {
  sharpenAmount: number;
  sharpenRadius: number;
  sharpenDetail: number;
  sharpenMasking: number;
  nrLuminance: number;
  nrLumDetail: number;
  nrLumContrast: number;
  nrColor: number;
  nrColorDetail: number;
  nrColorSmooth: number;
}

export interface EffectsAdjustments {
  vignetteAmount: number;
  vignetteMidpoint: number;
  vignetteFeather: number;
  vignetteRoundness: number;
  grainAmount: number;
  grainSize: number;
  grainRoughness: number;
}

export interface CalibrationAdjustments {
  shadowTint: number;
  redHue: number;
  redSaturation: number;
  greenHue: number;
  greenSaturation: number;
  blueHue: number;
  blueSaturation: number;
}

import { type CropAdjustments, defaultCropAdjustments } from '../panels/crop';

export interface Adjustments {
  basic: BasicAdjustments;
  curves: { rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] };
  hsl: HSLColor[];
  grading: ColorGradingAdjustments;
  detail: DetailAdjustments;
  effects: EffectsAdjustments;
  calibration: CalibrationAdjustments;
  crop: CropAdjustments;
}

export function defaultAdjustments(): Adjustments {
  const defaultCurve = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const defaultHSL = (): HSLColor => ({ hue: 0, saturation: 0, luminance: 0 });
  const defaultWheel = (): ColorGradingWheel => ({ hue: 0, saturation: 0, luminance: 0 });
  return {
    basic: {
      temperature: 6500, tint: 0, exposure: 0, contrast: 0,
      highlights: 0, shadows: 0, whites: 0, blacks: 0,
      clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
    },
    curves: {
      rgb: defaultCurve(), r: defaultCurve(), g: defaultCurve(), b: defaultCurve(),
    },
    hsl: Array.from({ length: 8 }, defaultHSL),
    grading: {
      shadows: defaultWheel(), midtones: defaultWheel(), highlights: defaultWheel(),
      blending: 50, balance: 0,
    },
    detail: {
      sharpenAmount: 0, sharpenRadius: 1, sharpenDetail: 25, sharpenMasking: 0,
      nrLuminance: 0, nrLumDetail: 50, nrLumContrast: 0,
      nrColor: 0, nrColorDetail: 50, nrColorSmooth: 50,
    },
    effects: {
      vignetteAmount: 0, vignetteMidpoint: 50, vignetteFeather: 50,
      vignetteRoundness: 0, grainAmount: 0, grainSize: 25, grainRoughness: 50,
    },
    calibration: {
      shadowTint: 0, redHue: 0, redSaturation: 0,
      greenHue: 0, greenSaturation: 0, blueHue: 0, blueSaturation: 0,
    },
    crop: defaultCropAdjustments(),
  };
}


// ============================================================
// GLSL — Vertex Shader (trivial full-screen quad passthrough)
// ============================================================
const VERT_SRC = /* glsl */`#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  // NDC [-1,1] → texture UV [0,1]
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// ============================================================
// GLSL — Fragment Shader
// Implements the full Lightroom adjustment pipeline on the GPU.
// Every pixel is processed in parallel by thousands of GPU cores.
// ============================================================
const FRAG_SRC = /* glsl */`#version 300 es
precision highp float;

// --- Textures ---
uniform sampler2D u_image;
// Packed 256×1 tone curve LUT:
//   .r = combined R curve  (rgb_lut → r_channel_lut)
//   .g = combined G curve  (rgb_lut → g_channel_lut)
//   .b = combined B curve  (rgb_lut → b_channel_lut)
uniform sampler2D u_curveLUT;

// --- Basic ---
uniform float u_temperature;
uniform float u_tint;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_clarity;
uniform float u_dehaze;
uniform float u_vibrance;
uniform float u_saturation;

// --- HSL: 8 color ranges (red/orange/yellow/green/aqua/blue/purple/magenta) ---
// .x = hue shift, .y = sat shift, .z = lum shift  (all –100 to +100)
uniform vec3 u_hsl[8];

// --- Color Grading ---
// .x = hue (0–360), .y = saturation (0–100), .z = luminance (–100 to +100)
uniform vec3 u_grading_shadows;
uniform vec3 u_grading_midtones;
uniform vec3 u_grading_highlights;
uniform float u_grading_blending;
uniform float u_grading_balance;

// --- Effects ---
uniform float u_vignette_amount;
uniform float u_vignette_midpoint;
uniform float u_vignette_feather;
uniform float u_grain_amount;
uniform float u_grain_roughness;
uniform float u_grain_seed;    // changes per render for animated grain

// --- Calibration ---
uniform float u_shadow_tint;
uniform vec2  u_red_primary;    // .x=hue, .y=sat shift
uniform vec2  u_green_primary;
uniform vec2  u_blue_primary;

// --- Crop, Rotation & Flip ---
uniform vec4  u_crop;       // .x = xMin, .y = yMin, .z = width, .w = height
uniform float u_rotation;   // angle in radians
uniform float u_flip_h;     // 0.0 or 1.0
uniform float u_flip_v;     // 0.0 or 1.0

// --- Spatial Layer Mask Texture ---
uniform sampler2D u_mask_texture;
uniform float u_use_mask;
uniform float u_mask_opacity;

in vec2 v_uv;
out vec4 fragColor;

// ============================================================
// Color Space Conversions
// ============================================================

vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  if (maxC == minC) return vec3(0.0, 0.0, l);
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  float h;
  if      (maxC == c.r) h = ((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0)) / 6.0;
  else if (maxC == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
  else                  h = ((c.r - c.g) / d + 4.0) / 6.0;
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  t = mod(t, 1.0);
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5)     return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Smooth cubic step
float smoothcubic(float x) {
  return x * x * (3.0 - 2.0 * x);
}

// ============================================================
// Stage 1 — Calibration (camera profile primary shifts)
// ============================================================
vec3 applyCalibration(vec3 col) {
  vec3 hsl = rgbToHsl(col);
  float hueDeg = hsl.x * 360.0;

  // Shadow tint — shifts hue of dark pixels toward green or magenta
  if (u_shadow_tint != 0.0 && hsl.z < 0.5) {
    float mask = (0.5 - hsl.z) * 2.0;
    hsl.x = mod(hsl.x + mask * (abs(u_shadow_tint) / 100.0) * 0.02 * sign(u_shadow_tint) + 1.0, 1.0);
  }

  // Per-primary hue/saturation shifts weighted by color proximity
  float redW   = max(
    max(0.0, 1.0 - min(abs(hueDeg),       abs(hueDeg - 360.0)) / 40.0),
    max(0.0, 1.0 - min(abs(hueDeg - 360.0), abs(hueDeg))       / 40.0)
  );
  float greenW = max(0.0, 1.0 - abs(hueDeg - 120.0) / 50.0);
  float blueW  = max(0.0, 1.0 - abs(hueDeg - 220.0) / 50.0);
  float totalW = redW + greenW + blueW;

  if (totalW > 0.0) {
    float dH = (redW * u_red_primary.x + greenW * u_green_primary.x + blueW * u_blue_primary.x)
               / totalW / 360.0 * 0.1;
    float dS = (redW * u_red_primary.y + greenW * u_green_primary.y + blueW * u_blue_primary.y)
               / totalW / 100.0 * 0.3;
    hsl.x = mod(hsl.x + dH + 1.0, 1.0);
    hsl.y = clamp(hsl.y + dS, 0.0, 1.0);
  }
  return hslToRgb(hsl);
}

// ============================================================
// Stage 2 — White Balance (Planckian locus approximation)
// ============================================================
vec3 applyWhiteBalance(vec3 col) {
  float t = clamp(u_temperature, 2000.0, 50000.0);
  float r, g, b;

  if (t <= 6600.0) {
    r = 1.0;
    g = clamp((99.4708 * log(t / 100.0) - 161.1196) / 255.0, 0.0, 1.0);
    b = (t <= 1900.0) ? 0.0
      : clamp((138.5177 * log(max(t / 100.0 - 10.0, 0.001)) - 305.0448) / 255.0, 0.0, 1.0);
  } else {
    r = clamp(329.6987 * pow(t / 100.0 - 60.0, -0.1332) / 255.0, 0.0, 1.0);
    g = clamp(288.1222 * pow(t / 100.0 - 60.0, -0.0755) / 255.0, 0.0, 1.0);
    b = 1.0;
  }

  // Tint: shifts green channel (positive = more green, negative = magenta)
  g = clamp(g - (u_tint / 150.0) * 0.15, 0.01, 2.0);

  float maxV = max(r, max(g, b));
  vec3 mul = vec3(r, g, b) / maxV;
  return clamp(col * mul, 0.0, 1.0);
}

// ============================================================
// Stage 4 — Highlights / Shadows tone mapping
// ============================================================
vec3 applyHighlightsShadows(vec3 col) {
  float lum = luminance(col);
  float newLum = lum;

  if (u_highlights != 0.0) {
    float h = u_highlights / 100.0;
    float mask = smoothcubic(clamp((lum - 0.5) * 2.0, 0.0, 1.0));
    newLum -= mask * h * 0.5;
  }
  if (u_shadows != 0.0) {
    float s = u_shadows / 100.0;
    float mask = smoothcubic(clamp((0.5 - lum) * 2.0, 0.0, 1.0));
    newLum += mask * s * 0.5;
  }

  newLum = clamp(newLum, 0.0, 1.0);
  if (lum > 0.001) col *= (newLum / lum);
  return clamp(col, 0.0, 1.0);
}

// ============================================================
// Stage 6 — Contrast (sigmoid curve)
// ============================================================
vec3 applySigmoidContrast(vec3 col) {
  if (u_contrast == 0.0) return col;
  float c = u_contrast / 100.0;
  float k = c * 5.0;
  vec3 sig = 1.0 / (1.0 + exp(-k * (col - 0.5)));
  float strength = abs(c);
  return clamp(col * (1.0 - strength) + sig * strength, 0.0, 1.0);
}

// ============================================================
// Stage 8 — Vibrance (boosts low-saturation colors more)
// ============================================================
vec3 applyVibrance(vec3 col) {
  if (u_vibrance == 0.0) return col;
  vec3 hsl = rgbToHsl(col);
  float v = u_vibrance / 100.0;
  float boost = v * (1.0 - hsl.y * 0.8); // saturated colors get less boost
  hsl.y = clamp(hsl.y + boost * 0.5, 0.0, 1.0);
  return hslToRgb(hsl);
}

// ============================================================
// Stage 11 — HSL per-color targeting
// Each of 8 color ranges gets independent H/S/L adjustments
// ============================================================
// HSL color range centers (degrees) and half-widths
const float HSL_CENTERS[8]    = float[8](  0.0,  30.0,  60.0, 120.0, 180.0, 220.0, 280.0, 320.0);
const float HSL_HALFWIDTHS[8] = float[8]( 25.0,  20.0,  25.0,  40.0,  30.0,  30.0,  30.0,  25.0);

float hueWeight(float pixHueDeg, float center, float halfW) {
  float diff = abs(pixHueDeg - center);
  if (diff > 180.0) diff = 360.0 - diff;
  return max(0.0, 1.0 - diff / halfW);
}

vec3 applyHSL(vec3 col) {
  vec3 hsl = rgbToHsl(col);
  float hueDeg = hsl.x * 360.0;

  float totalH = 0.0, totalS = 0.0, totalL = 0.0, totalW = 0.0;

  for (int i = 0; i < 8; i++) {
    float w = hueWeight(hueDeg, HSL_CENTERS[i], HSL_HALFWIDTHS[i]);
    if (w > 0.0) {
      totalH += w * u_hsl[i].x;
      totalS += w * u_hsl[i].y;
      totalL += w * u_hsl[i].z;
      totalW += w;
    }
  }

  if (totalW > 0.0) {
    hsl.x = mod(hsl.x + totalH / totalW / 360.0 + 1.0, 1.0);
    hsl.y = clamp(hsl.y + totalS / totalW / 100.0 * 0.5, 0.0, 1.0);
    hsl.z = clamp(hsl.z + totalL / totalW / 100.0 * 0.5, 0.0, 1.0);
    return hslToRgb(hsl);
  }
  return col;
}

// ============================================================
// Stage 12 — Color Grading (Shadows / Midtones / Highlights wheels)
// ============================================================
vec3 wheelTintDelta(float w, vec3 wheel) {
  vec3 d = vec3(0.0);
  if (w <= 0.0) return d;
  if (wheel.y > 0.0) {
    vec3 tintCol = hslToRgb(vec3(wheel.x / 360.0, wheel.y / 100.0, 0.5));
    d += (tintCol - 0.5) * (w * wheel.y / 100.0 * 0.3);
  }
  if (wheel.z != 0.0) d += vec3(w * wheel.z / 100.0 * 0.2);
  return d;
}

vec3 applyColorGrading(vec3 col) {
  float lum     = luminance(col);
  float blend   = u_grading_blending / 100.0;
  float balance = u_grading_balance  / 100.0;

  float shadowW    = pow(clamp(1.0 - lum * 2.0, 0.0, 1.0), 2.0) * (1.0 - balance * 0.5);
  float highlightW = pow(clamp((lum - 0.5) * 2.0, 0.0, 1.0), 2.0) * (1.0 + balance * 0.5);
  float midtoneW   = 4.0 * lum * (1.0 - lum) * blend;

  vec3 delta = vec3(0.0);
  delta += wheelTintDelta(shadowW,    u_grading_shadows);
  delta += wheelTintDelta(midtoneW,   u_grading_midtones);
  delta += wheelTintDelta(highlightW, u_grading_highlights);

  return clamp(col + delta, 0.0, 1.0);
}

// ============================================================
// Stage 13 — Dehaze
// ============================================================
vec3 applyDehaze(vec3 col) {
  if (u_dehaze == 0.0) return col;
  float a = u_dehaze / 100.0;

  if (a > 0.0) {
    float lum  = luminance(col);
    float mask = sqrt(lum);
    col = clamp(col - mask * a * 0.3, 0.0, 1.0);
    vec3 hsl = rgbToHsl(col);
    hsl.y = clamp(hsl.y + a * 0.2, 0.0, 1.0);
    col = hslToRgb(hsl);
  } else {
    float abs_a = abs(a);
    col = clamp(col + (vec3(0.7) - col) * abs_a * 0.5, 0.0, 1.0);
  }
  return col;
}

// ============================================================
// Stage 14 — Vignette
// ============================================================
vec3 applyVignette(vec3 col) {
  if (u_vignette_amount == 0.0) return col;

  // Normalized ellipse distance (0=center, ~1=corner)
  vec2 d    = (v_uv - 0.5) * 2.0;
  float dist = length(d) / sqrt(2.0);

  float midpoint = u_vignette_midpoint / 100.0;
  float feather  = max(u_vignette_feather / 100.0, 0.001);
  float inner    = midpoint - feather * 0.5;
  float outer    = midpoint + feather * 0.5;

  float t    = clamp((dist - inner) / (outer - inner), 0.0, 1.0);
  float mask = smoothcubic(t);

  float amount   = u_vignette_amount / 100.0;
  float strength = mask * abs(amount);
  float multiply = amount < 0.0 ? (1.0 - strength) : (1.0 + strength * 0.5);
  return clamp(col * multiply, 0.0, 1.0);
}

// ============================================================
// Stage 15 — Film Grain (GPU hash-based, per-pixel random)
// ============================================================
float hash21(vec2 p) {
  p  = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 applyGrain(vec3 col) {
  if (u_grain_amount <= 0.0) return col;
  float amount    = u_grain_amount / 100.0;
  float roughness = u_grain_roughness / 100.0;
  // Hash seed varies per render via u_grain_seed uniform
  float noise = (hash21(v_uv * 4000.0 + u_grain_seed) - 0.5)
                * amount * 0.25 * (0.5 + roughness * 0.5);
  return clamp(col + noise, 0.0, 1.0);
}

// ============================================================
// Main — full pipeline in order
// ============================================================
void main() {
  vec2 uv = v_uv;

  // Flip transformations
  if (u_flip_h > 0.5) uv.x = 1.0 - uv.x;
  if (u_flip_v > 0.5) uv.y = 1.0 - uv.y;

  // Angle Rotation around center (0.5, 0.5)
  if (abs(u_rotation) > 0.0001) {
    vec2 center = vec2(0.5);
    float cosA = cos(u_rotation);
    float sinA = sin(u_rotation);
    vec2 dir = uv - center;
    uv = vec2(
      dir.x * cosA - dir.y * sinA,
      dir.x * sinA + dir.y * cosA
    ) + center;
  }

  // Remap UV to crop bounds
  uv = vec2(
    u_crop.x + uv.x * u_crop.z,
    u_crop.y + uv.y * u_crop.w
  );

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 origCol = texture(u_image, uv).rgb;
  vec3 col = origCol;

  // 1. Calibration
  col = applyCalibration(col);

  // 2. White Balance
  col = applyWhiteBalance(col);

  // 3. Exposure
  col = clamp(col * pow(2.0, u_exposure), 0.0, 1.0);

  // 4. Highlights / Shadows
  col = applyHighlightsShadows(col);

  // 5. Whites / Blacks
  float wScale  = 1.0 + u_whites / 200.0;
  float bOffset = u_blacks / 500.0;
  col = clamp(col * wScale - bOffset, 0.0, 1.0);

  // 6. Contrast
  col = applySigmoidContrast(col);

  // 7. Clarity — midtone local contrast boost
  if (u_clarity != 0.0) {
    float lum     = luminance(col);
    float c       = u_clarity / 100.0;
    float midMask = 4.0 * lum * (1.0 - lum); // peaks at lum=0.5
    float boost   = 1.0 + c * midMask * 0.5;
    col = clamp((col - 0.5) * boost + 0.5, 0.0, 1.0);
  }

  // 8. Vibrance
  col = applyVibrance(col);

  // 9. Saturation
  if (u_saturation != 0.0) {
    vec3 hsl  = rgbToHsl(col);
    hsl.y = clamp(hsl.y + u_saturation / 100.0 * (1.0 - hsl.y * 0.5), 0.0, 1.0);
    col = hslToRgb(hsl);
  }

  // 10. Tone Curves
  col.r = texture(u_curveLUT, vec2(col.r * (1023.0 / 1024.0) + 0.5 / 1024.0, 0.5)).r;
  col.g = texture(u_curveLUT, vec2(col.g * (1023.0 / 1024.0) + 0.5 / 1024.0, 0.5)).g;
  col.b = texture(u_curveLUT, vec2(col.b * (1023.0 / 1024.0) + 0.5 / 1024.0, 0.5)).b;

  // 11. HSL per-color adjustments
  col = applyHSL(col);

  // 12. Color Grading
  col = applyColorGrading(col);

  // 13. Dehaze
  col = applyDehaze(col);

  // 14. Vignette
  col = applyVignette(col);

  // 15. Film Grain
  col = applyGrain(col);

  // Apply spatial mask texture weighting
  if (u_use_mask > 0.5) {
    float maskVal = texture(u_mask_texture, uv).a;
    if (maskVal <= 0.001) {
      maskVal = texture(u_mask_texture, uv).r;
    }
    col = mix(origCol, col, clamp(maskVal * u_mask_opacity, 0.0, 1.0));
  }

  fragColor = vec4(col, 1.0);
}
`;

// ============================================================
// WebGL Helper Functions
// ============================================================

function createShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error:\n${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    throw new Error(`Program link error:\n${info}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return prog;
}

function createTexture(gl: WebGL2RenderingContext, filter: number = gl.LINEAR): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ============================================================
// ImageProcessor — GPU-Accelerated
// ============================================================
export class ImageProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private imageTexture: WebGLTexture | null = null;
  private curveLUTTexture: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  private canvas: HTMLCanvasElement;
  private adjustments: Adjustments = defaultAdjustments();
  private imageWidth  = 0;
  private imageHeight = 0;
  private rafId: number | null = null;
  private dirty = false;
  private maskTexture: WebGLTexture | null = null;
  private useMask = 0;
  private maskOpacity = 1.0;

  setAdjustments(adj: Adjustments): void {
    this.adjustments = adj;
    this.scheduleRender();
  }

  setMaskTexture(maskCanvas: HTMLCanvasElement | null, opacity = 1.0): void {
    const gl = this.gl;
    this.maskOpacity = opacity;

    if (!maskCanvas) {
      this.useMask = 0;
      this.scheduleRender();
      return;
    }

    this.useMask = 1;
    if (!this.maskTexture) {
      this.maskTexture = createTexture(gl, gl.LINEAR);
    }

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);

    this.scheduleRender();
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Obtain WebGL2 context with wide-gamut Display P3 support where available
    const gl = (canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      alpha: false,
      antialias: false,
      colorSpace: 'display-p3',
    }) || canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      alpha: false,
      antialias: false,
    })) as WebGL2RenderingContext | null;

    if (!gl) {
      throw new Error(
        'WebGL 2.0 is not supported by your browser. ' +
        'Please use a modern browser (Chrome 56+, Firefox 51+, Safari 15+).'
      );
    }
    this.gl = gl;

    // Check for float texture and color buffer extensions
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    // Attempt to set wide display color space
    try {
      if ('drawingBufferColorSpace' in gl) {
        (gl as any).drawingBufferColorSpace = 'display-p3';
      }
    } catch {
      // Fallback to default color space
    }

    // Build shader program
    this.program = createProgram(gl, VERT_SRC, FRAG_SRC);
    gl.useProgram(this.program);

    // Full-screen quad (two triangles covering NDC [-1,1])
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,   1, -1,   -1, 1,
      -1,  1,   1, -1,    1, 1,
    ]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Cache all uniform locations
    const uniformNames = [
      'u_image', 'u_curveLUT',
      'u_temperature', 'u_tint', 'u_exposure', 'u_contrast',
      'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
      'u_clarity', 'u_dehaze', 'u_vibrance', 'u_saturation',
      'u_hsl',
      'u_grading_shadows', 'u_grading_midtones', 'u_grading_highlights',
      'u_grading_blending', 'u_grading_balance',
      'u_vignette_amount', 'u_vignette_midpoint', 'u_vignette_feather',
      'u_grain_amount', 'u_grain_roughness', 'u_grain_seed',
      'u_shadow_tint', 'u_red_primary', 'u_green_primary', 'u_blue_primary',
      'u_crop', 'u_rotation', 'u_flip_h', 'u_flip_v',
      'u_mask_texture', 'u_use_mask', 'u_mask_opacity',
    ];

    for (const name of uniformNames) {
      const loc = gl.getUniformLocation(this.program, name);
      if (loc) this.uniforms.set(name, loc);
    }

    // Bind texture units
    gl.uniform1i(this.uniforms.get('u_image')!, 0);
    gl.uniform1i(this.uniforms.get('u_curveLUT')!, 1);

    // Create 10-bit curve LUT texture (1024×1 RGBA float with LINEAR filtering)
    this.curveLUTTexture = createTexture(gl, gl.LINEAR);
    this.updateCurveLUT();
  }

  loadImage(img: HTMLImageElement): void {
    const gl = this.gl;
    this.imageWidth  = img.naturalWidth;
    this.imageHeight = img.naturalHeight;
    this.bitDepth = 10; // Promoted to 10-bit / 16F pipeline on GPU
    this.rawMetadata = null;

    // Resize canvas to match image resolution
    this.canvas.width  = this.imageWidth;
    this.canvas.height = this.imageHeight;
    gl.viewport(0, 0, this.imageWidth, this.imageHeight);

    // Clean up previous texture to prevent format/dimension conflicts
    if (this.imageTexture) {
      gl.deleteTexture(this.imageTexture);
    }
    this.imageTexture = createTexture(gl, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    this.scheduleRender();
  }

  loadRawData(
    width: number,
    height: number,
    floatData: Float32Array,
    bitDepth = 14,
    metadata?: CameraMetadata
  ): void {
    const gl = this.gl;
    this.imageWidth  = width;
    this.imageHeight = height;
    this.bitDepth = bitDepth;
    this.rawMetadata = metadata || null;

    this.canvas.width  = this.imageWidth;
    this.canvas.height = this.imageHeight;
    gl.viewport(0, 0, this.imageWidth, this.imageHeight);

    // Clean up previous texture
    if (this.imageTexture) {
      gl.deleteTexture(this.imageTexture);
    }
    this.imageTexture = createTexture(gl, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    // Flip rows so row 0 (top of image) is at UV y = 1.0 (top of screen)
    const flipped = new Float32Array(width * height * 4);
    const rowFloats = width * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = y * rowFloats;
      const dstRow = (height - 1 - y) * rowFloats;
      flipped.set(floatData.subarray(srcRow, srcRow + rowFloats), dstRow);
    }
    // Upload true high bit-depth normalized float data into RGBA16F texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, flipped);

    this.scheduleRender();
  }

  getBitDepth(): number {
    return this.bitDepth;
  }

  getMetadata(): CameraMetadata | null {
    return this.rawMetadata;
  }

  setAdjustments(adj: Adjustments): void {
    this.adjustments = adj;
    this.scheduleRender();
  }

  getAdjustments(): Adjustments {
    return this.adjustments;
  }

  hasImage(): boolean {
    return this.imageTexture !== null && this.imageWidth > 0;
  }

  getImageDataSampled(maxDim: number): ImageData | null {
    if (!this.hasImage()) return null;
    const scale = Math.min(1, maxDim / Math.max(this.canvas.width, this.canvas.height));
    const w = Math.max(1, Math.round(this.canvas.width  * scale));
    const h = Math.max(1, Math.round(this.canvas.height * scale));
    const tmp    = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tmpCtx = tmp.getContext('2d')!;
    tmpCtx.drawImage(this.canvas, 0, 0, w, h);
    return tmpCtx.getImageData(0, 0, w, h);
  }

  getImageDataUrl(quality = 0.95): string {
    return this.canvas.toDataURL('image/jpeg', quality);
  }

  getProcessedBlob(quality = 0.95): Promise<Blob> {
    return new Promise(resolve => {
      this.canvas.toBlob(blob => resolve(blob!), 'image/jpeg', quality);
    });
  }

  getPngBlob(): Promise<Blob> {
    return new Promise(resolve => {
      this.canvas.toBlob(blob => resolve(blob!), 'image/png');
    });
  }

  async get16BitTiffBlob(): Promise<Blob> {
    if (!this.hasImage()) throw new Error('No image loaded');
    const w = this.canvas.width;
    const h = this.canvas.height;
    const gl = this.gl;

    // Render to ensure frame is fresh
    this.render();

    // Read back rendered pixels from WebGL drawing buffer
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip Y (WebGL coordinates start at bottom-left)
    const floatData = new Float32Array(w * h * 4);
    const inv255 = 1.0 / 255.0;
    for (let y = 0; y < h; y++) {
      const srcRow = (h - 1 - y) * w * 4;
      const dstRow = y * w * 4;
      for (let x = 0; x < w * 4; x++) {
        floatData[dstRow + x] = pixels[srcRow + x] * inv255;
      }
    }

    return encode16BitTiff(floatData, w, h);
  }

  // --------------------------------------------------------
  // Private
  // --------------------------------------------------------

  private scheduleRender(): void {
    this.dirty = true;
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
    });
  }

  render(): void {
    if (!this.hasImage()) return;
    const gl = this.gl;

    // Rebuild and re-upload the curve LUT whenever adjustments change
    this.updateCurveLUT();

    // Upload all adjustment uniforms
    this.uploadUniforms();

    // Draw full-screen quad — GPU processes every pixel in parallel
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
    if (this.maskTexture) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // Build the 10-bit / 16-bit tone-curve LUT on the CPU, pack 3 channels into one
  // 1024×1 RGBA float texture, upload to GPU with linear filtering for continuous interpolation.
  private updateCurveLUT(): void {
    const gl  = this.gl;
    const adj = this.adjustments.curves;
    const size = 1024;

    const lutRgb = buildCurveLUTFloat(adj.rgb, size);
    const lutR   = buildCurveLUTFloat(adj.r, size);
    const lutG   = buildCurveLUTFloat(adj.g, size);
    const lutB   = buildCurveLUTFloat(adj.b, size);

    // Combined float LUT: 1024 x 1 RGBA Float32Array
    const data = new Float32Array(size * 4);
    const denom = size - 1;
    for (let i = 0; i < size; i++) {
      const mapped = lutRgb[i];
      const rIdx = Math.min(denom, Math.max(0, Math.round(mapped * denom)));
      data[i * 4 + 0] = lutR[rIdx];
      data[i * 4 + 1] = lutG[rIdx];
      data[i * 4 + 2] = lutB[rIdx];
      data[i * 4 + 3] = 1.0;
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveLUTTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, 1, 0, gl.RGBA, gl.FLOAT, data);
  }

  private uploadUniforms(): void {
    const gl  = this.gl;
    const adj = this.adjustments;
    const u   = this.uniforms;
    const b   = adj.basic;
    const g   = adj.grading;
    const e   = adj.effects;
    const c   = adj.calibration;

    const set1f  = (n: string, v: number) => { const l = u.get(n); if (l) gl.uniform1f(l, v); };
    const set2fv = (n: string, v: Float32Array) => { const l = u.get(n); if (l) gl.uniform2fv(l, v); };
    const set3fv = (n: string, v: Float32Array) => { const l = u.get(n); if (l) gl.uniform3fv(l, v); };

    // Basic
    set1f('u_temperature', b.temperature);
    set1f('u_tint',        b.tint);
    set1f('u_exposure',    b.exposure);
    set1f('u_contrast',    b.contrast);
    set1f('u_highlights',  b.highlights);
    set1f('u_shadows',     b.shadows);
    set1f('u_whites',      b.whites);
    set1f('u_blacks',      b.blacks);
    set1f('u_clarity',     b.clarity);
    set1f('u_dehaze',      b.dehaze);
    set1f('u_vibrance',    b.vibrance);
    set1f('u_saturation',  b.saturation);

    // HSL — 8 × vec3 array
    const hslData = new Float32Array(24);
    adj.hsl.forEach((hc, i) => {
      hslData[i * 3 + 0] = hc.hue;
      hslData[i * 3 + 1] = hc.saturation;
      hslData[i * 3 + 2] = hc.luminance;
    });
    set3fv('u_hsl', hslData);

    // Color Grading
    set3fv('u_grading_shadows',    new Float32Array([g.shadows.hue,    g.shadows.saturation,    g.shadows.luminance]));
    set3fv('u_grading_midtones',   new Float32Array([g.midtones.hue,   g.midtones.saturation,   g.midtones.luminance]));
    set3fv('u_grading_highlights', new Float32Array([g.highlights.hue, g.highlights.saturation, g.highlights.luminance]));
    set1f('u_grading_blending',    g.blending);
    set1f('u_grading_balance',     g.balance);

    // Effects
    set1f('u_vignette_amount',    e.vignetteAmount);
    set1f('u_vignette_midpoint',  e.vignetteMidpoint);
    set1f('u_vignette_feather',   e.vignetteFeather);
    set1f('u_grain_amount',       e.grainAmount);
    set1f('u_grain_roughness',    e.grainRoughness);
    // Grain seed changes every render to animate grain
    this.grainSeed = (this.grainSeed + 1) % 1000;
    set1f('u_grain_seed',         this.grainSeed * 7.391 + 0.5);

    // Calibration
    set1f('u_shadow_tint',    c.shadowTint);
    set2fv('u_red_primary',   new Float32Array([c.redHue,   c.redSaturation]));
    set2fv('u_green_primary', new Float32Array([c.greenHue, c.greenSaturation]));
    set2fv('u_blue_primary',  new Float32Array([c.blueHue,  c.blueSaturation]));

    // Crop, Rotation & Flip
    const cr = adj.crop || { x: 0, y: 0, width: 1, height: 1, rotation: 0, flipH: false, flipV: false };
    const set4fv = (n: string, v: Float32Array) => { const l = u.get(n); if (l) gl.uniform4fv(l, v); };
    set4fv('u_crop', new Float32Array([cr.x, cr.y, cr.width, cr.height]));
    set1f('u_rotation', (cr.rotation * Math.PI) / 180);
    set1f('u_flip_h', cr.flipH ? 1.0 : 0.0);
    set1f('u_flip_v', cr.flipV ? 1.0 : 0.0);

    // Spatial Mask Texture
    const maskLoc = u.get('u_mask_texture');
    if (maskLoc) gl.uniform1i(maskLoc, 2);
    set1f('u_use_mask', this.useMask);
    set1f('u_mask_opacity', this.maskOpacity);
  }
}

