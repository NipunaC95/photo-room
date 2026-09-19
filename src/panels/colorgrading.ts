// ============================================================
// Color Grading Panel — color wheels for shadows/midtones/highlights
// ============================================================
import type { ColorGradingAdjustments, ColorGradingWheel } from '../modules/processor';

const WHEEL_SIZE = 100; // canvas px (display will be 100% width via CSS)

export class ColorGradingPanel {
  private container: HTMLElement;
  private values: ColorGradingAdjustments;
  private onChange: (v: ColorGradingAdjustments) => void;
  private wheels: Map<string, WheelControl> = new Map();

  constructor(
    container: HTMLElement,
    initial: ColorGradingAdjustments,
    onChange: (v: ColorGradingAdjustments) => void
  ) {
    this.container = container;
    this.values = JSON.parse(JSON.stringify(initial));
    this.onChange = onChange;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<h2>Color Grading</h2><button class="panel-reset-btn" id="grading-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    const wheelDefs: { key: keyof Omit<ColorGradingAdjustments, 'blending' | 'balance'>; label: string }[] = [
      { key: 'shadows',    label: 'Shadows' },
      { key: 'midtones',   label: 'Midtones' },
      { key: 'highlights', label: 'Highlights' },
    ];

    const wheelGroup = document.createElement('div');
    wheelGroup.className = 'color-wheel-group';

    wheelDefs.forEach(({ key, label }) => {
      const wheel = new WheelControl(
        label,
        this.values[key],
        (updated) => {
          (this.values[key] as ColorGradingWheel) = updated;
          this.onChange({ ...this.values });
        }
      );
      const el = wheel.getElement();
      wheelGroup.appendChild(el);
      this.wheels.set(key, wheel);
    });
    this.container.appendChild(wheelGroup);

    // Blending + Balance
    const sec = document.createElement('div');
    sec.className = 'panel-section';
    sec.style.marginTop = '16px';
    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'Global';
    sec.appendChild(title);

    sec.appendChild(this.buildSlider('Blending', 0, 100, this.values.blending, (v) => {
      this.values.blending = v;
      this.onChange({ ...this.values });
    }));
    sec.appendChild(this.buildSlider('Balance', -100, 100, this.values.balance, (v) => {
      this.values.balance = v;
      this.onChange({ ...this.values });
    }));
    this.container.appendChild(sec);

    header.querySelector('#grading-reset')?.addEventListener('click', () => {
      const def = (): ColorGradingWheel => ({ hue: 0, saturation: 0, luminance: 0 });
      this.values = {
        shadows: def(), midtones: def(), highlights: def(),
        blending: 50, balance: 0,
      };
      this.wheels.forEach((w, k) => w.update(this.values[k as keyof typeof this.values] as ColorGradingWheel));
      this.onChange({ ...this.values });
    });
  }

  private buildSlider(
    label: string, min: number, max: number, initial: number,
    onChange: (v: number) => void
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const lbl = document.createElement('label');
    lbl.className = 'slider-label';
    lbl.textContent = label;
    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(initial);
    const pct = ((initial - min) / (max - min)) * 100;
    input.style.background = `linear-gradient(90deg, #0a84ff ${pct}%, #2e2e35 ${pct}%)`;
    const display = document.createElement('span');
    display.className = 'slider-value';
    display.textContent = `${initial > 0 ? '+' : ''}${initial}`;
    input.addEventListener('input', () => {
      const v = parseInt(input.value);
      const p = ((v - min) / (max - min)) * 100;
      input.style.background = `linear-gradient(90deg, #0a84ff ${p}%, #2e2e35 ${p}%)`;
      display.textContent = `${v > 0 ? '+' : ''}${v}`;
      onChange(v);
    });
    trackWrap.appendChild(input);
    row.append(lbl, trackWrap, display);
    return row;
  }

  update(values: ColorGradingAdjustments): void {
    this.values = JSON.parse(JSON.stringify(values));
    this.wheels.forEach((w, k) => {
      w.update(this.values[k as keyof typeof this.values] as ColorGradingWheel);
    });
  }
}

// ---- Individual color wheel control ----
class WheelControl {
  private label: string;
  private value: ColorGradingWheel;
  private onChange: (v: ColorGradingWheel) => void;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private puck!: HTMLElement;
  private wrapper!: HTMLElement;
  private isDragging = false;
  private readonly R = WHEEL_SIZE / 2;

  constructor(label: string, initial: ColorGradingWheel, onChange: (v: ColorGradingWheel) => void) {
    this.label = label;
    this.value = { ...initial };
    this.onChange = onChange;
  }

