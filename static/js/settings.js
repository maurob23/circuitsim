/**
 * Impostazioni CircuitSim — tema, canvas, simulazione, layout.
 * Persistenza: localStorage key "circuitsim-settings"
 */
'use strict';

const SETTINGS_KEY = 'circuitsim-settings';

const SETTINGS_DEFAULTS = {
  theme: 'midnight',
  showGrid: true,
  snapToGrid: true,
  showCompLabels: true,
  confirmDelete: true,
  autoCurrentAnim: true,
  defaultAnalysis: 'ac',
  uiScale: 'normal',
  showRightPanel: true,
  showAnalystPanel: true,
};

const THEMES = [
  { id: 'midnight', label: 'Notte',  hint: 'Blu scuro (predefinito)' },
  { id: 'slate',    label: 'Ardesia', hint: 'Grigio neutro' },
  { id: 'ocean',    label: 'Oceano', hint: 'Blu profondo' },
  { id: 'light',    label: 'Chiaro', hint: 'Sfondo chiaro' },
];

function _applyUiScale(scale) {
  document.body.classList.remove('ui-compact', 'ui-normal', 'ui-large');
  const cls = scale === 'compact' ? 'ui-compact' : scale === 'large' ? 'ui-large' : 'ui-normal';
  document.body.classList.add(cls);
}

function _applyTheme(themeId) {
  const root = document.documentElement;
  if (!themeId || themeId === 'midnight') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', themeId);
  }
  if (typeof window.syncChartThemeFromCss === 'function') {
    window.syncChartThemeFromCss();
  }
}

class CircuitSimSettings {
  constructor() {
    this.prefs = { ...SETTINGS_DEFAULTS };
    this._canvas = null;
    this._load();
    _applyTheme(this.prefs.theme);
    _applyUiScale(this.prefs.uiScale);
  }

  _load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.keys(SETTINGS_DEFAULTS).forEach(k => {
        if (s[k] !== undefined) this.prefs[k] = s[k];
      });
    } catch (_) { /* ignore */ }
  }

  save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.prefs));
    } catch (_) { /* ignore */ }
  }

  get(key) {
    return this.prefs[key];
  }

  set(key, value) {
    if (!(key in SETTINGS_DEFAULTS)) return;
    this.prefs[key] = value;
    this.save();
    this._applyKey(key);
    window.dispatchEvent(new CustomEvent('circuitsim-settings-changed', {
      detail: { key, value, prefs: { ...this.prefs } },
    }));
  }

  bindCanvas(canvas) {
    this._canvas = canvas;
    this._applyCanvasPrefs();
  }

  _applyKey(key) {
    switch (key) {
      case 'theme':
        _applyTheme(this.prefs.theme);
        break;
      case 'uiScale':
        _applyUiScale(this.prefs.uiScale);
        break;
      case 'showGrid':
      case 'snapToGrid':
      case 'showCompLabels':
        this._applyCanvasPrefs();
        break;
      case 'defaultAnalysis':
        this._applyDefaultAnalysis();
        break;
      default:
        break;
    }
  }

  _applyCanvasPrefs() {
    if (!this._canvas) return;
    this._canvas.showGrid = this.prefs.showGrid;
    this._canvas.snapToGrid = this.prefs.snapToGrid;
    this._canvas.showCompLabels = this.prefs.showCompLabels;
    this._canvas.render();
  }

  _applyDefaultAnalysis() {
    const v = this.prefs.defaultAnalysis;
    const radio = document.querySelector(`input[name="analysis"][value="${v}"]`);
    if (radio) radio.checked = true;
    radio?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  applyAll() {
    _applyTheme(this.prefs.theme);
    _applyUiScale(this.prefs.uiScale);
    this._applyCanvasPrefs();
    this._applyDefaultAnalysis();
    window.dispatchEvent(new CustomEvent('circuitsim-settings-changed', {
      detail: { key: 'all', prefs: { ...this.prefs } },
    }));
  }

  /** Usato da app.js al primo avvio se non ci sono preferenze layout salvate. */
  getLayoutDefaults() {
    return {
      right: this.prefs.showRightPanel,
      analyst: this.prefs.showAnalystPanel,
    };
  }

  shouldConfirmDelete() {
    return !!this.prefs.confirmDelete;
  }

  shouldAutoCurrentAnim() {
    return !!this.prefs.autoCurrentAnim;
  }

  initPanel() {
    const root = document.getElementById('settings-panel');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    const themeRow = root.querySelector('.settings-theme-swatches');
    THEMES.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-theme-btn';
      btn.dataset.theme = t.id;
      btn.title = t.hint;
      btn.innerHTML = `<span class="settings-theme-swatch settings-theme-swatch--${t.id}"></span><span class="settings-theme-label">${t.label}</span>`;
      btn.addEventListener('click', () => {
        this.set('theme', t.id);
        this._syncThemeButtons(themeRow);
      });
      themeRow.appendChild(btn);
    });
    this._syncThemeButtons(themeRow);

    root.querySelectorAll('[data-setting]').forEach(el => {
      const key = el.dataset.setting;
      if (el.type === 'checkbox') {
        el.checked = !!this.prefs[key];
        el.addEventListener('change', () => this.set(key, el.checked));
      } else if (el.tagName === 'SELECT') {
        el.value = this.prefs[key];
        el.addEventListener('change', () => this.set(key, el.value));
      }
    });

    document.getElementById('settings-reset')?.addEventListener('click', () => {
      if (!confirm('Ripristinare tutte le impostazioni ai valori predefiniti?')) return;
      this.prefs = { ...SETTINGS_DEFAULTS };
      this.save();
      this.applyAll();
      root.querySelectorAll('[data-setting]').forEach(el => {
        const key = el.dataset.setting;
        if (el.type === 'checkbox') el.checked = !!this.prefs[key];
        else if (el.tagName === 'SELECT') el.value = this.prefs[key];
      });
      this._syncThemeButtons(themeRow);
    });
  }

  _syncThemeButtons(row) {
    if (!row) return;
    row.querySelectorAll('.settings-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === this.prefs.theme);
    });
  }
}

window.CircuitSimSettings = CircuitSimSettings;

function initCircuitSimSettings(canvas) {
  if (!window.circuitSimSettings) {
    window.circuitSimSettings = new CircuitSimSettings();
  }
  if (canvas) window.circuitSimSettings.bindCanvas(canvas);
  window.circuitSimSettings.initPanel();
  return window.circuitSimSettings;
}
