// ============================================================
// BatchExport — Renders & exports all photos in folder
// ============================================================

import type { BatchItem } from './folderManager';
import { ImageProcessor } from './processor';
import { isRawOrTiff, decodeRawFile } from './raw';

export class BatchExport {
  private modalEl: HTMLElement;
  private formatSelect: HTMLSelectElement;
  private qualitySlider: HTMLInputElement;
  private qualityValDisplay: HTMLElement;
  private qualityRow: HTMLElement;
  private exportScopeSelect: HTMLSelectElement;
  private startBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private progressContainer: HTMLElement;
  private progressBarFill: HTMLElement;
  private progressText: HTMLElement;
  private progressFilename: HTMLElement;

  private isExporting = false;
  private shouldCancel = false;

  constructor(modalElement: HTMLElement) {
    this.modalEl = modalElement;
    this.formatSelect = this.modalEl.querySelector('#export-batch-format') as HTMLSelectElement;
    this.qualitySlider = this.modalEl.querySelector('#export-batch-quality') as HTMLInputElement;
    this.qualityValDisplay = this.modalEl.querySelector('#export-batch-quality-val')!;
    this.qualityRow = this.modalEl.querySelector('#export-quality-row')!;
    this.exportScopeSelect = this.modalEl.querySelector('#export-batch-scope') as HTMLSelectElement;
    this.startBtn = this.modalEl.querySelector('#btn-start-batch-export') as HTMLButtonElement;
    this.cancelBtn = this.modalEl.querySelector('#btn-cancel-batch-export') as HTMLButtonElement;
    this.closeBtn = this.modalEl.querySelector('#btn-close-batch-modal') as HTMLButtonElement;
    this.progressContainer = this.modalEl.querySelector('#batch-progress-container')!;
    this.progressBarFill = this.modalEl.querySelector('#batch-progress-bar-fill')!;
    this.progressText = this.modalEl.querySelector('#batch-progress-text')!;
    this.progressFilename = this.modalEl.querySelector('#batch-progress-filename')!;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.closeBtn.addEventListener('click', () => this.hide());
    this.cancelBtn.addEventListener('click', () => {
      if (this.isExporting) {
        this.shouldCancel = true;
      } else {
        this.hide();
      }
    });

    this.formatSelect.addEventListener('change', () => {
      const isJpeg = this.formatSelect.value === 'jpeg';
      this.qualityRow.style.display = isJpeg ? 'flex' : 'none';
    });

    this.qualitySlider.addEventListener('input', () => {
      this.qualityValDisplay.textContent = `${this.qualitySlider.value}%`;
    });
  }

  public show(items: BatchItem[], folderName: string): void {
    if (items.length === 0) {
      alert('No photos in folder to export.');
      return;
    }

    this.modalEl.classList.add('active');
    this.progressContainer.style.display = 'none';
    this.startBtn.style.display = 'inline-flex';
    this.startBtn.disabled = false;
    this.startBtn.onclick = () => this.runExport(items, folderName);
  }

  public hide(): void {
    if (this.isExporting) return;
    this.modalEl.classList.remove('active');
  }

  private async runExport(allItems: BatchItem[], folderName: string): Promise<void> {
    const scope = this.exportScopeSelect.value;
    const items = scope === 'edited' ? allItems.filter(i => i.isEdited) : allItems;

    if (items.length === 0) {
      alert('No edited photos found to export.');
      return;
    }

    const format = this.formatSelect.value; // 'jpeg' | 'png' | 'tiff'
    const quality = parseInt(this.qualitySlider.value, 10) / 100;

    this.isExporting = true;
    this.shouldCancel = false;
    this.startBtn.style.display = 'none';
    this.progressContainer.style.display = 'block';
    this.progressBarFill.style.width = '0%';

    // Offscreen canvas for high-quality WebGL rendering
    const offscreenCanvas = document.createElement('canvas');
    const processor = new ImageProcessor(offscreenCanvas);

    let completed = 0;

    for (let i = 0; i < items.length; i++) {
      if (this.shouldCancel) {
        this.progressText.textContent = `Cancelled batch export (${completed} of ${items.length} exported).`;
        break;
      }

      const item = items[i];
      const pct = Math.round(((i) / items.length) * 100);
      this.progressBarFill.style.width = `${pct}%`;
      this.progressText.textContent = `Exporting ${i + 1} of ${items.length} (${pct}%)`;
      this.progressFilename.textContent = item.name;

      try {
        await this.renderAndDownloadItem(item, processor, format, quality, folderName);
        completed++;
      } catch (err) {
        console.error(`Failed to export ${item.name}:`, err);
      }

      // Small delay to allow UI refresh and non-blocking download
      await new Promise(r => setTimeout(r, 120));
    }

    this.progressBarFill.style.width = '100%';
    this.isExporting = false;
    this.progressFilename.textContent = '';

    if (!this.shouldCancel) {
      this.progressText.textContent = `🎉 Batch Export Complete! (${completed} ${completed === 1 ? 'photo' : 'photos'} exported)`;
      this.cancelBtn.textContent = 'Done';
    } else {
      this.cancelBtn.textContent = 'Close';
    }
  }

  private async renderAndDownloadItem(
    item: BatchItem,
    processor: ImageProcessor,
    format: string,
    quality: number,
    folderName: string
  ): Promise<void> {
    const file = item.file;
    const isRaw = isRawOrTiff(file);

    if (isRaw) {
      const buffer = await file.arrayBuffer();
      const decoded = await decodeRawFile(buffer, file.name);
      processor.loadRawData(decoded.width, decoded.height, decoded.floatData, decoded.bitDepth, decoded.metadata);
    } else {
      const img = await this.loadImageElement(file);
      processor.loadImage(img);
    }

    // Apply item's custom adjustments
    processor.setAdjustments(item.adjustments);
    processor.render();

    let blob: Blob;
    let ext: string;

    if (format === 'tiff') {
      blob = await processor.get16BitTiffBlob();
      ext = 'tif';
    } else if (format === 'png') {
      blob = await processor.getPngBlob();
      ext = 'png';
    } else {
      blob = await processor.getProcessedBlob(quality);
      ext = 'jpg';
    }

    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    const downloadName = `${baseName}_edited_${folderName}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadImageElement(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = e.target!.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
}