  getElement(): HTMLElement {
    const item = document.createElement('div');
    item.className = 'color-wheel-item';

    const lbl = document.createElement('div');
    lbl.className = 'color-wheel-label';
    lbl.textContent = this.label;
    item.appendChild(lbl);

    // Wheel wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'color-wheel-wrapper';
    this.wrapper.style.width = `${WHEEL_SIZE * 2}px`;
    this.wrapper.style.height = `${WHEEL_SIZE * 2}px`;

    this.canvas = document.createElement('canvas');
    this.canvas.width = WHEEL_SIZE * 2;
    this.canvas.height = WHEEL_SIZE * 2;
    this.canvas.className = 'color-wheel-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx = this.canvas.getContext('2d')!;
    this.drawWheel();

    this.puck = document.createElement('div');
    this.puck.className = 'color-wheel-puck';
    this.updatePuckPosition();

    this.wrapper.appendChild(this.canvas);
    this.wrapper.appendChild(this.puck);
    item.appendChild(this.wrapper);

    // Luminance slider
    const lumSlider = this.buildLuminanceSlider();
    item.appendChild(lumSlider);

    this.bindEvents();
    return item;
  }

  private drawWheel(): void {
    const ctx = this.ctx;
    const size = WHEEL_SIZE * 2;
    const cx = size / 2, cy = size / 2;
    const radius = this.R;

    ctx.clearRect(0, 0, size, size);

    // Draw hue-saturation wheel using image data
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
          const sat = dist / radius;
          // HSL with L=0.5
          const [r, g, b] = hslToRgb(hue, sat, 0.5);
          const idx = (y * size + x) * 4;
          data[idx]     = r * 255;
          data[idx + 1] = g * 255;
          data[idx + 2] = b * 255;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Inner shadow / border
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  private buildLuminanceSlider(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slider-row color-wheel-luminance';
    const lbl = document.createElement('label');
    lbl.className = 'slider-label';
    lbl.style.width = '56px';
    lbl.textContent = 'Lum';
    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.min = '-100';
    input.max = '100';
    input.step = '1';
    input.value = String(this.value.luminance);
    const pct = ((this.value.luminance + 100) / 200) * 100;
    input.style.background = `linear-gradient(90deg, #0a84ff ${pct}%, #2e2e35 ${pct}%)`;
    const display = document.createElement('span');
    display.className = 'slider-value';
    display.textContent = `${this.value.luminance > 0 ? '+' : ''}${this.value.luminance}`;
    input.addEventListener('input', () => {
      const v = parseInt(input.value);
      const p = ((v + 100) / 200) * 100;
      input.style.background = `linear-gradient(90deg, #0a84ff ${p}%, #2e2e35 ${p}%)`;
      display.textContent = `${v > 0 ? '+' : ''}${v}`;
      this.value.luminance = v;
      this.onChange({ ...this.value });
    });
    trackWrap.appendChild(input);
    row.append(lbl, trackWrap, display);
    return row;
  }

  private updatePuckPosition(): void {
    const size = WHEEL_SIZE * 2;
    const cx = size / 2, cy = size / 2;
    const hueRad = (this.value.hue / 360) * Math.PI * 2;
    const sat = this.value.saturation / 100;
    const px = cx + Math.cos(hueRad) * sat * this.R;
    const py = cy + Math.sin(hueRad) * sat * this.R;
    const rect = this.wrapper?.getBoundingClientRect() || { width: size };
    const displayScale = (rect.width || size) / size;
    this.puck.style.left = `${px * displayScale}px`;
    this.puck.style.top = `${py * displayScale}px`;
    this.puck.style.background = this.value.saturation > 0
      ? `hsl(${this.value.hue}deg, 80%, 60%)`
      : '#fff';
  }

  private bindEvents(): void {
    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const scale = (WHEEL_SIZE * 2) / rect.width;
      if (e instanceof TouchEvent) {
        return { x: (e.touches[0].clientX - rect.left) * scale, y: (e.touches[0].clientY - rect.top) * scale };
      }
      return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      const { x, y } = getPos(e);
      const size = WHEEL_SIZE * 2;
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = this.R;
      const clampedDist = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      this.value.hue = ((angle / (Math.PI * 2)) * 360 + 360) % 360;
      this.value.saturation = Math.round((clampedDist / maxDist) * 100);
      this.updatePuckPosition();
      this.onChange({ ...this.value });
    };

    this.canvas.addEventListener('mousedown', (e) => { this.isDragging = true; handleMove(e); });
    window.addEventListener('mousemove', (e) => handleMove(e));
    window.addEventListener('mouseup', () => { this.isDragging = false; });
    this.canvas.addEventListener('touchstart', (e) => { this.isDragging = true; handleMove(e); e.preventDefault(); }, { passive: false });
    window.addEventListener('touchmove', (e) => handleMove(e));
    window.addEventListener('touchend', () => { this.isDragging = false; });
  }

  update(value: ColorGradingWheel): void {
    this.value = { ...value };
    this.updatePuckPosition();
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
