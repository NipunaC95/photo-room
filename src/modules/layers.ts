// ============================================================
// Layers & Sub-Layers System — Hierarchical Tree & Mask Math
// ============================================================
import type { Adjustments, ColorGradingWheel } from './processor';
import { defaultAdjustments } from './processor';

export type MaskType = 'brush' | 'linear_gradient' | 'radial_gradient' | 'color_range' | 'luminance_range';

export interface LinearGradientParams {
  x1: number; // 0 to 1
  y1: number; // 0 to 1
  x2: number; // 0 to 1
  y2: number; // 0 to 1
}

export interface RadialGradientParams {
  cx: number;      // 0 to 1
  cy: number;      // 0 to 1
  rx: number;      // 0 to 1
  ry: number;      // 0 to 1
  feather: number; // 0 to 1
}

export interface ColorRangeParams {
  targetHue: number;    // 0 to 360
  targetSat: number;    // 0 to 100
  tolerance: number;    // 0 to 100
}

export interface LuminanceRangeParams {
  minLum: number;       // 0 to 100
  maxLum: number;       // 0 to 100
  feather: number;      // 0 to 100
}

export interface SubLayerMask {
  id: string;
  name: string;
  type: MaskType;
  enabled: boolean;
  inverted: boolean;
  linear?: LinearGradientParams;
  radial?: RadialGradientParams;
  colorRange?: ColorRangeParams;
  lumRange?: LuminanceRangeParams;
  brushDataUrl?: string;
  brushSize?: number;
  brushFeather?: number;
}

export interface Layer {
  id: string;
  name: string;
  enabled: boolean;
  opacity: number; // 0.0 to 1.0 (0% to 100%)
  adjustments: Adjustments;
  masks: SubLayerMask[];
  expanded?: boolean;
}

export interface LayeredAdjustments {
  base: Adjustments;
  layers: Layer[];
  activeLayerId: string; // 'base', layer ID, or sub-layer mask ID
  activeMaskId?: string; // sub-layer mask ID if editing mask handles
}

export function createDefaultSubLayerMask(type: MaskType, customName?: string): SubLayerMask {
  const id = `mask-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  let defaultName = 'Sub-Layer Mask';
  if (type === 'brush') defaultName = 'Brush Mask';
  if (type === 'linear_gradient') defaultName = 'Linear Gradient';
  if (type === 'radial_gradient') defaultName = 'Radial Mask';
  if (type === 'color_range') defaultName = 'Color Range Mask';
  if (type === 'luminance_range') defaultName = 'Luminance Range Mask';

  const mask: SubLayerMask = {
    id,
    name: customName || defaultName,
    type,
    enabled: true,
    inverted: false,
    brushSize: 40,
    brushFeather: 50,
  };

  if (type === 'linear_gradient') {
    mask.linear = { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 };
  } else if (type === 'radial_gradient') {
    mask.radial = { cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, feather: 0.5 };
  } else if (type === 'color_range') {
    mask.colorRange = { targetHue: 200, targetSat: 50, tolerance: 30 };
  } else if (type === 'luminance_range') {
    mask.lumRange = { minLum: 60, maxLum: 100, feather: 20 };
  }

  return mask;
}

export function createDefaultLayer(name: string): Layer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name,
    enabled: true,
    opacity: 1.0,
    adjustments: defaultAdjustments(),
    masks: [],
    expanded: true,
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
 * Calculate effective layer weight incorporating layer opacity and sub-layer mask states.
 */
export function getLayerWeight(layer: Layer): number {
  if (!layer.enabled || layer.opacity <= 0) return 0;
  const activeMasks = (layer.masks || []).filter(m => m.enabled);
  if (activeMasks.length === 0) return layer.opacity;

  let totalWeight = 1.0;
  for (const m of activeMasks) {
    let w = 0.75;
    if (m.inverted) w = 1.0 - w;
    totalWeight *= w;
  }
  return layer.opacity * totalWeight;
}

/**
 * Render pixel-accurate offscreen mask canvas for any sub-layer mask.
 */
export function renderSubLayerMaskCanvas(
  mask: SubLayerMask,
  width: number,
  height: number
): HTMLCanvasElement | null {
  if (!mask || !mask.enabled) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(10, Math.round(width));
  canvas.height = Math.max(10, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;

  if (mask.type === 'brush') {
    if (mask.brushDataUrl) {
      const img = new Image();
      img.src = mask.brushDataUrl;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillRect(0, 0, w, h);
    }
  } else if (mask.type === 'linear_gradient' && mask.linear) {
    const l = mask.linear;
    const grad = ctx.createLinearGradient(l.x1 * w, l.y1 * h, l.x2 * w, l.y2 * h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else if (mask.type === 'radial_gradient' && mask.radial) {
    const r = mask.radial;
    const cx = r.cx * w;
    const cy = r.cy * h;
    const rx = r.rx * w;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(Math.max(0, 1 - (r.feather || 0.5) * 0.8), 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fillRect(0, 0, w, h);
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const alpha = imgData.data[i + 3] || imgData.data[i];
    imgData.data[i] = 255;
    imgData.data[i + 1] = 255;
    imgData.data[i + 2] = 255;
    imgData.data[i + 3] = alpha;

    if (mask.inverted) {
      imgData.data[i + 3] = 255 - alpha;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas;
}

/**
 * Computes the combined Adjustments by stacking all enabled layer adjustments
 * on top of the base adjustments, weighted by each layer's opacity and sub-layer masks.
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
    const w = getLayerWeight(layer);
    if (w <= 0) continue;

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
      const w = getLayerWeight(layer);
      if (w <= 0) continue;

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
      const w = getLayerWeight(layer);
      if (w <= 0) continue;

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
    const w = getLayerWeight(layer);
    if (w <= 0) continue;

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
    const w = getLayerWeight(layer);
    if (w <= 0) continue;

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
    const w = getLayerWeight(layer);
    if (w <= 0) continue;

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
    const w = getLayerWeight(layer);
    if (w <= 0) continue;

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
  let rotationShift = 0;
  for (const layer of enabledLayers) {
    if (!layer.adjustments?.crop) continue;
    const w = getLayerWeight(layer);
    if (w <= 0) continue;
    rotationShift += layer.adjustments.crop.rotation * w;
  }
  result.crop = {
    ...base.crop,
    rotation: clamp(base.crop.rotation + rotationShift, -45, 45),
  };

  // --- Curves ---
  result.curves = { ...base.curves };

  return result;
}
