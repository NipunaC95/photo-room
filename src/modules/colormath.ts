// ============================================================
// Color Math Utilities
// ============================================================

/** Convert sRGB [0,1] to linear light */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Convert linear light to sRGB [0,1] */
export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Clamp value between min and max */
export function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/** Map value from [inMin,inMax] to [outMin,outMax] */
export function remap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

// ---- RGB <-> HSL ----
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
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

// ---- RGB <-> HSV ----
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// ---- White Balance (temperature/tint) ----
// Planckian approximation: maps color temperature to xy chromaticity
export function kelvinToRgbMultipliers(temp: number, tint: number): [number, number, number] {
  // Approximate D-illuminant multipliers
  const t = clamp(temp, 2000, 50000);
  let r = 1, g = 1, b = 1;

  if (t <= 6600) {
    r = 1.0;
    g = clamp((99.4708025861 * Math.log(t / 100) - 161.1195681661) / 255, 0, 1);
    b = t <= 1900 ? 0 : clamp((138.5177312231 * Math.log(t / 100 - 10) - 305.0447927307) / 255, 0, 1);
  } else {
    r = clamp((329.698727446 * Math.pow(t / 100 - 60, -0.1332047592)) / 255, 0, 1);
    g = clamp((288.1221695283 * Math.pow(t / 100 - 60, -0.0755148492)) / 255, 0, 1);
    b = 1.0;
  }

  // Tint affects green channel (positive = green, negative = magenta)
  const tintEffect = tint / 150;
  g = clamp(g - tintEffect * 0.15, 0.01, 2);

  // Normalize so brightest is 1
  const maxVal = Math.max(r, g, b);
  return [r / maxVal, g / maxVal, b / maxVal];
}

// ---- Cubic Bezier Curve Interpolation ----
export interface CurvePoint {
  x: number; // [0,1]
  y: number; // [0,1]
}

export function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);

  if (points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Monotone cubic interpolation (Fritsch-Carlson)
  const n = sorted.length;
  const h: number[] = [], delta: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = sorted[i + 1].x - sorted[i].x;
    delta[i] = (sorted[i + 1].y - sorted[i].y) / h[i];
  }
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (delta[i - 1] + delta[i]) / 2;
  }
  // Monotonicity adjustment
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-10) {
      m[i] = 0; m[i + 1] = 0;
    } else {
      const alpha = m[i] / delta[i];
      const beta = m[i + 1] / delta[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * alpha * delta[i];
        m[i + 1] = t * beta * delta[i];
      }
    }
  }

  for (let px = 0; px < 256; px++) {
    const x = px / 255;
    // Find segment
    let seg = n - 2;
    for (let i = 0; i < n - 1; i++) {
      if (x <= sorted[i + 1].x) { seg = i; break; }
    }
    const t = (x - sorted[seg].x) / h[seg];
    const t2 = t * t, t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * sorted[seg].y +
      (t3 - 2 * t2 + t) * h[seg] * m[seg] +
      (-2 * t3 + 3 * t2) * sorted[seg + 1].y +
      (t3 - t2) * h[seg] * m[seg + 1];
    lut[px] = Math.round(clamp(y, 0, 1) * 255);
  }

  return lut;
}

// ---- HSL Color Range Targeting ----
// Returns a weight [0,1] for how much a given hue falls within a color range
// colorRanges: hue center in degrees for the 8 LR color labels
export const HSL_COLOR_RANGES: { name: string; hue: number; width: number }[] = [
  { name: 'red',     hue: 0,   width: 25 },
  { name: 'orange',  hue: 30,  width: 20 },
  { name: 'yellow',  hue: 60,  width: 25 },
  { name: 'green',   hue: 120, width: 40 },
  { name: 'aqua',    hue: 180, width: 30 },
  { name: 'blue',    hue: 220, width: 30 },
  { name: 'purple',  hue: 280, width: 30 },
  { name: 'magenta', hue: 320, width: 25 },
];

export function hueWeight(pixelHueDeg: number, centerDeg: number, halfWidthDeg: number): number {
  let diff = Math.abs(pixelHueDeg - centerDeg);
  if (diff > 180) diff = 360 - diff;
  return Math.max(0, 1 - diff / halfWidthDeg);
}

