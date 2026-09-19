// ============================================================
// Layers Panel — UI component for managing adjustment layers
// ============================================================
import type { Layer, LayeredAdjustments } from '../modules/layers';
import { createDefaultLayer } from '../modules/layers';

export class LayersPanel {
  private container: HTMLElement;
  private state: LayeredAdjustments;
  private onChange: (state: LayeredAdjustments) => void;
  private onActiveLayerChanged: (activeId: string) => void;

  constructor(
    container: HTMLElement,
    initialState: LayeredAdjustments,
    onChange: (state: LayeredAdjustments) => void,
    onActiveLayerChanged: (activeId: string) => void
  ) {
    this.container = container;
    this.state = JSON.parse(JSON.stringify(initialState));
    this.onChange = onChange;
    this.onActiveLayerChanged = onActiveLayerChanged;
    this.build();
  }

  public updateState(newState: LayeredAdjustments): void {
    this.state = JSON.parse(JSON.stringify(newState));
    this.renderLayerList();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h2>Layers</h2>
      <button class="panel-add-layer-btn" id="add-layer-header-btn">+ Add Layer</button>
    `;
    this.container.appendChild(header);

    header.querySelector('#add-layer-header-btn')?.addEventListener('click', () => {
      this.addNewLayer();
    });

    // Sub-actions bar
    const subActions = document.createElement('div');
    subActions.className = 'layers-action-bar';
    subActions.innerHTML = `
      <button class="layers-primary-add-btn" id="add-layer-main-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        New Adjustment Layer
      </button>
    `;
    this.container.appendChild(subActions);

    subActions.querySelector('#add-layer-main-btn')?.addEventListener('click', () => {
      this.addNewLayer();
    });

    // Layer List container
    const listWrap = document.createElement('div');
    listWrap.className = 'layers-list-container';
    listWrap.id = 'layers-list';
    this.container.appendChild(listWrap);

    this.renderLayerList();
  }

  private addNewLayer(): void {
    const layerNum = (this.state.layers?.length || 0) + 1;
    const newLayer = createDefaultLayer(`Layer ${layerNum}`);
    if (!this.state.layers) this.state.layers = [];
    this.state.layers.unshift(newLayer); // Add to top of stack
    this.state.activeLayerId = newLayer.id;
    this.renderLayerList();
    this.onActiveLayerChanged(newLayer.id);
    this.onChange(this.state);
  }

  private renderLayerList(): void {
    const listWrap = this.container.querySelector('#layers-list');
    if (!listWrap) return;
    listWrap.innerHTML = '';

    // Custom Layers (Top to Bottom)
    const layers = this.state.layers || [];

    if (layers.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'layers-empty-state';
      emptyState.innerHTML = `
        <p class="empty-title">No Custom Layers</p>
        <p class="empty-desc">Edits currently apply to Global Base. Add layers to stack non-destructive adjustments.</p>
      `;
      listWrap.appendChild(emptyState);
    } else {
      layers.forEach((layer, idx) => {
        const item = this.createLayerRow(layer, idx);
        listWrap.appendChild(item);
      });
    }

    // Base Layer Row (Always at bottom)
    const baseRow = document.createElement('div');
    const isBaseActive = this.state.activeLayerId === 'base';
    baseRow.className = `layer-item base-layer${isBaseActive ? ' active' : ''}`;
    baseRow.innerHTML = `
      <div class="layer-item-main">
        <span class="layer-icon">🌐</span>
        <div class="layer-info">
          <span class="layer-name">Global Base</span>
          <span class="layer-subtext">Overall photo foundation</span>
        </div>
        <span class="layer-badge">Base</span>
      </div>
    `;

    baseRow.addEventListener('click', () => {
      this.state.activeLayerId = 'base';
      this.renderLayerList();
      this.onActiveLayerChanged('base');
    });

    listWrap.appendChild(baseRow);
  }

  private createLayerRow(layer: Layer, idx: number): HTMLElement {
    const row = document.createElement('div');
    const isActive = this.state.activeLayerId === layer.id;
    row.className = `layer-item${isActive ? ' active' : ''}${!layer.enabled ? ' disabled' : ''}`;

    row.innerHTML = `
      <div class="layer-item-header">
        <button class="layer-toggle-btn" title="Toggle Layer Visibility">
          ${layer.enabled ? '👁️' : '🙈'}
        </button>
        <span class="layer-name" title="Click to select, double-click to rename">${this.escapeHtml(layer.name)}</span>
        <div class="layer-actions">
          <button class="layer-act-btn up-btn" title="Move Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="layer-act-btn down-btn" title="Move Down" ${idx === (this.state.layers.length - 1) ? 'disabled' : ''}>▼</button>
          <button class="layer-act-btn dup-btn" title="Duplicate Layer">📋</button>
          <button class="layer-act-btn del-btn danger" title="Delete Layer">🗑️</button>
        </div>
      </div>
      <div class="layer-item-opacity">
        <span class="layer-opacity-label">Opacity</span>
        <input type="range" class="slider layer-opacity-slider" min="0" max="100" value="${Math.round(layer.opacity * 100)}">
        <span class="layer-opacity-val">${Math.round(layer.opacity * 100)}%</span>
      </div>
    `;

    // Row selection on click
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.layer-actions') || target.closest('.layer-toggle-btn') || target.closest('.layer-opacity-slider')) {
        return;
      }
      this.state.activeLayerId = layer.id;
      this.renderLayerList();
      this.onActiveLayerChanged(layer.id);
    });

    // Double-click name to rename
    row.querySelector('.layer-name')?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nameEl = e.currentTarget as HTMLElement;
      const current = layer.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'layer-name-input';
      input.value = current;
      nameEl.replaceWith(input);
      input.focus();

      const commit = () => {
        const val = input.value.trim() || current;
        layer.name = val;
        this.renderLayerList();
        this.onChange(this.state);
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
      });
    });

    // Visibility toggle
    row.querySelector('.layer-toggle-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.enabled = !layer.enabled;
      this.renderLayerList();
      this.onChange(this.state);
    });

    // Opacity slider
    const opSlider = row.querySelector('.layer-opacity-slider') as HTMLInputElement;
    const opVal = row.querySelector('.layer-opacity-val') as HTMLElement;
    opSlider?.addEventListener('input', (e) => {
      e.stopPropagation();
      const v = parseInt(opSlider.value, 10);
      layer.opacity = v / 100;
      if (opVal) opVal.textContent = `${v}%`;
      this.updateSliderFill(opSlider, v);
      this.onChange(this.state);
    });
    this.updateSliderFill(opSlider, Math.round(layer.opacity * 100));

    // Move Up
    row.querySelector('.up-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        const item = this.state.layers.splice(idx, 1)[0];
        this.state.layers.splice(idx - 1, 0, item);
        this.renderLayerList();
        this.onChange(this.state);
      }
    });

    // Move Down
    row.querySelector('.down-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < this.state.layers.length - 1) {
        const item = this.state.layers.splice(idx, 1)[0];
        this.state.layers.splice(idx + 1, 0, item);
        this.renderLayerList();
        this.onChange(this.state);
      }
    });

    // Duplicate Layer
    row.querySelector('.dup-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dup: Layer = {
        id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: `${layer.name} Copy`,
        enabled: layer.enabled,
        opacity: layer.opacity,
        adjustments: JSON.parse(JSON.stringify(layer.adjustments)),
      };
      this.state.layers.splice(idx, 0, dup);
      this.state.activeLayerId = dup.id;
      this.renderLayerList();
      this.onActiveLayerChanged(dup.id);
      this.onChange(this.state);
    });

    // Delete Layer
    row.querySelector('.del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.state.layers.splice(idx, 1);
      if (this.state.activeLayerId === layer.id) {
        this.state.activeLayerId = this.state.layers[0]?.id || 'base';
        this.onActiveLayerChanged(this.state.activeLayerId);
      }
      this.renderLayerList();
      this.onChange(this.state);
    });

    return row;
  }

  private updateSliderFill(input: HTMLInputElement, val: number): void {
    if (!input) return;
    input.style.background = `linear-gradient(90deg, #0a84ff ${val}%, rgba(255,255,255,0.12) ${val}%)`;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
