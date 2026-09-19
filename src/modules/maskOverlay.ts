// ============================================================
// Mask Overlay — Interactive On-Canvas Mask Controls & Painting
// ============================================================
import type { SubLayerMask, LinearGradientParams, RadialGradientParams } from './layers';

export class MaskOverlay {
  private overlayCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private activeMask: SubLayerMask | null = null;
  private onChange: () => void;

  private isDragging = false;
  private dragHandle: 'linear_start' | 'linear_end' | 'radial_center' | 'radial_border' | 'brush' | null = null;
  private mainCanvas: HTMLCanvasElement;

  constructor(wrapper: HTMLElement, mainCanvas: HTMLCanvasElement, onChange: () => void) {
    this.mainCanvas = mainCanvas;
    this.onChange = onChange;

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'mask-overlay-canvas';
    this.overlayCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    `;
    wrapper.appendChild(this.overlayCanvas);
    this.ctx = this.overlayCanvas.getContext('2d')!;

    this.bindEvents();
  }

  public setActiveMask(mask: SubLayerMask | null): void {
    this.activeMask = mask;
    this.overlayCanvas.style.pointerEvents = mask ? 'auto' : 'none';
    this.render();
  }

  public resize(): void {
    const rect = this.mainCanvas.getBoundingClientRect();
    this.overlayCanvas.width = rect.width;
    this.overlayCanvas.height = rect.height;
    this.overlayCanvas.style.width = `${rect.width}px`;
    this.overlayCanvas.style.height = `${rect.height}px`;
    this.render();
  }

  public render(): void {
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this.activeMask || !this.activeMask.enabled) return;

    if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
      this.renderLinearGradientOverlay(this.activeMask.linear, w, h);
    } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
      this.renderRadialGradientOverlay(this.activeMask.radial, w, h);
    } else if (this.activeMask.type === 'brush') {
      this.renderBrushHint(w, h);
    }
  }

  private renderLinearGradientOverlay(l: LinearGradientParams, w: number, h: number): void {
    const x1 = l.x1 * w;
    const y1 = l.y1 * h;
    const x2 = l.x2 * w;
    const y2 = l.y2 * h;

    // Draw gradient line
    this.ctx.strokeStyle = '#0a84ff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Start handle
    this.drawHandle(x1, y1, '#0a84ff', 'Start');
    // End handle
    this.drawHandle(x2, y2, '#38bdf8', 'End');
  }

  private renderRadialGradientOverlay(r: RadialGradientParams, w: number, h: number): void {
    const cx = r.cx * w;
    const cy = r.cy * h;
    const rx = r.rx * w;
    const ry = r.ry * h;

    // Draw ellipse boundary
    this.ctx.strokeStyle = '#0a84ff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, Math.max(10, rx), Math.max(10, ry), 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Center handle
    this.drawHandle(cx, cy, '#0a84ff', 'Center');
    // Border radius handle
    this.drawHandle(cx + rx, cy, '#38bdf8', 'Radius');
  }

  private renderBrushHint(_w: number, _h: number): void {
    this.ctx.fillStyle = 'rgba(10, 132, 255, 0.15)';
    this.ctx.font = '11px -apple-system, sans-serif';
    this.ctx.fillText('🖌️ Click & drag to paint brush mask', 12, 24);
  }

  private drawHandle(x: number, y: number, color: string, label: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 7, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '10px -apple-system, sans-serif';
    this.ctx.fillText(label, x + 10, y + 3);
  }

  private bindEvents(): void {
    this.overlayCanvas.addEventListener('mousedown', (e) => {
      if (!this.activeMask) return;
      const rect = this.overlayCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
        const l = this.activeMask.linear;
        const d1 = Math.hypot(px - l.x1 * rect.width, py - l.y1 * rect.height);
        const d2 = Math.hypot(px - l.x2 * rect.width, py - l.y2 * rect.height);

        if (d1 < 15) {
          this.isDragging = true;
          this.dragHandle = 'linear_start';
        } else if (d2 < 15) {
          this.isDragging = true;
          this.dragHandle = 'linear_end';
        }
      } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
        const r = this.activeMask.radial;
        const dc = Math.hypot(px - r.cx * rect.width, py - r.cy * rect.height);
        const db = Math.hypot(px - (r.cx + r.rx) * rect.width, py - r.cy * rect.height);

        if (dc < 15) {
          this.isDragging = true;
          this.dragHandle = 'radial_center';
        } else if (db < 15) {
          this.isDragging = true;
          this.dragHandle = 'radial_border';
        }
      }
    });

    this.overlayCanvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.activeMask) return;
      const rect = this.overlayCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (this.dragHandle === 'linear_start' && this.activeMask.linear) {
        this.activeMask.linear.x1 = x;
        this.activeMask.linear.y1 = y;
        this.render();
        this.onChange();
      } else if (this.dragHandle === 'linear_end' && this.activeMask.linear) {
        this.activeMask.linear.x2 = x;
        this.activeMask.linear.y2 = y;
        this.render();
        this.onChange();
      } else if (this.dragHandle === 'radial_center' && this.activeMask.radial) {
        this.activeMask.radial.cx = x;
        this.activeMask.radial.cy = y;
        this.render();
        this.onChange();
      } else if (this.dragHandle === 'radial_border' && this.activeMask.radial) {
        this.activeMask.radial.rx = Math.max(0.05, Math.abs(x - this.activeMask.radial.cx));
        this.activeMask.radial.ry = this.activeMask.radial.rx;
        this.render();
        this.onChange();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragHandle = null;
      }
    });
  }
}
