// ============================================================
// Layers Panel — Hierarchical Tree View with Sub-Layers (Masks)
// ============================================================
import type { Layer, LayeredAdjustments, SubLayerMask, MaskType } from '../modules/layers';
import { createDefaultLayer, createDefaultSubLayerMask } from '../modules/layers';

export class LayersPanel {
  private container: HTMLElement;
  private state: LayeredAdjustments;
  private onChange: (state: LayeredAdjustments) => void;
  private onActiveLayerChanged: (activeId: string, maskId?: string) => void;

  constructor(
    container: HTMLElement,
    initialState: LayeredAdjustments,
    onChange: (state: LayeredAdjustments) => void,
    onActiveLayerChanged: (activeId: string, maskId?: string) => void
  ) {
    this.container = container;
    this.state = JSON.parse(JSON.stringify(initialState));
    this.onChange = onChange;
    this.onActiveLayerChanged = onActiveLayerChanged;
    this.build();
  }

  public updateState(newState: LayeredAdjustments): void {
    this.state = JSON.parse(JSON.stringify(newState));
    this.renderLayerTree();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h2>Layers Tree</h2>
      <button class="panel-add-layer-btn" id="add-layer-header-btn">+ Add Layer</button>
    `;
    this.container.appendChild(header);

    header.querySelector('#add-layer-header-btn')?.addEventListener('click', () => {
      this.addNewLayer();
    });

    // Sub-actions & Quick Mask Toolbar
    const subActions = document.createElement('div');
    subActions.className = 'layers-action-bar';
    subActions.innerHTML = `
      <button class="layers-primary-add-btn" id="add-layer-main-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        New Adjustment Layer
      </button>

      <div class="mask-quick-toolbar">
        <span class="mask-toolbar-title">Add Sub-Layer Mask:</span>
        <div class="mask-tool-grid">
          <button class="mask-quick-btn" data-type="brush" title="Add Brush Mask">🖌️ Brush</button>
          <button class="mask-quick-btn" data-type="linear_gradient" title="Add Linear Gradient">📐 Linear</button>
          <button class="mask-quick-btn" data-type="radial_gradient" title="Add Radial Mask">⭕ Radial</button>
          <button class="mask-quick-btn" data-type="color_range" title="Add Color Range Mask">🎨 Color</button>
          <button class="mask-quick-btn" data-type="luminance_range" title="Add Luminance Mask">💡 Lum</button>
        </div>
      </div>
    `;
    this.container.appendChild(subActions);

    subActions.querySelector('#add-layer-main-btn')?.addEventListener('click', () => {
      this.addNewLayer();
    });

    subActions.querySelectorAll('.mask-quick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).dataset.type as MaskType;
        this.addQuickMask(type);
      });
    });

    // Layer Tree Container
    const treeWrap = document.createElement('div');
    treeWrap.className = 'layers-tree-container';
    treeWrap.id = 'layers-tree';
    this.container.appendChild(treeWrap);

    this.renderLayerTree();
  }

  private addNewLayer(): Layer {
    const layerNum = (this.state.layers?.length || 0) + 1;
    const newLayer = createDefaultLayer(`Layer ${layerNum}`);
    if (!this.state.layers) this.state.layers = [];
    this.state.layers.unshift(newLayer);
    this.state.activeLayerId = newLayer.id;
    this.state.activeMaskId = undefined;
    this.renderLayerTree();
    this.onActiveLayerChanged(newLayer.id);
    this.onChange(this.state);
    return newLayer;
  }

  private addQuickMask(type: MaskType): void {
    let targetLayer: Layer | undefined;
    const activeId = this.state.activeLayerId;
    if (activeId && activeId !== 'base') {
      targetLayer = (this.state.layers || []).find(l => l.id === activeId);
    }

    if (!targetLayer) {
      if (this.state.layers && this.state.layers.length > 0) {
        targetLayer = this.state.layers[0];
      } else {
        targetLayer = this.addNewLayer();
      }
    }

    this.addSubLayerMask(targetLayer, type);
  }

  private renderLayerTree(): void {
    const treeWrap = this.container.querySelector('#layers-tree');
    if (!treeWrap) return;
    treeWrap.innerHTML = '';

    const layers = this.state.layers || [];

    if (layers.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'layers-empty-state';
      emptyState.innerHTML = `
        <p class="empty-title">No Custom Layers</p>
        <p class="empty-desc">Edits currently apply to Global Base. Click '+ Add Layer' or a Quick Mask tool to create a sub-layer mask.</p>
      `;
      treeWrap.appendChild(emptyState);
    } else {
      layers.forEach((layer, idx) => {
        const node = this.createLayerTreeNode(layer, idx);
        treeWrap.appendChild(node);
      });
    }

    // Global Base Row
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
      this.state.activeMaskId = undefined;
      this.renderLayerTree();
      this.onActiveLayerChanged('base');
    });

    treeWrap.appendChild(baseRow);
  }

  private createLayerTreeNode(layer: Layer, idx: number): HTMLElement {
    const node = document.createElement('div');
    node.className = 'layer-tree-node';

    const isLayerActive = this.state.activeLayerId === layer.id && !this.state.activeMaskId;
    const isExpanded = layer.expanded !== false;

    // Main Layer Item
    const layerRow = document.createElement('div');
    layerRow.className = `layer-item parent-layer${isLayerActive ? ' active' : ''}${!layer.enabled ? ' disabled' : ''}`;

    const maskCount = layer.masks ? layer.masks.length : 0;

    layerRow.innerHTML = `
      <div class="layer-item-header">
        <button class="layer-expand-btn" title="${isExpanded ? 'Collapse Sub-Layers' : 'Expand Sub-Layers'}">
          ${isExpanded ? '▼' : '▶'}
        </button>
        <button class="layer-toggle-btn" title="Toggle Layer Visibility">
          ${layer.enabled ? '👁️' : '🙈'}
        </button>
        <span class="layer-name" title="Click to select layer, double-click to rename">${this.escapeHtml(layer.name)}</span>
        ${maskCount > 0 ? `<span class="mask-count-badge" title="${maskCount} Sub-Layer Masks">${maskCount} mask${maskCount > 1 ? 's' : ''}</span>` : ''}

        <div class="layer-actions">
          <div class="add-mask-dropdown-wrap">
            <button class="add-mask-btn" title="Add Sub-Layer Mask">+ Mask ▾</button>
            <div class="add-mask-menu" style="display:none">
              <button class="add-mask-option" data-type="brush">🖌️ Brush Mask</button>
              <button class="add-mask-option" data-type="linear_gradient">📐 Linear Gradient</button>
              <button class="add-mask-option" data-type="radial_gradient">⭕ Radial Mask</button>
              <button class="add-mask-option" data-type="color_range">🎨 Color Range</button>
              <button class="add-mask-option" data-type="luminance_range">💡 Luminance Range</button>
            </div>
          </div>
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

    // Expand/Collapse toggle
    layerRow.querySelector('.layer-expand-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.expanded = !isExpanded;
      this.renderLayerTree();
    });

