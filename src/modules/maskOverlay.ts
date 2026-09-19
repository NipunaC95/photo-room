// ============================================================
// Mask Overlay — Interactive On-Canvas Mask Painting & Drawing Engine
// ============================================================
import type { SubLayerMask, LinearGradientParams, RadialGradientParams } from './layers';

export class MaskOverlay {
  private overlayCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenMaskCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  private activeMask: SubLayerMask | null = null;
  private onChange: () => void;
  private mainCanvas: HTMLCanvasElement;
  private wrapper: HTMLElement;

  // Floating toolbar refs
  private toolbarEl!: HTMLElement;
  private sizeSlider!: HTMLInputElement;
  private sizeVal!: HTMLElement;
  private featherSlider!: HTMLInputElement;
  private featherVal!: HTMLElement;
  private eraseBtn!: HTMLButtonElement;
  private overlayToggleBtn!: HTMLButtonElement;
  private invertBtn!: HTMLButtonElement;

  // Drawing state
  private isDrawing = false;
  private isEraseMode = false;
  private showMaskOverlay = true;
  private brushSize = 40;
  private brushFeather = 50;
  private cursorX = -1000;
  private cursorY = -1000;

  private dragHandle: 'linear_start' | 'linear_end' | 'radial_center' | 'radial_border' | 'draw_linear' | 'draw_radial' | null = null;

