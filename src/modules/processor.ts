// ============================================================
// Image Processing Engine
// ============================================================
import {
  clamp, kelvinToRgbMultipliers, buildCurveLUT,
  rgbToHsl, hslToRgb, luminance,
  highlightShadowTonemap, sigmoidContrast,
  applyDehaze, applyVibrance, applyCalibration,
  hueWeight, HSL_COLOR_RANGES, CurvePoint,
} from './colormath';

// ---------- Adjustment State ----------
export interface BasicAdjustments {
  temperature: number;   // 2000–50000 K (default 6500)
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
  blending: number;   // 0–100
  balance: number;    // –100 to +100
}

export interface DetailAdjustments {
  sharpenAmount: number;   // 0–150
  sharpenRadius: number;   // 0.5–3
  sharpenDetail: number;   // 0–100
  sharpenMasking: number;  // 0–100
  nrLuminance: number;     // 0–100
  nrLumDetail: number;     // 0–100
  nrLumContrast: number;   // 0–100
  nrColor: number;         // 0–100
  nrColorDetail: number;   // 0–100
  nrColorSmooth: number;   // 0–100
}

export interface EffectsAdjustments {
  vignetteAmount: number;     // –100 to +100
  vignetteMidpoint: number;   // 0–100
  vignetteFeather: number;    // 0–100
  vignetteRoundness: number;  // –100 to +100
  grainAmount: number;        // 0–100
  grainSize: number;          // 1–50
  grainRoughness: number;     // 0–100
}

export interface CalibrationAdjustments {
  shadowTint: number;         // –100 to +100
  redHue: number;             // –100 to +100
  redSaturation: number;      // –100 to +100
  greenHue: number;
  greenSaturation: number;
  blueHue: number;
  blueSaturation: number;
}

export interface Adjustments {
  basic: BasicAdjustments;
  curves: { rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] };
  hsl: HSLColor[];  // 8 colors: red,orange,yellow,green,aqua,blue,purple,magenta
  grading: ColorGradingAdjustments;
  detail: DetailAdjustments;
  effects: EffectsAdjustments;
  calibration: CalibrationAdjustments;
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
  };
}

