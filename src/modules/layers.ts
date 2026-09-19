// ============================================================
// Layers System — Stacked Adjustment Layers math & data structures
// ============================================================
import type { Adjustments, HSLColor, ColorGradingWheel } from './processor';
import { defaultAdjustments } from './processor';

export interface Layer {
  id: string;
  name: string;
  enabled: boolean;
  opacity: number; // 0.0 to 1.0 (0% to 100%)
  adjustments: Adjustments;
}

export interface LayeredAdjustments {
  base: Adjustments;
  layers: Layer[];
  activeLayerId: string; // 'base' or layer ID
}

export function createDefaultLayer(name: string): Layer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name,
    enabled: true,
    opacity: 1.0,
    adjustments: defaultAdjustments(),
  };
}

export function createDefaultLayeredAdjustments(): LayeredAdjustments {
  return {
    base: defaultAdjustments(),
    layers: [],
    activeLayerId: 'base',
  };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Computes the combined Adjustments by stacking all enabled layer adjustments
 * on top of the base adjustments, weighted by each layer's opacity.
 */
export function flattenAdjustments(layered: LayeredAdjustments): Adjustments {
  const result = defaultAdjustments();
  const base = layered.base || defaultAdjustments();
  const enabledLayers = (layered.layers || []).filter(l => l.enabled && l.opacity > 0);

  // --- Basic Adjustments ---
  let tempShift = 0;
  let tintShift = 0;
  let expShift = 0;
  let contrastShift = 0;
  let highShift = 0;
  let shadowShift = 0;
  let whiteShift = 0;
  let blackShift = 0;
  let clarityShift = 0;
  let dehazeShift = 0;
  let vibShift = 0;
  let satShift = 0;

  for (const layer of enabledLayers) {
    const adj = layer.adjustments?.basic;
    if (!adj) continue;
    const w = layer.opacity;
    tempShift += (adj.temperature - 6500) * w;
    tintShift += adj.tint * w;
    expShift += adj.exposure * w;
    contrastShift += adj.contrast * w;
    highShift += adj.highlights * w;
    shadowShift += adj.shadows * w;
    whiteShift += adj.whites * w;
    blackShift += adj.blacks * w;
    clarityShift += adj.clarity * w;
    dehazeShift += adj.dehaze * w;
    vibShift += adj.vibrance * w;
    satShift += adj.saturation * w;
  }

  result.basic.temperature = clamp(base.basic.temperature + tempShift, 2000, 12000);
  result.basic.tint = clamp(base.basic.tint + tintShift, -100, 100);
  result.basic.exposure = clamp(base.basic.exposure + expShift, -5, 5);
  result.basic.contrast = clamp(base.basic.contrast + contrastShift, -100, 100);
  result.basic.highlights = clamp(base.basic.highlights + highShift, -100, 100);
  result.basic.shadows = clamp(base.basic.shadows + shadowShift, -100, 100);
  result.basic.whites = clamp(base.basic.whites + whiteShift, -100, 100);
  result.basic.blacks = clamp(base.basic.blacks + blackShift, -100, 100);
  result.basic.clarity = clamp(base.basic.clarity + clarityShift, -100, 100);
  result.basic.dehaze = clamp(base.basic.dehaze + dehazeShift, -100, 100);
  result.basic.vibrance = clamp(base.basic.vibrance + vibShift, -100, 100);
  result.basic.saturation = clamp(base.basic.saturation + satShift, -100, 100);

  // --- HSL Adjustments (8 colors) ---
  for (let i = 0; i < 8; i++) {
    const baseHsl = base.hsl?.[i] || { hue: 0, saturation: 0, luminance: 0 };
    let hShift = 0;
    let sShift = 0;
    let lShift = 0;

    for (const layer of enabledLayers) {
      const lHsl = layer.adjustments?.hsl?.[i];
      if (!lHsl) continue;
      const w = layer.opacity;
      hShift += lHsl.hue * w;
      sShift += lHsl.saturation * w;
      lShift += lHsl.luminance * w;
    }

    result.hsl[i] = {
      hue: clamp(baseHsl.hue + hShift, -100, 100),
      saturation: clamp(baseHsl.saturation + sShift, -100, 100),
      luminance: clamp(baseHsl.luminance + lShift, -100, 100),
    };
  }

  // --- Color Grading ---
  const blendWheel = (baseW: ColorGradingWheel, wheelKey: 'shadows' | 'midtones' | 'highlights'): ColorGradingWheel => {
    let hShift = 0;
    let sShift = 0;
    let lShift = 0;
    for (const layer of enabledLayers) {
      const lw = layer.adjustments?.grading?.[wheelKey];
      if (!lw) continue;
      const w = layer.opacity;
      hShift += lw.hue * w;
      sShift += lw.saturation * w;
      lShift += lw.luminance * w;
    }
    return {
      hue: (baseW.hue + hShift) % 360,
      saturation: clamp(baseW.saturation + sShift, 0, 100),
      luminance: clamp(baseW.luminance + lShift, -100, 100),
    };
  };

  result.grading.shadows = blendWheel(base.grading.shadows, 'shadows');
  result.grading.midtones = blendWheel(base.grading.midtones, 'midtones');
  result.grading.highlights = blendWheel(base.grading.highlights, 'highlights');

  let blendingShift = 0;
  let balanceShift = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.grading) continue;
    const w = layer.opacity;
    blendingShift += (layer.adjustments.grading.blending - 50) * w;
    balanceShift += layer.adjustments.grading.balance * w;
  }
  result.grading.blending = clamp(base.grading.blending + blendingShift, 0, 100);
  result.grading.balance = clamp(base.grading.balance + balanceShift, -100, 100);

  // --- Detail ---
  let sharpAmt = 0;
  let nrLum = 0;
  let nrCol = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.detail) continue;
    const w = layer.opacity;
    sharpAmt += layer.adjustments.detail.sharpenAmount * w;
    nrLum += layer.adjustments.detail.nrLuminance * w;
    nrCol += layer.adjustments.detail.nrColor * w;
  }
  result.detail = {
    ...base.detail,
    sharpenAmount: clamp(base.detail.sharpenAmount + sharpAmt, 0, 150),
    nrLuminance: clamp(base.detail.nrLuminance + nrLum, 0, 100),
    nrColor: clamp(base.detail.nrColor + nrCol, 0, 100),
  };

  // --- Effects ---
  let vigAmt = 0;
  let grainAmt = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.effects) continue;
    const w = layer.opacity;
    vigAmt += layer.adjustments.effects.vignetteAmount * w;
    grainAmt += layer.adjustments.effects.grainAmount * w;
  }
  result.effects = {
    ...base.effects,
    vignetteAmount: clamp(base.effects.vignetteAmount + vigAmt, -100, 100),
    grainAmount: clamp(base.effects.grainAmount + grainAmt, 0, 100),
  };

  // --- Calibration ---
  let rHue = 0, rSat = 0, gHue = 0, gSat = 0, bHue = 0, bSat = 0, tint = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.calibration) continue;
    const w = layer.opacity;
    const c = layer.adjustments.calibration;
    rHue += c.redHue * w;
    rSat += c.redSaturation * w;
    gHue += c.greenHue * w;
    gSat += c.greenSaturation * w;
    bHue += c.blueHue * w;
    bSat += c.blueSaturation * w;
    tint += c.shadowTint * w;
  }
  result.calibration = {
    shadowTint: clamp(base.calibration.shadowTint + tint, -100, 100),
    redHue: clamp(base.calibration.redHue + rHue, -100, 100),
    redSaturation: clamp(base.calibration.redSaturation + rSat, -100, 100),
    greenHue: clamp(base.calibration.greenHue + gHue, -100, 100),
    greenSaturation: clamp(base.calibration.greenSaturation + gSat, -100, 100),
    blueHue: clamp(base.calibration.blueHue + bHue, -100, 100),
    blueSaturation: clamp(base.calibration.blueSaturation + bSat, -100, 100),
  };

  // --- Crop & Transform ---
  let angleShift = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.crop) continue;
    angleShift += layer.adjustments.crop.angle * layer.opacity;
  }
  result.crop = {
    ...base.crop,
    angle: clamp(base.crop.angle + angleShift, -45, 45),
  };

  // --- Curves ---
  result.curves = { ...base.curves };

  return result;
}
