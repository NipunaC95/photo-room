// ============================================================
// App — Root application controller with multi-photo batch,
// filmstrip navigation, and davinci_edits.json persistence
// ============================================================
import { ImageProcessor, defaultAdjustments } from './modules/processor';
import type { Adjustments } from './modules/processor';
import { decodeRawFile, createSampleRawData } from './modules/raw';
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
import { FolderManager } from './modules/folderManager';
import type { BatchItem } from './modules/folderManager';
import { Filmstrip } from './modules/filmstrip';
import { BatchExport } from './modules/batchExport';

export class App {
  private processor: ImageProcessor;
  private histogram: Histogram;
  private folderManager: FolderManager;
  private filmstrip: Filmstrip;
  private batchExport: BatchExport;

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
  private folderInput: HTMLInputElement;
  private fileName: HTMLElement;
  private fileDims: HTMLElement;
  private zoomDisplay: HTMLElement;
  private beforeAfterBtn: HTMLButtonElement;
  private bitDepthBadge: HTMLElement;
  private exifChip: HTMLElement;
  private exportFormatSelect: HTMLSelectElement;
  private filmstripContainer: HTMLElement;

  // State
  private zoom = 1;
  private showingBefore = false;
  private histogramUpdateTimer: number | null = null;
  private activeItem: BatchItem | null = null;

  constructor() {
    this.mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    this.dropZone = document.getElementById('drop-zone')!;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.folderInput = document.getElementById('folder-input') as HTMLInputElement;
    this.fileName = document.getElementById('file-name')!;
    this.fileDims = document.getElementById('file-dims')!;
    this.zoomDisplay = document.getElementById('zoom-display')!;
    this.beforeAfterBtn = document.getElementById('btn-before-after') as HTMLButtonElement;
    this.bitDepthBadge = document.getElementById('bit-depth-badge')!;
    this.exifChip = document.getElementById('exif-chip')!;
    this.exportFormatSelect = document.getElementById('export-format-select') as HTMLSelectElement;
    this.filmstripContainer = document.getElementById('filmstrip-container')!;

    this.processor = new ImageProcessor(this.mainCanvas);
    this.histogram = new Histogram(document.getElementById('histogram-canvas') as HTMLCanvasElement);

    // Initialize FolderManager & Filmstrip
    this.folderManager = new FolderManager({
      onBatchChanged: (items, activeIndex) => {
        this.filmstrip.update(items, activeIndex);
        this.filmstripContainer.style.display = items.length > 0 ? 'flex' : 'none';
      },
      onActiveChanged: (item, _index) => {
        this.loadBatchItem(item);
      },
      onSyncStatusChanged: (status) => {
        this.filmstrip.setSyncStatus(status);
      },
    });

    this.filmstrip = new Filmstrip(this.filmstripContainer, this.folderManager, {
      onSelectPhoto: (_item, index) => {
        this.folderManager.setActiveIndex(index);
      },
      onExportAll: () => {
        this.batchExport.show(this.folderManager.getItems(), this.folderManager.getFolderName());
      },
      onOpenFolder: () => {
        this.handleOpenFolder();
      },
      onCopySettings: () => {
        this.folderManager.setCopiedAdjustments(this.adjustments);
        this.showToast('Adjustments copied');
      },
      onPasteSettings: () => {
        const copied = this.folderManager.getCopiedAdjustments();
        if (copied) {
          this.adjustments = copied;
          this.syncPanelsToAdjustments();
          this.process();
          this.folderManager.updateActiveAdjustments(this.adjustments);
          this.showToast('Adjustments pasted');
        } else {
          this.showToast('No copied adjustments found');
        }
      },
    });

    this.batchExport = new BatchExport(document.getElementById('batch-export-modal')!);

    this.initPanels();
    this.bindEvents();
    this.bindNavigation();
  }

  private initPanels(): void {
    const adj = this.adjustments;

    this.basicPanel = new BasicPanel(
      document.getElementById('panel-basic')!,
      adj.basic,
      (v) => { adj.basic = v; this.onAdjustmentsChanged(); }
    );

    this.curvePanel = new ToneCurvePanel(
      document.getElementById('panel-curve')!,
      adj.curves as CurveAdjustments,
      (v) => { adj.curves = v; this.onAdjustmentsChanged(); }
    );

    this.hslPanel = new HSLPanel(
      document.getElementById('panel-hsl')!,
      adj.hsl,
      (v) => { adj.hsl = v; this.onAdjustmentsChanged(); }
    );

    this.gradingPanel = new ColorGradingPanel(
      document.getElementById('panel-grading')!,
      adj.grading,
      (v) => { adj.grading = v; this.onAdjustmentsChanged(); }
    );

    this.detailPanel = new DetailPanel(
      document.getElementById('panel-detail')!,
      adj.detail,
      (v) => { adj.detail = v; this.onAdjustmentsChanged(); }
    );

    this.effectsPanel = new EffectsPanel(
      document.getElementById('panel-effects')!,
      adj.effects,
      (v) => { adj.effects = v; this.onAdjustmentsChanged(); }
    );

    this.calibrationPanel = new CalibrationPanel(
      document.getElementById('panel-calibration')!,
      adj.calibration,
      (v) => { adj.calibration = v; this.onAdjustmentsChanged(); }
    );
  }

