/**
 * app.js — Main application logic per CircuitSim MVP.
 *
 * Tipi di analisi gestiti:
 *   ac          → Bode plot (pannello destro + V(f) in basso)
 *   transient   → Risposta al gradino (V(t) in basso)
 *   sinusoidal  → Vin(t) e Vout(t) sovrapposti in basso (transitorio + regime)
 */

'use strict';

if (!window.CIRCUIT_COMPONENT_REGISTRY) {
  throw new Error('CircuitSim component registry not loaded');
}

// ─── Palette colori nodi ─────────────────────────────────────────────────────
// Ogni nodo elettrico ha un colore fisso usato SIA sul canvas SIA nei grafici.
const NODE_COLORS = {
  n1:  '#58a6ff',   // blu   — nodo ingresso / sorgente
  n2:  '#3fb950',   // verde — nodo uscita principale
  n3:  '#e3b341',   // ambra
  n4:  '#a371f7',   // viola
  n5:  '#f0883e',   // arancione
  gnd: '#6e7681',   // grigio
};
/** Ritorna il colore per un nome nodo; fallback a bianco sporco. */
function nodeColor(name) {
  return NODE_COLORS[name] ?? '#c9d1d9';
}
/** Colore del nodo di ingresso (n1). */
const C_IN  = NODE_COLORS.n1;
/** Colore del nodo di uscita (n2). */
const C_OUT = NODE_COLORS.n2;

// ─── Subsystem init ───────────────────────────────────────────────────────────

const canvas    = new CircuitCanvas(document.getElementById('circuit-canvas'));
const bode      = new BodePlot('chart-magnitude', 'chart-phase');
const transient = new TransientPlot('chart-transient');
const animator  = new CurrentAnimator(canvas);

// ─── Layout: nascondi pannelli / modalità disegno ────────────────────────────

const _layout = { focus: false, right: true, analyst: true };

function _loadLayoutPrefs() {
  try {
    const raw = localStorage.getItem('circuitsim-layout');
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.focus === 'boolean')   _layout.focus   = s.focus;
      if (typeof s.right === 'boolean')   _layout.right   = s.right;
      if (typeof s.analyst === 'boolean') _layout.analyst = s.analyst;
      return;
    }
  } catch (_) { /* ignore */ }
  const defs = window.circuitSimSettings?.getLayoutDefaults?.();
  if (defs) {
    if (typeof defs.right === 'boolean')   _layout.right   = defs.right;
    if (typeof defs.analyst === 'boolean') _layout.analyst = defs.analyst;
  }
}

function _refreshChartsTheme() {
  window.syncChartThemeFromCss?.();
  window.applyChartTheme?.(vfChart);
  window.applyChartTheme?.(vtChart);
  window.applyChartTheme?.(_expandChart);
  bode?.refreshTheme?.();
  transient?.refreshTheme?.();
}

function _saveLayoutPrefs() {
  try {
    localStorage.setItem('circuitsim-layout', JSON.stringify(_layout));
  } catch (_) { /* ignore */ }
}

function _closePanelsForFocus() {
  const bp = document.getElementById('bottom-panel');
  const be = document.getElementById('bode-expand-panel');
  const sp = document.getElementById('oscilloscope-panel');
  if (bp) bp.style.display = 'none';
  if (be) be.style.display = 'none';
  if (sp) sp.style.display = 'none';
  if (typeof _expandChart !== 'undefined' && _expandChart) {
    _expandChart.destroy();
    _expandChart = null;
  }
}

function _applyLayout() {
  const hideRight   = !_layout.right   || _layout.focus;
  const hideAnalyst = !_layout.analyst || _layout.focus;
  document.body.classList.toggle('layout-focus', _layout.focus);
  document.body.classList.toggle('hide-panel-right', hideRight);
  document.body.classList.toggle('hide-panel-analyst', hideAnalyst);

  if (_layout.focus) _closePanelsForFocus();

  const ft = document.getElementById('focus-toolbar');
  if (ft) ft.setAttribute('aria-hidden', _layout.focus ? 'false' : 'true');

  const btnFocus   = document.getElementById('btn-layout-focus');
  const btnRight   = document.getElementById('btn-toggle-right');
  const btnAnalyst = document.getElementById('btn-toggle-analyst');
  btnFocus?.classList.toggle('layout-active', _layout.focus);
  btnRight?.classList.toggle('panel-off', hideRight);
  btnAnalyst?.classList.toggle('panel-off', hideAnalyst);
  if (btnFocus)   btnFocus.title   = _layout.focus ? 'Esci — ripristina tutti i pannelli' : 'Massimo spazio: solo canvas + componenti';
  if (btnRight)   btnRight.title   = hideRight ? 'Mostra grafici (destra)' : 'Nascondi grafici (destra)';
  if (btnAnalyst) btnAnalyst.title = hideAnalyst ? 'Mostra assistente' : 'Nascondi assistente';
}

function _setLayoutFocus(on) {
  _layout.focus = on;
  if (on) { _layout.right = false; _layout.analyst = false; }
  _saveLayoutPrefs();
  _applyLayout();
}

function _initSidebarCollapsibles() {
  document.querySelectorAll('.sidebar-collapsible .sidebar-sec-toggle').forEach(title => {
    const sec = title.closest('.sidebar-collapsible');
    if (!sec) return;
    title.addEventListener('click', () => sec.classList.toggle('collapsed'));
  });
}

function _initLayoutControls() {
  _loadLayoutPrefs();
  _initSidebarCollapsibles();
  _applyLayout();

  document.getElementById('btn-layout-focus')?.addEventListener('click', () => {
    _setLayoutFocus(!_layout.focus);
  });

  document.getElementById('focus-exit')?.addEventListener('click', () => _setLayoutFocus(false));
  document.getElementById('focus-simulate')?.addEventListener('click', () => {
    document.getElementById('btn-simulate')?.click();
  });
  document.getElementById('focus-nodes')?.addEventListener('click', () => {
    document.getElementById('btn-show-nodes')?.click();
  });
  document.querySelectorAll('#focus-toolbar [data-tool]').forEach(btn => {
    btn.addEventListener('click', () => _activateTool(btn.dataset.tool, btn));
  });

  document.getElementById('btn-toggle-right')?.addEventListener('click', () => {
    if (_layout.focus) _layout.focus = false;
    _layout.right = !_layout.right;
    _saveLayoutPrefs();
    _applyLayout();
  });

  document.getElementById('btn-toggle-analyst')?.addEventListener('click', () => {
    if (_layout.focus) _layout.focus = false;
    _layout.analyst = !_layout.analyst;
    _saveLayoutPrefs();
    _applyLayout();
  });

  document.getElementById('rail-right')?.addEventListener('click', () => {
    _layout.focus = false;
    _layout.right = true;
    _saveLayoutPrefs();
    _applyLayout();
  });

  document.getElementById('rail-analyst')?.addEventListener('click', () => {
    _layout.focus = false;
    _layout.analyst = true;
    _saveLayoutPrefs();
    _applyLayout();
  });

  document.getElementById('rail-left-extra')?.addEventListener('click', () => {
    _layout.focus = false;
    _saveLayoutPrefs();
    _applyLayout();
    document.getElementById('sec-analisi')?.classList.remove('collapsed');
  });
}

// ─── Pannelli collassabili sidebar destro ────────────────────────────────────

function _makeSidebarToggle(toggleId, bodyId, chevronId) {
  const btn     = document.getElementById(toggleId);
  const body    = document.getElementById(bodyId);
  const chevron = document.getElementById(chevronId);
  if (!btn || !body || !chevron) return;
  let open = true;
  btn.addEventListener('click', () => {
    open = !open;
    body.style.display = open ? '' : 'none';
    chevron.classList.toggle('open', open);
  });
}
_makeSidebarToggle('bode-mag-toggle',   'bode-mag-body',   'bode-mag-chevron');
_makeSidebarToggle('bode-phase-toggle', 'bode-phase-body', 'bode-phase-chevron');

// ─── Bode espanso ─────────────────────────────────────────────────────────────

let _expandChart = null;   // istanza Chart.js nel pannello grande
let _lastAcData  = null;   // ultimi dati AC per il re-render

const _expandPanel = document.getElementById('bode-expand-panel');
const _expandTitle = document.getElementById('bode-expand-title');

