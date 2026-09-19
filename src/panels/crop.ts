// ============================================================
// CropPanel — Image Crop, Aspect Ratio, Straighten & Flip Controls
// ============================================================

export interface CropAdjustments {
  x: number;          // 0 to 1 (left normalized)
  y: number;          // 0 to 1 (top normalized)
  width: number;      // 0 to 1 (width normalized)
  height: number;     // 0 to 1 (height normalized)
  rotation: number;   // angle in degrees (-45 to 45)
  aspectRatio: string; // 'original' | 'custom' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16' | '4:5' | '5:7'
  flipH: boolean;
  flipV: boolean;
}

export function defaultCropAdjustments(): CropAdjustments {
  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    aspectRatio: 'original',
    flipH: false,
    flipV: false,
  };
}

export class CropPanel {
  private container: HTMLElement;
  private value: CropAdjustments;
  private onChange: (v: CropAdjustments) => void;

  private angleSlider!: HTMLInputElement;
  private angleDisplay!: HTMLElement;
  private aspectSelect!: HTMLSelectElement;
  private flipHBtn!: HTMLButtonElement;
  private flipVBtn!: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    initialValue: CropAdjustments,
    onChange: (v: CropAdjustments) => void
  ) {
    this.container = container;
    this.value = JSON.parse(JSON.stringify(initialValue));
    this.onChange = onChange;

    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <h2>Crop & Straighten</h2>
        <button class="panel-reset-btn" id="btn-reset-crop">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2.5 8a5.5 5.5 0 101.61-3.89L2 6M2 2v4h4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Reset Crop
        </button>
      </div>

      <!-- Aspect Ratio Presets -->
      <div class="panel-section">
        <div class="panel-section-title">Aspect Ratio</div>
        <div class="slider-row">
          <label class="slider-label">Ratio</label>
          <div class="slider-track-wrap">
            <select class="crop-aspect-select" id="crop-aspect-select" style="width:100%">
              <option value="original">Original (As Shot)</option>
              <option value="custom">Freeform (Custom)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="4:3">4:3 (Standard Photo)</option>
              <option value="3:2">3:2 (Classic 35mm)</option>
              <option value="16:9">16:9 (Widescreen HD)</option>
              <option value="9:16">9:16 (Story / Reel)</option>
              <option value="4:5">4:5 (Instagram Portrait)</option>
              <option value="5:7">5:7 (Print)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Straighten / Angle -->
      <div class="panel-section">
        <div class="panel-section-title">Angle & Straighten</div>
        <div class="slider-row">
          <label class="slider-label">Angle</label>
          <div class="slider-track-wrap">
            <input type="range" class="slider" id="crop-angle-slider" min="-45" max="45" step="0.5" value="${this.value.rotation}" />
          </div>
          <span class="slider-value" id="crop-angle-val">${this.value.rotation}°</span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Rotate & Flip Transforms -->
      <div class="panel-section">
        <div class="panel-section-title">Transform</div>
        <div class="crop-transform-grid">
          <button class="crop-tool-btn" id="crop-rotate-left" title="Rotate 90° Left">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 7V3a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H9" stroke-linecap="round"/>
              <path d="M7 10L4 7l3-3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Rotate -90°
          </button>
          <button class="crop-tool-btn" id="crop-rotate-right" title="Rotate 90° Right">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 7V3a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h4" stroke-linecap="round"/>
              <path d="M9 10l3-3-3-3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Rotate +90°
          </button>
          <button class="crop-tool-btn ${this.value.flipH ? 'active' : ''}" id="crop-flip-h" title="Flip Horizontal">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 2v12M2 8l4-4v8l-4-4zm12 0l-4-4v8l4-4z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Flip H
          </button>
          <button class="crop-tool-btn ${this.value.flipV ? 'active' : ''}" id="crop-flip-v" title="Flip Vertical">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 8h12M8 2l-4 4h8l-4-4zm0 12l-4-4h8l-4 4z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Flip V
          </button>
        </div>
      </div>
    `;

    this.aspectSelect = this.container.querySelector('#crop-aspect-select') as HTMLSelectElement;
    this.angleSlider = this.container.querySelector('#crop-angle-slider') as HTMLInputElement;
    this.angleDisplay = this.container.querySelector('#crop-angle-val')!;
    this.flipHBtn = this.container.querySelector('#crop-flip-h') as HTMLButtonElement;
    this.flipVBtn = this.container.querySelector('#crop-flip-v') as HTMLButtonElement;

    this.bindEvents();
    this.updateSliderFill();
  }

  private bindEvents(): void {
    this.aspectSelect.value = this.value.aspectRatio;
    this.aspectSelect.addEventListener('change', () => {
      this.value.aspectRatio = this.aspectSelect.value;
      this.applyAspectRatioPreset(this.value.aspectRatio);
      this.notifyChange();
    });

    this.angleSlider.addEventListener('input', () => {
      this.value.rotation = parseFloat(this.angleSlider.value);
      this.angleDisplay.textContent = `${this.value.rotation}°`;
      this.updateSliderFill();
      this.notifyChange();
    });

    this.flipHBtn.addEventListener('click', () => {
      this.value.flipH = !this.value.flipH;
      this.flipHBtn.classList.toggle('active', this.value.flipH);
      this.notifyChange();
    });

    this.flipVBtn.addEventListener('click', () => {
      this.value.flipV = !this.value.flipV;
      this.flipVBtn.classList.toggle('active', this.value.flipV);
      this.notifyChange();
    });

    this.container.querySelector('#crop-rotate-left')?.addEventListener('click', () => {
      this.value.rotation = (this.value.rotation - 90 + 360) % 360;
      if (this.value.rotation > 180) this.value.rotation -= 360;
      this.angleSlider.value = String(this.value.rotation);
      this.angleDisplay.textContent = `${this.value.rotation}°`;
      this.updateSliderFill();
      this.notifyChange();
    });

    this.container.querySelector('#crop-rotate-right')?.addEventListener('click', () => {
      this.value.rotation = (this.value.rotation + 90 + 360) % 360;
      if (this.value.rotation > 180) this.value.rotation -= 360;
      this.angleSlider.value = String(this.value.rotation);
      this.angleDisplay.textContent = `${this.value.rotation}°`;
      this.updateSliderFill();
      this.notifyChange();
    });

    this.container.querySelector('#btn-reset-crop')?.addEventListener('click', () => {
      this.update(defaultCropAdjustments());
      this.notifyChange();
    });
  }

  private applyAspectRatioPreset(ratio: string): void {
    if (ratio === 'original') {
      this.value.x = 0;
      this.value.y = 0;
      this.value.width = 1;
      this.value.height = 1;
      return;
    }

    let targetRatio = 1;
    switch (ratio) {
      case '1:1': targetRatio = 1.0; break;
      case '4:3': targetRatio = 4 / 3; break;
      case '3:2': targetRatio = 3 / 2; break;
      case '16:9': targetRatio = 16 / 9; break;
      case '9:16': targetRatio = 9 / 16; break;
      case '4:5': targetRatio = 4 / 5; break;
      case '5:7': targetRatio = 5 / 7; break;
      default: return;
    }

    if (targetRatio >= 1) {
      this.value.width = 1;
      this.value.height = Math.min(1, 1 / targetRatio);
      this.value.x = 0;
      this.value.y = (1 - this.value.height) / 2;
    } else {
      this.value.height = 1;
      this.value.width = Math.min(1, targetRatio);
      this.value.x = (1 - this.value.width) / 2;
      this.value.y = 0;
    }
  }

  public update(val: CropAdjustments): void {
    this.value = JSON.parse(JSON.stringify(val));
    this.aspectSelect.value = this.value.aspectRatio;
    this.angleSlider.value = String(this.value.rotation);
    this.angleDisplay.textContent = `${this.value.rotation}°`;
    this.flipHBtn.classList.toggle('active', this.value.flipH);
    this.flipVBtn.classList.toggle('active', this.value.flipV);
    this.updateSliderFill();
  }

  private updateSliderFill(): void {
    const v = parseFloat(this.angleSlider.value);
    const pct = ((v - (-45)) / 90) * 100;
    this.angleSlider.style.background = `linear-gradient(90deg, #0a84ff ${pct}%, rgba(255,255,255,0.12) ${pct}%)`;
  }

  private notifyChange(): void {
    this.onChange(JSON.parse(JSON.stringify(this.value)));
  }
}