// ---------- Main Processor ----------
export class ImageProcessor {
  private originalData: ImageData | null = null;
  private adjustments: Adjustments = defaultAdjustments();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private dirty = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  }

  loadImage(img: HTMLImageElement): void {
    this.canvas.width = img.naturalWidth;
    this.canvas.height = img.naturalHeight;
    this.ctx.drawImage(img, 0, 0);
    this.originalData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.scheduleRender();
  }

  setAdjustments(adj: Adjustments): void {
    this.adjustments = adj;
    this.scheduleRender();
  }

  getAdjustments(): Adjustments {
    return this.adjustments;
  }

  hasImage(): boolean {
    return this.originalData !== null;
  }

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
    if (!this.originalData) return;

    const src = this.originalData;
    const w = src.width, h = src.height;
    const output = new ImageData(w, h);
    const srcD = src.data;
    const outD = output.data;
    const adj = this.adjustments;
    const { basic, curves, hsl, grading, detail, effects, calibration } = adj;

    // Pre-build LUTs
    const lutRgb = buildCurveLUT(curves.rgb);
    const lutR   = buildCurveLUT(curves.r);
    const lutG   = buildCurveLUT(curves.g);
    const lutB   = buildCurveLUT(curves.b);

    // White balance multipliers
    const wbMul = kelvinToRgbMultipliers(basic.temperature, basic.tint);

    // Exposure multiplier
    const expMul = Math.pow(2, basic.exposure);

    // Process pixels
    for (let i = 0; i < srcD.length; i += 4) {
      let r = srcD[i]     / 255;
      let g = srcD[i + 1] / 255;
      let b = srcD[i + 2] / 255;

      // ---- 1. Calibration ----
      [r, g, b] = applyCalibration(
        r, g, b,
        calibration.shadowTint,
        calibration.redHue, calibration.redSaturation,
        calibration.greenHue, calibration.greenSaturation,
        calibration.blueHue, calibration.blueSaturation,
      );

      // ---- 2. White Balance ----
      r = clamp(r * wbMul[0]);
      g = clamp(g * wbMul[1]);
      b = clamp(b * wbMul[2]);

      // ---- 3. Exposure ----
      r = clamp(r * expMul);
      g = clamp(g * expMul);
      b = clamp(b * expMul);

      // ---- 4. Highlights / Shadows ----
      const lum0 = luminance(r, g, b);
      const newLum = highlightShadowTonemap(lum0, basic.highlights, basic.shadows);
      if (lum0 > 0) {
        const lumScale = newLum / lum0;
        r = clamp(r * lumScale);
        g = clamp(g * lumScale);
        b = clamp(b * lumScale);
      }

      // ---- 5. Whites / Blacks ----
      const wScale = 1 + basic.whites / 200;
      const bOffset = basic.blacks / 500;
      r = clamp(r * wScale - bOffset);
      g = clamp(g * wScale - bOffset);
      b = clamp(b * wScale - bOffset);

      // ---- 6. Contrast ----
      r = sigmoidContrast(r, basic.contrast);
      g = sigmoidContrast(g, basic.contrast);
      b = sigmoidContrast(b, basic.contrast);

      // ---- 7. Clarity (local contrast approximation via midtone boost) ----
      if (basic.clarity !== 0) {
        const lumC = luminance(r, g, b);
        const c = basic.clarity / 100;
        const midMask = 4 * lumC * (1 - lumC);
        // Clarity = local contrast, approximate as contrast boost at midtones
        const boost = 1 + c * midMask * 0.5;
        r = clamp((r - 0.5) * boost + 0.5);
        g = clamp((g - 0.5) * boost + 0.5);
        b = clamp((b - 0.5) * boost + 0.5);
      }

      // ---- 8. Vibrance ----
      if (basic.vibrance !== 0) {
        [r, g, b] = applyVibrance(r, g, b, basic.vibrance);
      }

      // ---- 9. Saturation ----
      if (basic.saturation !== 0) {
        const [hh, s, l] = rgbToHsl(r, g, b);
        const ns = clamp(s + basic.saturation / 100 * (1 - s * 0.5));
        [r, g, b] = hslToRgb(hh, ns, l);
      }

      // ---- 10. Tone Curve ----
      let ri = Math.round(r * 255);
      let gi = Math.round(g * 255);
      let bi = Math.round(b * 255);

      // RGB composite curve
      ri = lutRgb[ri]; gi = lutRgb[gi]; bi = lutRgb[bi];
      // Per-channel curves
      ri = lutR[ri]; gi = lutG[gi]; bi = lutB[bi];

      r = ri / 255; g = gi / 255; b = bi / 255;

      // ---- 11. HSL ----
      const [hDeg360, sSrc, lSrc] = (() => {
        const [hh, ss, ll] = rgbToHsl(r, g, b);
        return [hh * 360, ss, ll];
      })();

      let totalHueShift = 0, totalSatShift = 0, totalLumShift = 0, totalW = 0;
      for (let ci = 0; ci < 8; ci++) {
        const range = HSL_COLOR_RANGES[ci];
        const weight = hueWeight(hDeg360, range.hue, range.width);
        if (weight > 0) {
          const ha = hsl[ci];
          totalHueShift += weight * ha.hue;
          totalSatShift += weight * ha.saturation;
          totalLumShift += weight * ha.luminance;
          totalW += weight;
        }
      }
      if (totalW > 0) {
        const hh = ((hDeg360 + totalHueShift / totalW) / 360 + 1) % 1;
        const ss = clamp(sSrc + totalSatShift / totalW / 100 * 0.5);
        const ll = clamp(lSrc + totalLumShift / totalW / 100 * 0.5);
        [r, g, b] = hslToRgb(hh, ss, ll);
      }

      // ---- 12. Color Grading ----
      [r, g, b] = applyColorGrading(r, g, b, grading);

      // ---- 13. Dehaze ----
      if (basic.dehaze !== 0) {
        [r, g, b] = applyDehaze(r, g, b, basic.dehaze);
      }

      // Store to output
      outD[i]     = clamp(r) * 255;
      outD[i + 1] = clamp(g) * 255;
      outD[i + 2] = clamp(b) * 255;
      outD[i + 3] = srcD[i + 3];
    }

    // ---- Vignette (post-process) ----
    if (effects.vignetteAmount !== 0) {
      applyVignette(outD, w, h, effects);
    }

    // ---- Grain ----
    if (effects.grainAmount > 0) {
      applyGrain(outD, w, h, effects);
    }

    this.ctx.putImageData(output, 0, 0);
  }

  getImageDataUrl(quality = 0.95): string {
    return this.canvas.toDataURL('image/jpeg', quality);
  }

  getProcessedBlob(quality = 0.95): Promise<Blob> {
    return new Promise(resolve => {
      this.canvas.toBlob(blob => resolve(blob!), 'image/jpeg', quality);
    });
  }
}