// ---- Luminosity ----
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ---- Tone Mapping Helpers ----
export function highlightShadowTonemap(
  v: number, highlights: number, shadows: number
): number {
  const h = highlights / 100;
  const s = shadows / 100;

  let out = v;
  // Highlights: pull down/up bright tones
  if (h !== 0) {
    const mask = clamp((v - 0.5) * 2, 0, 1); // affects top half
    const smoothMask = mask * mask * (3 - 2 * mask); // smooth
    out = out - smoothMask * h * 0.5;
  }
  // Shadows: lift/lower dark tones
  if (s !== 0) {
    const mask = clamp((0.5 - v) * 2, 0, 1); // affects bottom half
    const smoothMask = mask * mask * (3 - 2 * mask);
    out = out + smoothMask * s * 0.5;
  }
  return clamp(out);
}

export function clarityFilter(lum: number, localLum: number, clarity: number): number {
  // Clarity increases local contrast at midtones
  const c = clarity / 100;
  const midMask = 4 * lum * (1 - lum); // peaks at 0.5
  const diff = lum - localLum;
  return clamp(lum + c * midMask * diff * 2);
}

// ---- Color Temperature Matrix ----
export function applyWhiteBalance(
  r: number, g: number, b: number,
  tempMul: [number, number, number]
): [number, number, number] {
  return [
    clamp(r * tempMul[0]),
    clamp(g * tempMul[1]),
    clamp(b * tempMul[2]),
  ];
}

// ---- Sigmoid Contrast ----
export function sigmoidContrast(v: number, contrast: number): number {
  if (contrast === 0) return v;
  const c = contrast / 100;
  const k = c * 5; // steepness
  // Sigmoid centered at 0.5
  const sig = 1 / (1 + Math.exp(-k * (v - 0.5)));
  // Blend between linear and sigmoid
  const strength = Math.abs(c);
  return clamp(v * (1 - strength) + sig * strength);
}

// ---- Dehaze ----
export function applyDehaze(r: number, g: number, b: number, amount: number): [number, number, number] {
  if (amount === 0) return [r, g, b];
  const a = amount / 100;
  if (a > 0) {
    // Remove haze: increase contrast + reduce atmospheric veil
    const lum = luminance(r, g, b);
    const mask = Math.pow(lum, 0.5); // more effect on bright areas
    r = clamp(r - mask * a * 0.3);
    g = clamp(g - mask * a * 0.3);
    b = clamp(b - mask * a * 0.3);
    // Boost saturation slightly
    const [h, s, l] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h, clamp(s + a * 0.2), l);
    return [nr, ng, nb];
  } else {
    // Add haze: push toward gray
    const gray = 0.7;
    const abs = Math.abs(a);
    return [
      clamp(r + (gray - r) * abs * 0.5),
      clamp(g + (gray - g) * abs * 0.5),
      clamp(b + (gray - b) * abs * 0.5),
    ];
  }
}

// ---- Vibrance ----
export function applyVibrance(r: number, g: number, b: number, vibrance: number): [number, number, number] {
  if (vibrance === 0) return [r, g, b];
  const v = vibrance / 100;
  const [h, s, l] = rgbToHsl(r, g, b);
  // Vibrance boosts low-saturation colors more than high-saturation
  const boost = v * (1 - s * 0.8); // less boost for already-saturated
  const newS = clamp(s + boost * 0.5);
  return hslToRgb(h, newS, l);
}

// ---- Calibration matrix multipliers ----
export function applyCalibration(
  r: number, g: number, b: number,
  shadowTint: number,
  redHue: number, redSat: number,
  greenHue: number, greenSat: number,
  blueHue: number, blueSat: number
): [number, number, number] {
  let [h, s, l] = rgbToHsl(r, g, b);
  const hueDeg = h * 360;

  // Shadow tint: adds green/magenta tint to darks
  if (shadowTint !== 0 && l < 0.5) {
    const shadowMask = (0.5 - l) * 2;
    h = h + shadowMask * (Math.abs(shadowTint) / 100) * 0.02 * Math.sign(shadowTint);
  }

  // Primary hue/sat shifts
  const redW = hueWeight(hueDeg, 0, 40) + hueWeight(hueDeg, 360, 40);
  const greenW = hueWeight(hueDeg, 120, 50);
  const blueW = hueWeight(hueDeg, 220, 50);
  const totalW = redW + greenW + blueW;

  if (totalW > 0) {
    const dH = (redW * redHue + greenW * greenHue + blueW * blueHue) / totalW / 360 * 0.1;
    const dS = (redW * redSat + greenW * greenSat + blueW * blueSat) / totalW / 100 * 0.3;
    h = (h + dH + 1) % 1;
    s = clamp(s + dS);
  }

  return hslToRgb(h, s, l);
}
