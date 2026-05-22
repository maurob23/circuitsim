/**
 * tools.js — Strumenti: conversione condensatori, progettazione filtri, frequenzimetro.
 */
'use strict';

const TAU = 2 * Math.PI;

// Serie E12 (valori normalizzati 1–8.2)
const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
const E24_EXTRA = [11, 13, 16, 20, 24, 30, 36, 43, 51, 62, 75, 91];

function _eSeriesValues(series = 'E12', decades = 12) {
  const base = series === 'E24' ? [...E12, ...E24_EXTRA].sort((a, b) => a - b) : E12;
  const out = [];
  for (let exp = -12; exp <= -5; exp++) {
    for (const b of base) {
      const v = (b / 10) * Math.pow(10, exp);
      if (v >= 1e-12 && v <= 1e-2) out.push(v);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

const CAP_STD = _eSeriesValues('E12');

function _fmtCap(F) {
  if (F >= 1e-3) return (F * 1e3).toFixed(3) + ' mF';
  if (F >= 1e-6) return (F * 1e6).toFixed(2) + ' µF';
  if (F >= 1e-9) return (F * 1e9).toFixed(2) + ' nF';
  return (F * 1e12).toFixed(2) + ' pF';
}

function _fmtFreq(hz) {
  if (hz >= 1e6) return (hz / 1e6).toPrecision(4) + ' MHz';
  if (hz >= 1e3) return (hz / 1e3).toPrecision(4) + ' kHz';
  return hz.toPrecision(4) + ' Hz';
}

function _nearestStd(F, n = 5) {
  return CAP_STD
    .map(v => ({ v, err: Math.abs(v - F) / F }))
    .sort((a, b) => a.err - b.err)
    .slice(0, n)
    .map(x => ({
      F: x.v,
      label: _fmtCap(x.v),
      errPct: (x.err * 100).toFixed(1),
    }));
}

function _bindToolModal(overlayId, closeId) {
  const overlay = document.getElementById(overlayId);
  const close   = document.getElementById(closeId);
  if (!overlay) return null;
  const closeFn = () => { overlay.style.display = 'none'; };
  close?.addEventListener('click', closeFn);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeFn(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeFn();
  });
  return {
    open:  () => { overlay.style.display = 'flex'; },
    close: closeFn,
  };
}

// ─── 1. Conversione condensatori ─────────────────────────────────────────────

class CapConverterTool {
  constructor() {
    this._modal = _bindToolModal('cap-conv-overlay', 'cap-conv-close');
    this._fromUnit = document.getElementById('cap-from-unit');
    this._fromVal  = document.getElementById('cap-from-val');
    this._outAll   = document.getElementById('cap-conv-all');
    this._outStd   = document.getElementById('cap-conv-std');
    this._searchFc = document.getElementById('cap-search-fc');
    this._searchR  = document.getElementById('cap-search-r');
    this._outSearch = document.getElementById('cap-search-out');

    document.getElementById('cap-conv-convert')?.addEventListener('click', () => this._convert());
    document.getElementById('cap-search-btn')?.addEventListener('click', () => this._searchByFc());
    this._fromVal?.addEventListener('input', () => this._convert());
    this._fromUnit?.addEventListener('change', () => this._convert());
  }

  open() {
    this._modal?.open();
    this._convert();
  }

  _toFarads(val, unit) {
    const m = { F: 1, mF: 1e-3, uF: 1e-6, nF: 1e-9, pF: 1e-12 };
    return val * (m[unit] ?? 1);
  }

  _convert() {
    const v = parseFloat(this._fromVal?.value);
    const u = this._fromUnit?.value || 'nF';
    if (!Number.isFinite(v) || v <= 0) {
      if (this._outAll) this._outAll.textContent = '—';
      if (this._outStd) this._outStd.innerHTML = '';
      return;
    }
    const F = this._toFarads(v, u);
    if (this._outAll) {
      this._outAll.innerHTML = [
        ['F', F],
        ['mF', F * 1e3],
        ['µF', F * 1e6],
        ['nF', F * 1e9],
        ['pF', F * 1e12],
      ].map(([unit, n]) => `<span class="cap-chip">${n.toPrecision(4)} ${unit}</span>`).join('');
    }
    if (this._outStd) {
      const near = _nearestStd(F, 6);
      this._outStd.innerHTML = near.map(n =>
        `<div class="cap-std-row"><span class="cap-std-val">${n.label}</span><span class="cap-std-err">Δ ${n.errPct}%</span></div>`
      ).join('');
    }
  }

  _searchByFc() {
    const fc = parseFloat(this._searchFc?.value);
    const R  = parseFloat(this._searchR?.value);
    if (!fc || !R || fc <= 0 || R <= 0) {
      if (this._outSearch) this._outSearch.textContent = 'Inserisci fc e R validi.';
      return;
    }
    const Cideal = 1 / (TAU * fc * R);
    const near = _nearestStd(Cideal, 5);
    const lines = near.map(n => {
      const fcAct = 1 / (TAU * R * n.F);
      return `${n.label} (E12) → fc ≈ ${_fmtFreq(fcAct)} (Δ ${n.errPct}% su C)`;
    });
    if (this._outSearch) {
      this._outSearch.innerHTML =
        `<div class="tool-result-hl">C ideale = ${_fmtCap(Cideal)}</div>` +
        lines.map(l => `<div class="cap-std-row">${l}</div>`).join('');
    }
  }
}

// ─── 2. Calcolo filtri ───────────────────────────────────────────────────────

const FILTER_TYPES = {
  lp_rc: {
    label: 'Passa-basso RC (1° ordine)',
    desc: 'Vout sul condensatore. Attenua le alte frequenze.',
    calc(fc, R, C, L) {
      if (R && fc) C = 1 / (TAU * fc * R);
      else if (C && fc) R = 1 / (TAU * fc * C);
      else if (R && C) fc = 1 / (TAU * R * C);
      return { R, C, L: null, fc: fc || 1 / (TAU * R * C), tau: R * C, extra: 'Roll-off −20 dB/dec' };
    },
  },
  hp_rc: {
    label: 'Passa-alto RC (1° ordine)',
    desc: 'Vout sulla resistenza. Attenua le basse frequenze.',
    calc(fc, R, C, L) {
      if (R && fc) C = 1 / (TAU * fc * R);
      else if (C && fc) R = 1 / (TAU * fc * C);
      else if (R && C) fc = 1 / (TAU * R * C);
      return { R, C, L: null, fc: fc || 1 / (TAU * R * C), tau: R * C, extra: 'Roll-off +20 dB/dec sotto fc' };
    },
  },
  lp_rl: {
    label: 'Passa-basso RL (1° ordine)',
    desc: 'Vout sull\'induttore.',
    calc(fc, R, C, L) {
      if (R && fc) L = R / (TAU * fc);
      else if (L && fc) R = TAU * fc * L;
      else if (R && L) fc = R / (TAU * L);
      return { R, C: null, L, fc: fc || R / (TAU * L), tau: L / R, extra: 'Roll-off −20 dB/dec' };
    },
  },
  hp_rl: {
    label: 'Passa-alto RL (1° ordine)',
    desc: 'Vout sulla resistenza in configurazione HP.',
    calc(fc, R, C, L) {
      if (R && fc) L = R / (TAU * fc);
      else if (L && fc) R = TAU * fc * L;
      else if (R && L) fc = R / (TAU * L);
      return { R, C: null, L, fc: fc || R / (TAU * L), tau: L / R, extra: 'Roll-off +20 dB/dec sotto fc' };
    },
  },
  rlc_bp: {
    label: 'Passa-banda RLC (serie)',
    desc: 'Risonanza serie: minimo |Z| a f₀.',
    calc(fc, R, C, L) {
      const f0 = fc;
      if (f0 && C && !L) L = 1 / ((TAU * f0) ** 2 * C);
      else if (f0 && L && !C) C = 1 / ((TAU * f0) ** 2 * L);
      else if (L && C) fc = 1 / (TAU * Math.sqrt(L * C));
      const Q = R && L && C ? (1 / R) * Math.sqrt(L / C) : null;
      const bw = Q && fc ? fc / Q : null;
      return { R, C, L, fc: fc || f0, tau: null, extra: Q != null ? `Q = ${Q.toPrecision(3)}, BW ≈ ${_fmtFreq(bw)}` : '' };
    },
  },
};

class FilterCalcTool {
  constructor() {
    this._modal = _bindToolModal('filter-calc-overlay', 'filter-calc-close');
    this._type   = document.getElementById('filter-type');
    this._desc   = document.getElementById('filter-type-desc');
    this._fc     = document.getElementById('filter-fc');
    this._R      = document.getElementById('filter-r');
    this._C      = document.getElementById('filter-c');
    this._L      = document.getElementById('filter-l');
    this._solve  = document.getElementById('filter-solve');
    this._out    = document.getElementById('filter-calc-out');

    this._type?.addEventListener('change', () => this._updateDesc());
    this._solve?.addEventListener('click', () => this._calculate());
    this._updateDesc();
  }

  open() {
    this._modal?.open();
    this._updateDesc();
  }

  _updateDesc() {
    const t = FILTER_TYPES[this._type?.value] || FILTER_TYPES.lp_rc;
    if (this._desc) this._desc.textContent = t.desc;
    const isRL = this._type?.value?.includes('rl');
    const isRLC = this._type?.value === 'rlc_bp';
    document.getElementById('filter-row-c')?.style.setProperty('display', isRL && !isRLC ? 'none' : '');
    document.getElementById('filter-row-l')?.style.setProperty('display', isRL || isRLC ? '' : 'none');
  }

  _calculate() {
    const key = this._type?.value || 'lp_rc';
    const spec = FILTER_TYPES[key];
    const fc = parseFloat(this._fc?.value) || null;
    let R = parseFloat(this._R?.value) || null;
    let C = parseFloat(this._C?.value) || null;
    let L = parseFloat(this._L?.value) || null;

    const known = [fc, R, C, L].filter(v => v != null && v > 0).length;
    if (known < 2) {
      if (this._out) this._out.textContent = 'Inserisci almeno due parametri (es. fc + R).';
      return;
    }
    try {
      const r = spec.calc(fc, R, C, L);
      const lines = [
        `<div class="tool-result-hl">${spec.label}</div>`,
        r.fc != null && `<div>fc = <b>${_fmtFreq(r.fc)}</b></div>`,
        r.R != null  && `<div>R = <b>${r.R >= 1000 ? (r.R / 1000).toFixed(3) + ' kΩ' : r.R.toFixed(2) + ' Ω'}</b></div>`,
        r.C != null  && `<div>C = <b>${_fmtCap(r.C)}</b></div>`,
        r.L != null  && `<div>L = <b>${r.L >= 1 ? r.L.toFixed(3) + ' H' : (r.L * 1e3).toFixed(3) + ' mH'}</b></div>`,
        r.tau != null && `<div>τ = <b>${r.tau >= 1 ? r.tau.toFixed(4) + ' s' : (r.tau * 1000).toFixed(3) + ' ms'}</b></div>`,
        r.extra && `<div class="tool-note">${r.extra}</div>`,
      ].filter(Boolean);
      if (r.C) {
        const near = _nearestStd(r.C, 3);
        lines.push('<div class="tool-note">Condensatori E12 vicini:</div>');
        near.forEach(n => lines.push(`<div class="cap-std-row">${n.label} (Δ ${n.errPct}%)</div>`));
      }
      if (this._out) this._out.innerHTML = lines.join('');
    } catch (e) {
      if (this._out) this._out.textContent = 'Parametri insufficienti o non validi.';
    }
  }
}

// ─── 3. Frequenzimetro ───────────────────────────────────────────────────────

class FreqMeterTool {
  constructor() {
    this._modal = _bindToolModal('freq-meter-overlay', 'freq-meter-close');
    this._period = document.getElementById('freq-period');
    this._pUnit  = document.getElementById('freq-period-unit');
    this._outPeriod = document.getElementById('freq-from-period');
    this._outSim = document.getElementById('freq-from-sim');
    this._cycles = document.getElementById('freq-cycles');
    this._window = document.getElementById('freq-window');
    this._wUnit  = document.getElementById('freq-window-unit');
    this._outCount = document.getElementById('freq-from-count');

    document.getElementById('freq-period-btn')?.addEventListener('click', () => this._fromPeriod());
    document.getElementById('freq-count-btn')?.addEventListener('click', () => this._fromCount());
    document.getElementById('freq-sim-btn')?.addEventListener('click', () => this._fromSim());
  }

  open() {
    this._modal?.open();
    this._fromSim();
  }

  _fromPeriod() {
    const T = parseFloat(this._period?.value);
    const u = this._pUnit?.value || 'ms';
    if (!T || T <= 0) {
      if (this._outPeriod) this._outPeriod.textContent = '—';
      return;
    }
    const mult = { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9 };
    const Ts = T * (mult[u] ?? 1e-3);
    const f = 1 / Ts;
    if (this._outPeriod) {
      this._outPeriod.innerHTML =
        `<span class="tool-result-hl">f = ${_fmtFreq(f)}</span><br>` +
        `T = ${Ts.toExponential(3)} s · ω = ${(TAU * f).toExponential(3)} rad/s`;
    }
  }

  _fromCount() {
    const n = parseFloat(this._cycles?.value);
    const w = parseFloat(this._window?.value);
    const u = this._wUnit?.value || 'ms';
    if (!n || !w || n <= 0 || w <= 0) {
      if (this._outCount) this._outCount.textContent = '—';
      return;
    }
    const mult = { s: 1, ms: 1e-3, us: 1e-6 };
    const tw = w * (mult[u] ?? 1e-3);
    const f = n / tw;
    if (this._outCount) {
      this._outCount.innerHTML =
        `<span class="tool-result-hl">f = ${_fmtFreq(f)}</span><br>` +
        `${n} cicli in ${tw * 1000} ms`;
    }
  }

  _fromSim() {
    const m = window.circuitSimGetMetrics?.() ?? null;
    const type = window.circuitSimGetAnalysisType?.() ?? '';
    if (!m || Object.keys(m).length === 0) {
      if (this._outSim) this._outSim.textContent = 'Nessuna simulazione — premi Simula prima.';
      return;
    }
    const parts = [];
    if (m.frequency_hz) {
      parts.push(`<div><b>Frequenza segnale</b>: ${_fmtFreq(m.frequency_hz)}</div>`);
      if (m.gain_db != null) parts.push(`<div>Guadagno @ f: ${m.gain_db.toFixed(2)} dB · φ ${(m.phase_deg ?? 0).toFixed(1)}°</div>`);
    }
    if (m.cutoff_frequency_hz) {
      parts.push(`<div><b>Frequenza di taglio fc</b>: ${_fmtFreq(m.cutoff_frequency_hz)}</div>`);
    }
    if (m.time_constant_ms) {
      parts.push(`<div><b>Costante τ</b>: ${m.time_constant_ms.toFixed(3)} ms → fτ ≈ ${_fmtFreq(1000 / (TAU * m.time_constant_ms))}</div>`);
    }
    parts.push(`<div class="tool-note">Analisi: ${type || '—'}</div>`);
    if (this._outSim) this._outSim.innerHTML = parts.join('') || 'Nessuna frequenza nei risultati.';
  }
}

window.CapConverterTool = CapConverterTool;
window.FilterCalcTool   = FilterCalcTool;
window.FreqMeterTool    = FreqMeterTool;
