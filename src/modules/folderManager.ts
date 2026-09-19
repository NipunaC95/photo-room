// ============================================================
// FolderManager — Pointing folder, multi-file batch state,
// and automatic JSON edits persistence (davinci_edits.json)
// ============================================================

import type { Adjustments } from './processor';
import { defaultAdjustments } from './processor';
import { isRawOrTiff, decodeRawFile } from './raw';
import type { CameraMetadata } from './raw';

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  isRaw: boolean;
  thumbnailUrl: string;
  adjustments: Adjustments;
  isEdited: boolean;
  handle?: FileSystemFileHandle;
  metadata?: CameraMetadata | null;
  bitDepth?: number;
}

export interface FolderEditsData {
  version: string;
  appName: string;
  folderName: string;
  updatedAt: string;
  edits: Record<string, Adjustments>;
}

export class FolderManager {
  private items: BatchItem[] = [];
  private activeIndex: number = -1;
  private folderName: string = 'Imported Photos';
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private editsJsonHandle: FileSystemFileHandle | null = null;
  private saveDebounceTimer: number | null = null;
  private copiedAdjustments: Adjustments | null = null;

  private onBatchChanged?: (items: BatchItem[], activeIndex: number) => void;
  private onActiveChanged?: (item: BatchItem, index: number) => void;
  private onSyncStatusChanged?: (status: 'synced' | 'saving' | 'unsaved' | 'local') => void;

  constructor(options?: {
    onBatchChanged?: (items: BatchItem[], activeIndex: number) => void;
    onActiveChanged?: (item: BatchItem, index: number) => void;
    onSyncStatusChanged?: (status: 'synced' | 'saving' | 'unsaved' | 'local') => void;
  }) {
    if (options?.onBatchChanged) this.onBatchChanged = options.onBatchChanged;
    if (options?.onActiveChanged) this.onActiveChanged = options.onActiveChanged;
    if (options?.onSyncStatusChanged) this.onSyncStatusChanged = options.onSyncStatusChanged;
  }

  public getItems(): BatchItem[] {
    return this.items;
  }

  public getActiveItem(): BatchItem | null {
    if (this.activeIndex >= 0 && this.activeIndex < this.items.length) {
      return this.items[this.activeIndex];
    }
    return null;
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  public getFolderName(): string {
    return this.folderName;
  }

  public setCopiedAdjustments(adj: Adjustments): void {
    this.copiedAdjustments = JSON.parse(JSON.stringify(adj));
  }

  public getCopiedAdjustments(): Adjustments | null {
    return this.copiedAdjustments ? JSON.parse(JSON.stringify(this.copiedAdjustments)) : null;
  }

  /** Point and open a folder using the File System Access API */
  public async openDirectoryPicker(): Promise<boolean> {
    if (!('showDirectoryPicker' in window)) {
      return false;
    }

    try {
      const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      await this.loadFromDirectoryHandle(handle);
      return true;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Directory picker error:', err);
      }
      return false;
    }
  }

  /** Load batch items from a directory handle */
  public async loadFromDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this.clear();
    this.dirHandle = handle;
    this.folderName = handle.name || 'Folder';

    const fileEntries: { file: File; handle: FileSystemFileHandle }[] = [];
    let savedEditsJsonText: string | null = null;
    this.editsJsonHandle = null;

