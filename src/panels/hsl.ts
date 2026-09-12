// ============================================================
// HSL / Color Panel — per-color hue/saturation/luminance
// ============================================================
import { HSLColor } from '../modules/processor';

const COLOR_DEFS = [
  { name: 'Red',     color: '#ff4d4d' },
  { name: 'Orange',  color: '#ff8c42' },
  { name: 'Yellow',  color: '#ffd166' },
  { name: 'Green',   color: '#06d6a0' },
  { name: 'Aqua',    color: '#00b4d8' },
  { name: 'Blue',    color: '#4361ee' },
  { name: 'Purple',  color: '#b5179e' },
  { name: 'Magenta', color: '#f72585' },
];

const HSL_SLIDERS = [
  { key: 'hue',        label: 'Hue',        min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'luminance',  label: 'Luminance',  min: -100, max: 100 },
] as const;

export class HSLPanel {
  private container: HTMLElement;
  private values: HSLColor[];
  private onChange: (v: HSLColor[]) => void;
  private activeColor = 0;
  private inputs: Map<string, HTMLInputElement> = new Map();
  private displays: Map<string, HTMLElement> = new Map();

  constructor(
    container: HTMLElement,
    initial: HSLColor[],
    onChange: (v: HSLColor[]) => void
  ) {
    this.container = container;
    this.values = initial.map(v => ({ ...v }));
    this.onChange = onChange;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<h2>HSL / Color</h2><button class="panel-reset-btn" id="hsl-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    // Color tabs
    const tabs = document.createElement('div');
    tabs.className = 'panel-tabs';
    COLOR_DEFS.forEach((def, i) => {
      const btn = document.createElement('button');
      btn.className = `panel-tab${i === this.activeColor ? ' active' : ''}`;
      btn.dataset.idx = String(i);
      btn.innerHTML = `<span class="color-dot" style="background:${def.color}"></span>${def.name}`;
      btn.addEventListener('click', () => {
        this.activeColor = i;
        tabs.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderSliders(sliderArea);
      });
      tabs.appendChild(btn);
    });
    this.container.appendChild(tabs);

    const sliderArea = document.createElement('div');
    sliderArea.className = 'panel-section';
    this.container.appendChild(sliderArea);
    this.renderSliders(sliderArea);

    header.querySelector('#hsl-reset')?.addEventListener('click', () => {
      this.values = Array.from({ length: 8 }, () => ({ hue: 0, saturation: 0, luminance: 0 }));
      this.renderSliders(sliderArea);
      this.onChange(this.values.map(v => ({ ...v })));
    });
  }

  private renderSliders(area: HTMLElement): void {
    area.innerHTML = '';
    this.inputs.clear();
    this.displays.clear();

    HSL_SLIDERS.forEach(def => {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const label = document.createElement('label');
      label.className = 'slider-label';
      label.textContent = def.label;
      label.htmlFor = `hsl-${def.key}`;

      const trackWrap = document.createElement('div');
      trackWrap.className = 'slider-track-wrap';

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'slider';
      input.id = `hsl-${def.key}`;
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = '1';
      input.value = String(this.values[this.activeColor][def.key]);
      this.updateFill(input, def.min, def.max);

      const display = document.createElement('span');
      display.className = 'slider-value';
      display.textContent = this.fmt(this.values[this.activeColor][def.key]);

      input.addEventListener('input', () => {
        const v = parseInt(input.value);
        this.values[this.activeColor][def.key] = v;
        display.textContent = this.fmt(v);
        this.updateFill(input, def.min, def.max);
        this.onChange(this.values.map(v => ({ ...v })));
      });

      input.addEventListener('dblclick', () => {
        input.value = '0';
        this.values[this.activeColor][def.key] = 0;
        display.textContent = '0';
        this.updateFill(input, def.min, def.max);
        this.onChange(this.values.map(v => ({ ...v })));
      });

      this.inputs.set(def.key, input);
      this.displays.set(def.key, display);
      trackWrap.appendChild(input);
      row.append(label, trackWrap, display);
      area.appendChild(row);
    });
  }

  private updateFill(input: HTMLInputElement, min: number, max: number): void {
    const v = parseFloat(input.value);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.background = `linear-gradient(90deg, #e96fff ${pct}%, #2e2e35 ${pct}%)`;
  }

  private fmt(v: number): string {
    return `${v > 0 ? '+' : ''}${v}`;
  }

  update(values: HSLColor[]): void {
    this.values = values.map(v => ({ ...v }));
  }
}
