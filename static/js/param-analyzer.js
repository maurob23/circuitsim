/**
 * ParamAnalyzer — Analisi parametrica dei circuiti elettronici.
 *
 * Rileva la topologia dal netlist, calcola i parametri caratteristici con
 * formule simboliche e numeriche, e fornisce un calcolatore interattivo
 * per valutare guadagno/fase a una frequenza arbitraria.
 */

'use strict';

// ─── Costanti fisiche ────────────────────────────────────────────────────────
const VT = 0.02585;   // Tensione termica a 300 K (V)
const PI = Math.PI;

// ─── Formattatori ────────────────────────────────────────────────────────────
function fmtFreq(hz) {
  if (hz >= 1e6)  return (hz / 1e6).toPrecision(4) + ' MHz';
  if (hz >= 1e3)  return (hz / 1e3).toPrecision(4) + ' kHz';
  return hz.toPrecision(4) + ' Hz';
}
function fmtTime(s) {
  if (s < 1e-6) return (s * 1e9).toPrecision(3) + ' ns';
  if (s < 1e-3) return (s * 1e6).toPrecision(3) + ' µs';
  if (s < 1)    return (s * 1e3).toPrecision(3) + ' ms';
  return s.toPrecision(3) + ' s';
}
function fmtOhm(r) {
  if (r >= 1e6) return (r / 1e6).toPrecision(3) + ' MΩ';
  if (r >= 1e3) return (r / 1e3).toPrecision(3) + ' kΩ';
  return r.toPrecision(3) + ' Ω';
}
function fmtVal(v, unit) {
  const abs = Math.abs(v);
  if (unit === 'F') {
    if (abs < 1e-9) return (v * 1e12).toPrecision(3) + ' pF';
    if (abs < 1e-6) return (v * 1e9).toPrecision(3) + ' nF';
    if (abs < 1e-3) return (v * 1e6).toPrecision(3) + ' µF';
    return v.toPrecision(3) + ' F';
  }
  if (unit === 'H') {
    if (abs < 1e-6) return (v * 1e9).toPrecision(3) + ' nH';
    if (abs < 1e-3) return (v * 1e6).toPrecision(3) + ' µH';
    if (abs < 1)    return (v * 1e3).toPrecision(3) + ' mH';
    return v.toPrecision(3) + ' H';
  }
  return v.toPrecision(4);
}
function db(ratio) { return 20 * Math.log10(Math.abs(ratio)); }

// ─── Rilevamento topologia ───────────────────────────────────────────────────

/**
 * Analizza i componenti del circuito e restituisce un oggetto topologia con
 * i valori estratti e il tipo di circuito rilevato.
 */
function detectTopology(components) {
  const counts = {};
  for (const c of components) {
    counts[c.type] = (counts[c.type] || 0) + 1;
  }

  const R_all = components.filter(c => c.type === 'resistor').map(c => c.value);
  const C_all = components.filter(c => c.type === 'capacitor').map(c => c.value);
  const L_all = components.filter(c => c.type === 'inductor').map(c => c.value);
  const BJT   = components.find(c => c.type === 'bjt_npn');

  const nR = R_all.length, nC = C_all.length, nL = L_all.length;

  // Valori singoli (primo elemento)
  const R = R_all[0], C = C_all[0], L = L_all[0];

  if (BJT) {
    return { type: 'bjt', R_all, BJT };
  }
  if (nR >= 1 && nC >= 1 && nL >= 1) {
    return { type: 'rlc_series', R, C, L };
  }
  if (nR >= 1 && nL >= 1 && nC === 0) {
    return { type: 'rl', R, L };
  }
  if (nR >= 1 && nC >= 1 && nL === 0) {
    return { type: 'rc', R, C };
  }
  if (nR >= 1 && nC === 0 && nL === 0) {
    return { type: 'resistive', R_all };
  }
  return { type: 'unknown' };
}

// ─── Calcolatori per topologia ───────────────────────────────────────────────

function calcRC(R, C) {
  const tau = R * C;
  const fc  = 1 / (2 * PI * tau);
  return { tau, fc };
}

function calcRL(R, L) {
  const tau = L / R;
  const fc  = R / (2 * PI * L);
  return { tau, fc };
}