function _openExpandedBode(mode) {   // mode = 'mag' | 'phase'
  if (!_lastAcData) return;
  _expandTitle.textContent = mode === 'mag' ? 'Bode plot — Ampiezza (dB)' : 'Bode plot — Fase (°)';
  _expandPanel.style.display = 'flex';

  // Distruggi istanza precedente se esiste
  if (_expandChart) { _expandChart.destroy(); _expandChart = null; }

  const canvas = document.getElementById('chart-bode-expand');
  const { frequencies, magnitude_db, phase_deg } = _lastAcData;
  const yData   = mode === 'mag' ? magnitude_db : phase_deg;
  const yLabel  = mode === 'mag' ? 'Ampiezza (dB)' : 'Fase (°)';
  const color   = mode === 'mag' ? '#3fb950' : '#58a6ff';
  const T = window.CHART_THEME || { tick: '#e6edf3', axisTitle: '#f4f6f8', legend: '#d8dee4', grid: '#2d3a52', border: '#484f58', font: 'JetBrains Mono, monospace', tickSize: 10, titleSize: 11 };

  // Resetta dimensioni esplicite dal render precedente
  canvas.removeAttribute('width');
  canvas.removeAttribute('height');

  _expandChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [{
        label: yLabel,
        data: frequencies.map((f, i) => ({ x: f, y: yData[i] })).filter(p => isFinite(p.x) && isFinite(p.y)),
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Frequenza (Hz)', color: T.axisTitle, font: { size: T.titleSize, family: T.font } },
          ticks: { color: T.tick, font: { size: T.tickSize, family: T.font },
            callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
          grid: { color: T.grid },
          border: { color: T.border },
        },
        y: {
          title: { display: true, text: yLabel, color: T.axisTitle, font: { size: T.titleSize, family: T.font } },
          ticks: { color: T.tick, font: { size: T.tickSize, family: T.font } },
          grid: { color: T.grid },
          border: { color: T.border },
        }
      },
      plugins: {
        legend: { labels: { color: T.legend, font: { size: 11, family: T.font } } },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
          pan:  { enabled: true, mode: 'x' },
        }
      }
    }
  });

  // Auto-adatta alle dimensioni reali del contenitore dopo il layout
  requestAnimationFrame(() => { if (_expandChart) _expandChart.resize(); });
}

document.getElementById('btn-expand-mag')  .addEventListener('click', e => { e.stopPropagation(); _openExpandedBode('mag'); });
document.getElementById('btn-expand-phase').addEventListener('click', e => { e.stopPropagation(); _openExpandedBode('phase'); });
document.getElementById('btn-bode-expand-close').addEventListener('click', () => {
  _expandPanel.style.display = 'none';
  if (_expandChart) { _expandChart.destroy(); _expandChart = null; }
});

// ─── Help componenti + guida contestuale ──────────────────────────────────────

const compHelpModal = new CompHelpModal();
const contextHelp   = new ContextHelp('analyst-hover-title', 'analyst-hover-text');
contextHelp.bind();
contextHelp.reset();

document.querySelectorAll('.comp-help-btn[data-help]').forEach(btn => {
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    e.preventDefault();
    compHelpModal.open(btn.dataset.help);
  });
});

// ─── Calcolatrice ─────────────────────────────────────────────────────────────

const calculator = new Calculator();
document.getElementById('btn-open-calc')?.addEventListener('click', () => calculator.open());

const capConverter = new CapConverterTool();
const filterCalc   = new FilterCalcTool();
const freqMeter    = new FreqMeterTool();
const translator   = new TranslatorTool();
document.getElementById('btn-open-cap-conv')?.addEventListener('click', () => capConverter.open());
document.getElementById('btn-open-filter-calc')?.addEventListener('click', () => filterCalc.open());
document.getElementById('btn-open-freq-meter')?.addEventListener('click', () => freqMeter.open());
document.getElementById('btn-open-translator')?.addEventListener('click', () => translator.open());

window.circuitSimGetMetrics = () => _lastSimState?.metrics ?? null;
window.circuitSimGetAnalysisType = () => _lastSimState?.analysisType ?? null;

// ─── SimAnalyst ──────────────────────────────────────────────────────────────

const analyst      = new SimAnalyst('analyst-content');
const _analystPanel = document.getElementById('analyst-panel');
const _ctxBadge     = document.getElementById('analyst-ctx-badge');

// Ultimo stato simulazione memorizzato per il re-render contestuale
let _lastSimState = null;   // { analysisType, metrics, components }

const CTX_LABEL = {
  circuit:   'Circuito',
  'bode-mag': 'Bode Amp',
  'bode-phase': 'Bode Fase',
  transient:  'Transitorio',
  sine:       'Sinusoide',
  scope:      'Scope',
  vt:         'V(t)',
};

// Mappa contesto → tipo analisi usato da SimAnalyst
const CTX_TYPE = {
  circuit:     null,         // usa l'ultimo tipo simulato
  'bode-mag':  'ac',
  'bode-phase':'ac',
  transient:   'transient',
  sine:        'sinusoidal',
  scope:       'sinusoidal',
  vt:          null,
};

function _focusAnalyst(context) {
  if (!_lastSimState) return;

  const type = CTX_TYPE[context] ?? _lastSimState.analysisType;
  analyst.analyze(type, _lastSimState.metrics, _lastSimState.components);

  // Badge contesto
  _ctxBadge.textContent = CTX_LABEL[context] ?? context;
  _ctxBadge.classList.add('visible');

  // Flash border
  _analystPanel.classList.remove('flash');
  void _analystPanel.offsetWidth;   // reflow per riavviare animazione
  _analystPanel.classList.add('flash');
  setTimeout(() => _analystPanel.classList.remove('flash'), 750);
}

// ─── Click handler su canvas e grafici ───────────────────────────────────────

function _attachAnalystTriggers() {
  // Circuito
  const schematicEl = document.getElementById('schematic-canvas');
  if (schematicEl) schematicEl.addEventListener('click', () => _focusAnalyst('circuit'));

  // Bode magnitude
  const magCanvas = document.getElementById('chart-magnitude');
  if (magCanvas) magCanvas.addEventListener('click', () => _focusAnalyst('bode-mag'));

  // Bode phase
  const phaseCanvas = document.getElementById('chart-phase');
  if (phaseCanvas) phaseCanvas.addEventListener('click', () => _focusAnalyst('bode-phase'));

  // Transient chart
  const transCanvas = document.getElementById('chart-transient');
  if (transCanvas) transCanvas.addEventListener('click', () => _focusAnalyst('transient'));

  // Oscilloscope canvas
  const scopeCanvas = document.getElementById('scope-canvas');
  if (scopeCanvas) scopeCanvas.addEventListener('click', () => _focusAnalyst('scope'));

  // V(t) chart
  const vtCanvas = document.getElementById('chart-vt');
  if (vtCanvas) vtCanvas.addEventListener('click', () => _focusAnalyst('vt'));

  // Bode espanso
  const expandCanvas = document.getElementById('chart-bode-expand');
  if (expandCanvas) expandCanvas.addEventListener('click', () => _focusAnalyst('bode-mag'));
}

_attachAnalystTriggers();

// ─── Sync palette / toolbar quando il tool cambia via shortcut ───────────────

document.getElementById('circuit-canvas').addEventListener('toolchange', e => {
  const tool = e.detail;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
  const match = document.querySelector(`[data-tool="${tool}"]`);
  if (match) match.classList.add('active');
});

// ─── Oscilloscopio ───────────────────────────────────────────────────────────

const scope = new Oscilloscope('scope-canvas', 'oscilloscope-panel');
let _scopeNodeTraces = {};   // ultime tracce disponibili (aggiornate dopo ogni simulazione)

document.getElementById('btn-oscilloscope').addEventListener('click', () => scope.toggle());
document.getElementById('btn-scope-close') .addEventListener('click', () => scope.show(false));
document.getElementById('btn-scope-auto')  .addEventListener('click', () => {
  _scopeAutoScale();
  scope.draw();
});

// Toggle grafico V(t): permette di nasconderlo quando si usa solo lo scope
const _vtPanel     = document.getElementById('vt-panel');
const _bottomPanel = document.getElementById('bottom-panel');
const _btnTogVt    = document.getElementById('btn-toggle-vt');
let   _vtVisible   = false;
if (_btnTogVt) {
  _btnTogVt.style.opacity = '0.4';
  _btnTogVt.title = 'Mostra grafico V(t)';
}
_btnTogVt?.addEventListener('click', () => {
  _vtVisible = !_vtVisible;
  _vtPanel.style.display     = _vtVisible ? '' : 'none';
  _bottomPanel.style.display = _vtVisible ? '' : 'none';
  _btnTogVt.style.opacity    = _vtVisible ? '1' : '0.4';
  _btnTogVt.title            = _vtVisible ? 'Nascondi grafico V(t)' : 'Mostra grafico V(t)';
});

// Canali CH1–CH4: sync dropdown e vdiv
[1, 2, 3, 4].forEach(ch => {
  const sel   = document.getElementById(`scope-ch${ch}-node`);
  const vdiv  = document.getElementById(`scope-ch${ch}-vdiv`);
  if (sel)  sel .addEventListener('change', () => {
    scope.setChannel(ch - 1, sel.value || null);
    scope.setData(scope.times, _scopeNodeTraces);
  });
  if (vdiv) vdiv.addEventListener('change', () => {
    scope.channels[ch - 1].vdiv = parseFloat(vdiv.value) || 1.0;
    scope.draw();
  });
});

document.getElementById('scope-tdiv').addEventListener('change', e => {
  scope.tdiv = parseFloat(e.target.value) || 1.0;
  scope.draw();
});