    // Scan entries
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle;
        if (fileHandle.name === 'davinci_edits.json') {
          this.editsJsonHandle = fileHandle;
          try {
            const jsonFile = await fileHandle.getFile();
            savedEditsJsonText = await jsonFile.text();
          } catch (e) {
            console.warn('Failed to read existing davinci_edits.json:', e);
          }
        } else if (this.isImageFile(fileHandle.name)) {
          const file = await fileHandle.getFile();
          fileEntries.push({ file, handle: fileHandle });
        }
      }
    }

    // Sort files alphabetically
    fileEntries.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }));

    // Parse pre-existing edits JSON if present
    const editsMap: Record<string, Adjustments> = {};
    if (savedEditsJsonText) {
      try {
        const parsed: FolderEditsData = JSON.parse(savedEditsJsonText);
        if (parsed.edits) {
          Object.assign(editsMap, parsed.edits);
        }
      } catch (err) {
        console.warn('Invalid JSON format in davinci_edits.json:', err);
      }
    }

    // Build batch items
    for (const entry of fileEntries) {
      const item = await this.createBatchItem(entry.file, entry.handle, editsMap[entry.file.name]);
      this.items.push(item);
    }

    if (this.items.length > 0) {
      this.activeIndex = 0;
      this.notifyBatchChanged();
      this.notifySyncStatus('synced');
    }
  }

  /** Load batch from HTML FileList / File array (e.g. drop or input webkitdirectory) */
  public async loadFromFiles(files: FileList | File[], folderLabel = 'Imported Folder'): Promise<void> {
    this.clear();
    this.folderName = folderLabel;

    const fileList: File[] = Array.from(files);
    let savedEditsJsonText: string | null = null;
    const imageFiles: File[] = [];

    for (const f of fileList) {
      if (f.name === 'davinci_edits.json') {
        try {
          savedEditsJsonText = await f.text();
        } catch (e) {
          console.warn('Could not read davinci_edits.json text:', e);
        }
      } else if (this.isImageFile(f.name)) {
        imageFiles.push(f);
      }
    }

    // Try reading cached JSON from localStorage if not provided in files
    if (!savedEditsJsonText) {
      const cacheKey = `davinci_edits_${this.folderName}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) savedEditsJsonText = cached;
    }

    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const editsMap: Record<string, Adjustments> = {};
    if (savedEditsJsonText) {
      try {
        const parsed: FolderEditsData = JSON.parse(savedEditsJsonText);
        if (parsed.edits) {
          Object.assign(editsMap, parsed.edits);
        }
      } catch (e) {
        console.warn('Could not parse edits JSON:', e);
      }
    }

    for (const file of imageFiles) {
      const item = await this.createBatchItem(file, undefined, editsMap[file.name]);
      this.items.push(item);
    }

    if (this.items.length > 0) {
      this.activeIndex = 0;
      this.notifyBatchChanged();
      this.notifySyncStatus('local');
    }
  }

  /** Update adjustments for active item and schedule JSON auto-save */
  public updateActiveAdjustments(adj: Adjustments): void {
    const item = this.getActiveItem();
    if (!item) return;

    item.adjustments = JSON.parse(JSON.stringify(adj));
    item.isEdited = this.checkIsEdited(item.adjustments);

    // Save to LocalStorage cache immediately
    this.saveToLocalStorage();

    // Schedule debounced file save to davinci_edits.json in directory if handle is open
    this.scheduleSaveEditsJson();
  }

  /** Switch active photo by index */
  public setActiveIndex(index: number): boolean {
    if (index < 0 || index >= this.items.length) return false;
    this.activeIndex = index;
    const item = this.items[index];
    if (this.onActiveChanged) {
      this.onActiveChanged(item, index);
    }
    return true;
  }

  /** Switch to next photo */
  public next(): boolean {
    return this.setActiveIndex(this.activeIndex + 1);
  }

  /** Switch to previous photo */
  public previous(): boolean {
    return this.setActiveIndex(this.activeIndex - 1);
  }

  /** Reset adjustments for a specific item */
  public resetItemAdjustments(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    item.adjustments = defaultAdjustments();
    item.isEdited = false;

    if (index === this.activeIndex) {
      if (this.onActiveChanged) this.onActiveChanged(item, index);
    }
    this.notifyBatchChanged();
    this.scheduleSaveEditsJson();
  }

  /** Apply adjustments to item at index */
  public setItemAdjustments(index: number, adj: Adjustments): void {
    if (index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    item.adjustments = JSON.parse(JSON.stringify(adj));
    item.isEdited = this.checkIsEdited(item.adjustments);

    if (index === this.activeIndex) {
      if (this.onActiveChanged) this.onActiveChanged(item, index);
    }
    this.notifyBatchChanged();
    this.scheduleSaveEditsJson();
  }

  /** Remove an item from the batch */
  public removeItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;
    URL.revokeObjectURL(this.items[index].thumbnailUrl);
    this.items.splice(index, 1);

    if (this.items.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex >= this.items.length) {
      this.activeIndex = this.items.length - 1;
    }

    this.notifyBatchChanged();
    if (this.activeIndex >= 0) {
      this.setActiveIndex(this.activeIndex);
    }
  }

  /** Generate current folder's edits JSON structure */
  public getEditsJsonData(): FolderEditsData {
    const edits: Record<string, Adjustments> = {};
    for (const item of this.items) {
      if (item.isEdited) {
        edits[item.name] = item.adjustments;
      }
    }
    return {
      version: '1.0',
      appName: 'Davinci',
      folderName: this.folderName,
      updatedAt: new Date().toISOString(),
      edits,
    };
  }

  /** Trigger download of davinci_edits.json */
  public downloadEditsJson(): void {
    const data = this.getEditsJsonData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'davinci_edits.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Schedule debounced saving of davinci_edits.json to pointed directory */
  private scheduleSaveEditsJson(): void {
    this.notifySyncStatus('saving');
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = window.setTimeout(async () => {
      this.saveDebounceTimer = null;
      await this.saveEditsJsonToFolder();
    }, 600);
  }

  /** Write davinci_edits.json directly into directory handle if available */
  private async saveEditsJsonToFolder(): Promise<void> {
    const editsData = this.getEditsJsonData();
    const jsonStr = JSON.stringify(editsData, null, 2);

    if (this.dirHandle) {
      try {
        let fileHandle = this.editsJsonHandle;
        if (!fileHandle) {
          fileHandle = await this.dirHandle.getFileHandle('davinci_edits.json', { create: true });
          this.editsJsonHandle = fileHandle;
        }
        const writable = await (fileHandle as any).createWritable();
        await writable.write(jsonStr);
        await writable.close();
        this.notifySyncStatus('synced');
        return;
      } catch (err) {
        console.warn('Could not auto-save davinci_edits.json to folder:', err);
      }
    }

    // Local storage fallback
    this.saveToLocalStorage();
    this.notifySyncStatus('local');
  }

  private saveToLocalStorage(): void {
    try {
      const data = this.getEditsJsonData();
      const cacheKey = `davinci_edits_${this.folderName}`;
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  private async createBatchItem(file: File, handle?: FileSystemFileHandle, savedAdj?: Adjustments): Promise<BatchItem> {
    const isRaw = isRawOrTiff(file);
    const adj = savedAdj ? JSON.parse(JSON.stringify(savedAdj)) : defaultAdjustments();
    const isEdited = this.checkIsEdited(adj);
    const thumbnailUrl = await this.generateThumbnail(file, isRaw);

    return {
      id: `${file.name}_${file.size}_${Date.now()}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type || (isRaw ? 'image/x-raw' : 'image/jpeg'),
      isRaw,
      thumbnailUrl,
      adjustments: adj,
      isEdited,
      handle,
    };
  }

  private async generateThumbnail(file: File, isRaw: boolean): Promise<string> {
    if (isRaw) {
      try {
        const buffer = await file.arrayBuffer();
        const decoded = await decodeRawFile(buffer, file.name);
        return this.createCanvasThumbnail(decoded.width, decoded.height, decoded.floatData);
      } catch (e) {
        console.warn('Failed to render RAW thumbnail, using placeholder:', e);
        return this.createPlaceholderThumbnail(file.name);
      }
    }

    // Standard image thumbnail
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 160;
        const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(URL.createObjectURL(blob));
            else resolve(url);
          }, 'image/jpeg', 0.85);
        } else {
          resolve(url);
        }
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  private createCanvasThumbnail(width: number, height: number, floatData: Float32Array): string {
    const canvas = document.createElement('canvas');
    const maxDim = 160;
    const scale = Math.min(maxDim / width, maxDim / height, 1);
    const thumbW = Math.max(1, Math.round(width * scale));
    const thumbH = Math.max(1, Math.round(height * scale));
    canvas.width = thumbW;
    canvas.height = thumbH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imgData = ctx.createImageData(thumbW, thumbH);
    const data = imgData.data;

    // Nearest neighbor downscale from float RGBA
    for (let y = 0; y < thumbH; y++) {
      const srcY = Math.min(height - 1, Math.floor(y / scale));
      for (let x = 0; x < thumbW; x++) {
        const srcX = Math.min(width - 1, Math.floor(x / scale));
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * thumbW + x) * 4;

        data[dstIdx + 0] = Math.min(255, Math.max(0, Math.round(floatData[srcIdx + 0] * 255)));
        data[dstIdx + 1] = Math.min(255, Math.max(0, Math.round(floatData[srcIdx + 1] * 255)));
        data[dstIdx + 2] = Math.min(255, Math.max(0, Math.round(floatData[srcIdx + 2] * 255)));
        data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  private createPlaceholderThumbnail(filename: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e1e24';
      ctx.fillRect(0, 0, 160, 120);
      ctx.fillStyle = '#e96fff';
      ctx.font = '600 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RAW PHOTO', 80, 55);
      ctx.fillStyle = '#8a8a9e';
      ctx.font = '10px monospace';
      ctx.fillText(filename.slice(0, 16), 80, 75);
    }
    return canvas.toDataURL('image/jpeg');
  }

  private isImageFile(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const valid = [
      '.jpg', '.jpeg', '.png', '.webp', '.bmp',
      '.dng', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2',
      '.orf', '.rw2', '.pef', '.raf', '.tif', '.tiff'
    ];
    return valid.includes(ext);
  }

  private checkIsEdited(adj: Adjustments): boolean {
    const def = defaultAdjustments();
    return (
      adj.basic.temperature !== def.basic.temperature ||
      adj.basic.exposure !== def.basic.exposure ||
      adj.basic.contrast !== def.basic.contrast ||
      adj.basic.highlights !== def.basic.highlights ||
      adj.basic.shadows !== def.basic.shadows ||
      adj.basic.vibrance !== def.basic.vibrance ||
      adj.basic.saturation !== def.basic.saturation ||
      adj.curves.rgb.length > 2 ||
      adj.hsl.some(h => h.hue !== 0 || h.saturation !== 0 || h.luminance !== 0) ||
      adj.grading.shadows.hue !== 0 || adj.grading.highlights.hue !== 0 ||
      adj.effects.vignetteAmount !== 0 || adj.effects.grainAmount !== 0
    );
  }

  private clear(): void {
    for (const item of this.items) {
      if (item.thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    }
    this.items = [];
    this.activeIndex = -1;
    this.dirHandle = null;
    this.editsJsonHandle = null;
  }

  private notifyBatchChanged(): void {
    if (this.onBatchChanged) {
      this.onBatchChanged(this.items, this.activeIndex);
    }
  }

  private notifySyncStatus(status: 'synced' | 'saving' | 'unsaved' | 'local'): void {
    if (this.onSyncStatusChanged) {
      this.onSyncStatusChanged(status);
    }
  }
}
