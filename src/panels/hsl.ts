// ============================================================
// HSL / Color Panel — Single-panel layout with Hue, Saturation & Luminance sections
// ============================================================
import type { HSLColor } from '../modules/processor';

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

const SECTIONS = [
  { key: 'hue',        title: 'Hue',        min: -100, max: 100 },
  { key: 'saturation', title: 'Saturation', min: -100, max: 100 },
  { key: 'luminance',  title: 'Luminance',  min: -100, max: 100 },
] as const;

type ChannelKey = 'hue' | 'saturation' | 'luminance';

export class HSLPanel {
  private container: HTMLElement;
  private values: HSLColor[];
  private onChange: (v: HSLColor[]) => void;
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

    // Header with Reset button
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `<h2>HSL / Color</h2><button class="panel-reset-btn" id="hsl-reset">↺ Reset</button>`;
    this.container.appendChild(header);

    header.querySelector('#hsl-reset')?.addEventListener('click', () => {
      this.values = Array.from({ length: 8 }, () => ({ hue: 0, saturation: 0, luminance: 0 }));
      this.refreshAllSliders();
      this.onChange(this.values.map(v => ({ ...v })));
    });

    const content = document.createElement('div');
    content.className = 'hsl-panel-content';

    this.inputs.clear();
    this.displays.clear();

    // Render HUE, SATURATION, LUMINANCE sections
    SECTIONS.forEach(sec => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'panel-section';

      const secTitle = document.createElement('div');
      secTitle.className = 'panel-section-title';
      secTitle.textContent = sec.title;
      sectionEl.appendChild(secTitle);

      COLOR_DEFS.forEach((colorDef, colorIdx) => {
        const row = document.createElement('div');
        row.className = 'slider-row';

        const label = document.createElement('label');
        label.className = 'slider-label color-slider-label';
        label.htmlFor = `hsl-${sec.key}-${colorIdx}`;
        label.innerHTML = `<span class="color-dot-inline" style="background:${colorDef.color}"></span>${colorDef.name}`;

        const trackWrap = document.createElement('div');
        trackWrap.className = 'slider-track-wrap';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'slider';
        input.id = `hsl-${sec.key}-${colorIdx}`;
        input.min = String(sec.min);
        input.max = String(sec.max);
        input.step = '1';

        const val = this.values[colorIdx]?.[sec.key as ChannelKey] ?? 0;
        input.value = String(val);
        this.updateFill(input, sec.min, sec.max);

        const display = document.createElement('span');
        display.className = 'slider-value';
        display.textContent = this.fmt(val);

        const mapKey = `${sec.key}-${colorIdx}`;
        this.inputs.set(mapKey, input);
        this.displays.set(mapKey, display);

        input.addEventListener('input', () => {
          const v = parseInt(input.value, 10);
          if (this.values[colorIdx]) {
            this.values[colorIdx][sec.key as ChannelKey] = v;
          }
          display.textContent = this.fmt(v);
          this.updateFill(input, sec.min, sec.max);
          this.onChange(this.values.map(v => ({ ...v })));
        });

        input.addEventListener('dblclick', () => {
          input.value = '0';
          if (this.values[colorIdx]) {
            this.values[colorIdx][sec.key as ChannelKey] = 0;
          }
          display.textContent = '0';
          this.updateFill(input, sec.min, sec.max);
          this.onChange(this.values.map(v => ({ ...v })));
        });

        trackWrap.appendChild(input);
        row.append(label, trackWrap, display);
        sectionEl.appendChild(row);
      });

      content.appendChild(sectionEl);
    });

    this.container.appendChild(content);
  }

  private refreshAllSliders(): void {
    SECTIONS.forEach(sec => {
      COLOR_DEFS.forEach((_, colorIdx) => {
        const mapKey = `${sec.key}-${colorIdx}`;
        const input = this.inputs.get(mapKey);
        const display = this.displays.get(mapKey);
        const val = this.values[colorIdx]?.[sec.key as ChannelKey] ?? 0;
        if (input) {
          input.value = String(val);
          this.updateFill(input, sec.min, sec.max);
        }
        if (display) {
          display.textContent = this.fmt(val);
        }
      });
    });
  }

  private updateFill(input: HTMLInputElement, min: number, max: number): void {
    const v = parseFloat(input.value);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.background = `linear-gradient(90deg, #0a84ff ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
  }

  private fmt(v: number): string {
    return `${v > 0 ? '+' : ''}${v}`;
  }

  update(values: HSLColor[]): void {
    this.values = values.map(v => ({ ...v }));
    this.refreshAllSliders();
  }
}
