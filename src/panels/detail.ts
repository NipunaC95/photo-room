// ============================================================
// Detail Panel — Sharpening + Noise Reduction
// ============================================================
import type { DetailAdjustments } from '../modules/processor';

interface SliderDef {
  key: keyof DetailAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const DETAIL_SECTIONS = [
  {
    title: 'Sharpening',
    sliders: [
      { key: 'sharpenAmount',  label: 'Amount',   min: 0,   max: 150, step: 1,   default: 0   },
      { key: 'sharpenRadius',  label: 'Radius',   min: 0.5, max: 3,   step: 0.1, default: 1   },
      { key: 'sharpenDetail',  label: 'Detail',   min: 0,   max: 100, step: 1,   default: 25  },
      { key: 'sharpenMasking', label: 'Masking',  min: 0,   max: 100, step: 1,   default: 0   },
    ] as SliderDef[],
  },
  {
    title: 'Noise Reduction',
    sliders: [
      { key: 'nrLuminance',    label: 'Luminance',   min: 0, max: 100, step: 1, default: 0  },
      { key: 'nrLumDetail',    label: 'Lum Detail',  min: 0, max: 100, step: 1, default: 50 },
      { key: 'nrLumContrast',  label: 'Lum Contrast',min: 0, max: 100, step: 1, default: 0  },
      { key: 'nrColor',        label: 'Color',       min: 0, max: 100, step: 1, default: 0  },
      { key: 'nrColorDetail',  label: 'Color Detail',min: 0, max: 100, step: 1, default: 50 },
      { key: 'nrColorSmooth',  label: 'Color Smooth',min: 0, max: 100, step: 1, default: 50 },
    ] as SliderDef[],
  },
];

export class DetailPanel {
  private container: HTMLElement;
  private values: DetailAdjustments;
  private onChange: (v: DetailAdjustments) => void;
  private inputs = new Map<string, HTMLInputElement>();
  private displays = new Map<string, HTMLElement>();

  constructor(
    container: HTMLElement,
    initial: DetailAdjustments,
    onChange: (v: DetailAdjustments) => void
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
    header.innerHTML = `<h2>Detail</h2><button class="panel-reset-btn" id="detail-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    DETAIL_SECTIONS.forEach(section => {
      const sec = document.createElement('div');
      sec.className = 'panel-section';
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = section.title;
      sec.appendChild(title);

      section.sliders.forEach(def => {
        sec.appendChild(this.buildRow(def));
      });

      this.container.appendChild(sec);
    });

    header.querySelector('#detail-reset')?.addEventListener('click', () => {
      DETAIL_SECTIONS.forEach(s => s.sliders.forEach(def => {
        this.values[def.key] = def.default;
        const inp = this.inputs.get(def.key);
        const disp = this.displays.get(def.key);
        if (inp) { inp.value = String(def.default); this.updateFill(inp, def); }
        if (disp) disp.textContent = this.fmt(def.key, def.default);
      }));
      this.onChange({ ...this.values });
    });
  }

  private buildRow(def: SliderDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slider-row';
    const label = document.createElement('label');
    label.className = 'slider-label';
    label.textContent = def.label;
    label.htmlFor = `detail-${def.key}`;
    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = `detail-${def.key}`;
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(this.values[def.key]);
    this.updateFill(input, def);
    const display = document.createElement('span');
    display.className = 'slider-value';
    display.textContent = this.fmt(def.key, this.values[def.key]);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      this.values[def.key] = v;
      display.textContent = this.fmt(def.key, v);
      this.updateFill(input, def);
      this.onChange({ ...this.values });
    });
    input.addEventListener('dblclick', () => {
      input.value = String(def.default);
      this.values[def.key] = def.default;
      display.textContent = this.fmt(def.key, def.default);
      this.updateFill(input, def);
      this.onChange({ ...this.values });
    });

    this.inputs.set(def.key, input);
    this.displays.set(def.key, display);
    trackWrap.appendChild(input);
    row.append(label, trackWrap, display);
    return row;
  }

  private updateFill(input: HTMLInputElement, def: SliderDef): void {
    const v = parseFloat(input.value);
    const pct = ((v - def.min) / (def.max - def.min)) * 100;
    input.style.background = `linear-gradient(90deg, #0a84ff ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;

  }

  private fmt(key: string, v: number): string {
    if (key === 'sharpenRadius') return v.toFixed(1);
    return String(Math.round(v));
  }

  update(values: DetailAdjustments): void {
    this.values = { ...values };
    DETAIL_SECTIONS.forEach(s => s.sliders.forEach(def => {
      const inp = this.inputs.get(def.key);
      const disp = this.displays.get(def.key);
      if (inp) { inp.value = String(values[def.key]); this.updateFill(inp, def); }
      if (disp) disp.textContent = this.fmt(def.key, values[def.key]);
    }));
  }
}
