// ============================================================
// App — Root application controller
// ============================================================
import { ImageProcessor, defaultAdjustments } from './modules/processor';
import type { Adjustments } from './modules/processor';
import { isRawOrTiff, decodeRawFile, createSampleRawData } from './modules/raw';
import type { CameraMetadata } from './modules/raw';
import { Histogram } from './modules/histogram';
import { BasicPanel } from './panels/basic';
import { ToneCurvePanel } from './panels/tonecurve';
import type { CurveAdjustments } from './panels/tonecurve';
import { HSLPanel } from './panels/hsl';
import { ColorGradingPanel } from './panels/colorgrading';
import { DetailPanel } from './panels/detail';
import { EffectsPanel } from './panels/effects';
import { CalibrationPanel } from './panels/calibration';

export class App {
  private processor: ImageProcessor;
  private histogram: Histogram;
  private adjustments: Adjustments = defaultAdjustments();

  // Panels
  private basicPanel!: BasicPanel;
  private curvePanel!: ToneCurvePanel;
  private hslPanel!: HSLPanel;
  private gradingPanel!: ColorGradingPanel;
  private detailPanel!: DetailPanel;
  private effectsPanel!: EffectsPanel;
  private calibrationPanel!: CalibrationPanel;

  // UI refs
  private mainCanvas: HTMLCanvasElement;
  private dropZone: HTMLElement;
  private fileInput: HTMLInputElement;
  private fileName: HTMLElement;
  private fileDims: HTMLElement;
  private zoomDisplay: HTMLElement;
  private beforeAfterBtn: HTMLButtonElement;
  private bitDepthBadge: HTMLElement;
  private exifChip: HTMLElement;
  private exportFormatSelect: HTMLSelectElement;

  // State
  private zoom = 1;
  private showingBefore = false;
  private histogramUpdateTimer: number | null = null;