  private bindEvents(): void {
    // Open Folder buttons
    document.getElementById('btn-open-folder')?.addEventListener('click', () => this.handleOpenFolder());
    document.getElementById('btn-drop-open-folder')?.addEventListener('click', () => this.handleOpenFolder());

    // Folder input fallback
    this.folderInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const path = files[0].webkitRelativePath;
        const folderName = path ? path.split('/')[0] : 'Imported Folder';
        this.folderManager.loadFromFiles(files, folderName);
      }
    });

    // File input
    this.fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      if (files.length === 1) {
        this.loadFile(files[0]);
      } else {
        this.folderManager.loadFromFiles(files, 'Imported Files');
      }
    });

    // Sample buttons
    document.getElementById('btn-load-sample-raw')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadSampleRaw();
    });

    document.getElementById('btn-load-sample-gallery')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadSampleGallery();
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

    canvasArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      if (!e.dataTransfer) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 1) {
        await this.folderManager.loadFromFiles(files, 'Dropped Photos');
      } else if (files.length === 1) {
        this.loadFile(files[0]);
      }
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.folderManager.previous();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.folderManager.next();
          break;
      }

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

  private async handleOpenFolder(): Promise<void> {
    const opened = await this.folderManager.openDirectoryPicker();
    if (!opened) {
      // Fallback to HTML input webkitdirectory
      this.folderInput.click();
    }
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

  private onAdjustmentsChanged(): void {
    this.process();
    this.folderManager.updateActiveAdjustments(this.adjustments);
  }

  private async loadBatchItem(item: BatchItem): Promise<void> {
    this.activeItem = item;
    this.adjustments = JSON.parse(JSON.stringify(item.adjustments));
    this.syncPanelsToAdjustments();

    if (item.isRaw) {
      await this.loadRawFile(item.file);
    } else {
      await this.loadStandardFile(item.file);
    }
  }

  private async loadFile(file: File): Promise<void> {
    await this.folderManager.loadFromFiles([file], file.name);
  }

  private async loadStandardFile(file: File): Promise<void> {
    return new Promise((resolve) => {
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
          this.process();
          resolve();
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
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
      this.process();
    } catch (err) {
      console.error('Failed to parse RAW file:', err);
      alert(`Error reading RAW file: ${(err as Error).message}`);
      this.fileName.textContent = 'Failed to load RAW image';
    }
  }

  public async loadSampleRaw(): Promise<void> {
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
    this.adjustments = defaultAdjustments();
    this.syncPanelsToAdjustments();
    this.process();
  }

  /** Load a sample gallery of multiple photos for instant demonstration */
  public async loadSampleGallery(): Promise<void> {
    const samples: { name: string; render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }[] = [
      {
        name: 'Sunset_Vibes.jpg',
        render: (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#ff4e50');
          grad.addColorStop(0.5, '#f9d423');
          grad.addColorStop(1, '#6b0200');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.45, 120, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      {
        name: 'Cyberpunk_Neon.jpg',
        render: (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#0f0c29');
          grad.addColorStop(0.5, '#302b63');
          grad.addColorStop(1, '#24243e');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#e96fff';
          ctx.lineWidth = 12;
          ctx.strokeRect(80, 80, w - 160, h - 160);
          ctx.strokeStyle = '#4fc3ff';
          ctx.beginPath();
          ctx.arc(w * 0.5, h * 0.5, 160, 0, Math.PI * 2);
          ctx.stroke();
        }
      },
      {
        name: 'Forest_Mist.jpg',
        render: (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#134e5e');
          grad.addColorStop(1, '#71b280');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
      },
      {
        name: 'Ocean_Breeze.jpg',
        render: (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, '#2b5876');
          grad.addColorStop(1, '#4e4376');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
      },
    ];

    const files: File[] = [];

    for (const sample of samples) {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 850;
      const ctx = canvas.getContext('2d');
      if (ctx) sample.render(ctx, 1280, 850);

      const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.95));
      const file = new File([blob], sample.name, { type: 'image/jpeg' });
      files.push(file);
    }

    await this.folderManager.loadFromFiles(files, 'Sample Gallery Folder');
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

  private syncPanelsToAdjustments(): void {
    const adj = this.adjustments;
    this.basicPanel.update(adj.basic);
    this.curvePanel.update(adj.curves as CurveAdjustments);
    this.hslPanel.update(adj.hsl);
    this.gradingPanel.update(adj.grading);
    this.detailPanel.update(adj.detail);
    this.effectsPanel.update(adj.effects);
    this.calibrationPanel.update(adj.calibration);
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
    const imageData = this.processor.getImageDataSampled(512);
    if (!imageData) return;
    this.histogram.update(imageData);
  }

  private fitToScreen(): void {
    if (!this.processor.hasImage()) return;
    const area = document.getElementById('canvas-area')!;
    const filmstripH = this.filmstripContainer.style.display !== 'none' ? 150 : 0;
    const areaW = area.clientWidth - 32;
    const areaH = area.clientHeight - 32 - filmstripH;
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
      this.processor.setAdjustments(defaultAdjustments());
    } else {
      this.processor.setAdjustments(this.adjustments);
    }
  }

  private resetAll(): void {
    this.adjustments = defaultAdjustments();
    this.syncPanelsToAdjustments();
    this.process();
    this.folderManager.updateActiveAdjustments(this.adjustments);
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

    const currentName = this.activeItem?.name || 'davinci-export';
    const baseName = currentName.substring(0, currentName.lastIndexOf('.')) || currentName;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_edited.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'davinci-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 165px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(22, 22, 24, 0.9);
      backdrop-filter: blur(8px);
      color: #e96fff;
      border: 1px solid rgba(233, 111, 255, 0.3);
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      z-index: 999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }
}
