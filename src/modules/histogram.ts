// ============================================================
// Real-time RGB Histogram
// ============================================================

export class Histogram {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  update(imageData: ImageData): void {
    const data = imageData.data;
    const rBins = new Uint32Array(256);
    const gBins = new Uint32Array(256);
    const bBins = new Uint32Array(256);
    const lumBins = new Uint32Array(256);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rBins[r]++;
      gBins[g]++;
      bBins[b]++;
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      lumBins[lum]++;
    }

    this.draw(rBins, gBins, bBins, lumBins);
  }

  private draw(
    rBins: Uint32Array, gBins: Uint32Array,
    bBins: Uint32Array, lumBins: Uint32Array
  ): void {
    const ctx = this.ctx;
    const w = this.width, h = this.height;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(30,30,33,0.8)';
    ctx.fillRect(0, 0, w, h);

    // Find max for normalization (exclude extremes)
    const maxVal = Math.max(
      ...Array.from(rBins.slice(5, 250)),
      ...Array.from(gBins.slice(5, 250)),
      ...Array.from(bBins.slice(5, 250)),
    );

    if (maxVal === 0) return;

    const barW = w / 256;

    // Draw luminance (dark gray background layer)
    this.drawChannel(ctx, lumBins, maxVal, w, h, 'rgba(180,180,200,0.15)');
    // Draw RGB channels
    this.drawChannel(ctx, bBins, maxVal, w, h, 'rgba(79,195,255,0.45)');
    this.drawChannel(ctx, gBins, maxVal, w, h, 'rgba(107,255,158,0.45)');
    this.drawChannel(ctx, rBins, maxVal, w, h, 'rgba(255,107,107,0.45)');

    // Clipping indicators
    const totalPx = rBins.reduce((a, b) => a + b, 0);
    const clipThresh = totalPx * 0.001;
    const leftClip = rBins[0] + gBins[0] + bBins[0] > clipThresh;
    const rightClip = rBins[255] + gBins[255] + bBins[255] > clipThresh;
    if (leftClip) {
      ctx.fillStyle = 'rgba(255,120,120,0.7)';
      ctx.fillRect(0, 0, 3, h);
    }
    if (rightClip) {
      ctx.fillStyle = 'rgba(255,120,120,0.7)';
      ctx.fillRect(w - 3, 0, 3, h);
    }
  }

  private drawChannel(
    ctx: CanvasRenderingContext2D,
    bins: Uint32Array, maxVal: number,
    w: number, h: number, color: string
  ): void {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const barH = (bins[i] / maxVal) * h * 0.95;
      ctx.lineTo(x, h - barH);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
