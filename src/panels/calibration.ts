// ============================================================
// Calibration Panel — Camera Profile Calibration
// ============================================================
import type { CalibrationAdjustments } from '../modules/processor';

interface SliderDef {
  key: keyof CalibrationAdjustments;
  label: string;
  min: number;
  max: number;
  default: number;
}

const CALIBRATION_SECTIONS = [
  {
    title: 'Shadows',
    sliders: [
      { key: 'shadowTint', label: 'Shadow Tint', min: -100, max: 100, default: 0 },
    ] as SliderDef[],
  },
  {
    title: 'Red Primary',
    sliders: [
      { key: 'redHue',        label: 'Hue',        min: -100, max: 100, default: 0 },
      { key: 'redSaturation', label: 'Saturation', min: -100, max: 100, default: 0 },
    ] as SliderDef[],
  },
  {
    title: 'Green Primary',
    sliders: [
      { key: 'greenHue',        label: 'Hue',        min: -100, max: 100, default: 0 },
      { key: 'greenSaturation', label: 'Saturation', min: -100, max: 100, default: 0 },
    ] as SliderDef[],
  },
  {
    title: 'Blue Primary',
    sliders: [
      { key: 'blueHue',        label: 'Hue',        min: -100, max: 100, default: 0 },
      { key: 'blueSaturation', label: 'Saturation', min: -100, max: 100, default: 0 },
    ] as SliderDef[],
  },
];

export class CalibrationPanel {
  private container: HTMLElement;
  private values: CalibrationAdjustments;
  private onChange: (v: CalibrationAdjustments) => void;
  private inputs = new Map<string, HTMLInputElement>();
  private displays = new Map<string, HTMLElement>();

  constructor(
    container: HTMLElement,
    initial: CalibrationAdjustments,
    onChange: (v: CalibrationAdjustments) => void
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
    header.innerHTML = `<h2>Calibration</h2><button class="panel-reset-btn" id="calibr-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    CALIBRATION_SECTIONS.forEach(section => {
      const sec = document.createElement('div');
      sec.className = 'panel-section';
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = section.title;
      sec.appendChild(title);
      section.sliders.forEach(def => sec.appendChild(this.buildRow(def)));
      this.container.appendChild(sec);
    });

    header.querySelector('#calibr-reset')?.addEventListener('click', () => {
      CALIBRATION_SECTIONS.forEach(s => s.sliders.forEach(def => {
        this.values[def.key] = def.default;
        const inp = this.inputs.get(def.key);
        if (inp) { inp.value = String(def.default); this.updateFill(inp, def); }
        const disp = this.displays.get(def.key);
        if (disp) disp.textContent = this.fmt(def.default);
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
    label.htmlFor = `cal-${def.key}`;
    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = `cal-${def.key}`;
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = '1';
    input.value = String(this.values[def.key]);
    this.updateFill(input, def);
    const display = document.createElement('span');
    display.className = 'slider-value';
    display.textContent = this.fmt(this.values[def.key]);

    input.addEventListener('input', () => {
      const v = parseInt(input.value);
      this.values[def.key] = v;
      display.textContent = this.fmt(v);
      this.updateFill(input, def);
      this.onChange({ ...this.values });
    });
    input.addEventListener('dblclick', () => {
      input.value = String(def.default);
      this.values[def.key] = def.default;
      display.textContent = this.fmt(def.default);
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

  private fmt(v: number): string {
    return `${v > 0 ? '+' : ''}${v}`;
  }

  update(values: CalibrationAdjustments): void {
    this.values = { ...values };
  }
}
