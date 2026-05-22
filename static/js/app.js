/**
 * app.js — Main application logic per CircuitSim MVP.
 *
 * Tipi di analisi gestiti:
 *   ac          → Bode plot (pannello destro + V(f) in basso)
 *   transient   → Risposta al gradino (V(t) in basso)
 *   sinusoidal  → Vin(t) e Vout(t) sovrapposti in basso (transitorio + regime)
 */

'use strict';

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
          title: { display: true, text: 'Frequenza (Hz)', color: '#8b949e', font: { size: 11 } },
          ticks: { color: '#8b949e', font: { size: 10 },
            callback: v => v >= 1000 ? (v / 1000) + 'k' : v },
          grid: { color: '#21262d' },
        },
        y: {
          title: { display: true, text: yLabel, color: '#8b949e', font: { size: 11 } },
          ticks: { color: '#c9d1d9', font: { size: 11 } },
          grid: { color: '#21262d' },
        }
      },
      plugins: {
        legend: { labels: { color: '#c9d1d9', font: { size: 11 } } },
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
  btn.addEventListener('click', e => {
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
document.getElementById('btn-open-cap-conv')?.addEventListener('click', () => capConverter.open());
document.getElementById('btn-open-filter-calc')?.addEventListener('click', () => filterCalc.open());
document.getElementById('btn-open-freq-meter')?.addEventListener('click', () => freqMeter.open());

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
_btnTogVt.style.opacity = '0.4';
_btnTogVt.title = 'Mostra grafico V(t)';
_btnTogVt.addEventListener('click', () => {
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
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 120 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true, position: 'bottom',
        labels: { color: '#c9d1d9', boxWidth: 10, padding: 6,
                  font: { size: 9, family: 'JetBrains Mono, monospace' } },
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
      x: { grid: { color: '#1e274088' },
           border: { color: '#30363d' },
           ticks: { color: '#c9d1d9', maxTicksLimit: 7,
                    font: { size: 10, family: 'JetBrains Mono, monospace' } },
           ...xOpts },
      y: { grid: { color: '#1e274088' },
           border: { color: '#30363d' },
           ticks: { color: '#c9d1d9', maxTicksLimit: 6,
                    font: { size: 10, family: 'JetBrains Mono, monospace' } },
           ...yOpts },
    },
  };
  return base;
}

function initBottomCharts() {
  vtChart = new Chart(document.getElementById('chart-vt'), {
    type: 'scatter',
    data: { datasets: [] },
    options: bottomOpts(
      { title: { display: true, text: 'Tempo (ms)', color: '#8b949e', font: { size: 9 } } },
      { title: { display: true, text: 'V (volt)',   color: '#8b949e', font: { size: 9 } },
        suggestedMin: -1.3, suggestedMax: 1.3 }
    ),
  });

  vfChart = new Chart(document.getElementById('chart-vf'), {
    type: 'scatter',
    data: { datasets: [] },
    options: bottomOpts(
      { type: 'logarithmic',
        title: { display: true, text: 'Frequenza (Hz)', color: '#8b949e', font: { size: 9 } },
        min: 10, max: 100_000,
        ticks: { color: '#c9d1d9', maxTicksLimit: 6,
                 font: { size: 10, family: 'JetBrains Mono, monospace' },
                 callback: v => ({ 10:'10',100:'100',1000:'1k',10000:'10k',100000:'100k' }[v] ?? '') } },
      { title: { display: true, text: 'Ampiezza (dB)', color: '#8b949e', font: { size: 9 } },
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

document.querySelectorAll('.comp-cat-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.comp-cat').classList.toggle('open');
  });
});

// ─── Attivazione tool (toolbar + palette) ─────────────────────────────────────

const TOOL_MSGS = {
  select:    'Seleziona / trascina — E per ruotare',
  wire:      'Filo — clicca nodo iniziale poi nodo finale',
  delete:    'Elimina — clicca su un componente o filo',
  resistor:  'Resistenza — clicca sulla canvas per piazzare (R)',
  capacitor: 'Condensatore — clicca per piazzare (C)',
  inductor:  'Induttore — clicca per piazzare (L)',
  gnd:       'Massa — clicca per piazzare il riferimento (G)',
  vsource:   'Generatore di tensione — clicca per piazzare (V)',
  bjt_npn:   'BJT NPN — clicca per piazzare il transistore (Q)',
  text:      'Testo — clicca sulla canvas per inserire un\'etichetta (T)',
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

document.querySelector('.comp-palette-section').addEventListener('click', e => {
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

// ─── Slider R / C ─────────────────────────────────────────────────────────────

const sliderR = document.getElementById('slider-r');
const sliderC = document.getElementById('slider-c');
const valR    = document.getElementById('val-r');
const valC    = document.getElementById('val-c');

function getRValue() { return Math.pow(10, parseFloat(sliderR.value)); }
function getCValue() { return Math.pow(10, parseFloat(sliderC.value)); }

function updateSliderDisplays() {
  valR.textContent = fmt(getRValue(), 'R');
  valC.textContent = fmt(getCValue(), 'C');
}

function fmt(v, t) {
  if (t === 'R') {
    if (v >= 1e6) return `${+(v/1e6).toPrecision(3)} MΩ`;
    if (v >= 1e3) return `${+(v/1e3).toPrecision(3)} kΩ`;
    return `${+v.toPrecision(3)} Ω`;
  }
  if (t === 'C') {
    if (v >= 1e-3) return `${+(v/1e-3).toPrecision(3)} mF`;
    if (v >= 1e-6) return `${+(v/1e-6).toPrecision(3)} µF`;
    if (v >= 1e-9) return `${+(v/1e-9).toPrecision(3)} nF`;
    return `${+(v/1e-12).toPrecision(3)} pF`;
  }
  return String(v);
}

let _raf = null;
function scheduleAnalytical() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(updateAnalyticalFromSliders);
}

function updateAnalyticalFromSliders() {
  const R    = getRValue();
  const C    = getCValue();
  const type = getSelectedAnalysis();
  const fStart = parseFloat(document.getElementById('freq-start').value) || 10;
  const fStop  = parseFloat(document.getElementById('freq-stop').value)  || 100_000;

  // Pannello destro
  if (type === 'ac') {
    bode.updateAnalytical(R, C, fStart, fStop);
    updateMetricsAnalytical(R, C);
  } else if (type === 'transient') {
    transient.updateAnalytical(R, C);
    updateMetricsTransient(R, C);
  } else if (type === 'sinusoidal') {
    const freq    = getSineFreq();
    const amp     = getSineAmp();
    const periods = getSinePeriods();
    updateVtSine(R, C, freq, amp, periods);
  }

  // Bottom V(f) — sempre aggiornato
  updateVfAnalytical(R, C, fStart, fStop);

  // Bottom V(t) — dipende dal tipo
  if (type === 'transient') updateVtStep(R, C);
  else if (type === 'ac')   updateVtStep(R, C);  // mostra step anche in modalità AC

  syncCanvasToSliders(R, C);
  updateNetlistPreview();
  updateSliderDisplays();
}

function syncCanvasToSliders(R, C) {
  for (const comp of canvas.components) {
    if (comp.type === 'resistor')  comp.value = R;
    if (comp.type === 'capacitor') comp.value = C;
  }
  canvas.render();
}

sliderR.addEventListener('input', scheduleAnalytical);
sliderC.addEventListener('input', scheduleAnalytical);

// ─── Slider frequenza sinusoide ───────────────────────────────────────────────

const sliderSineFreq = document.getElementById('slider-sine-freq');

function getSineFreq()    { return Math.pow(10, parseFloat(sliderSineFreq.value)); }
function getSineAmp()     { return parseFloat(document.getElementById('sine-amp').value)     || 1; }
function getSinePeriods() { return parseFloat(document.getElementById('sine-periods').value) || 6; }

sliderSineFreq.addEventListener('input', () => {
  const f = getSineFreq();
  document.getElementById('val-sine-freq').textContent =
    f >= 1000 ? `${+(f/1000).toPrecision(3)} kHz` : `${+f.toPrecision(4)} Hz`;
  scheduleAnalytical();
});

document.getElementById('sine-amp').addEventListener('input',     scheduleAnalytical);
document.getElementById('sine-periods').addEventListener('input', scheduleAnalytical);

// ─── Tipo di analisi ──────────────────────────────────────────────────────────

function getSelectedAnalysis() {
  return document.querySelector('input[name="analysis"]:checked')?.value ?? 'ac';
}

document.querySelectorAll('input[name="analysis"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const type = getSelectedAnalysis();
    document.getElementById('params-ac').style.display      = type === 'ac'         ? '' : 'none';
    document.getElementById('params-sine').style.display    = type === 'sinusoidal' ? '' : 'none';
    document.getElementById('transient-section').style.display    = 'none';
    document.getElementById('sine-metrics-section').style.display = 'none';
    updateAnalyticalFromSliders();
  });
});

document.getElementById('freq-start').addEventListener('input', scheduleAnalytical);
document.getElementById('freq-stop').addEventListener('input',  scheduleAnalytical);

// ─── Component editor ─────────────────────────────────────────────────────────

document.getElementById('circuit-canvas').addEventListener('circuit-select', e => {
  renderCompEditor(e.detail.comp);
});

function renderCompEditor(comp) {
  const container = document.getElementById('comp-editor');
  if (!comp) {
    container.innerHTML = '<div class="no-selection">Clicca un componente per modificarlo</div>';
    return;
  }
  const def      = COMP_DEFS[comp.type];
  const hasValue = def.defaultValue !== null;

  const isBJT = comp.type === 'bjt_npn';

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
          if (comp.type === 'resistor')  sliderR.value = Math.log10(parsed);
          if (comp.type === 'capacitor') sliderC.value = Math.log10(parsed);
          canvas.render();
          updateAnalyticalFromSliders();
        }
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

document.getElementById('btn-simulate').addEventListener('click', runSimulation);

async function runSimulation() {
  const btn  = document.getElementById('btn-simulate');
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
    // AC: anima corrente sinusoidale alla frequenza di taglio
    _startAcAnimation(data.metrics);

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
    // Anima corrente per risposta al gradino
    _startTransientAnimation(r);

  } else if (type === 'sinusoidal') {
    document.getElementById('sine-metrics-section').style.display = '';
    _showSineResult(data);
    // Anima corrente per segnale sinusoidale
    _startSineAnimation(r, buildAnalysisOptions().frequency);
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
  const R  = getRValue();
  const C  = getCValue();
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

  const R     = getRValue();
  const Vstep = 1.0;
  const currents = r.voltages.map(vout => (Vstep - vout) / R);

  // Velocità di playback: 1 τ = 1 secondo di animazione
  const tau_ms = Math.max(R * getCValue() * 1000, 0.001);
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

  const R = getRValue();
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
    return { type: 'transient', points: 600 };
  if (type === 'sinusoidal')
    return {
      type: 'sinusoidal',
      frequency:        getSineFreq(),
      amplitude:        getSineAmp(),
      periods:          getSinePeriods(),
      points_per_cycle: 60,
    };
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
  initBottomCharts();
  updateSliderDisplays();
  canvas.loadExample();
  updateAnalyticalFromSliders();
  setStatus('Circuito RC caricato — fc = 338 Hz · premi Simula per la verifica MNA');
})();
