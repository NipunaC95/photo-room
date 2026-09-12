// ============================================================
// Effects Panel — Vignette + Grain
// ============================================================
import type { EffectsAdjustments } from '../modules/processor';

interface SliderDef {
  key: keyof EffectsAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

const EFFECTS_SECTIONS = [
  {
    title: 'Vignette',
    sliders: [
      { key: 'vignetteAmount',    label: 'Amount',    min: -100, max: 100, step: 1, default: 0  },
      { key: 'vignetteMidpoint',  label: 'Midpoint',  min: 0,    max: 100, step: 1, default: 50 },
      { key: 'vignetteFeather',   label: 'Feather',   min: 0,    max: 100, step: 1, default: 50 },
      { key: 'vignetteRoundness', label: 'Roundness', min: -100, max: 100, step: 1, default: 0  },
    ] as SliderDef[],
  },
  {
    title: 'Grain',
    sliders: [
      { key: 'grainAmount',    label: 'Amount',    min: 0, max: 100, step: 1, default: 0  },
      { key: 'grainSize',      label: 'Size',      min: 1, max: 50,  step: 1, default: 25 },
      { key: 'grainRoughness', label: 'Roughness', min: 0, max: 100, step: 1, default: 50 },
    ] as SliderDef[],
  },
];

export class EffectsPanel {
  private container: HTMLElement;
  private values: EffectsAdjustments;
  private onChange: (v: EffectsAdjustments) => void;
  private inputs = new Map<string, HTMLInputElement>();
  private displays = new Map<string, HTMLElement>();

  constructor(
    container: HTMLElement,
    initial: EffectsAdjustments,
    onChange: (v: EffectsAdjustments) => void
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
    header.innerHTML = `<h2>Effects</h2><button class="panel-reset-btn" id="effects-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    EFFECTS_SECTIONS.forEach(section => {
      const sec = document.createElement('div');
      sec.className = 'panel-section';
      const title = document.createElement('div');
      title.className = 'panel-section-title';
      title.textContent = section.title;
      sec.appendChild(title);
      section.sliders.forEach(def => sec.appendChild(this.buildRow(def)));
      this.container.appendChild(sec);
    });

    header.querySelector('#effects-reset')?.addEventListener('click', () => {
      EFFECTS_SECTIONS.forEach(s => s.sliders.forEach(def => {
        this.values[def.key] = def.default;
        const inp = this.inputs.get(def.key);
        if (inp) { inp.value = String(def.default); this.updateFill(inp, def); }
        const disp = this.displays.get(def.key);
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
    label.htmlFor = `effects-${def.key}`;
    const trackWrap = document.createElement('div');
    trackWrap.className = 'slider-track-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = `effects-${def.key}`;
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
    input.style.background = `linear-gradient(90deg, #e96fff ${pct}%, #2e2e35 ${pct}%)`;
  }

  private fmt(_key: string, v: number): string {
    return `${v > 0 ? '+' : ''}${Math.round(v)}`;
  }

  update(values: EffectsAdjustments): void {
    this.values = { ...values };
  }
}