// ---------- Color Grading ----------
function applyColorGrading(
  r: number, g: number, b: number,
  grading: ColorGradingAdjustments
): [number, number, number] {
  const lum = luminance(r, g, b);
  const blend = grading.blending / 100;
  const balance = grading.balance / 100;

  // Compute weights for shadows, midtones, highlights
  const shadowW   = Math.pow(clamp(1 - lum * 2), 2) * (1 - balance * 0.5);
  const highlightW = Math.pow(clamp((lum - 0.5) * 2), 2) * (1 + balance * 0.5);
  const midtoneW  = 4 * lum * (1 - lum) * blend;

  let dr = 0, dg = 0, db = 0;

  const wheels = [
    { w: shadowW,    wheel: grading.shadows },
    { w: midtoneW,   wheel: grading.midtones },
    { w: highlightW, wheel: grading.highlights },
  ];

  for (const { w, wheel } of wheels) {
    if (w > 0 && wheel.saturation > 0) {
      const [wr, wg, wb] = hslToRgb(wheel.hue / 360, wheel.saturation / 100, 0.5);
      const strength = w * wheel.saturation / 100 * 0.3;
      dr += (wr - 0.5) * strength;
      dg += (wg - 0.5) * strength;
      db += (wb - 0.5) * strength;
    }
    if (w > 0 && wheel.luminance !== 0) {
      const lumAdj = w * wheel.luminance / 100 * 0.2;
      dr += lumAdj; dg += lumAdj; db += lumAdj;
    }
  }

  return [clamp(r + dr), clamp(g + dg), clamp(b + db)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

// ---------- Vignette ----------
function applyVignette(
  data: Uint8ClampedArray, w: number, h: number,
  effects: EffectsAdjustments
): void {
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const midpoint = effects.vignetteMidpoint / 100;
  const feather = effects.vignetteFeather / 100;
  const amount = effects.vignetteAmount / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      // Ellipse distance
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.sqrt(2);
      // Feathered mask
      const inner = midpoint - feather * 0.5;
      const outer = midpoint + feather * 0.5;
      let mask = clamp((dist - inner) / (outer - inner));
      mask = mask * mask * (3 - 2 * mask); // smooth step

      const strength = mask * Math.abs(amount);
      const multiply = amount < 0 ? 1 - strength : 1 + strength * 0.5;
      const idx = (y * w + x) * 4;
      data[idx]     = clamp(data[idx]     / 255 * multiply) * 255;
      data[idx + 1] = clamp(data[idx + 1] / 255 * multiply) * 255;
      data[idx + 2] = clamp(data[idx + 2] / 255 * multiply) * 255;
    }
  }
}

// ---------- Film Grain ----------
function applyGrain(
  data: Uint8ClampedArray, w: number, h: number,
  effects: EffectsAdjustments
): void {
  const amount = effects.grainAmount / 100;
  const roughness = effects.grainRoughness / 100;
  // Simple seeded pseudo-random grain
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount * 60 * (0.5 + roughness * 0.5);
    data[i]     = clamp((data[i]     + noise) / 255) * 255;
    data[i + 1] = clamp((data[i + 1] + noise * (0.9 + roughness * 0.1)) / 255) * 255;
    data[i + 2] = clamp((data[i + 2] + noise) / 255) * 255;
  }
}