    // Layer selection
    layerRow.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.layer-actions') ||
        target.closest('.layer-toggle-btn') ||
        target.closest('.layer-expand-btn') ||
        target.closest('.layer-opacity-slider')
      ) {
        return;
      }
      this.state.activeLayerId = layer.id;
      this.state.activeMaskId = undefined;
      this.renderLayerTree();
      this.onActiveLayerChanged(layer.id);
    });

    // Double-click to rename
    layerRow.querySelector('.layer-name')?.addEventListener('dblclick', (e) => {
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
        this.renderLayerTree();
        this.onChange(this.state);
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
      });
    });

    // Add Mask dropdown logic
    const addMaskBtn = layerRow.querySelector('.add-mask-btn') as HTMLElement;
    const addMaskMenu = layerRow.querySelector('.add-mask-menu') as HTMLElement;
    addMaskBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = addMaskMenu.style.display !== 'none';
      document.querySelectorAll('.add-mask-menu').forEach(m => (m as HTMLElement).style.display = 'none');
      addMaskMenu.style.display = isVisible ? 'none' : 'block';
    });

    addMaskMenu?.querySelectorAll('.add-mask-option').forEach(optBtn => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = (optBtn as HTMLElement).dataset.type as MaskType;
        addMaskMenu.style.display = 'none';
        this.addSubLayerMask(layer, type);
      });
    });

    // Visibility toggle
    layerRow.querySelector('.layer-toggle-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.enabled = !layer.enabled;
      this.renderLayerTree();
      this.onChange(this.state);
    });

    // Opacity slider
    const opSlider = layerRow.querySelector('.layer-opacity-slider') as HTMLInputElement;
    const opVal = layerRow.querySelector('.layer-opacity-val') as HTMLElement;
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
    layerRow.querySelector('.up-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) {
        const item = this.state.layers.splice(idx, 1)[0];
        this.state.layers.splice(idx - 1, 0, item);
        this.renderLayerTree();
        this.onChange(this.state);
      }
    });

    // Move Down
    layerRow.querySelector('.down-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < this.state.layers.length - 1) {
        const item = this.state.layers.splice(idx, 1)[0];
        this.state.layers.splice(idx + 1, 0, item);
        this.renderLayerTree();
        this.onChange(this.state);
      }
    });

    // Duplicate Layer
    layerRow.querySelector('.dup-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const dup: Layer = JSON.parse(JSON.stringify(layer));
      dup.id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      dup.name = `${layer.name} Copy`;
      this.state.layers.splice(idx, 0, dup);
      this.state.activeLayerId = dup.id;
      this.state.activeMaskId = undefined;
      this.renderLayerTree();
      this.onActiveLayerChanged(dup.id);
      this.onChange(this.state);
    });

    // Delete Layer
    layerRow.querySelector('.del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.state.layers.splice(idx, 1);
      if (this.state.activeLayerId === layer.id) {
        this.state.activeLayerId = this.state.layers[0]?.id || 'base';
        this.state.activeMaskId = undefined;
        this.onActiveLayerChanged(this.state.activeLayerId);
      }
      this.renderLayerTree();
      this.onChange(this.state);
    });

    node.appendChild(layerRow);

    // Render Sub-Layers Tree Children if expanded
    if (isExpanded && layer.masks && layer.masks.length > 0) {
      const subTreeWrap = document.createElement('div');
      subTreeWrap.className = 'sublayers-tree-list';

      layer.masks.forEach((mask, mIdx) => {
        const subRow = this.createSubLayerRow(layer, mask, mIdx);
        subTreeWrap.appendChild(subRow);
      });

      node.appendChild(subTreeWrap);
    }

    return node;
  }

  private addSubLayerMask(layer: Layer, type: MaskType): void {
    if (!layer.masks) layer.masks = [];
    const maskNum = layer.masks.length + 1;
    let name = `Sub-Layer Mask ${maskNum}`;
    if (type === 'brush') name = `Brush Mask ${maskNum}`;
    if (type === 'linear_gradient') name = `Linear Gradient ${maskNum}`;
    if (type === 'radial_gradient') name = `Radial Mask ${maskNum}`;
    if (type === 'color_range') name = `Color Range ${maskNum}`;
    if (type === 'luminance_range') name = `Luminance Range ${maskNum}`;

    const newMask = createDefaultSubLayerMask(type, name);
    layer.masks.push(newMask);
    layer.expanded = true;

    this.state.activeLayerId = layer.id;
    this.state.activeMaskId = newMask.id;

    this.renderLayerTree();
    this.onActiveLayerChanged(layer.id, newMask.id);
    this.onChange(this.state);
  }

  private createSubLayerRow(parentLayer: Layer, mask: SubLayerMask, mIdx: number): HTMLElement {
    const subRow = document.createElement('div');
    const isMaskActive = this.state.activeLayerId === parentLayer.id && this.state.activeMaskId === mask.id;
    subRow.className = `sublayer-item${isMaskActive ? ' active' : ''}${!mask.enabled ? ' disabled' : ''}`;

    let icon = '🖌️';
    if (mask.type === 'linear_gradient') icon = '📐';
    if (mask.type === 'radial_gradient') icon = '⭕';
    if (mask.type === 'color_range') icon = '🎨';
    if (mask.type === 'luminance_range') icon = '💡';

    subRow.innerHTML = `
      <span class="tree-connector">↳</span>
      <span class="sublayer-icon">${icon}</span>
      <span class="sublayer-name" title="Click to select sub-layer mask, double-click to rename">${this.escapeHtml(mask.name)}</span>

      <div class="sublayer-actions">
        <button class="sublayer-act-btn invert-btn${mask.inverted ? ' active' : ''}" title="Invert Sub-Layer Mask">
          ${mask.inverted ? '⇄ Inverted' : '⇄ Invert'}
        </button>
        <button class="sublayer-toggle-btn" title="Toggle Sub-Layer Mask Visibility">
          ${mask.enabled ? '👁️' : '🙈'}
        </button>
        <button class="sublayer-act-btn del-btn danger" title="Delete Sub-Layer Mask">🗑️</button>
      </div>
    `;

    // Select sub-layer
    subRow.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.sublayer-actions')) return;
      this.state.activeLayerId = parentLayer.id;
      this.state.activeMaskId = mask.id;
      this.renderLayerTree();
      this.onActiveLayerChanged(parentLayer.id, mask.id);
    });

    // Double click to rename
    subRow.querySelector('.sublayer-name')?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nameEl = e.currentTarget as HTMLElement;
      const current = mask.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'layer-name-input';
      input.value = current;
      nameEl.replaceWith(input);
      input.focus();

      const commit = () => {
        const val = input.value.trim() || current;
        mask.name = val;
        this.renderLayerTree();
        this.onChange(this.state);
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
      });
    });

    // Invert toggle
    subRow.querySelector('.invert-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      mask.inverted = !mask.inverted;
      this.renderLayerTree();
      this.onChange(this.state);
    });

    // Toggle sub-layer visibility
    subRow.querySelector('.sublayer-toggle-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      mask.enabled = !mask.enabled;
      this.renderLayerTree();
      this.onChange(this.state);
    });

    // Delete sub-layer mask
    subRow.querySelector('.del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      parentLayer.masks.splice(mIdx, 1);
      if (this.state.activeMaskId === mask.id) {
        this.state.activeMaskId = undefined;
        this.onActiveLayerChanged(parentLayer.id);
      }
      this.renderLayerTree();
      this.onChange(this.state);
    });

    return subRow;
  }

  private updateSliderFill(input: HTMLInputElement, val: number): void {
    if (!input) return;
    input.style.background = `linear-gradient(90deg, #0a84ff ${val}%, rgba(255,255,255,0.12) ${val}%)`;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