/**
 * Auto-scala V/div per ogni canale attivo in base all'ampiezza del segnale.
 * Usa il valore "nice" più piccolo che sia >= ampiezza/3.5 (con margine 12.5%)
 * in modo che il segnale non tocchi mai i bordi del display.
 */
const _NICE_VDIV = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
function _scopeAutoScale() {
  scope.channels.forEach((ch, ci) => {
    if (!ch.nodeId) return;
    const trace = _scopeNodeTraces[ch.nodeId];
    if (!trace || trace.length === 0) return;
    const maxAbs = Math.max(...trace.map(v => Math.abs(v)));
    if (maxAbs === 0) return;
    // Il display ha 8 divisioni (±4 dal centro).
    // Vogliamo che l'ampiezza occupi al massimo 3.5 divisioni (margine 12.5%).
    const minVdiv = maxAbs / 3.5;
    // Ceiling: primo valore >= minVdiv
    const best = _NICE_VDIV.find(v => v >= minVdiv) ?? _NICE_VDIV[_NICE_VDIV.length - 1];
    scope.channels[ci].vdiv = best;
    const vdivEl = document.getElementById(`scope-ch${ci + 1}-vdiv`);
    if (vdivEl) vdivEl.value = String(best);
  });
}

/** Popola i dropdown dei canali con i nodi disponibili. */
function _updateScopeNodeSelectors(nodeNames) {
  [1, 2, 3, 4].forEach(ch => {
    const sel = document.getElementById(`scope-ch${ch}-node`);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— off —</option>';
    nodeNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n; opt.textContent = n;
      if (n === prev) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

// ─── Bottom panel charts ──────────────────────────────────────────────────────

let vtChart = null;
let vfChart = null;

function bottomOpts(xOpts, yOpts) {
  const T = window.CHART_THEME || { tick: '#e6edf3', axisTitle: '#f4f6f8', legend: '#d8dee4', grid: '#2d3a52', border: '#484f58', font: 'JetBrains Mono, monospace', tickSize: 10, titleSize: 11 };
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 120 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: { color: T.legend, boxWidth: 10, padding: 6,
                  font: { size: 10, family: T.font } },
      },
      tooltip: {
        backgroundColor: '#161b22', borderColor: '#30363d', borderWidth: 1,
        titleColor: '#e6edf3', bodyColor: '#c9d1d9',
        titleFont: { size: 10, family: 'JetBrains Mono, monospace' },
        bodyFont:  { size: 10, family: 'JetBrains Mono, monospace' },
      },
      zoom: {
        zoom: {
          wheel:  { enabled: true, speed: 0.1 },
          pinch:  { enabled: true },
          mode:   'xy',
        },
        pan: {
          enabled: true,
          mode:    'xy',
        },
        limits: {
          x: { min: 'original', max: 'original', minRange: 0.0001 },
          y: { min: 'original', max: 'original', minRange: 0.001  },
        },
      },
    },
    scales: {
      x: { grid: { color: T.gridFaint || T.grid },
           border: { color: T.border },
           ticks: { color: T.tick, maxTicksLimit: 7,
                    font: { size: T.tickSize, family: T.font } },
           ...xOpts },
      y: { grid: { color: T.gridFaint || T.grid },
           border: { color: T.border },
           ticks: { color: T.tick, maxTicksLimit: 6,
                    font: { size: T.tickSize, family: T.font } },
           ...yOpts },
    },
  };
  return base;
}

function initBottomCharts() {
  const T = window.CHART_THEME || {
    tick: '#e6edf3', axisTitle: '#f4f6f8', legend: '#d8dee4',
    grid: '#2d3a52', border: '#484f58', font: 'JetBrains Mono, monospace',
    tickSize: 10, titleSize: 11,
  };

  vtChart = new Chart(document.getElementById('chart-vt'), {
    type: 'scatter',
    data: { datasets: [] },
    options: bottomOpts(
      { title: { display: true, text: 'Tempo (ms)', color: T.axisTitle, font: { size: T.titleSize, family: T.font } } },
      { title: { display: true, text: 'V (volt)',   color: T.axisTitle, font: { size: T.titleSize, family: T.font } },
        suggestedMin: -1.3, suggestedMax: 1.3 }
    ),
  });

  vfChart = new Chart(document.getElementById('chart-vf'), {
    type: 'scatter',
    data: { datasets: [] },
    options: bottomOpts(
      { type: 'logarithmic',
        title: { display: true, text: 'Frequenza (Hz)', color: T.axisTitle, font: { size: T.titleSize, family: T.font } },
        min: 10, max: 100_000,
        ticks: { color: T.tick, maxTicksLimit: 6,
                 font: { size: T.tickSize, family: T.font },
                 callback: v => ({ 10:'10',100:'100',1000:'1k',10000:'10k',100000:'100k' }[v] ?? '') } },
      { title: { display: true, text: 'Ampiezza (dB)', color: T.axisTitle, font: { size: T.titleSize, family: T.font } },
        suggestedMin: -60, suggestedMax: 5 }
    ),
  });

  // Pulsanti reset zoom
  document.getElementById('zoom-reset-vt').addEventListener('click', () => vtChart.resetZoom());
  document.getElementById('zoom-reset-vf').addEventListener('click', () => vfChart.resetZoom());
}

// ─── Dataset helpers ──────────────────────────────────────────────────────────

function setDS(chart, label, pts, color, dash = [], width = 2) {
  const ex = chart.data.datasets.find(d => d.label === label);
  if (ex) { ex.data = pts; ex.borderColor = color; ex.borderDash = dash; }
  else {
    chart.data.datasets.push({
      label, data: pts, showLine: true,
      borderColor: color, backgroundColor: 'transparent',
      borderWidth: width, borderDash: dash, pointRadius: 0, tension: 0,
    });
  }
  chart.update('none');
}

function removeDS(chart, label) {
  const i = chart.data.datasets.findIndex(d => d.label === label);
  if (i >= 0) { chart.data.datasets.splice(i, 1); chart.update('none'); }
}

function clearAllDS(chart) {
  chart.data.datasets = [];
  chart.update('none');
}

// ─── Analytical previews ──────────────────────────────────────────────────────

/** V(t) gradino analitico */
function updateVtStep(R, C, Vin = 1) {
  const tau    = R * C;
  const tEndMs = 5 * tau * 1000;
  const n      = 400;

  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * tEndMs;
    return { x: t, y: Vin * (1 - Math.exp(-t / (tau * 1000))) };
  });

  clearAllDS(vtChart);
  setDS(vtChart, 'V(t) gradino', pts, C_OUT, [5, 4]);
  setDS(vtChart, 'τ = ' + (tau * 1000).toFixed(3) + ' ms',
    [{ x: tau * 1000, y: 0 }, { x: tau * 1000, y: Vin * 1.05 }],
    'rgba(210,153,34,0.5)', [3, 3], 1);

  vtChart.options.scales.y.suggestedMin = -0.1;
  vtChart.options.scales.y.suggestedMax = Vin * 1.15;
  vtChart.options.scales.x.max = tEndMs;
  vtChart.update('none');

  setBadge('badge-vt', 'analitico', false);
}

/** V(t) sinusoide analitica (regime permanente) */
function updateVtSine(R, C, freq, amplitude, periods) {
  const tau     = R * C;
  const T       = 1 / freq;
  const tEndMs  = periods * T * 1000;
  const H_mag   = 1 / Math.sqrt(1 + (2 * Math.PI * freq * tau) ** 2);
  const H_phase = -Math.atan(2 * Math.PI * freq * tau);   // rad
  const ppc     = 60;
  const n       = Math.max(120, Math.round(periods * ppc));

  const ptsIn  = [];
  const ptsOut = [];

  for (let i = 0; i <= n; i++) {
    const t_ms = (i / n) * tEndMs;
    const t_s  = t_ms / 1000;
    ptsIn.push({ x: t_ms, y: amplitude * Math.sin(2 * Math.PI * freq * t_s) });
    ptsOut.push({ x: t_ms, y: amplitude * H_mag * Math.sin(2 * Math.PI * freq * t_s + H_phase) });
  }

  clearAllDS(vtChart);
  setDS(vtChart, 'Vin(t)',      ptsIn,  C_IN,  [5, 4]);
  setDS(vtChart, 'Vout regime', ptsOut, C_OUT, [5, 4]);

  vtChart.options.scales.y.suggestedMin = -(amplitude * 1.3);
  vtChart.options.scales.y.suggestedMax =  (amplitude * 1.3);
  vtChart.options.scales.x.min = 0;
  vtChart.options.scales.x.max = tEndMs;
  vtChart.update('none');

  // Info badge
  const gainDb  = 20 * Math.log10(H_mag);
  const phaseDeg = H_phase * (180 / Math.PI);
  updateSineInfo(freq, gainDb, phaseDeg, tau);
  setBadge('badge-vt', 'analitico · regime', false);
}

