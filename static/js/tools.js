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

// 4. Traduttore EN/IT locale

const TRANSLATOR_GLOSSARY = {
  en_it: {
    the: 'il',
    a: 'un',
    an: 'un',
    and: 'e',
    or: 'o',
    of: 'di',
    to: 'a',
    at: 'a',
    in: 'in',
    on: 'su',
    with: 'con',
    without: 'senza',
    from: 'da',
    for: 'per',
    by: 'da',
    as: 'come',
    is: 'e',
    are: 'sono',
    be: 'essere',
    can: 'puo',
    may: 'puo',
    must: 'deve',
    should: 'dovrebbe',
    when: 'quando',
    if: 'se',
    then: 'poi',
    this: 'questo',
    that: 'che',
    these: 'questi',
    those: 'quelli',
    each: 'ogni',
    all: 'tutti',
    into: 'in',
    through: 'attraverso',
    between: 'tra',
    across: 'attraverso',
    before: 'prima',
    after: 'dopo',
    used: 'usato',
    use: 'usa',
    connected: 'collegato',
    connect: 'collega',
    connecting: 'collegando',
    selected: 'selezionato',
    select: 'seleziona',
    placed: 'posizionato',
    place: 'posiziona',
    calculate: 'calcola',
    calculated: 'calcolato',
    measured: 'misurato',
    increase: 'aumenta',
    decreases: 'diminuisce',
    decrease: 'diminuisci',
    high: 'alta',
    low: 'bassa',
    higher: 'piu alta',
    lower: 'piu bassa',
    first: 'primo',
    second: 'secondo',
    order: 'ordine',
    series: 'serie',
    parallel: 'parallelo',
    equivalent: 'equivalente',
    ideal: 'ideale',
    real: 'reale',
    positive: 'positivo',
    negative: 'negativo',
    terminal: 'terminale',
    terminals: 'terminali',
    lead: 'terminale',
    leads: 'terminali',
    purposes: 'scopi',
    practical: 'pratici',
    then: 'quindi',
    earth: 'terra',
    defined: 'definito',
    zero: 'zero',
    potential: 'potenziale',
    relative: 'relativo',
    other: 'altro',
    things: 'cose',
    practically: 'praticamente',
    immune: 'immune',
    wavering: 'oscillazioni',
    makes: 'rende',
    convenient: 'comodo',
    useful: 'utile',
    which: 'cui',
    signals: 'segnali',
    various: 'diversi',
    pieces: 'elementi',
    equipment: 'apparecchiatura',
    they: 'essi',
    share: 'condividono',
    thus: 'quindi',
    devices: 'dispositivi',
    common: 'comune',
    voltage: 'tensione',
    current: 'corrente',
    electrical: 'elettrico',
    electronic: 'elettronico',
    resistor: 'resistenza',
    resistance: 'resistenza',
    capacitor: 'condensatore',
    capacitance: 'capacita',
    inductor: 'induttore',
    inductance: 'induttanza',
    ground: 'massa',
    node: 'nodo',
    nodes: 'nodi',
    wire: 'filo',
    circuit: 'circuito',
    circuits: 'circuiti',
    simulation: 'simulazione',
    simulate: 'simula',
    transient: 'transitorio',
    frequency: 'frequenza',
    phase: 'fase',
    gain: 'guadagno',
    magnitude: 'modulo',
    cutoff: 'taglio',
    filter: 'filtro',
    input: 'ingresso',
    output: 'uscita',
    source: 'sorgente',
    power: 'potenza',
    load: 'carico',
    switch: 'interruttore',
    open: 'aperto',
    closed: 'chiuso',
    waveform: 'forma d onda',
    amplitude: 'ampiezza',
    offset: 'offset',
    value: 'valore',
    component: 'componente',
    components: 'componenti',
    analysis: 'analisi',
    graph: 'grafico',
    chart: 'grafico',
    manual: 'manuale',
    measure: 'misura',
    measurement: 'misura',
    time: 'tempo',
    period: 'periodo',
    pulse: 'impulso',
    sine: 'sinusoide',
    square: 'quadra',
    transformer: 'trasformatore',
    diode: 'diodo',
    transistor: 'transistor',
    microcontroller: 'microcontrollore',
    battery: 'batteria',
    resistor: 'resistenza',
    ohm: 'ohm',
    farad: 'farad',
    henry: 'henry',
    hertz: 'hertz',
    impedance: 'impedenza',
    admittance: 'ammettenza',
    reactance: 'reattanza',
    conductance: 'conduttanza',
    charge: 'carica',
    discharge: 'scarica',
    charging: 'carica',
    discharging: 'scarica',
    steady: 'stabile',
    state: 'stato',
    steady_state: 'regime permanente',
    response: 'risposta',
    step: 'gradino',
    noise: 'rumore',
    signal: 'segnale',
    small: 'piccolo',
    large: 'grande',
    model: 'modello',
    equation: 'equazione',
    equations: 'equazioni',
    law: 'legge',
    laws: 'leggi',
    branch: 'ramo',
    mesh: 'maglia',
    loop: 'anello',
    reference: 'riferimento',
    divider: 'partitore',
    divider: 'partitore',
    divider: 'partitore',
    gain: 'guadagno',
    loss: 'perdita',
    attenuation: 'attenuazione',
    bandwidth: 'larghezza di banda',
    slope: 'pendenza',
    decibel: 'decibel',
    octave: 'ottava',
  },
};

