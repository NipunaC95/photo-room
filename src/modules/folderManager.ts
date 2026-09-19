// ============================================================
// FolderManager — Pointing folder, multi-file batch state,
// and automatic JSON edits persistence (davinci_edits.json)
// ============================================================

import type { Adjustments } from './processor';
import { defaultAdjustments } from './processor';
import type { LayeredAdjustments } from './layers';
import { createDefaultLayeredAdjustments, flattenAdjustments } from './layers';
import { isRawOrTiff } from './raw';
import type { CameraMetadata } from './raw';

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  isRaw: boolean;
  thumbnailUrl: string;
  layeredAdjustments: LayeredAdjustments;
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
  edits: Record<string, LayeredAdjustments | Adjustments>;
}

export class FolderManager {
  private items: BatchItem[] = [];
  private activeIndex: number = -1;
  private folderName: string = 'Imported Photos';
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private editsJsonHandle: FileSystemFileHandle | null = null;
  private saveDebounceTimer: number | null = null;
  private copiedLayered: LayeredAdjustments | null = null;

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
    const item = this.getActiveItem();
    if (item) {
      this.copiedLayered = JSON.parse(JSON.stringify(item.layeredAdjustments));
    } else {
      this.copiedLayered = {
        base: JSON.parse(JSON.stringify(adj)),
        layers: [],
        activeLayerId: 'base',
      };
    }
  }

  public getCopiedAdjustments(): Adjustments | null {
    if (!this.copiedLayered) return null;
    return flattenAdjustments(this.copiedLayered);
  }

  public setCopiedLayered(layered: LayeredAdjustments): void {
    this.copiedLayered = JSON.parse(JSON.stringify(layered));
  }

  public getCopiedLayered(): LayeredAdjustments | null {
    return this.copiedLayered ? JSON.parse(JSON.stringify(this.copiedLayered)) : null;
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
    const editsMap: Record<string, LayeredAdjustments | Adjustments> = {};
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

  /** Load batch from HTML FileList / File array */
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

    if (!savedEditsJsonText) {
      const cacheKey = `davinci_edits_${this.folderName}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) savedEditsJsonText = cached;
    }

    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const editsMap: Record<string, LayeredAdjustments | Adjustments> = {};
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

  /** Update active item with new LayeredAdjustments */
  public updateActiveLayeredAdjustments(layered: LayeredAdjustments): void {
    const item = this.getActiveItem();
    if (!item) return;

    item.layeredAdjustments = JSON.parse(JSON.stringify(layered));
    item.adjustments = flattenAdjustments(item.layeredAdjustments);
    item.isEdited = this.checkIsEdited(item.adjustments);

    this.saveToLocalStorage();
    this.scheduleSaveEditsJson();
  }

  /** Update adjustments for active item (legacy compatibility) */
  public updateActiveAdjustments(adj: Adjustments): void {
    const item = this.getActiveItem();
    if (!item) return;

    const activeId = item.layeredAdjustments?.activeLayerId || 'base';
    if (activeId === 'base') {
      item.layeredAdjustments.base = JSON.parse(JSON.stringify(adj));
    } else {
      const layer = item.layeredAdjustments.layers.find(l => l.id === activeId);
      if (layer) {
        layer.adjustments = JSON.parse(JSON.stringify(adj));
      } else {
        item.layeredAdjustments.base = JSON.parse(JSON.stringify(adj));
      }
    }

    item.adjustments = flattenAdjustments(item.layeredAdjustments);
    item.isEdited = this.checkIsEdited(item.adjustments);

    this.saveToLocalStorage();
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
    item.layeredAdjustments = createDefaultLayeredAdjustments();
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
    item.layeredAdjustments = {
      base: JSON.parse(JSON.stringify(adj)),
      layers: [],
      activeLayerId: 'base',
    };
    item.adjustments = flattenAdjustments(item.layeredAdjustments);
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
    const edits: Record<string, LayeredAdjustments> = {};
    for (const item of this.items) {
      if (item.isEdited) {
        edits[item.name] = item.layeredAdjustments;
      }
    }
    return {
      version: '2.0',
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

  private async createBatchItem(file: File, handle?: FileSystemFileHandle, saved?: LayeredAdjustments | Adjustments): Promise<BatchItem> {
    const isRaw = isRawOrTiff(file);
    let layered: LayeredAdjustments;

    if (saved) {
      if ('base' in saved && 'layers' in saved) {
        layered = JSON.parse(JSON.stringify(saved));
      } else {
        layered = {
          base: JSON.parse(JSON.stringify(saved)),
          layers: [],
          activeLayerId: 'base',
        };
      }
    } else {
      layered = createDefaultLayeredAdjustments();
    }

    const flatAdj = flattenAdjustments(layered);
    const isEdited = this.checkIsEdited(flatAdj);
    const thumbnailUrl = await this.generateThumbnail(file, isRaw);

    return {
      id: `${file.name}_${file.size}_${Date.now()}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type || (isRaw ? 'image/x-raw' : 'image/jpeg'),
      isRaw,
      thumbnailUrl,
      layeredAdjustments: layered,
      adjustments: flatAdj,
      isEdited,
      handle,
    };
  }

  private async generateThumbnail(file: File, isRaw: boolean): Promise<string> {
    if (isRaw) {
      try {
        const { decodeRawFile } = await import('./raw');
        const rawData = await decodeRawFile(file);
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(rawData.width, 300);
        canvas.height = Math.round((canvas.width / rawData.width) * rawData.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.createImageData(rawData.width, rawData.height);
          imgData.data.set(rawData.previewData);
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = rawData.width;
          tempCanvas.height = rawData.height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.putImageData(imgData, 0, 0);
            ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.85);
          }
        }
      } catch (err) {
        console.warn('Failed to extract RAW thumbnail:', err);
      }
    }
    return URL.createObjectURL(file);
  }

  private checkIsEdited(adj: Adjustments): boolean {
    const def = defaultAdjustments();
    return JSON.stringify(adj) !== JSON.stringify(def);
  }

  private isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'dng', 'cr2', 'nef', 'arw'].includes(ext);
  }

  public clear(): void {
    this.items.forEach(item => URL.revokeObjectURL(item.thumbnailUrl));
    this.items = [];
    this.activeIndex = -1;
  }

  private notifyBatchChanged(): void {
    if (this.onBatchChanged) this.onBatchChanged(this.items, this.activeIndex);
  }

  private notifySyncStatus(status: 'synced' | 'saving' | 'unsaved' | 'local'): void {
    if (this.onSyncStatusChanged) this.onSyncStatusChanged(status);
  }
}