  constructor() {
    this.mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    this.dropZone = document.getElementById('drop-zone')!;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.fileName = document.getElementById('file-name')!;
    this.fileDims = document.getElementById('file-dims')!;
    this.zoomDisplay = document.getElementById('zoom-display')!;
    this.beforeAfterBtn = document.getElementById('btn-before-after') as HTMLButtonElement;
    this.bitDepthBadge = document.getElementById('bit-depth-badge')!;
    this.exifChip = document.getElementById('exif-chip')!;
    this.exportFormatSelect = document.getElementById('export-format-select') as HTMLSelectElement;

    this.processor = new ImageProcessor(this.mainCanvas);
    this.histogram = new Histogram(document.getElementById('histogram-canvas') as HTMLCanvasElement);

    this.initPanels();
    this.bindEvents();
    this.bindNavigation();

    // Sample RAW button
    document.getElementById('btn-load-sample-raw')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadSampleRaw();
    });
  }

  private initPanels(): void {
    const adj = this.adjustments;

    this.basicPanel = new BasicPanel(
      document.getElementById('panel-basic')!,
      adj.basic,
      (v) => { adj.basic = v; this.process(); }
    );

    this.curvePanel = new ToneCurvePanel(
      document.getElementById('panel-curve')!,
      adj.curves as CurveAdjustments,
      (v) => { adj.curves = v; this.process(); }
    );

    this.hslPanel = new HSLPanel(
      document.getElementById('panel-hsl')!,
      adj.hsl,
      (v) => { adj.hsl = v; this.process(); }
    );

    this.gradingPanel = new ColorGradingPanel(
      document.getElementById('panel-grading')!,
      adj.grading,
      (v) => { adj.grading = v; this.process(); }
    );

    this.detailPanel = new DetailPanel(
      document.getElementById('panel-detail')!,
      adj.detail,
      (v) => { adj.detail = v; this.process(); }
    );

    this.effectsPanel = new EffectsPanel(
      document.getElementById('panel-effects')!,
      adj.effects,
      (v) => { adj.effects = v; this.process(); }
    );

    this.calibrationPanel = new CalibrationPanel(
      document.getElementById('panel-calibration')!,
      adj.calibration,
      (v) => { adj.calibration = v; this.process(); }
    );
  }

  private bindEvents(): void {
    // File import
    this.fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadFile(file);
    });

    // Drag and drop
    const canvasArea = document.getElementById('canvas-area')!;
    canvasArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    canvasArea.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });
    canvasArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file && (file.type.startsWith('image/') || isRawOrTiff(file))) this.loadFile(file);
    });

    // Reset
    document.getElementById('btn-reset')?.addEventListener('click', () => this.resetAll());

    // Export
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportImage());

    // Fit to screen
    document.getElementById('btn-fit')?.addEventListener('click', () => this.fitToScreen());

    // Before/After
    this.beforeAfterBtn.addEventListener('click', () => this.toggleBeforeAfter());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'b': this.toggleBeforeAfter(); break;
        case 'f': this.fitToScreen(); break;
        case '=':
        case '+': this.adjustZoom(0.1); break;
        case '-': this.adjustZoom(-0.1); break;
        case '0': this.resetZoom(); break;
      }
    });

    // Scroll to zoom
    this.mainCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.adjustZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }, { passive: false });
  }

  private bindNavigation(): void {
    const navItems = document.querySelectorAll('.panel-nav-item');
    const panels = document.querySelectorAll('.panel');

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const panelId = (item as HTMLElement).dataset.panel;
        navItems.forEach(n => n.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        document.querySelector(`.panel[data-panel="${panelId}"]`)?.classList.add('active');
      });
    });
  }

  private async loadFile(file: File): Promise<void> {
    if (isRawOrTiff(file)) {
      await this.loadRawFile(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.dropZone.style.display = 'none';
        this.mainCanvas.style.display = 'block';
        this.processor.loadImage(img);
        this.fitToScreen();
        this.updateFileInfo(file, img);
        this.updateBadges(10, null);
        this.scheduleHistogramUpdate();
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  }

  private async loadRawFile(file: File): Promise<void> {
    try {
      this.fileName.textContent = `Loading ${file.name}...`;
      const buffer = await file.arrayBuffer();
      const decoded = await decodeRawFile(buffer, file.name);

      this.dropZone.style.display = 'none';
      this.mainCanvas.style.display = 'block';
      this.processor.loadRawData(
        decoded.width,
        decoded.height,
        decoded.floatData,
        decoded.bitDepth,
        decoded.metadata
      );
      this.fitToScreen();

      this.fileName.textContent = file.name;
      this.fileDims.textContent = `${decoded.width} × ${decoded.height}`;
      this.updateBadges(decoded.bitDepth, decoded.metadata);
      this.scheduleHistogramUpdate();
    } catch (err) {
      console.error('Failed to parse RAW file:', err);
      alert(`Error reading RAW file: ${(err as Error).message}`);
      this.fileName.textContent = 'Failed to load RAW image';
    }
  }

  public loadSampleRaw(): void {
    const sample = createSampleRawData();
    this.dropZone.style.display = 'none';
    this.mainCanvas.style.display = 'block';
    this.processor.loadRawData(
      sample.width,
      sample.height,
      sample.floatData,
      sample.bitDepth,
      sample.metadata
    );
    this.fitToScreen();

    this.fileName.textContent = 'DSC04921_RAW.DNG';
    this.fileDims.textContent = `${sample.width} × ${sample.height}`;
    this.updateBadges(sample.bitDepth, sample.metadata);
    this.scheduleHistogramUpdate();
  }

  private updateBadges(bitDepth: number, meta?: CameraMetadata | null): void {
    this.bitDepthBadge.textContent = bitDepth >= 12 ? `${bitDepth}-bit RAW` : `${bitDepth}-bit P3`;
    this.bitDepthBadge.classList.toggle('raw-mode', bitDepth >= 12);

    if (meta && (meta.make || meta.model)) {
      this.exifChip.style.display = 'inline-flex';
      const cam = meta.model || meta.make || 'Camera RAW';
      this.exifChip.innerHTML = `<span style="color:#e96fff;font-weight:600">${cam}</span> · ${meta.focalLength || ''} · ${meta.aperture || ''} · ${meta.shutterSpeed || ''} · ISO ${meta.iso || ''}`;
    } else {
      this.exifChip.style.display = 'none';
    }
  }

  private updateFileInfo(file: File, img: HTMLImageElement): void {
    this.fileName.textContent = file.name;
    this.fileDims.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  }

  private process(): void {
    if (!this.processor.hasImage()) return;
    this.processor.setAdjustments(this.adjustments);
    this.scheduleHistogramUpdate();
  }

  private scheduleHistogramUpdate(): void {
    if (this.histogramUpdateTimer !== null) {
      clearTimeout(this.histogramUpdateTimer);
    }
    this.histogramUpdateTimer = window.setTimeout(() => {
      this.updateHistogram();
    }, 150);
  }

  private updateHistogram(): void {
    // The main canvas has a WebGL context — use getImageDataSampled()
    // which blits to a temp 2D canvas at reduced resolution for performance
    const imageData = this.processor.getImageDataSampled(512);
    if (!imageData) return;
    this.histogram.update(imageData);
  }

  private fitToScreen(): void {
    if (!this.processor.hasImage()) return;
    const area = document.getElementById('canvas-area')!;
    const areaW = area.clientWidth - 32;
    const areaH = area.clientHeight - 32;
    const imgW = this.mainCanvas.width;
    const imgH = this.mainCanvas.height;
    const scaleX = areaW / imgW;
    const scaleY = areaH / imgH;
    this.zoom = Math.min(scaleX, scaleY, 1);
    this.applyZoom();
  }

  private adjustZoom(delta: number): void {
    this.zoom = Math.max(0.05, Math.min(8, this.zoom + delta));
    this.applyZoom();
  }

  private resetZoom(): void {
    this.zoom = 1;
    this.applyZoom();
  }

  private applyZoom(): void {
    const w = this.mainCanvas.width * this.zoom;
    const h = this.mainCanvas.height * this.zoom;
    this.mainCanvas.style.width = `${w}px`;
    this.mainCanvas.style.height = `${h}px`;
    this.zoomDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  private toggleBeforeAfter(): void {
    if (!this.processor.hasImage()) return;
    this.showingBefore = !this.showingBefore;
    this.beforeAfterBtn.classList.toggle('active', this.showingBefore);
    if (this.showingBefore) {
      // Temporarily reset all adjustments
      this.processor.setAdjustments(defaultAdjustments());
    } else {
      this.processor.setAdjustments(this.adjustments);
    }
  }

  private resetAll(): void {
    this.adjustments = defaultAdjustments();
    const adj = this.adjustments;
    this.basicPanel.update(adj.basic);
    this.curvePanel.update(adj.curves as CurveAdjustments);
    this.hslPanel.update(adj.hsl);
    this.gradingPanel.update(adj.grading);
    this.detailPanel.update(adj.detail);
    this.effectsPanel.update(adj.effects);
    this.calibrationPanel.update(adj.calibration);
    this.process();
  }

  private async exportImage(): Promise<void> {
    if (!this.processor.hasImage()) return;
    const format = this.exportFormatSelect?.value || 'jpeg';
    let blob: Blob;
    let ext: string;

    if (format === 'tiff') {
      blob = await this.processor.get16BitTiffBlob();
      ext = 'tif';
    } else if (format === 'png') {
      blob = await this.processor.getPngBlob();
      ext = 'png';
    } else {
      blob = await this.processor.getProcessedBlob(0.95);
      ext = 'jpg';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `davinci-export-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