TRANSLATOR_GLOSSARY.it_en = Object.fromEntries(
  Object.entries(TRANSLATOR_GLOSSARY.en_it).map(([en, it]) => [it, en])
);

const TRANSLATOR_PHRASES = {
  en_it: [
    ['the earth is defined to be at a zero potential', 'la terra viene definita a potenziale zero'],
    ['a potential that is practically immune to wavering', 'un potenziale praticamente immune da oscillazioni'],
    ['this makes the earth', 'questo rende la terra'],
    ['by connecting various pieces of electronics equipment to the earth ground', 'collegando diversi apparecchi elettronici alla terra fisica'],
    ['they can all share', 'possono tutti condividere'],
    ['the earth’s ground reference potential', 'il potenziale di riferimento di massa della terra'],
    ["the earth's ground reference potential", 'il potenziale di riferimento di massa della terra'],
    ['and thus all devices share a common reference', 'e quindi tutti i dispositivi condividono un riferimento comune'],
    ['for practical purposes', 'ai fini pratici'],
    ['is defined to be', 'viene definita come'],
    ['zero potential', 'potenziale zero'],
    ['relative to other things', 'rispetto ad altri elementi'],
    ['practically immune to wavering', 'praticamente immune da oscillazioni'],
    ['a convenient and useful potential', 'un potenziale comodo e utile'],
    ['on which to reference other signals', 'rispetto al quale riferire altri segnali'],
    ['various pieces of electronics equipment', 'diversi apparecchi elettronici'],
    ['electronics equipment', 'apparecchi elettronici'],
    ['earth ground', 'terra fisica'],
    ['ground reference potential', 'potenziale di riferimento di massa'],
    ['ground reference', 'riferimento di massa'],
    ['reference potential', 'potenziale di riferimento'],
    ['all devices', 'tutti i dispositivi'],
    ['common reference', 'riferimento comune'],
    ['voltage source', 'sorgente di tensione'],
    ['current source', 'sorgente di corrente'],
    ['low pass filter', 'filtro passa-basso'],
    ['high pass filter', 'filtro passa-alto'],
    ['band pass filter', 'filtro passa-banda'],
    ['cutoff frequency', 'frequenza di taglio'],
    ['time constant', 'costante di tempo'],
    ['steady state', 'regime permanente'],
    ['small signal', 'piccolo segnale'],
    ['output voltage', 'tensione di uscita'],
    ['input voltage', 'tensione di ingresso'],
    ['voltage divider', 'partitore di tensione'],
    ['power supply', 'alimentatore'],
    ['ground node', 'nodo di massa'],
    ['open circuit', 'circuito aperto'],
    ['short circuit', 'cortocircuito'],
    ['series resistor', 'resistenza in serie'],
    ['parallel resistor', 'resistenza in parallelo'],
    ['transient analysis', 'analisi transitoria'],
    ['dc analysis', 'analisi DC'],
    ['ac analysis', 'analisi AC'],
    ['frequency response', 'risposta in frequenza'],
    ['phase shift', 'sfasamento'],
  ],
};
TRANSLATOR_PHRASES.it_en = TRANSLATOR_PHRASES.en_it.map(([en, it]) => [it, en]);