/** V(f) Bode magnitude analitico */
function updateVfAnalytical(R, C, fStart = 10, fStop = 100_000) {
  const tau = R * C;
  const fc  = 1 / (2 * Math.PI * tau);
  const n   = 300;
  const dec = Math.log10(fStop / fStart);

  const pts = Array.from({ length: n }, (_, i) => {
    const f   = fStart * 10 ** (i / (n - 1) * dec);
    const wRC = 2 * Math.PI * f * tau;
    return { x: f, y: 20 * Math.log10(1 / Math.sqrt(1 + wRC * wRC)) };
  });

  setDS(vfChart, 'V(f) analitico', pts, C_OUT, [5, 4]);
  setDS(vfChart, 'fc = ' + fc.toFixed(0) + ' Hz',
    [{ x: fc, y: -65 }, { x: fc, y: 5 }],
    'rgba(210,153,34,0.45)', [3, 3], 1);

  vfChart.options.scales.x.min = fStart;
  vfChart.options.scales.x.max = fStop;
  vfChart.update('none');
  setBadge('badge-vf', 'analitico', false);
}

function updateSineInfo(freq, gainDb, phaseDeg, tau) {
  const el  = document.getElementById('sine-info');
  if (!el) return;
  const fc  = 1 / (2 * Math.PI * tau);
  const rel = freq < fc ? 'f << fc (passa)' : freq > fc * 3 ? 'f >> fc (attenua)' : 'f ≈ fc (transizione)';
  el.innerHTML =
    `f = ${freq.toFixed(1)} Hz &nbsp;|&nbsp; fc = ${fc.toFixed(0)} Hz<br>` +
    `Guadagno = ${gainDb.toFixed(2)} dB &nbsp;|&nbsp; φ = ${phaseDeg.toFixed(1)}°<br>` +
    `<span style="color:var(--blue)">${rel}</span>`;
}

function setBadge(id, text, isMna) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'bottom-badge' + (isMna ? ' mna' : '');
}

// ─── Palette componenti — accordion toggle ────────────────────────────────────

function _isManualButtonEvent(e) {
  return e.target?.closest?.('.comp-cat-manual-btn')
    || e.composedPath?.().some(el => el?.classList?.contains?.('comp-cat-manual-btn'));
}

document.querySelectorAll('.comp-cat-header').forEach(header => {
  header.addEventListener('click', e => {
    if (_isManualButtonEvent(e)) return;
    header.closest('.comp-cat')?.classList.toggle('open');
  });
  header.querySelector('.comp-cat-chevron')?.addEventListener('click', e => {
    e.stopPropagation();
    header.closest('.comp-cat')?.classList.toggle('open');
  });
  header.querySelector('.comp-cat-title')?.addEventListener('click', e => {
    e.stopPropagation();
    header.closest('.comp-cat')?.classList.toggle('open');
  });
});

function _syncPaletteWithRegistry() {
  document.querySelectorAll('.comp-item[data-tool]').forEach(btn => {
    const spec = window.CIRCUIT_COMPONENT_REGISTRY[btn.dataset.tool];
    if (!spec) return;
    const label = btn.querySelector('.comp-item-name');
    if (label) label.textContent = spec.label;
  });
}

function _initManualLinks() {
  const manuals = window.CIRCUIT_MANUAL_REGISTRY || {};
  const stopManualEvent = e => {
    if (!_isManualButtonEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  ['pointerdown', 'mousedown', 'mouseup', 'dblclick'].forEach(eventName => {
    document.addEventListener(eventName, stopManualEvent, true);
  });

  document.addEventListener('click', async e => {
    const btn = e.target?.closest?.('.comp-cat-manual-btn[data-manual-topic]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const manual = manuals[btn.dataset.manualTopic];
    if (!manual?.url) {
      setStatus('Manuale non configurato per questa sezione', 'warn');
      return;
    }

    try {
      const resp = await fetch('/api/manual/open/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: btn.dataset.manualTopic }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        window.open(manual.url, '_blank', 'noopener');
        setStatus(data.error || 'Apro il manuale nel browser', 'warn');
        return;
      }
      setStatus(`Manuale aperto: ${manual.title}`, 'ok');
    } catch (_err) {
      window.open(manual.url, '_blank', 'noopener');
      setStatus('Backend non raggiungibile: apro il manuale nel browser', 'warn');
    }
  }, true);

  document.querySelectorAll('.comp-cat-manual-btn[data-manual-topic]').forEach(btn => {
    btn.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      btn.click();
    });
  });
}

_syncPaletteWithRegistry();
_initManualLinks();

// ─── Attivazione tool (toolbar + palette) ─────────────────────────────────────

const TOOL_MSGS = {
  select: 'Seleziona / trascina: E per ruotare',
  wire:   'Filo: clicca nodo iniziale poi nodo finale',
  delete: 'Elimina: clicca su un componente o filo',
  text:   'Testo: clicca sulla canvas per inserire un\'etichetta (T)',
  ...Object.fromEntries(
    Object.entries(window.CIRCUIT_COMPONENT_REGISTRY).map(([type, spec]) => [type, spec.toolMessage || spec.label])
  ),
};

function _activateTool(tool, btn) {
  if (btn && btn.disabled) return;
  canvas.setTool(tool);
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (TOOL_MSGS[tool]) setStatus(TOOL_MSGS[tool]);
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

document.getElementById('toolbar').addEventListener('click', e => {
  const btn = e.target.closest('[data-tool]');
  if (!btn) return;
  _activateTool(btn.dataset.tool, btn);
});

// ─── Palette componenti — selezione item ──────────────────────────────────────

document.querySelector('.comp-palette-section')?.addEventListener('click', e => {
  if (e.target.closest('.comp-help-btn')) return;
  const btn = e.target.closest('.comp-item[data-tool]');
  if (!btn || btn.disabled) return;
  _activateTool(btn.dataset.tool, btn);
});


document.getElementById('btn-example').addEventListener('click', () => {
  canvas.loadExample();
  _activateTool('select', document.querySelector('[data-tool="select"]'));
  updateAnalyticalFromSliders();
  setStatus('Circuito RC caricato — fc = 338 Hz, τ = 0.47 ms');
});

document.getElementById('btn-zoom-in') .addEventListener('click', () => canvas.zoomBy(1.25));
document.getElementById('btn-zoom-out').addEventListener('click', () => canvas.zoomBy(0.8));
document.getElementById('btn-zoom-fit').addEventListener('click', () => canvas.fitAll());

// ─── Salva circuito ───────────────────────────────────────────────────────
document.getElementById('btn-save-circuit').addEventListener('click', () => {
  const data = canvas.exportCircuit();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `circuitsim_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Circuito salvato come file JSON.');
});

// ─── Carica circuito ──────────────────────────────────────────────────────
document.getElementById('btn-load-circuit').addEventListener('click', () => {
  document.getElementById('file-input-circuit').click();
});
document.getElementById('file-input-circuit').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (canvas.importCircuit(data)) {
        setStatus(`Circuito caricato: ${file.name}`);
        animator.stop(); showAnimControls(false);
        canvas.clearNodeOverlay(); _probeNode = null;
        document.getElementById('badge-probe').style.display = 'none';
        clearAllDS(vfChart); clearAllDS(vtChart);
        updateNetlistPreview();
      } else {
        setStatus('File non valido — formato circuito non riconosciuto.', 'error');
      }
    } catch {
      setStatus('Errore nel parsing del file JSON.', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';   // reset per permettere ricaricamento dello stesso file
});

document.getElementById('btn-clear').addEventListener('click', () => {
  animator.stop();
  showAnimControls(false);
  canvas.clearNodeOverlay();
  canvas._selectedNode = null;
  _probeNode = null;
  document.getElementById('badge-probe').style.display = 'none';
  canvas.clearAll();
  bode.clearMna();
  clearAllDS(vfChart); clearAllDS(vtChart);
  clearMetrics();
  setStatus('Canvas vuoto');
});

// ─── Pausa / Riprendi animazione ──────────────────────────────────────────────

document.getElementById('btn-pause-anim').addEventListener('click', () => {
  animator.togglePause();
  _syncPauseBtn();
});

document.getElementById('btn-stop-anim').addEventListener('click', () => {
  animator.stop();
  showAnimControls(false);
  setStatus('Animazione corrente fermata');
});

function _syncPauseBtn() {
  const paused = animator.paused;
  document.getElementById('pause-icon').style.display  = paused ? 'none' : '';
  document.getElementById('resume-icon').style.display = paused ? '' : 'none';
  document.getElementById('pause-label').textContent   = paused ? 'Riprendi' : 'Pausa';
}

// Slider velocità corrente
(function () {
  const slider = document.getElementById('anim-speed');
  const label  = document.getElementById('anim-speed-val');
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    label.textContent = v + '×';
    animator.speedMultiplier = v;
  });
})();

function showAnimControls(show) {
  document.getElementById('btn-pause-anim').style.display  = show ? '' : 'none';
  document.getElementById('btn-stop-anim').style.display   = show ? '' : 'none';
  document.getElementById('anim-speed-wrap').style.display = show ? '' : 'none';
  if (show) _syncPauseBtn();
}

// ─── Toggle nodi di misura ─────────────────────────────────────────────────────

let _showNodes = false;

document.getElementById('btn-show-nodes').addEventListener('click', () => {
  _showNodes = !_showNodes;
  document.getElementById('btn-show-nodes').classList.toggle('active', _showNodes);
  if (_showNodes) {
    _refreshNodeOverlay();
  } else {
    canvas.clearNodeOverlay();
  }
});

/** Ricalcola e aggiorna l'overlay dei nodi sul canvas. */
function _updateProbeBadge(data) {
  const badge = document.getElementById('badge-probe');
  const vtTitle = document.getElementById('vt-title');
  const vfTitle = document.getElementById('vf-title');
  const type    = data?.analysis_type;

  // Nodo effettivamente misurato (nel netlist inviato)
  const measuredNode = data?.results
    ? (canvas.generateNetlist(buildAnalysisOptions())?.output_nodes?.[0] ?? null)
    : null;
  const probeLabel = _probeNode || measuredNode;

  if (probeLabel) {
    badge.textContent  = `⊙ ${probeLabel}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  const nodeStr = probeLabel ? ` @ ${probeLabel}` : '';
  if (type === 'transient')  vtTitle.textContent = `V(t) — Transitorio${nodeStr}`;
  else if (type === 'sinusoidal') vtTitle.textContent = `V(t) — Sinusoide${nodeStr}`;
  else if (type === 'ac')    { vtTitle.textContent = 'V(t)'; vfTitle.textContent = `V(f) — Bode${nodeStr}`; }
}

function _refreshNodeOverlay(simData = null) {
  if (!_showNodes) return;

  const netlist    = canvas.generateNetlist(buildAnalysisOptions());
  const outputNode = netlist?.output_nodes?.[0] ?? null;
  const nodes      = canvas.computeNodeMap(outputNode);

  // Assegna colore dalla palette globale
  for (const n of nodes) n.color = nodeColor(n.name);

  // Tensioni note: GND=0, input=Vin, output=da risultato sim
  for (const n of nodes) {
    if (n.name === 'gnd') { n.voltage = 0; continue; }

    if (!simData) continue;
    const r    = simData.results;
    const type = simData.analysis_type;

    if (n.isOutput) {
      if (type === 'transient' && r.voltages?.length)
        n.voltage = r.voltages[r.voltages.length - 1];
      else if (type === 'sinusoidal' && r.vout?.length)
        n.voltage = Math.max(...r.vout.map(Math.abs));
      else if (type === 'ac' && r.magnitude_db?.length) {
        // Vout alla frequenza centrale (indice mediano)
        const mid = Math.floor(r.magnitude_db.length / 2);
        n.voltage = Math.pow(10, r.magnitude_db[mid] / 20);
      }
    }

    // Nodo di ingresso (collegato alla sorgente): Vin=1V
    if (!n.isOutput && n.name !== 'gnd') {
      n.voltage = simData ? 1.0 : undefined;
    }
  }

  canvas.setNodeOverlay(nodes);
}

document.getElementById('btn-rotate').addEventListener('click', () => {
  canvas.rotateSelected();
});

// Analitica RC contestuale

let _raf = null;
function scheduleAnalytical() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(updateAnalyticalFromSliders);
}

function getQuickParamProfile() {
  const resistors = canvas.components.filter(c => c.type === 'resistor');
  const capacitors = canvas.components.filter(c => c.type === 'capacitor');
  if (resistors.length === 1 && capacitors.length === 1) {
    return { resistor: resistors[0], capacitor: capacitors[0] };
  }
  return null;
}

function getRcValuesFromCircuit() {
  const profile = getQuickParamProfile();
  if (!profile) return null;
  return {
    R: profile.resistor.value || 10_000,
    C: profile.capacitor.value || 47e-9,
    profile,
  };
}

function updateAnalyticalFromSliders() {
  const rc = getRcValuesFromCircuit();
  if (!rc) {
    updateNetlistPreview();
    return;
  }

  const { R, C } = rc;
  const type = getSelectedAnalysis();
  const fStart = parseFloat(document.getElementById('freq-start').value) || 10;
  const fStop  = parseFloat(document.getElementById('freq-stop').value)  || 100_000;

  if (type === 'ac') {
    bode.updateAnalytical(R, C, fStart, fStop);
    updateMetricsAnalytical(R, C);
  } else if (type === 'transient') {
    transient.updateAnalytical(R, C);
    updateMetricsTransient(R, C);
  }

  updateVfAnalytical(R, C, fStart, fStop);
  if (type === 'transient') updateVtStep(R, C);
  else if (type === 'ac')   updateVtStep(R, C);

  updateNetlistPreview();
}

function getSinePeriods() { return parseFloat(document.getElementById('sine-periods').value) || 6; }

document.getElementById('sine-periods').addEventListener('input', scheduleAnalytical);

// ─── Tipo di analisi ──────────────────────────────────────────────────────────

function getSelectedAnalysis() {
  return document.querySelector('input[name="analysis"]:checked')?.value ?? 'ac';
}

document.querySelectorAll('input[name="analysis"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const type = getSelectedAnalysis();
    document.getElementById('params-ac').style.display      = type === 'ac'         ? '' : 'none';
    document.getElementById('params-transient').style.display = type === 'transient' ? '' : 'none';
    document.getElementById('transient-section').style.display    = 'none';
    document.getElementById('sine-metrics-section').style.display = 'none';
    updateAnalyticalFromSliders();
  });
});

