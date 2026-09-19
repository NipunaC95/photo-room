// ============================================================
// Filmstrip — Horizontal scroll bar UI for multi-photo editing
// ============================================================

import type { FolderManager, BatchItem } from './folderManager';

export class Filmstrip {
  private container: HTMLElement;
  private manager: FolderManager;

  // DOM elements
  private folderLabel!: HTMLElement;
  private syncStatusEl!: HTMLElement;
  private trackEl!: HTMLElement;
  private scrollLeftBtn!: HTMLButtonElement;
  private scrollRightBtn!: HTMLButtonElement;
  private copyBtn!: HTMLButtonElement;
  private pasteBtn!: HTMLButtonElement;
  private exportAllBtn!: HTMLButtonElement;
  private openFolderBtn!: HTMLButtonElement;
  private downloadJsonBtn!: HTMLButtonElement;

  // Drag scroll state
  private isDragging = false;
  private startX = 0;
  private scrollLeft = 0;

  private onSelectPhoto?: (item: BatchItem, index: number) => void;
  private onExportAll?: () => void;
  private onOpenFolder?: () => void;
  private onCopySettings?: () => void;
  private onPasteSettings?: () => void;

  constructor(
    container: HTMLElement,
    manager: FolderManager,
    callbacks?: {
      onSelectPhoto?: (item: BatchItem, index: number) => void;
      onExportAll?: () => void;
      onOpenFolder?: () => void;
      onCopySettings?: () => void;
      onPasteSettings?: () => void;
    }
  ) {
    this.container = container;
    this.manager = manager;
    if (callbacks) {
      if (callbacks.onSelectPhoto) this.onSelectPhoto = callbacks.onSelectPhoto;
      if (callbacks.onExportAll) this.onExportAll = callbacks.onExportAll;
      if (callbacks.onOpenFolder) this.onOpenFolder = callbacks.onOpenFolder;
      if (callbacks.onCopySettings) this.onCopySettings = callbacks.onCopySettings;
      if (callbacks.onPasteSettings) this.onPasteSettings = callbacks.onPasteSettings;
    }

    this.renderSkeleton();
    this.bindEvents();
  }

  private renderSkeleton(): void {
    this.container.innerHTML = `
      <div class="filmstrip-header">
        <div class="filmstrip-left">
          <div class="filmstrip-folder-chip" id="filmstrip-folder-chip">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4a1 1 0 011-1h3.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H13a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
            </svg>
            <span id="filmstrip-folder-label">No folder loaded</span>
          </div>
          <div class="sync-status-badge synced" id="filmstrip-sync-status" title="Temporary edit data saved to davinci_edits.json">
            <span class="sync-dot"></span>
            <span class="sync-text">davinci_edits.json synced</span>
          </div>
        </div>
        <div class="filmstrip-actions">
          <button class="filmstrip-btn" id="fs-btn-open-folder" title="Open / Point a Folder">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4a1 1 0 011-1h3.586a1 1 0 01.707.293l1.414 1.414a1 1 0 00.707.293H13a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
            </svg>
            Point Folder
          </button>
          <button class="filmstrip-btn" id="fs-btn-download-json" title="Download davinci_edits.json file">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 2v8M5 7l3 3 3-3M2 12h12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Save JSON
          </button>
          <div class="filmstrip-divider"></div>
          <button class="filmstrip-btn" id="fs-btn-copy" title="Copy active photo adjustments">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1.5"/>
              <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" stroke-linecap="round"/>
            </svg>
            Copy Adjustments
          </button>
          <button class="filmstrip-btn" id="fs-btn-paste" title="Paste adjustments to active photo">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="10" height="10" rx="1.5"/>
              <path d="M6 4V2.5A.5.5 0 016.5 2h3a.5.5 0 01.5.5V4" stroke-linecap="round"/>
            </svg>
            Paste Adjustments
          </button>
          <button class="filmstrip-btn primary" id="fs-btn-export-all" title="Batch export all photos">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 9V1M5 4l3-3 3 3M2 11h12M2 14h12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Export All Photos
          </button>
        </div>
      </div>
      <div class="filmstrip-body">
        <button class="filmstrip-scroll-btn left" id="fs-scroll-left" title="Scroll left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.707 13.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L6.414 8l4.293 4.293a1 1 0 010 1.414z"/>
          </svg>
        </button>
        <div class="filmstrip-track" id="filmstrip-track"></div>
        <button class="filmstrip-scroll-btn right" id="fs-scroll-right" title="Scroll right">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.293 2.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L9.586 8 5.293 3.707a1 1 0 010-1.414z"/>
          </svg>
        </button>
      </div>
    `;

    this.folderLabel = this.container.querySelector('#filmstrip-folder-label')!;
    this.syncStatusEl = this.container.querySelector('#filmstrip-sync-status')!;
    this.trackEl = this.container.querySelector('#filmstrip-track')!;
    this.scrollLeftBtn = this.container.querySelector('#fs-scroll-left') as HTMLButtonElement;
    this.scrollRightBtn = this.container.querySelector('#fs-scroll-right') as HTMLButtonElement;
    this.copyBtn = this.container.querySelector('#fs-btn-copy') as HTMLButtonElement;
    this.pasteBtn = this.container.querySelector('#fs-btn-paste') as HTMLButtonElement;
    this.exportAllBtn = this.container.querySelector('#fs-btn-export-all') as HTMLButtonElement;
    this.openFolderBtn = this.container.querySelector('#fs-btn-open-folder') as HTMLButtonElement;
    this.downloadJsonBtn = this.container.querySelector('#fs-btn-download-json') as HTMLButtonElement;
  }

