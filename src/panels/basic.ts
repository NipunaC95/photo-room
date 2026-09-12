// ============================================================
// Basic Panel
// ============================================================
import type { BasicAdjustments } from '../modules/processor';

interface SliderDef {
  key: keyof BasicAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const BASIC_SLIDERS: SliderDef[] = [
  // White Balance section
  { key: 'temperature', label: 'Temp',        min: 2000,  max: 50000, step: 100,  default: 6500  },
  { key: 'tint',        label: 'Tint',        min: -150,  max: 150,   step: 1,    default: 0     },
  // Tone section
  { key: 'exposure',    label: 'Exposure',    min: -5,    max: 5,     step: 0.05, default: 0     },
  { key: 'contrast',    label: 'Contrast',    min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'highlights',  label: 'Highlights',  min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'shadows',     label: 'Shadows',     min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'whites',      label: 'Whites',      min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'blacks',      label: 'Blacks',      min: -100,  max: 100,   step: 1,    default: 0     },
  // Presence section
  { key: 'clarity',     label: 'Clarity',     min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'dehaze',      label: 'Dehaze',      min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'vibrance',    label: 'Vibrance',    min: -100,  max: 100,   step: 1,    default: 0     },
  { key: 'saturation',  label: 'Saturation',  min: -100,  max: 100,   step: 1,    default: 0     },
];

const SECTIONS = [
  { title: 'White Balance', keys: ['temperature', 'tint'] },
  { title: 'Tone',          keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { title: 'Presence',      keys: ['clarity', 'dehaze', 'vibrance', 'saturation'] },
];

export class BasicPanel {
  private container: HTMLElement;
  private values: BasicAdjustments;
  private onChange: (v: BasicAdjustments) => void;
  private inputs = new Map<string, HTMLInputElement>();
  private displays = new Map<string, HTMLElement>();

  constructor(
    container: HTMLElement,
    initial: BasicAdjustments,
    onChange: (v: BasicAdjustments) => void
  ) {
    this.container = container;
    this.values = { ...initial };
    this.onChange = onChange;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<h2>Basic</h2><button class="panel-reset-btn" id="basic-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    const sliderMap = new Map(BASIC_SLIDERS.map(s => [s.key, s]));

    for (const section of SECTIONS) {
      const sec = document.createElement('div');
      sec.className = 'panel-section';
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = section.title;
      sec.appendChild(title);

      for (const key of section.keys) {
        const def = sliderMap.get(key as keyof BasicAdjustments)!;
        const row = this.buildSliderRow(def);
        sec.appendChild(row);
      }
      this.container.appendChild(sec);
    }

    header.querySelector('#basic-reset')?.addEventListener('click', () => {
      BASIC_SLIDERS.forEach(def => {
        this.values[def.key] = def.default;
        const inp = this.inputs.get(def.key);
        const disp = this.displays.get(def.key);
        if (inp) inp.value = String(def.default);
        if (disp) disp.textContent = this.formatValue(def.key, def.default);
      });
      this.onChange({ ...this.values });
    });
  }

  private buildSliderRow(def: SliderDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const label = document.createElement('label');
    label.className = 'slider-label';
    label.textContent = def.label;
    label.htmlFor = `slider-${def.key}`;

    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = `slider-${def.key}`;
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(this.values[def.key]);

    // Gradient fill effect via CSS custom property
    this.updateSliderFill(input, def);

    const display = document.createElement('span');
    display.className = 'slider-value';
    display.textContent = this.formatValue(def.key, this.values[def.key]);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      this.values[def.key] = v;
      display.textContent = this.formatValue(def.key, v);
      this.updateSliderFill(input, def);
      this.onChange({ ...this.values });
    });

    // Double-click to reset
    input.addEventListener('dblclick', () => {
      input.value = String(def.default);
      this.values[def.key] = def.default;
      display.textContent = this.formatValue(def.key, def.default);
      this.updateSliderFill(input, def);
      this.onChange({ ...this.values });
    });

    this.inputs.set(def.key, input);
    this.displays.set(def.key, display);

    trackWrap.appendChild(input);
    row.appendChild(label);
    row.appendChild(trackWrap);
    row.appendChild(display);
    return row;
  }

  private updateSliderFill(input: HTMLInputElement, def: SliderDef): void {
    const v = parseFloat(input.value);
    const pct = ((v - def.min) / (def.max - def.min)) * 100;
    input.style.background = `linear-gradient(90deg, #e96fff ${pct}%, #2e2e35 ${pct}%)`;
  }

  private formatValue(key: string, v: number): string {
    if (key === 'temperature') return `${Math.round(v)}K`;
    if (key === 'exposure') return v.toFixed(2);
    return `${v > 0 ? '+' : ''}${Math.round(v)}`;
  }

  update(values: BasicAdjustments): void {
    this.values = { ...values };
    BASIC_SLIDERS.forEach(def => {
      const inp = this.inputs.get(def.key);
      const disp = this.displays.get(def.key);
      if (inp) {
        inp.value = String(values[def.key]);
        this.updateSliderFill(inp, def);
      }
      if (disp) disp.textContent = this.formatValue(def.key, values[def.key]);
    });
  }
}