document.getElementById('freq-start').addEventListener('input', scheduleAnalytical);
document.getElementById('freq-stop').addEventListener('input',  scheduleAnalytical);

// ─── Component editor ─────────────────────────────────────────────────────────

document.getElementById('circuit-canvas').addEventListener('circuit-select', e => {
  renderCompEditor(e.detail);
});

function renderCompEditor(detail) {
  const container = document.getElementById('comp-editor');
  const comp  = detail?.comp ?? detail;
  const count = detail?.count ?? (detail?.comps?.length ?? (comp ? 1 : 0));

  if (!comp && count === 0) {
    container.innerHTML = '<div class="no-selection">Clicca un componente o trascina un rettangolo per selezionare più elementi</div>';
    return;
  }

  if (count > 1) {
    const types = {};
    (detail.comps || []).forEach(c => { types[c.type] = (types[c.type] || 0) + 1; });
    const summary = Object.entries(types)
      .map(([t, n]) => `${n}× ${window.CIRCUIT_COMPONENT_REGISTRY[t]?.label || t}`)
      .join(', ');
    container.innerHTML = `
      <div class="comp-multi-select">
        <div class="comp-id-badge">${count} componenti</div>
        <p class="comp-multi-hint">${summary}</p>
        <p class="comp-multi-hint">Trascina per spostare il gruppo · <kbd>Del</kbd> per eliminare · <kbd>Shift</kbd>+click per aggiungere/togliere</p>
      </div>`;
    return;
  }

  if (!comp) {
    container.innerHTML = '<div class="no-selection">Clicca un componente per modificarlo</div>';
    return;
  }
  const def      = window.CIRCUIT_COMPONENT_REGISTRY[comp.type];
  const hasValue = def.defaultValue !== null;

  const isBJT = comp.type === 'bjt_npn';
  const isPot = comp.type === 'potentiometer';
  const isSwitch = comp.type === 'switch_spst';
  const isLed = comp.type?.startsWith?.('led_');
  const isVSource = comp.type === 'vsource';

  // Campi valore: per BJT mostriamo β + Ic_Q; per gli altri il campo singolo
  const valueFields = isBJT
    ? `<div class="comp-field"><label>β (hFE)</label>
         <input type="text" id="comp-value-input" value="${comp.value ?? 100}" /></div>
       <div class="comp-field"><label>Ic_Q (mA)</label>
         <input type="text" id="comp-icq-input" value="${(comp.ic_q_ma ?? 1.0).toFixed(3)}" /></div>
       <div class="comp-field" style="font-size:10px;color:var(--text-2);line-height:1.4">
         gm = Ic_Q/26 mV &nbsp;·&nbsp; rπ = β/gm<br>
         ro = 100 kΩ (VA≈100 V @ 1 mA)
       </div>`
    : isPot
      ? `<div class="comp-field"><label>Valore totale (${def.unit})</label>
           <input type="text" id="comp-value-input" value="${comp.value}" /></div>
         <div class="comp-field"><label>Cursore (%)</label>
           <input type="number" id="comp-wiper-input" min="0.1" max="99.9" step="0.1"
                  value="${((comp.wiper ?? 0.5) * 100).toFixed(1)}" /></div>
         <div class="comp-field" style="font-size:10px;color:var(--text-2);line-height:1.4">
           Terminali: A - cursore - B. In simulazione diventa due resistenze: A-W e W-B.
         </div>`
    : isSwitch
      ? `<div class="comp-field"><label>Stato</label>
           <select id="comp-switch-state" style="background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-1);padding:3px 6px;font-size:11px;width:100%">
             <option value="open" ${comp.closed ? '' : 'selected'}>Aperto</option>
             <option value="closed" ${comp.closed ? 'selected' : ''}>Chiuso</option>
           </select></div>
         <div class="comp-field" style="font-size:10px;color:var(--text-2);line-height:1.4">
           Modello: aperto = 1 TΩ, chiuso = 1 mΩ.
         </div>`
    : isLed
      ? `<div class="comp-field"><label>Caduta diretta (${def.unit})</label>
           <input type="text" id="comp-value-input" value="${comp.value}" /></div>
         <div class="comp-field"><label>R interna modello (Ω)</label>
           <input type="text" id="comp-led-r-input" value="${comp.series_r ?? 10}" /></div>
         <div class="comp-field" style="font-size:10px;color:var(--text-2);line-height:1.4">
           Modello semplificato: sorgente Vf + piccola resistenza serie. Usa comunque una resistenza esterna di limitazione.
         </div>`
    : isVSource
      ? `<div class="comp-field"><label>Tipo segnale</label>
           <select id="comp-source-signal" style="background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-1);padding:3px 6px;font-size:11px;width:100%">
             <option value="dc" ${(comp.signal || 'dc') === 'dc' ? 'selected' : ''}>DC</option>
             <option value="sine" ${comp.signal === 'sine' ? 'selected' : ''}>Sinusoidale</option>
             <option value="step" ${comp.signal === 'step' ? 'selected' : ''}>Gradino</option>
             <option value="ac" ${comp.signal === 'ac' ? 'selected' : ''}>AC small-signal</option>
           </select></div>
         <div class="comp-field" data-source-field="dc ac"><label>DC / valore base (V)</label>
           <input type="text" id="comp-source-dc" value="${comp.dc ?? comp.value ?? 1}" /></div>
         <div class="comp-field" data-source-field="sine ac"><label>Ampiezza sine / AC (V)</label>
           <input type="text" id="comp-source-amp" value="${comp.amplitude ?? comp.ac_amplitude ?? 1}" /></div>
         <div class="comp-field" data-source-field="sine"><label>Frequenza sine (Hz)</label>
           <input type="number" id="comp-source-freq" value="${comp.frequency ?? 1000}" step="any" min="0.000001" /></div>
         <div class="comp-field" data-source-field="sine"><label>Offset sine (V)</label>
           <input type="text" id="comp-source-offset" value="${comp.offset ?? 0}" /></div>
         <div class="comp-field" data-source-field="sine"><label>Fase sine (deg)</label>
           <input type="number" id="comp-source-phase" value="${comp.phase ?? 0}" step="any" /></div>
         <div class="comp-field" data-source-field="step"><label>Gradino: iniziale / finale (V)</label>
           <input type="text" id="comp-source-step" value="${comp.step_initial ?? 0} / ${comp.step_final ?? comp.value ?? 1}" /></div>
         <div class="comp-field" data-source-field="step"><label>Tempo gradino (s)</label>
           <input type="number" id="comp-source-step-time" value="${comp.step_time ?? 0}" step="any" min="0" /></div>
         <div class="comp-field" style="font-size:10px;color:var(--text-2);line-height:1.4">
           Ogni generatore mantiene il proprio segnale. La sezione Simulazione sceglie solo il tipo di calcolo.
         </div>`
    : hasValue
      ? `<div class="comp-field"><label>Valore (${def.unit})</label>
           <input type="text" id="comp-value-input" value="${comp.value}" /></div>`
      : '';

  container.innerHTML = `
    <div class="comp-id-badge">${comp.id}</div>
    <div class="comp-editor-form">
      <div class="comp-field"><label>Nome</label>
        <input type="text" id="comp-label-input" value="${comp.label || comp.id}"
               style="font-weight:600" placeholder="es. R1, C_filtro…"/></div>
      <div class="comp-field"><label>Tipo</label>
        <span style="font-size:12px;color:var(--text-1)">${def.label}</span></div>
      ${valueFields}
      <div class="comp-field"><label>Rotazione</label>
        <select id="comp-rot-select" style="background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-1);padding:3px 6px;font-size:11px;width:100%">
          <option value="0"   ${(comp.rotation||0)===  0?'selected':''}>0° (orizzontale)</option>
          <option value="90"  ${(comp.rotation||0)=== 90?'selected':''}>90° (verticale)</option>
          <option value="180" ${(comp.rotation||0)===180?'selected':''}>180°</option>
          <option value="270" ${(comp.rotation||0)===270?'selected':''}>270°</option>
        </select></div>
    </div>`;

  const lblInput = document.getElementById('comp-label-input');
  const valInput = document.getElementById('comp-value-input');
  const wiperInput = document.getElementById('comp-wiper-input');
  const switchState = document.getElementById('comp-switch-state');
  const ledRInput = document.getElementById('comp-led-r-input');
  const srcSignal = document.getElementById('comp-source-signal');
  const srcDc = document.getElementById('comp-source-dc');
  const srcAmp = document.getElementById('comp-source-amp');
  const srcFreq = document.getElementById('comp-source-freq');
  const srcOffset = document.getElementById('comp-source-offset');
  const srcPhase = document.getElementById('comp-source-phase');
  const srcStep = document.getElementById('comp-source-step');
  const srcStepTime = document.getElementById('comp-source-step-time');
  const icqInput = document.getElementById('comp-icq-input');
  const rotSel   = document.getElementById('comp-rot-select');

  if (lblInput) {
    lblInput.addEventListener('change', () => {
      const v = lblInput.value.trim();
      if (v) { comp.label = v; canvas.render(); }
    });
  }

  if (valInput) {
    valInput.addEventListener('change', () => {
      if (isBJT) {
        const beta = parseFloat(valInput.value);
        if (!isNaN(beta) && beta > 0) { comp.value = beta; canvas.render(); }
      } else {
        const parsed = parseSI(valInput.value);
        if (parsed !== null) {
          comp.value = parsed;
          canvas.render();
          canvas._emitChange();
        }
      }
    });
  }

  if (wiperInput) {
    wiperInput.addEventListener('change', () => {
      const pct = parseFloat(wiperInput.value);
      if (!isNaN(pct) && pct > 0 && pct < 100) {
        comp.wiper = pct / 100;
        canvas.render();
        canvas._emitChange();
      }
    });
  }

  if (switchState) {
    switchState.addEventListener('change', () => {
      comp.closed = switchState.value === 'closed';
      canvas.render();
      canvas._emitChange();
    });
  }

  if (ledRInput) {
    ledRInput.addEventListener('change', () => {
      const parsed = parseSI(ledRInput.value);
      if (parsed !== null && parsed > 0) {
        comp.series_r = parsed;
        canvas.render();
        canvas._emitChange();
      }
    });
  }

  function emitSourceChange() {
    comp.value = comp.dc ?? comp.value ?? 0;
    canvas.render();
    canvas._emitChange();
  }

  function updateSourceFieldVisibility() {
    if (!srcSignal) return;
    const mode = srcSignal.value;
    container.querySelectorAll('[data-source-field]').forEach(field => {
      const visibleFor = (field.dataset.sourceField || '').split(/\s+/);
      field.style.display = visibleFor.includes(mode) ? '' : 'none';
    });
  }

  if (srcSignal) {
    updateSourceFieldVisibility();
    srcSignal.addEventListener('change', () => {
      comp.signal = srcSignal.value;
      updateSourceFieldVisibility();
      emitSourceChange();
    });
  }
  if (srcDc) {
    srcDc.addEventListener('change', () => {
      const parsed = parseSI(srcDc.value);
      if (parsed !== null) {
        comp.dc = parsed;
        comp.value = parsed;
        emitSourceChange();
      }
    });
  }
  if (srcAmp) {
    srcAmp.addEventListener('change', () => {
      const parsed = parseSI(srcAmp.value);
      if (parsed !== null && parsed >= 0) {
        comp.amplitude = parsed;
        comp.ac_amplitude = parsed;
        emitSourceChange();
      }
    });
  }
  if (srcFreq) {
    srcFreq.addEventListener('change', () => {
      const parsed = parseFloat(srcFreq.value);
      if (!isNaN(parsed) && parsed > 0) {
        comp.frequency = parsed;
        emitSourceChange();
      }
    });
  }
  if (srcOffset) {
    srcOffset.addEventListener('change', () => {
      const parsed = parseSI(srcOffset.value);
      if (parsed !== null) {
        comp.offset = parsed;
        emitSourceChange();
      }
    });
  }
  if (srcPhase) {
    srcPhase.addEventListener('change', () => {
      const parsed = parseFloat(srcPhase.value);
      if (!isNaN(parsed)) {
        comp.phase = parsed;
        emitSourceChange();
      }
    });
  }
  if (srcStep) {
    srcStep.addEventListener('change', () => {
      const parts = srcStep.value.split(/[\/,;]/).map(s => parseSI(s.trim()));
      if (parts.length >= 2 && parts[0] !== null && parts[1] !== null) {
        comp.step_initial = parts[0];
        comp.step_final = parts[1];
        emitSourceChange();
      }
    });
  }
  if (srcStepTime) {
    srcStepTime.addEventListener('change', () => {
      const parsed = parseFloat(srcStepTime.value);
      if (!isNaN(parsed) && parsed >= 0) {
        comp.step_time = parsed;
        emitSourceChange();
      }
    });
  }

  if (icqInput) {
    icqInput.addEventListener('change', () => {
      const ic = parseFloat(icqInput.value);
      if (!isNaN(ic) && ic > 0) { comp.ic_q_ma = ic; canvas.render(); }
    });
  }

  if (rotSel) {
    rotSel.addEventListener('change', () => {
      comp.rotation = parseInt(rotSel.value, 10);
      canvas.render(); canvas._emitChange();
    });
  }
}

