// ============================================================
// Tone Curve Panel — interactive bezier curve editor
// ============================================================
import type { CurvePoint } from '../modules/colormath';
import { buildCurveLUT } from '../modules/colormath';

type Channel = 'rgb' | 'r' | 'g' | 'b';

export interface CurveAdjustments {
  rgb: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

const CHANNEL_COLORS: Record<Channel, string> = {
  rgb: '#d0d0d8',
  r:   '#ff6b6b',
  g:   '#6bff9e',
  b:   '#6baaff',
};

export class ToneCurvePanel {
  private container: HTMLElement;
  private curves: CurveAdjustments;
  private onChange: (v: CurveAdjustments) => void;
  private activeChannel: Channel = 'rgb';
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private draggingIdx: number | null = null;
  private readonly SIZE = 256;
  private readonly POINT_RADIUS = 6;

  constructor(
    container: HTMLElement,
    initial: CurveAdjustments,
    onChange: (v: CurveAdjustments) => void
  ) {
    this.container = container;
    this.curves = {
      rgb: [...initial.rgb],
      r:   [...initial.r],
      g:   [...initial.g],
      b:   [...initial.b],
    };
    this.onChange = onChange;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<h2>Tone Curve</h2><button class="panel-reset-btn" id="curve-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    // Channel tabs
    const tabs = document.createElement('div');
    tabs.className = 'curve-channel-tabs';
    const channels: Channel[] = ['rgb', 'r', 'g', 'b'];
    const labels = ['RGB', 'Red', 'Green', 'Blue'];
    channels.forEach((ch, i) => {
      const btn = document.createElement('button');
      btn.className = `curve-channel-tab${ch === this.activeChannel ? ' active' : ''}`;
      btn.dataset.channel = ch;
      btn.textContent = labels[i];
      btn.addEventListener('click', () => {
        this.activeChannel = ch;
        tabs.querySelectorAll('.curve-channel-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.drawCurve();
      });
      tabs.appendChild(btn);
    });
    this.container.appendChild(tabs);

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.SIZE;
    this.canvas.height = this.SIZE;
    this.canvas.className = 'curve-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.ctx = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);

    const hint = document.createElement('p');
    hint.className = 'curve-hint';
    hint.textContent = 'Click to add points · Drag to move · Double-click to remove';
    this.container.appendChild(hint);

    this.bindCanvasEvents();

    header.querySelector('#curve-reset')?.addEventListener('click', () => {
      const defaultPts = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 1, y: 1 }];
      this.curves = { rgb: defaultPts(), r: defaultPts(), g: defaultPts(), b: defaultPts() };
      this.drawCurve();
      this.onChange({ ...this.curves });
    });

    this.drawCurve();
  }

  private getPoints(): CurvePoint[] {
    return this.curves[this.activeChannel];
  }

  private canvasToPoint(cx: number, cy: number): CurvePoint {
    return { x: cx / this.SIZE, y: 1 - cy / this.SIZE };
  }

  private pointToCanvas(p: CurvePoint): { cx: number; cy: number } {
    return { cx: p.x * this.SIZE, cy: (1 - p.y) * this.SIZE };
  }

  private bindCanvasEvents(): void {
    const getPos = (e: MouseEvent | TouchEvent): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      const scale = this.SIZE / rect.width;
      if (e instanceof TouchEvent) {
        return {
          x: (e.touches[0].clientX - rect.left) * scale,
          y: (e.touches[0].clientY - rect.top) * scale,
        };
      }
      return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
    };