function calcRLC(R, L, C) {
  const omega0 = 1 / Math.sqrt(L * C);
  const f0     = omega0 / (2 * PI);
  const Q      = (1 / R) * Math.sqrt(L / C);
  const BW     = f0 / Q;
  const zeta   = 1 / (2 * Q);
  return { omega0, f0, Q, BW, zeta };
}

function calcBJT(beta, ic_q_ma) {
  const Ic  = ic_q_ma * 1e-3;
  const gm  = Ic / VT;
  const rpi = beta / gm;
  const ro  = 0.1 / Ic;    // VA ≈ 100 V
  return { gm, rpi, ro };
}

// ─── Gain / Phase in funzione della frequenza ────────────────────────────────

function rcLowPassH(f, fc) {
  const ratio = f / fc;
  const mag   = 1 / Math.sqrt(1 + ratio * ratio);
  const phase = -Math.atan(ratio) * 180 / PI;
  return { mag, db: db(mag), phase };
}

function rcHighPassH(f, fc) {
  const ratio = f / fc;
  const mag   = ratio / Math.sqrt(1 + ratio * ratio);
  const phase = 90 - Math.atan(ratio) * 180 / PI;
  return { mag, db: db(mag), phase };
}

function rlcSeriesH(f, f0, Q) {
  const u   = f / f0;
  const den = Math.sqrt(Math.pow(1 - u * u, 2) + Math.pow(u / Q, 2));
  const mag = 1 / (Q * den);
  return { mag, db: db(mag), phase: 0 };
}

// ─── Rendering HTML ──────────────────────────────────────────────────────────

function row(label, value, note = '') {
  return `<div class="pa-row">
    <span class="pa-label">${label}</span>
    <span class="pa-value">${value}</span>
    ${note ? `<span class="pa-note">${note}</span>` : ''}
  </div>`;
}

function formula(sym, expr) {
  return `<div class="pa-formula"><span class="pa-sym">${sym}</span> = <span class="pa-expr">${expr}</span></div>`;
}

function section(title, content) {
  return `<div class="pa-section"><div class="pa-section-title">${title}</div>${content}</div>`;
}

// ─── Rendering per topologia ─────────────────────────────────────────────────

function renderRC(topo) {
  const { R, C } = topo;
  if (!R || !C) return '<div class="pa-empty">Valori R o C non disponibili</div>';
  const { tau, fc } = calcRC(R, C);

  const H_fc    = rcLowPassH(fc, fc);
  const H_10fc  = rcLowPassH(10 * fc, fc);
  const H_01fc  = rcLowPassH(0.1 * fc, fc);

  return `
    ${section('Costante di tempo', `
      ${formula('τ', 'R · C')}
      ${row('R', fmtOhm(R))}
      ${row('C', fmtVal(C, 'F'))}
      ${row('τ', fmtTime(tau), 'costante di carica')}
    `)}
    ${section('Frequenza di taglio (−3 dB)', `
      ${formula('f<sub>c</sub>', '1 / (2π · R · C)')}
      ${row('f<sub>c</sub>', fmtFreq(fc), '−3.01 dB, fase −45°')}
      ${row('ω<sub>c</sub>', (2 * PI * fc).toPrecision(4) + ' rad/s')}
    `)}
    ${section('Risposta in frequenza — LP', `
      ${formula('|H(f)|', '1 / √(1 + (f/f<sub>c</sub>)²)')}
      ${row('f = 0.1·f<sub>c</sub>', H_01fc.db.toFixed(2) + ' dB', H_01fc.phase.toFixed(1) + '°')}
      ${row('f = f<sub>c</sub>',     H_fc.db.toFixed(2)   + ' dB', H_fc.phase.toFixed(1)   + '°')}
      ${row('f = 10·f<sub>c</sub>',  H_10fc.db.toFixed(2) + ' dB', H_10fc.phase.toFixed(1) + '°')}
      ${row('Roll-off', '−20 dB/dec', 'pendenza asintotica')}
    `)}
    ${renderCalcInteractive('rc_lp', fc)}
  `;
}