function parseSI(str) {
  str = str.trim().replace(',', '.');
  const m = str.match(/^([0-9.eE+\-]+)\s*([TGMkKmuµnp]?)/);
  if (!m) return null;
  const num  = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const mult = { T:1e12,G:1e9,M:1e6,k:1e3,K:1e3,m:1e-3,u:1e-6,µ:1e-6,n:1e-9,p:1e-12 }[m[2]] ?? 1;
  return num * mult;
}

// ─── Circuit change ───────────────────────────────────────────────────────────

// ─── Analisi Parametrica ─────────────────────────────────────────────────────

const paramAnalyzer = new ParamAnalyzer('pa-content');

// Toggle espandi/comprimi
const _paToggle  = document.getElementById('pa-toggle');
const _paBody    = document.getElementById('pa-body');
const _paChevron = document.getElementById('pa-chevron');
let   _paOpen    = false;
_paToggle.addEventListener('click', () => {
  _paOpen = !_paOpen;
  _paBody.style.display    = _paOpen ? '' : 'none';
  _paChevron.classList.toggle('open', _paOpen);
  if (_paOpen) paramAnalyzer.update(canvas.components);
});

document.getElementById('circuit-canvas').addEventListener('circuit-change', () => {
  updateNetlistPreview();
  updateAnalyticalFromSliders();
  _refreshNodeOverlay();
  if (_paOpen) paramAnalyzer.update(canvas.components);
});