  private bindEvents(): void {
    // Arrow scroll
    this.scrollLeftBtn.addEventListener('click', () => {
      this.trackEl.scrollBy({ left: -260, behavior: 'smooth' });
    });
    this.scrollRightBtn.addEventListener('click', () => {
      this.trackEl.scrollBy({ left: 260, behavior: 'smooth' });
    });

    // Drag to scroll
    this.trackEl.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.trackEl.classList.add('dragging');
      this.startX = e.pageX - this.trackEl.offsetLeft;
      this.scrollLeft = this.trackEl.scrollLeft;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.trackEl.classList.remove('dragging');
      }
    });

    this.trackEl.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const x = e.pageX - this.trackEl.offsetLeft;
      const walk = (x - this.startX) * 1.5;
      this.trackEl.scrollLeft = this.scrollLeft - walk;
    });

    // Toolbar buttons
    this.openFolderBtn.addEventListener('click', () => {
      if (this.onOpenFolder) this.onOpenFolder();
    });

    this.downloadJsonBtn.addEventListener('click', () => {
      this.manager.downloadEditsJson();
    });

    this.copyBtn.addEventListener('click', () => {
      if (this.onCopySettings) this.onCopySettings();
    });

    this.pasteBtn.addEventListener('click', () => {
      if (this.onPasteSettings) this.onPasteSettings();
    });

    this.exportAllBtn.addEventListener('click', () => {
      if (this.onExportAll) this.onExportAll();
    });
  }

  public update(items: BatchItem[], activeIndex: number): void {
    const folderName = this.manager.getFolderName();
    this.folderLabel.textContent = `${folderName} (${items.length} ${items.length === 1 ? 'photo' : 'photos'})`;

    this.trackEl.innerHTML = '';
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `filmstrip-item ${index === activeIndex ? 'active' : ''} ${item.isEdited ? 'edited' : ''}`;
      card.dataset.index = String(index);

      card.innerHTML = `
        <div class="thumb-wrapper">
          <img src="${item.thumbnailUrl}" alt="${item.name}" loading="lazy" />
          ${item.isEdited ? '<span class="edited-dot" title="Photo has custom edits"></span>' : ''}
          ${item.isRaw ? '<span class="raw-badge">RAW</span>' : ''}
          <div class="item-overlay">
            <button class="thumb-action-btn btn-reset-item" title="Reset settings" data-index="${index}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2.5 8a5.5 5.5 0 101.61-3.89L2 6M2 2v4h4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="thumb-action-btn btn-remove-item" title="Remove photo" data-index="${index}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="thumb-info">
          <span class="thumb-name" title="${item.name}">${item.name}</span>
          <span class="thumb-index">#${index + 1}</span>
        </div>
      `;

      // Select photo click
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.thumb-action-btn')) return; // Ignore action buttons click
        if (this.onSelectPhoto) {
          this.onSelectPhoto(item, index);
        }
      });

      // Action buttons inside card
      card.querySelector('.btn-reset-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.resetItemAdjustments(index);
      });

      card.querySelector('.btn-remove-item')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.removeItem(index);
      });

      this.trackEl.appendChild(card);
    });

    // Scroll active item into view
    const activeCard = this.trackEl.querySelector(`.filmstrip-item[data-index="${activeIndex}"]`);
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  public setSyncStatus(status: 'synced' | 'saving' | 'unsaved' | 'local'): void {
    this.syncStatusEl.className = `sync-status-badge ${status}`;
    const textEl = this.syncStatusEl.querySelector('.sync-text');
    if (!textEl) return;

    switch (status) {
      case 'synced':
        textEl.textContent = 'davinci_edits.json synced';
        this.syncStatusEl.title = 'Edit data is automatically saved to davinci_edits.json in pointed folder';
        break;
      case 'saving':
        textEl.textContent = 'Saving davinci_edits.json...';
        this.syncStatusEl.title = 'Writing updated adjustments to davinci_edits.json';
        break;
      case 'local':
        textEl.textContent = 'Edits cached (Local)';
        this.syncStatusEl.title = 'Edits stored in local storage cache. Click "Save JSON" to download file.';
        break;
      case 'unsaved':
        textEl.textContent = 'Unsaved changes';
        this.syncStatusEl.title = 'Unsaved adjustments present';
        break;
    }
  }
}