  constructor(wrapper: HTMLElement, mainCanvas: HTMLCanvasElement, onChange: () => void) {
    this.wrapper = wrapper;
    this.mainCanvas = mainCanvas;
    this.onChange = onChange;

    // Overlay canvas mounted over photo
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'mask-overlay-canvas';
    this.overlayCanvas.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 10;
    `;
    wrapper.appendChild(this.overlayCanvas);
    this.ctx = this.overlayCanvas.getContext('2d')!;

    // Offscreen pixel mask canvas for painting
    this.offscreenMaskCanvas = document.createElement('canvas');
    this.offscreenMaskCanvas.width = 1000;
    this.offscreenMaskCanvas.height = 1000;
    this.offscreenCtx = this.offscreenMaskCanvas.getContext('2d')!;

    this.createFloatingToolbar();
    this.bindEvents();
  }

  private createFloatingToolbar(): void {
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'mask-floating-toolbar';
    this.toolbarEl.style.display = 'none';

    this.toolbarEl.innerHTML = `
      <div class="mask-toolbar-group">
        <button class="mask-tool-btn active" id="btn-mask-paint" title="Paint Brush">🖌️ Paint</button>
        <button class="mask-tool-btn" id="btn-mask-erase" title="Erase Brush">🧹 Erase</button>
      </div>
      <div class="mask-toolbar-divider"></div>
      <div class="mask-toolbar-slider-group">
        <span class="mask-tb-label">Size</span>
        <input type="range" class="slider mask-tb-slider" id="mask-size-slider" min="5" max="250" value="40">
        <span class="mask-tb-val" id="mask-size-val">40px</span>
      </div>
      <div class="mask-toolbar-slider-group">
        <span class="mask-tb-label">Feather</span>
        <input type="range" class="slider mask-tb-slider" id="mask-feather-slider" min="0" max="100" value="50">
        <span class="mask-tb-val" id="mask-feather-val">50%</span>
      </div>
      <div class="mask-toolbar-divider"></div>
      <button class="mask-tool-btn active" id="btn-mask-overlay" title="Toggle Ruby Red Mask Overlay">🔴 Overlay</button>
      <button class="mask-tool-btn" id="btn-mask-invert" title="Invert Mask">⇄ Invert</button>
      <button class="mask-tool-btn danger" id="btn-mask-clear" title="Clear Mask">🗑️ Clear</button>
    `;

    this.wrapper.appendChild(this.toolbarEl);

    // Bind floating toolbar controls
    const paintBtn = this.toolbarEl.querySelector('#btn-mask-paint') as HTMLButtonElement;
    this.eraseBtn = this.toolbarEl.querySelector('#btn-mask-erase') as HTMLButtonElement;
    this.sizeSlider = this.toolbarEl.querySelector('#mask-size-slider') as HTMLInputElement;
    this.sizeVal = this.toolbarEl.querySelector('#mask-size-val') as HTMLElement;
    this.featherSlider = this.toolbarEl.querySelector('#mask-feather-slider') as HTMLInputElement;
    this.featherVal = this.toolbarEl.querySelector('#mask-feather-val') as HTMLElement;
    this.overlayToggleBtn = this.toolbarEl.querySelector('#btn-mask-overlay') as HTMLButtonElement;
    this.invertBtn = this.toolbarEl.querySelector('#btn-mask-invert') as HTMLButtonElement;
    const clearBtn = this.toolbarEl.querySelector('#btn-mask-clear') as HTMLButtonElement;

    paintBtn.addEventListener('click', () => {
      this.isEraseMode = false;
      paintBtn.classList.add('active');
      this.eraseBtn.classList.remove('active');
    });

    this.eraseBtn.addEventListener('click', () => {
      this.isEraseMode = true;
      this.eraseBtn.classList.add('active');
      paintBtn.classList.remove('active');
    });

    this.sizeSlider.addEventListener('input', () => {
      this.brushSize = parseInt(this.sizeSlider.value, 10);
      this.sizeVal.textContent = `${this.brushSize}px`;
      if (this.activeMask) this.activeMask.brushSize = this.brushSize;
      this.render();
    });

    this.featherSlider.addEventListener('input', () => {
      this.brushFeather = parseInt(this.featherSlider.value, 10);
      this.featherVal.textContent = `${this.brushFeather}%`;
      if (this.activeMask) this.activeMask.brushFeather = this.brushFeather;
      this.render();
    });

    this.overlayToggleBtn.addEventListener('click', () => {
      this.showMaskOverlay = !this.showMaskOverlay;
      this.overlayToggleBtn.classList.toggle('active', this.showMaskOverlay);
      this.render();
    });

    this.invertBtn.addEventListener('click', () => {
      if (this.activeMask) {
        this.activeMask.inverted = !this.activeMask.inverted;
        this.invertBtn.classList.toggle('active', this.activeMask.inverted);
        this.render();
        this.onChange();
      }
    });

    clearBtn.addEventListener('click', () => {
      if (this.activeMask) {
        this.clearActiveMask();
      }
    });
  }

  public setActiveMask(mask: SubLayerMask | null): void {
    this.activeMask = mask;
    const hasMask = !!mask;
    this.overlayCanvas.style.pointerEvents = hasMask ? 'auto' : 'none';
    this.toolbarEl.style.display = hasMask ? 'flex' : 'none';

    if (mask) {
      this.brushSize = mask.brushSize || 40;
      this.brushFeather = mask.brushFeather || 50;
      this.sizeSlider.value = String(this.brushSize);
      this.sizeVal.textContent = `${this.brushSize}px`;
      this.featherSlider.value = String(this.brushFeather);
      this.featherVal.textContent = `${this.brushFeather}%`;
      this.invertBtn.classList.toggle('active', !!mask.inverted);

      // Load existing brush mask if present
      if (mask.type === 'brush' && mask.brushDataUrl) {
        const img = new Image();
        img.onload = () => {
          this.offscreenCtx.clearRect(0, 0, this.offscreenMaskCanvas.width, this.offscreenMaskCanvas.height);
          this.offscreenCtx.drawImage(img, 0, 0, this.offscreenMaskCanvas.width, this.offscreenMaskCanvas.height);
          this.render();
        };
        img.src = mask.brushDataUrl;
      } else if (mask.type === 'brush') {
        this.offscreenCtx.clearRect(0, 0, this.offscreenMaskCanvas.width, this.offscreenMaskCanvas.height);
      }
    }

    this.resize();
  }

  public resize(): void {
    const mainRect = this.mainCanvas.getBoundingClientRect();
    const wrapperRect = this.wrapper.getBoundingClientRect();

    if (mainRect.width > 0 && mainRect.height > 0) {
      const top = mainRect.top - wrapperRect.top;
      const left = mainRect.left - wrapperRect.left;

      this.overlayCanvas.width = Math.round(mainRect.width);
      this.overlayCanvas.height = Math.round(mainRect.height);
      this.overlayCanvas.style.top = `${top}px`;
      this.overlayCanvas.style.left = `${left}px`;
      this.overlayCanvas.style.width = `${Math.round(mainRect.width)}px`;
      this.overlayCanvas.style.height = `${Math.round(mainRect.height)}px`;

      if (this.offscreenMaskCanvas.width !== Math.round(mainRect.width) || this.offscreenMaskCanvas.height !== Math.round(mainRect.height)) {
        const temp = document.createElement('canvas');
        temp.width = this.offscreenMaskCanvas.width;
        temp.height = this.offscreenMaskCanvas.height;
        temp.getContext('2d')?.drawImage(this.offscreenMaskCanvas, 0, 0);

        this.offscreenMaskCanvas.width = Math.round(mainRect.width);
        this.offscreenMaskCanvas.height = Math.round(mainRect.height);
        this.offscreenCtx.drawImage(temp, 0, 0, mainRect.width, mainRect.height);
      }
    }
    this.render();
  }

  public getMaskCanvas(): HTMLCanvasElement | null {
    if (!this.activeMask || !this.activeMask.enabled) return null;

    const w = Math.max(10, Math.round(this.mainCanvas.width || this.overlayCanvas.width || 800));
    const h = Math.max(10, Math.round(this.mainCanvas.height || this.overlayCanvas.height || 600));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    if (this.activeMask.type === 'brush') {
      ctx.drawImage(this.offscreenMaskCanvas, 0, 0, w, h);
    } else if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
      const l = this.activeMask.linear;
      const grad = ctx.createLinearGradient(l.x1 * w, l.y1 * h, l.x2 * w, l.y2 * h);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
      const r = this.activeMask.radial;
      const cx = r.cx * w;
      const cy = r.cy * h;
      const rx = r.rx * w;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(Math.max(0, 1 - r.feather * 0.8), 'rgba(255, 255, 255, 0.7)');
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
      const a = imgData.data[i + 3] || imgData.data[i];
      imgData.data[i] = 255;
      imgData.data[i + 1] = 255;
      imgData.data[i + 2] = 255;
      imgData.data[i + 3] = a;

      if (this.activeMask.inverted) {
        imgData.data[i + 3] = 255 - a;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    return canvas;
  }

  public render(): void {
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!this.activeMask || !this.activeMask.enabled) return;

    // Render Ruby Red Mask Overlay if enabled
    if (this.showMaskOverlay) {
      if (this.activeMask.type === 'brush') {
        this.ctx.save();
        this.ctx.globalAlpha = 0.5;
        this.ctx.drawImage(this.offscreenMaskCanvas, 0, 0, w, h);
        this.ctx.globalCompositeOperation = 'source-in';
        this.ctx.fillStyle = 'rgb(255, 59, 48)';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.restore();
      } else if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
        this.renderLinearMaskFill(this.activeMask.linear, w, h);
      } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
        this.renderRadialMaskFill(this.activeMask.radial, w, h);
      }
    }

    // Render interactive handles and brush ring cursor
    if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
      this.renderLinearGradientOverlay(this.activeMask.linear, w, h);
    } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
      this.renderRadialGradientOverlay(this.activeMask.radial, w, h);
    } else if (this.activeMask.type === 'brush') {
      this.renderBrushRingCursor();
    }
  }

  private renderLinearMaskFill(l: LinearGradientParams, w: number, h: number): void {
    const x1 = l.x1 * w;
    const y1 = l.y1 * h;
    const x2 = l.x2 * w;
    const y2 = l.y2 * h;

    const grad = this.ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, 'rgba(255, 59, 48, 0.5)');
    grad.addColorStop(1, 'rgba(255, 59, 48, 0.0)');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, w, h);
  }

  private renderRadialMaskFill(r: RadialGradientParams, w: number, h: number): void {
    const cx = r.cx * w;
    const cy = r.cy * h;
    const rx = r.rx * w;

    const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, 'rgba(255, 59, 48, 0.5)');
    grad.addColorStop(Math.max(0, 1 - r.feather * 0.8), 'rgba(255, 59, 48, 0.3)');
    grad.addColorStop(1, 'rgba(255, 59, 48, 0.0)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderLinearGradientOverlay(l: LinearGradientParams, w: number, h: number): void {
    const x1 = l.x1 * w;
    const y1 = l.y1 * h;
    const x2 = l.x2 * w;
    const y2 = l.y2 * h;

    this.ctx.strokeStyle = '#0a84ff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.drawHandle(x1, y1, '#0a84ff', 'Start');
    this.drawHandle(x2, y2, '#38bdf8', 'End');
  }

  private renderRadialGradientOverlay(r: RadialGradientParams, w: number, h: number): void {
    const cx = r.cx * w;
    const cy = r.cy * h;
    const rx = r.rx * w;
    const ry = r.ry * h;

    this.ctx.strokeStyle = '#0a84ff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, Math.max(10, rx), Math.max(10, ry), 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.drawHandle(cx, cy, '#0a84ff', 'Center');
    this.drawHandle(cx + rx, cy, '#38bdf8', 'Radius');
  }

  private renderBrushRingCursor(): void {
    if (this.cursorX < 0 || this.cursorY < 0) return;
    const r = this.brushSize / 2;
    const featherR = r * (1 - (this.brushFeather / 100) * 0.5);

    // Inner radius ring
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.arc(this.cursorX, this.cursorY, Math.max(2, featherR), 0, Math.PI * 2);
    this.ctx.stroke();

    // Outer feather ring
    this.ctx.strokeStyle = 'rgba(10, 132, 255, 0.7)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 3]);
    this.ctx.beginPath();
    this.ctx.arc(this.cursorX, this.cursorY, r, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
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

  private paintBrushStroke(px: number, py: number): void {
    const r = this.brushSize / 2;
    this.offscreenCtx.save();
    if (this.isEraseMode) {
      this.offscreenCtx.globalCompositeOperation = 'destination-out';
      this.offscreenCtx.beginPath();
      this.offscreenCtx.arc(px, py, r, 0, Math.PI * 2);
      this.offscreenCtx.fill();
    } else {
      this.offscreenCtx.globalCompositeOperation = 'source-over';
      const grad = this.offscreenCtx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(255, 59, 48, 1)');
      grad.addColorStop(Math.max(0, 1 - (this.brushFeather / 100) * 0.8), 'rgba(255, 59, 48, 0.8)');
      grad.addColorStop(1, 'rgba(255, 59, 48, 0)');
      this.offscreenCtx.fillStyle = grad;
      this.offscreenCtx.beginPath();
      this.offscreenCtx.arc(px, py, r, 0, Math.PI * 2);
      this.offscreenCtx.fill();
    }
    this.offscreenCtx.restore();

    if (this.activeMask) {
      this.activeMask.brushDataUrl = this.offscreenMaskCanvas.toDataURL();
    }
  }

  public clearActiveMask(): void {
    if (!this.activeMask) return;
    this.offscreenCtx.clearRect(0, 0, this.offscreenMaskCanvas.width, this.offscreenMaskCanvas.height);
    this.activeMask.brushDataUrl = undefined;
    if (this.activeMask.linear) {
      this.activeMask.linear = { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 };
    }
    if (this.activeMask.radial) {
      this.activeMask.radial = { cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, feather: 0.5 };
    }
    this.render();
    this.onChange();
  }

  private bindEvents(): void {
    this.overlayCanvas.addEventListener('mouseenter', () => {
      this.render();
    });

    this.overlayCanvas.addEventListener('mouseleave', () => {
      this.cursorX = -1000;
      this.cursorY = -1000;
      this.render();
    });

    this.overlayCanvas.addEventListener('wheel', (e) => {
      if (!this.activeMask || this.activeMask.type !== 'brush') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -4 : 4;
      this.brushSize = Math.max(5, Math.min(250, this.brushSize + delta));
      this.sizeSlider.value = String(this.brushSize);
      this.sizeVal.textContent = `${this.brushSize}px`;
      if (this.activeMask) this.activeMask.brushSize = this.brushSize;
      this.render();
    }, { passive: false });

    this.overlayCanvas.addEventListener('mousedown', (e) => {
      if (!this.activeMask) return;
      const rect = this.overlayCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const x = px / rect.width;
      const y = py / rect.height;

      if (this.activeMask.type === 'brush') {
        this.isDrawing = true;
        this.paintBrushStroke(px, py);
        this.render();
        this.onChange();
      } else if (this.activeMask.type === 'linear_gradient' && this.activeMask.linear) {
        const l = this.activeMask.linear;
        const d1 = Math.hypot(px - l.x1 * rect.width, py - l.y1 * rect.height);
        const d2 = Math.hypot(px - l.x2 * rect.width, py - l.y2 * rect.height);

        if (d1 < 18) {
          this.isDrawing = true;
          this.dragHandle = 'linear_start';
        } else if (d2 < 18) {
          this.isDrawing = true;
          this.dragHandle = 'linear_end';
        } else {
          // Start fresh linear drag drawing
          this.isDrawing = true;
          this.dragHandle = 'draw_linear';
          this.activeMask.linear.x1 = x;
          this.activeMask.linear.y1 = y;
          this.activeMask.linear.x2 = x;
          this.activeMask.linear.y2 = y;
          this.render();
        }
      } else if (this.activeMask.type === 'radial_gradient' && this.activeMask.radial) {
        const r = this.activeMask.radial;
        const dc = Math.hypot(px - r.cx * rect.width, py - r.cy * rect.height);
        const db = Math.hypot(px - (r.cx + r.rx) * rect.width, py - r.cy * rect.height);

        if (dc < 18) {
          this.isDrawing = true;
          this.dragHandle = 'radial_center';
        } else if (db < 18) {
          this.isDrawing = true;
          this.dragHandle = 'radial_border';
        } else {
          // Start fresh radial drag drawing
          this.isDrawing = true;
          this.dragHandle = 'draw_radial';
          this.activeMask.radial.cx = x;
          this.activeMask.radial.cy = y;
          this.activeMask.radial.rx = 0.05;
          this.activeMask.radial.ry = 0.05;
          this.render();
        }
      }
    });

    this.overlayCanvas.addEventListener('mousemove', (e) => {
      const rect = this.overlayCanvas.getBoundingClientRect();
      this.cursorX = e.clientX - rect.left;
      this.cursorY = e.clientY - rect.top;

      if (!this.activeMask) return;
      const x = Math.max(0, Math.min(1, this.cursorX / rect.width));
      const y = Math.max(0, Math.min(1, this.cursorY / rect.height));

      if (this.isDrawing) {
        if (this.activeMask.type === 'brush') {
          this.paintBrushStroke(this.cursorX, this.cursorY);
          this.render();
          this.onChange();
        } else if (this.dragHandle === 'draw_linear' && this.activeMask.linear) {
          this.activeMask.linear.x2 = x;
          this.activeMask.linear.y2 = y;
          this.render();
          this.onChange();
        } else if (this.dragHandle === 'draw_radial' && this.activeMask.radial) {
          const rx = Math.hypot(x - this.activeMask.radial.cx, y - this.activeMask.radial.cy);
          this.activeMask.radial.rx = Math.max(0.02, rx);
          this.activeMask.radial.ry = Math.max(0.02, rx);
          this.render();
          this.onChange();
        } else if (this.dragHandle === 'linear_start' && this.activeMask.linear) {
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
          this.activeMask.radial.rx = Math.max(0.02, Math.abs(x - this.activeMask.radial.cx));
          this.activeMask.radial.ry = this.activeMask.radial.rx;
          this.render();
          this.onChange();
        }
      } else {
        this.render();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.dragHandle = null;
        if (this.activeMask?.type === 'brush') {
          this.onChange();
        }
      }
    });
  }
}