// ─── Selezione nodo sonda ─────────────────────────────────────────────────────

let _probeNode = null;  // nodo attualmente selezionato come punto di misura

document.getElementById('circuit-canvas').addEventListener('node-selected', (e) => {
  _probeNode = e.detail.node;   // null = deselezione

  if (_probeNode) {
    setStatus(`Sonda → ${_probeNode} — rieseguendo simulazione…`);
    runSimulation();
  } else {
    setStatus('Sonda rimossa');
  }
});

function updateNetlistPreview() {
  const netlist = canvas.generateNetlist(buildAnalysisOptions());
  const el = document.getElementById('netlist-preview');
  if (!netlist) { el.textContent = '— circuito vuoto —'; return; }
  el.textContent = JSON.stringify(netlist, null, 2);
}

// ─── Simulate ─────────────────────────────────────────────────────────────────

const _btnSimulate = document.getElementById('btn-simulate');
_btnSimulate?.addEventListener('click', runSimulation);

async function runSimulation() {
  const btn  = _btnSimulate || document.getElementById('btn-simulate');
  if (!btn) return;
  const opts = buildAnalysisOptions();

  // Se c'è un nodo sonda selezionato, lo passiamo come punto di misura
  if (_probeNode) opts.probe_node = _probeNode;

  const netlist = canvas.generateNetlist(opts);

  if (!netlist?.components?.length)                { setStatus('Circuito vuoto', 'warn'); return; }
  if (!netlist.components.some(c => c.type === 'voltage_source')) { setStatus('Manca un generatore', 'warn'); return; }
  if (!netlist.components.some(c => ['resistor','capacitor','inductor'].includes(c.type))) { setStatus('Manca almeno R, C o L', 'warn'); return; }
  if (!netlist.output_nodes?.length)               { setStatus('Nessun nodo di uscita rilevato', 'warn'); return; }

  btn.classList.add('loading');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="3,1 13,7 3,13" fill="currentColor"/></svg> Simulazione…';
  setStatus('Invio netlist al solver MNA…');

  try {
    const resp = await fetch('/api/simulate/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(netlist),
    });
    const data = await resp.json();
    if (!resp.ok) { setStatus(`Errore solver: ${data.error}`, 'error'); return; }
    handleSimResult(data);
  } catch (err) {
    setStatus(`Errore di rete: ${err.message}`, 'error');
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="3,1 13,7 3,13" fill="currentColor"/></svg> Simula';
  }
}

function handleSimResult(data) {
  const r    = data.results;
  const type = data.analysis_type;

  // Ferma eventuale animazione precedente
  animator.stop();
  showAnimControls(false);

  if (type === 'ac') {
    bode.updateMna(data);
    if (r.frequencies?.length) {
      const pts = r.frequencies.map((f, i) => ({ x: f, y: r.magnitude_db[i] }))
                                .filter(p => isFinite(p.x) && isFinite(p.y));
      setDS(vfChart, 'V(f) MNA', pts, C_OUT);
      setBadge('badge-vf', `MNA Tier ${data.tier_used}`, true);
      // Salva dati per il pannello espanso
      _lastAcData = { frequencies: r.frequencies, magnitude_db: r.magnitude_db, phase_deg: r.phase_deg };
      // Se il pannello espanso è aperto aggiorna il grafico
      if (_expandPanel.style.display !== 'none') {
        const mode = _expandTitle.textContent.includes('Fase') ? 'phase' : 'mag';
        _openExpandedBode(mode);
      }
    }
    updateMetrics(data.metrics);
    if (window.circuitSimSettings?.shouldAutoCurrentAnim()) {
      _startAcAnimation(data.metrics);
    }

  } else if (type === 'transient') {
    document.getElementById('transient-section').style.display = '';
    transient.update(data);
    if (r.times?.length) {
      const pts = r.times.map((t, i) => ({ x: t, y: r.voltages[i] }))
                          .filter(p => isFinite(p.x) && isFinite(p.y));
      setDS(vtChart, 'V(t) MNA', pts, C_OUT);
      setBadge('badge-vt', `MNA Tier ${data.tier_used}`, true);
    }
    updateMetrics(data.metrics);
    if (window.circuitSimSettings?.shouldAutoCurrentAnim()) {
      _startTransientAnimation(r);
    }

  } else if (type === 'sinusoidal') {
    document.getElementById('sine-metrics-section').style.display = '';
    _showSineResult(data);
    if (window.circuitSimSettings?.shouldAutoCurrentAnim()) {
      _startSineAnimation(r, buildAnalysisOptions().frequency);
    }
  } else if (type === 'dc') {
    clearAllDS(vfChart);
    clearAllDS(vtChart);
    setBadge('badge-vf', `DC Tier ${data.tier_used}`, true);
    updateMetrics(data.metrics);
  }

  // ── Oscilloscopio: aggiorna tracce se disponibili ─────────────────────────
  if (r.node_traces && r.times) {
    _scopeNodeTraces = r.node_traces;
    const nodeNames  = Object.keys(r.node_traces);
    _updateScopeNodeSelectors(nodeNames);

    // Auto-assegna CH1 al primo nodo (sempre: aggiorna ad ogni simulazione)
    if (nodeNames.length > 0) {
      scope.channels[0].nodeId  = nodeNames[0];
      scope.channels[0].enabled = true;
      const sel = document.getElementById('scope-ch1-node');
      if (sel) sel.value = nodeNames[0];
    }
    // Auto-assegna CH2 al secondo nodo se presente
    if (nodeNames.length > 1) {
      scope.channels[1].nodeId  = nodeNames[1];
      scope.channels[1].enabled = true;
      const sel2 = document.getElementById('scope-ch2-node');
      if (sel2) sel2.value = nodeNames[1];
    }

    // Auto-scala V/div su tutti i canali attivi
    _scopeAutoScale();

    // Adatta tdiv automaticamente: circa 1 schermo = intera finestra simulata
    const totalMs = r.times[r.times.length - 1];
    const autoTdiv = totalMs / 10;
    scope.tdiv = autoTdiv > 0 ? autoTdiv : 1.0;
    const tdivSel = document.getElementById('scope-tdiv');
    if (tdivSel) {
      const opts = Array.from(tdivSel.options).map(o => parseFloat(o.value));
      const best = opts.reduce((a, b) => Math.abs(b - scope.tdiv) < Math.abs(a - scope.tdiv) ? b : a);
      tdivSel.value = String(best);
      scope.tdiv    = best;
    }
    scope.setData(r.times, _scopeNodeTraces);
  }

  const s = data.solver_info;
  document.getElementById('solver-badge').textContent =
    `Tier ${data.tier_used} · ${s.solver} · ${s.elapsed_ms} ms`;

  // Aggiorna titoli grafici con il nodo sonda attivo
  _updateProbeBadge(data);

  const fcStr = data.metrics?.cutoff_frequency_hz
    ? `fc = ${data.metrics.cutoff_frequency_hz} Hz · ` : '';
  setStatus(`Simulazione completata · ${fcStr}${s.elapsed_ms} ms`, 'ok');

  // Aggiorna overlay nodi con tensioni dal risultato di simulazione
  _refreshNodeOverlay(data);

  // ── Memorizza stato per analisi contestuale ────────────────────────────────
  _lastSimState = {
    analysisType: data.analysis_type,
    metrics:      data.metrics ?? {},
    components:   canvas.components,
  };

  // Aggiorna automaticamente il pannello con le osservazioni correnti
  analyst.analyze(data.analysis_type, data.metrics ?? {}, canvas.components);

  // Flash leggero per segnalare l'aggiornamento
  _analystPanel.classList.remove('flash');
  void _analystPanel.offsetWidth;
  _analystPanel.classList.add('flash');
  setTimeout(() => _analystPanel.classList.remove('flash'), 750);
  _ctxBadge.textContent = { ac: 'AC', sinusoidal: 'Sine', transient: 'Step', dc: 'DC' }[data.analysis_type] ?? data.analysis_type;
  _ctxBadge.classList.add('visible');
}