function renderRL(topo) {
  const { R, L } = topo;
  if (!R || !L) return '<div class="pa-empty">Valori R o L non disponibili</div>';
  const { tau, fc } = calcRL(R, L);

  return `
    ${section('Costante di tempo', `
      ${formula('τ', 'L / R')}
      ${row('R', fmtOhm(R))}
      ${row('L', fmtVal(L, 'H'))}
      ${row('τ', fmtTime(tau))}
    `)}
    ${section('Frequenza di taglio (−3 dB)', `
      ${formula('f<sub>c</sub>', 'R / (2π · L)')}
      ${row('f<sub>c</sub>', fmtFreq(fc), '−3.01 dB, fase −45°')}
      ${row('ω<sub>c</sub>', (2 * PI * fc).toPrecision(4) + ' rad/s')}
    `)}
    ${renderCalcInteractive('rl_lp', fc)}
  `;
}

function renderRLC(topo) {
  const { R, L, C } = topo;
  if (!R || !L || !C) return '<div class="pa-empty">Valori R, L o C non disponibili</div>';
  const { f0, Q, BW, zeta } = calcRLC(R, L, C);

  const regime = zeta < 1 ? 'Sottosviluppato (oscillante)' :
                 zeta === 1 ? 'Critico' : 'Sovrasmorzato';

  return `
    ${section('Frequenza di risonanza', `
      ${formula('f<sub>0</sub>', '1 / (2π · √(LC))')}
      ${row('f<sub>0</sub>', fmtFreq(f0))}
      ${row('ω<sub>0</sub>', (2 * PI * f0).toPrecision(4) + ' rad/s')}
    `)}
    ${section('Fattore di qualità', `
      ${formula('Q', '(1/R) · √(L/C)')}
      ${row('Q', Q.toPrecision(4))}
      ${row('BW', fmtFreq(BW), 'banda passante −3 dB')}
      ${row('ζ', zeta.toPrecision(3), regime)}
      ${row('Z a f<sub>0</sub>', fmtOhm(R), 'impedenza minima')}
    `)}
    ${renderCalcInteractive('rlc', f0, Q)}
  `;
}

function renderBJT(topo) {
  const { BJT, R_all } = topo;
  const beta   = BJT.value || 100;
  const ic_q   = BJT.ic_q_ma || 1.0;
  const { gm, rpi, ro } = calcBJT(beta, ic_q);
  const Ic = ic_q * 1e-3;

  const Rc = R_all.find(r => r > 0);

  return `
    ${section('Punto di lavoro DC', `
      ${row('I<sub>C,Q</sub>', (ic_q).toPrecision(3) + ' mA')}
      ${row('β (h<sub>FE</sub>)', beta.toString())}
      ${row('V<sub>T</sub>', '25.85 mV', 'a 300 K')}
    `)}
    ${section('Modello hybrid-π small-signal', `
      ${formula('g<sub>m</sub>', 'I<sub>C,Q</sub> / V<sub>T</sub>')}
      ${row('g<sub>m</sub>', (gm * 1000).toPrecision(3) + ' mA/V')}
      ${formula('r<sub>π</sub>', 'β / g<sub>m</sub>')}
      ${row('r<sub>π</sub>', fmtOhm(rpi), 'resistenza ingresso B-E')}
      ${formula('r<sub>o</sub>', 'V<sub>A</sub> / I<sub>C,Q</sub>')}
      ${row('r<sub>o</sub>', fmtOhm(ro), 'resistenza uscita (V<sub>A</sub>=100V)')}
    `)}
    ${Rc ? section('Guadagno di tensione', `
      ${formula('A<sub>v</sub>', '−g<sub>m</sub> · R<sub>C</sub>')}
      ${row('R<sub>C</sub>', fmtOhm(Rc))}
      ${row('A<sub>v</sub>', (-(gm * Rc)).toPrecision(3), (db(gm * Rc)).toFixed(1) + ' dB')}
    `) : ''}
  `;
}

function renderResistive(topo) {
  const { R_all } = topo;
  const Rtot = R_all.reduce((a, b) => a + b, 0);
  const Rpar = 1 / R_all.reduce((a, b) => a + 1 / b, 0);
  return `
    ${section('Rete resistiva', `
      ${R_all.map((r, i) => row(`R<sub>${i + 1}</sub>`, fmtOhm(r))).join('')}
      ${row('Σ serie', fmtOhm(Rtot))}
      ${row('‖ parallelo', fmtOhm(Rpar))}
    `)}
  `;
}