function _translateWithGlossary(text, direction) {
  const dict = TRANSLATOR_GLOSSARY[direction] || TRANSLATOR_GLOSSARY.en_it;
  const phrases = TRANSLATOR_PHRASES[direction] || TRANSLATOR_PHRASES.en_it;
  let out = text;

  for (const [source, target] of phrases) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), match =>
      match[0] === match[0]?.toUpperCase()
        ? target.charAt(0).toUpperCase() + target.slice(1)
        : target
    );
  }

  return out.replace(/[A-Za-zÀ-ÿ]+(?:[-_][A-Za-zÀ-ÿ]+)*/g, token => {
    const normalized = token.toLowerCase().replace(/-/g, '_');
    let translated = dict[normalized];
    if (!translated && normalized.endsWith('s')) {
      translated = dict[normalized.slice(0, -1)];
      if (translated && !translated.endsWith('i')) translated += 'i';
    }
    if (!translated) return token;
    return token[0] === token[0]?.toUpperCase()
      ? translated.charAt(0).toUpperCase() + translated.slice(1)
      : translated;
  });
}

class TranslatorTool {
  constructor() {
    this._modal = _bindToolModal('translator-overlay', 'translator-close');
    this._source = document.getElementById('translator-source');
    this._target = document.getElementById('translator-target');
    this._sourceLabel = document.getElementById('translator-source-label');
    this._targetLabel = document.getElementById('translator-target-label');
    this._status = document.getElementById('translator-status');
    this._direction = 'en_it';

    document.getElementById('translator-run')?.addEventListener('click', () => this.translate());
    document.getElementById('translator-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('translator-copy')?.addEventListener('click', () => this.copy());
    document.getElementById('translator-swap')?.addEventListener('click', () => this.swap());
    this._source?.addEventListener('input', () => this._markPending());
  }

  open() {
    this._modal?.open();
    this._source?.focus();
    this._markPending();
  }

  _cleanInput() {
    return (this._source?.value || '').replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([A-Za-zÀ-ÿ])/g, '$1$2');
  }

  _translateLocal() {
    const text = this._cleanInput();
    if (!this._target) return;
    this._target.value = _translateWithGlossary(text, this._direction);
    if (this._status) {
      this._status.textContent = text.trim()
        ? 'Anteprima locale. Premi Traduci per usare DeepSeek.'
        : 'DeepSeek API via backend. Inserisci testo e premi Traduci.';
    }
  }

  _markPending() {
    if (this._target) this._target.value = '';
    if (this._status) {
      this._status.textContent = (this._source?.value || '').trim()
        ? 'Premi Traduci per usare DeepSeek.'
        : 'DeepSeek API via backend. Inserisci testo e premi Traduci.';
    }
  }

  async translate() {
    const text = this._cleanInput();
    if (!this._target || !text.trim()) {
      this._translateLocal();
      return;
    }

    if (this._status) this._status.textContent = 'Traduzione DeepSeek in corso...';
    try {
      const resp = await fetch('/api/translate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, direction: this._direction }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        this._target.value = '';
        if (this._status) this._status.textContent = data.error || 'DeepSeek non disponibile.';
        return;
      }
      this._target.value = data.translated_text || '';
      if (this._status) this._status.textContent = 'Traduzione completata con DeepSeek.';
    } catch (_err) {
      this._target.value = '';
      if (this._status) this._status.textContent = 'Backend non raggiungibile: traduzione DeepSeek non eseguita.';
    }
  }

  clear() {
    if (this._source) this._source.value = '';
    if (this._target) this._target.value = '';
    this._source?.focus();
  }

  swap() {
    this._direction = this._direction === 'en_it' ? 'it_en' : 'en_it';
    const sourceText = this._source?.value || '';
    if (this._source && this._target) {
      this._source.value = this._target.value || sourceText;
      this._target.value = '';
    }
    if (this._sourceLabel) this._sourceLabel.textContent = this._direction === 'en_it' ? 'Inglese' : 'Italiano';
    if (this._targetLabel) this._targetLabel.textContent = this._direction === 'en_it' ? 'Italiano' : 'Inglese';
    this._markPending();
  }

  async copy() {
    const text = this._target?.value || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (this._status) this._status.textContent = 'Risultato copiato negli appunti.';
    } catch (_err) {
      if (this._status) this._status.textContent = 'Copia non disponibile: seleziona il testo e usa Ctrl+C.';
    }
  }
}

window.CapConverterTool = CapConverterTool;
window.FilterCalcTool   = FilterCalcTool;
window.FreqMeterTool    = FreqMeterTool;
window.TranslatorTool   = TranslatorTool;