// ─── Avvio animazione corrente ────────────────────────────────────────────────

/**
 * AC: sintetizza I(t) analitico alla frequenza di taglio.
 * I(t) = (Vin / |Z|) · sin(2π·fc·t + φI)   dove φI = arctan(1/(ωRC))
 */
function _startAcAnimation(metrics) {
  const rc = getRcValuesFromCircuit();
  if (!rc) return;
  const { R, C } = rc;
  const fc = metrics?.cutoff_frequency_hz || (1 / (2 * Math.PI * R * C));
  const w  = 2 * Math.PI * fc;
  const Z  = Math.sqrt(R * R + 1 / (w * C) ** 2);
  const I0 = 1.0 / Z;   // ampiezza corrente a Vin=1V

  // Genera 3 periodi con 120 punti
  const T_ms    = 1000 / fc;
  const n_pts   = 120;
  const t_end   = 3 * T_ms;
  const times   = Array.from({ length: n_pts }, (_, i) => (i / (n_pts - 1)) * t_end);
  const phaseI  = Math.atan(1 / (w * R * C));  // corrente in anticipo rispetto a Vout
  const currents = times.map(t => I0 * Math.sin(w * (t / 1000) + phaseI));

  animator.start(times, currents, fc);
  showAnimControls(true);
}

/**
 * Transitorio: I_R(t) = (Vstep − Vout(t)) / R  (corrente che decade con τ)
 */
function _startTransientAnimation(r) {
  if (!r.times?.length || !r.voltages?.length) {
    console.warn('[CurrentAnim] transient: dati mancanti', r);
    return;
  }

  const rc = getRcValuesFromCircuit();
  if (!rc) return;
  const { R, C } = rc;
  const Vstep = 1.0;
  const currents = r.voltages.map(vout => (Vstep - vout) / R);

  // Velocità di playback: 1 τ = 1 secondo di animazione
  const tau_ms = Math.max(R * C * 1000, 0.001);
  const freq_equiv = 1000 / tau_ms;

  console.log('[CurrentAnim] transient start', { pts: r.times.length, I_max: Math.max(...currents), freq_equiv });
  animator.start(r.times, currents, freq_equiv);
  showAnimControls(true);
}

/**
 * Sinusoidale: I_R(t) = (Vin(t) − Vout(t)) / R  (dati MNA completi)
 */
function _startSineAnimation(r, freq_hz) {
  if (!r.times?.length || !r.vin?.length || !r.vout?.length) {
    console.warn('[CurrentAnim] sinusoidal: dati mancanti', r);
    return;
  }

  const rc = getRcValuesFromCircuit();
  if (!rc) return;
  const { R } = rc;
  const currents = r.vin.map((vin, i) => (vin - (r.vout[i] ?? 0)) / R);

  console.log('[CurrentAnim] sine start', { pts: r.times.length, freq_hz, I_max: Math.max(...currents.map(Math.abs)) });
  animator.start(r.times, currents, freq_hz);
  showAnimControls(true);
}

function _showSineResult(data) {
  const r = data.results;
  if (!r.times?.length) return;

  // V(t): sovrapponi Vin MNA e Vout MNA alle curve analitiche
  const ptsVin  = r.times.map((t, i) => ({ x: t, y: r.vin[i]  })).filter(p => isFinite(p.y));
  const ptsVout = r.times.map((t, i) => ({ x: t, y: r.vout[i] })).filter(p => isFinite(p.y));

  // Ripulisci le curve analitiche e sostituisci con MNA
  setDS(vtChart, 'Vin(t)',      ptsVin,  C_IN);
  setDS(vtChart, 'Vout(t) MNA', ptsVout, C_OUT);
  // Rimuovi la curva "regime" analitica (ora c'è MNA)
  removeDS(vtChart, 'Vout regime');

  setBadge('badge-vt', `MNA Tier ${data.tier_used} · transitorio + regime`, true);

  // Metriche regime permanente
  const m = data.metrics;
  const setM = (id, val, dec = 2) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== undefined ? (typeof val === 'number' ? val.toFixed(dec) : val) : '—';
  };
  setM('sm-gain',  m?.gain_db,     2);
  setM('sm-phase', m?.phase_deg !== undefined ? m.phase_deg.toFixed(1) + '°' : '—');
  setM('sm-vout',  m?.vout_peak_v, 4);
  setM('sm-ratio', m?.gain_ratio,  4);
}

// ─── Metriche ─────────────────────────────────────────────────────────────────

function updateMetrics(metrics) {
  const set = (id, val, dec = 1) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val !== undefined && val !== null)
      ? (typeof val === 'number' ? val.toFixed(dec) : val) : '—';
    el.className = 'metric-val' + (val !== undefined && val !== null ? ' highlight' : '');
  };
  set('m-fc',      metrics?.cutoff_frequency_hz, 1);
  set('m-tau',     metrics?.time_constant_ms, 3);
  set('m-phase',   metrics?.phase_at_cutoff_deg !== undefined
    ? metrics.phase_at_cutoff_deg.toFixed(1) + '°' : undefined);
  set('m-rolloff', metrics?.rolloff_db_per_decade !== undefined
    ? metrics.rolloff_db_per_decade.toFixed(0) + ' dB' : undefined);
  if (metrics?.cutoff_frequency_hz) bode.setFcMarker(metrics.cutoff_frequency_hz);
}

function updateMetricsAnalytical(R, C) {
  updateMetrics({
    cutoff_frequency_hz: 1 / (2 * Math.PI * R * C),
    time_constant_ms: R * C * 1000,
    phase_at_cutoff_deg: -45,
    rolloff_db_per_decade: -20,
  });
}

function updateMetricsTransient(R, C) {
  document.getElementById('m-fc').textContent      = '—';
  document.getElementById('m-tau').textContent     = (R * C * 1000).toFixed(3);
  document.getElementById('m-phase').textContent   = '—';
  document.getElementById('m-rolloff').textContent = '—';
}

function clearMetrics() {
  ['m-fc','m-tau','m-phase','m-rolloff'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.className = 'metric-val'; }
  });
  document.getElementById('solver-badge').textContent = '';
}

// ─── Build analisi options ─────────────────────────────────────────────────────

function buildAnalysisOptions() {
  const type   = getSelectedAnalysis();
  const fStart = parseFloat(document.getElementById('freq-start').value) || 10;
  const fStop  = parseFloat(document.getElementById('freq-stop').value)  || 100_000;

  if (type === 'ac')
    return { type: 'ac', start_freq: fStart, stop_freq: fStop, points_per_decade: 100 };
  if (type === 'transient')
    return { type: 'transient', points: 600, periods: getSinePeriods() };
  return { type };
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  const el = document.getElementById('canvas-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'canvas-status' + (type ? ` ${type}` : '');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

(function init() {
  try {
    initCircuitSimSettings(canvas);
    _initLayoutControls();
    initBottomCharts();
    window.circuitSimSettings?.applyAll();
    document.addEventListener('circuitsim-settings-changed', (e) => {
      if (e.detail.key === 'theme' || e.detail.key === 'all') _refreshChartsTheme();
    });
    updateNetlistPreview();
  } catch (err) {
    console.error('[CircuitSim] Errore inizializzazione UI:', err);
    setStatus('Errore avvio grafici — controlla la console (F12)', 'error');
  }
  _activateTool('select', document.querySelector('[data-tool="select"]'));
  setStatus('Canvas vuota — disegna un circuito o carica Esempio RC dal menu in alto');
})();