// ─── Calcolatore interattivo ─────────────────────────────────────────────────

function renderCalcInteractive(type, fcOrF0, Q = null) {
  return `
    <div class="pa-section pa-calc" data-calc-type="${type}" data-fc="${fcOrF0}" ${Q !== null ? `data-q="${Q}"` : ''}>
      <div class="pa-section-title">Calcolatore — punto di lavoro</div>
      <div class="pa-calc-row">
        <label class="pa-label">Frequenza</label>
        <input type="number" class="pa-calc-input" id="pa-calc-freq"
               value="${fcOrF0.toPrecision(3)}" min="0.001" step="any"/>
        <span class="pa-note">Hz</span>
      </div>
      <div class="pa-calc-results" id="pa-calc-results">
        <span class="pa-note">← inserisci un valore e premi Invio</span>
      </div>
    </div>
  `;
}

// ─── Classe principale ───────────────────────────────────────────────────────

class ParamAnalyzer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._topo = null;
  }

  /** Aggiorna il pannello dai componenti del canvas. */
  update(components) {
    if (!this.container) return;
    this._topo = detectTopology(components);
    this.container.innerHTML = this._render(this._topo);
    this._bindCalcEvents();
  }

  _render(topo) {
    const badge = `<div class="pa-topo-badge pa-topo-${topo.type}">${this._topoLabel(topo.type)}</div>`;
    let body = '';
    switch (topo.type) {
      case 'rc':        body = renderRC(topo);        break;
      case 'rl':        body = renderRL(topo);        break;
      case 'rlc_series':body = renderRLC(topo);       break;
      case 'bjt':       body = renderBJT(topo);       break;
      case 'resistive': body = renderResistive(topo); break;
      default:
        body = '<div class="pa-empty">Aggiungi componenti al circuito per vedere i parametri.</div>';
    }
    return badge + body;
  }

  _topoLabel(t) {
    return {
      rc: 'Filtro RC', rl: 'Filtro RL', rlc_series: 'Circuito RLC',
      bjt: 'Amplificatore BJT NPN', resistive: 'Rete resistiva', unknown: 'Circuito'
    }[t] || 'Circuito';
  }

  _bindCalcEvents() {
    const input = this.container.querySelector('#pa-calc-freq');
    const out   = this.container.querySelector('#pa-calc-results');
    const sec   = this.container.querySelector('.pa-calc');
    if (!input || !out || !sec) return;

    const calc = () => {
      const f    = parseFloat(input.value);
      if (!f || f <= 0) { out.innerHTML = '<span class="pa-note">Frequenza non valida</span>'; return; }
      const type = sec.dataset.calcType;
      const fc   = parseFloat(sec.dataset.fc);
      const Q    = sec.dataset.q ? parseFloat(sec.dataset.q) : null;
      let res;
      if (type === 'rc_lp') res = rcLowPassH(f, fc);
      else if (type === 'rl_lp') res = rcLowPassH(f, fc);   // stesso modello LP
      else if (type === 'rlc' && Q) res = rlcSeriesH(f, fc, Q);
      else return;

      const sign = res.phase >= 0 ? '+' : '';
      out.innerHTML = `
        <div class="pa-calc-result-row">
          <span class="pa-label">|H(f)|</span>
          <span class="pa-value">${res.mag.toPrecision(4)}</span>
          <span class="pa-note">${res.db.toFixed(2)} dB</span>
        </div>
        <div class="pa-calc-result-row">
          <span class="pa-label">Fase φ</span>
          <span class="pa-value">${sign}${res.phase.toFixed(2)}°</span>
        </div>
        <div class="pa-calc-result-row">
          <span class="pa-label">f / f<sub>c</sub></span>
          <span class="pa-value">${(f / fc).toPrecision(3)}</span>
          <span class="pa-note">${fmtFreq(f)}</span>
        </div>
      `;
    };

    input.addEventListener('input',   calc);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') calc(); });
    calc();   // calcola con il valore iniziale
  }
}