    const findPoint = (x: number, y: number): number => {
      const pts = this.getPoints();
      for (let i = 0; i < pts.length; i++) {
        const { cx, cy } = this.pointToCanvas(pts[i]);
        const dx = cx - x, dy = cy - y;
        if (Math.sqrt(dx * dx + dy * dy) < this.POINT_RADIUS * 2) return i;
      }
      return -1;
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const { x, y } = getPos(e);
      const idx = findPoint(x, y);
      if (idx >= 0) {
        this.draggingIdx = idx;
      } else {
        // Add new point
        const pts = this.getPoints();
        pts.push(this.canvasToPoint(x, y));
        pts.sort((a, b) => a.x - b.x);
        this.draggingIdx = pts.indexOf(this.canvasToPoint(x, y));
        // More robust: find closest
        let minD = Infinity;
        pts.forEach((p, i) => {
          const { cx, cy } = this.pointToCanvas(p);
          const d = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
          if (d < minD) { minD = d; this.draggingIdx = i; }
        });
        this.drawCurve();
        this.onChange({ ...this.curves });
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.draggingIdx === null) return;
      const { x, y } = getPos(e);
      const pts = this.getPoints();
      pts[this.draggingIdx] = {
        x: Math.max(0, Math.min(1, x / this.SIZE)),
        y: Math.max(0, Math.min(1, 1 - y / this.SIZE)),
      };
      pts.sort((a, b) => a.x - b.x);
      this.draggingIdx = pts.findIndex(p =>
        pts[this.draggingIdx!] === p
      );
      this.drawCurve();
      this.onChange({ ...this.curves });
    });

    window.addEventListener('mouseup', () => { this.draggingIdx = null; });

    this.canvas.addEventListener('dblclick', (e) => {
      const { x, y } = getPos(e);
      const idx = findPoint(x, y);
      const pts = this.getPoints();
      if (idx >= 0 && pts.length > 2) {
        pts.splice(idx, 1);
        this.drawCurve();
        this.onChange({ ...this.curves });
      }
    });
  }

  private drawCurve(): void {
    const ctx = this.ctx;
    const S = this.SIZE;
    ctx.clearRect(0, 0, S, S);

    // Background
    ctx.fillStyle = '#1e1e21';
    ctx.fillRect(0, 0, S, S);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const v = (i / 4) * S;
      ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(S, v); ctx.stroke();
    }

    // Diagonal
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S, 0); ctx.stroke();

    // Draw all channels (dimmed) below active
    const allChannels: Channel[] = ['rgb', 'r', 'g', 'b'];
    for (const ch of allChannels) {
      if (ch === this.activeChannel) continue;
      this.drawCurveChannel(ctx, this.curves[ch], CHANNEL_COLORS[ch], 0.2, 1);
    }

    // Draw active channel
    const pts = this.getPoints();
    const color = CHANNEL_COLORS[this.activeChannel];
    this.drawCurveChannel(ctx, pts, color, 0.85, 2);

    // Draw fill under active curve
    const lut = buildCurveLUT(pts);
    ctx.beginPath();
    ctx.moveTo(0, S);
    for (let i = 0; i < 256; i++) {
      const cx = (i / 255) * S;
      const cy = (1 - lut[i] / 255) * S;
      ctx.lineTo(cx, cy);
    }
    ctx.lineTo(S, S);
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

    // Control points
    pts.forEach((p, i) => {
      const { cx, cy } = this.pointToCanvas(p);
      ctx.beginPath();
      ctx.arc(cx, cy, this.POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = i === this.draggingIdx ? color : '#fff';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  private drawCurveChannel(
    ctx: CanvasRenderingContext2D, pts: CurvePoint[],
    color: string, alpha: number, lineWidth: number
  ): void {
    const S = this.SIZE;
    const lut = buildCurveLUT(pts);
    ctx.beginPath();
    ctx.moveTo(0, (1 - lut[0] / 255) * S);
    for (let i = 1; i < 256; i++) {
      const cx = (i / 255) * S;
      const cy = (1 - lut[i] / 255) * S;
      ctx.lineTo(cx, cy);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  update(curves: CurveAdjustments): void {
    this.curves = {
      rgb: [...curves.rgb], r: [...curves.r],
      g: [...curves.g], b: [...curves.b],
    };
    this.drawCurve();
  }
}
