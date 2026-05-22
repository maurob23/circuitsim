/**
 * comp-help.js — Popup parametri componenti + guida contestuale (hover).
 */
'use strict';

// ─── Dati help per popup (parametri significativi) ───────────────────────────

const COMP_HELP = {
  resistor: {
    title: 'Resistenza (R)',
    desc: 'Elemento passivo che oppone resistenza al flusso di corrente. Modello ohmico lineare.',
    params: [
      { sym: 'R', name: 'Resistenza', unit: 'Ω', note: 'Valore nominale (es. 10 kΩ)' },
      { sym: 'P', name: 'Potenza', unit: 'W', note: 'P = V²/R = I²·R' },
      { sym: 'V', name: 'Caduta tensione', unit: 'V', note: 'V = I·R (legge di Ohm)' },
      { sym: 'I', name: 'Corrente', unit: 'A', note: 'I = V/R' },
    ],
    tips: 'In AC: impedenza Z = R (indipendente dalla frequenza).',
  },
  capacitor: {
    title: 'Condensatore (C)',
    desc: 'Accumula carica elettrica. In AC introduce uno sfasamento −90° tra tensione e corrente.',
    params: [
      { sym: 'C', name: 'Capacità', unit: 'F', note: 'Valore nominale (es. 47 nF)' },
      { sym: 'Xc', name: 'Reattanza capacitiva', unit: 'Ω', note: 'Xc = 1 / (2π·f·C)' },
      { sym: 'τ', name: 'Costante di tempo', unit: 's', note: 'τ = R·C (circuito RC)' },
      { sym: 'fc', name: 'Freq. di taglio (RC)', unit: 'Hz', note: 'fc = 1 / (2π·R·C)' },
    ],
    tips: 'In transitorio: carica/scarica esponenziale con costante τ.',
  },
  inductor: {
    title: 'Induttore (L)',
    desc: 'Immagazzina energia nel campo magnetico. Oppone variazioni di corrente.',
    params: [
      { sym: 'L', name: 'Induttanza', unit: 'H', note: 'Valore nominale (es. 1 mH)' },
      { sym: 'XL', name: 'Reattanza induttiva', unit: 'Ω', note: 'XL = 2π·f·L' },
      { sym: 'τ', name: 'Costante di tempo', unit: 's', note: 'τ = L/R (circuito RL)' },
      { sym: 'E', name: 'Energia immagazzinata', unit: 'J', note: 'E = ½·L·I²' },
    ],
    tips: 'Modello transitorio: induttore companion (Backward Euler) nel solver MNA.',
  },
  gnd: {
    title: 'Massa (GND)',
    desc: 'Riferimento di potenziale zero per tutta la rete. Nodo comune di ritorno corrente.',
    params: [
      { sym: 'V', name: 'Potenziale', unit: 'V', note: 'V = 0 V (riferimento)' },
      { sym: '—', name: 'Nodo', unit: '—', note: 'Collega tutti i terminali al medesimo nodo' },
    ],
    tips: 'Ogni circuito simulabile deve avere almeno un riferimento di massa.',
  },
  bjt_npn: {
    title: 'BJT NPN',
    desc: 'Transistore bipolare a giunzione. Modello small-signal hybrid-π linearizzato attorno al punto Q.',
    params: [
      { sym: 'β', name: 'Guadagno di corrente', unit: '—', note: 'Ic = β·Ib (default 100)' },
      { sym: 'Ic_Q', name: 'Corrente collettore Q', unit: 'mA', note: 'Punto di lavoro DC' },
      { sym: 'gm', name: 'Transconduttanza', unit: 'S', note: 'gm = Ic / VT  (VT ≈ 26 mV)' },
      { sym: 'rπ', name: 'Resistenza base', unit: 'Ω', note: 'rπ = β / gm' },
      { sym: 'ro', name: 'Resistenza uscita', unit: 'Ω', note: 'Uscita Early (modello)' },
    ],
    tips: 'Terminali: B (base), C (collettore), E (emettitore). Freccia verso emettitore = NPN.',
  },
  vsource: {
    title: 'Generatore di tensione',
    desc: 'Sorgente ideale di tensione. Alimenta il circuito con segnale DC, gradino o sinusoidale.',
    params: [
      { sym: 'V', name: 'Ampiezza', unit: 'V', note: 'Tensione del generatore' },
      { sym: 'f', name: 'Frequenza', unit: 'Hz', note: 'Per analisi sinusoidale' },
      { sym: 'Vin', name: 'Ingresso', unit: 'V', note: 'Tensione applicata al nodo +' },
    ],
    tips: 'In AC sweep: Vin = 1 V (unitario) per calcolare la risposta in frequenza.',
  },
  opamp: {
    title: 'Op-Amp (prossimamente)',
    desc: 'Amplificatore operazionale ideale. Alta impedenza in ingresso, bassa in uscita.',
    params: [
      { sym: 'AOL', name: 'Guadagno ad anello aperto', unit: 'dB', note: 'Tipico 100–120 dB' },
      { sym: 'GBW', name: 'Gain-Bandwidth', unit: 'Hz', note: 'Prodotto guadagno–banda' },
      { sym: 'Zin', name: 'Impedenza ingresso', unit: 'Ω', note: 'Molto elevata' },
    ],
    tips: 'Componente in roadmap — non ancora simulabile.',
  },
  mosfet_n: {
    title: 'MOSFET N-canale (prossimamente)',
    desc: 'Transistore a effetto di campo. Controllo tramite tensione di gate.',
    params: [
      { sym: 'Vth', name: 'Soglia', unit: 'V', note: 'Tensione di soglia' },
      { sym: 'gm', name: 'Transconduttanza', unit: 'S', note: 'In regione attiva' },
      { sym: 'Cgs', name: 'Capacità gate-source', unit: 'F', note: 'Parassita' },
    ],
    tips: 'Componente in roadmap — non ancora simulabile.',
  },
  isource: {
    title: 'Generatore di corrente (prossimamente)',
    desc: 'Sorgente ideale di corrente costante indipendente dalla tensione ai capi.',
    params: [
      { sym: 'I', name: 'Corrente', unit: 'A', note: 'Valore nominale' },
    ],
    tips: 'Componente in roadmap — non ancora simulabile.',
  },
};

// ─── Testi guida hover (UI, grafici, strumenti) ──────────────────────────────

const HOVER_HELP = {
  // Componenti palette
  resistor:  { title: 'Resistenza', text: 'Clicca sulla canvas per piazzare. Modifica R dal pannello sinistro o doppio-click sul simbolo. Scorciatoia: R.' },
  capacitor: { title: 'Condensatore', text: 'Definisce τ = R·C e la frequenza di taglio fc. In AC introduce −20 dB/dec oltre fc. Scorciatoia: C.' },
  inductor:  { title: 'Induttore', text: 'Complementare al condensatore: reattanza cresce con f. Utile in filtri RL e RLC. Scorciatoia: L.' },
  gnd:       { title: 'Massa', text: 'Riferimento 0 V obbligatorio per la simulazione MNA. Collega il terminale inferiore al nodo comune.' },
  bjt_npn:   { title: 'BJT NPN', text: 'Transistore attivo small-signal. Imposta β e Ic_Q nel pannello componente. Scorciatoia: Q.' },
  vsource:   { title: 'Gen. tensione', text: 'Alimenta il circuito. Tipo di eccitazione scelto in Analisi (AC, gradino, sinusoide). Scorciatoia: V.' },
  opamp:     { title: 'Op-Amp', text: 'In arrivo: amplificatore operazionale per circuiti attivi e filtri attivi.' },
  mosfet_n:  { title: 'MOSFET N', text: 'In arrivo: transistore MOS per commutazione e amplificazione.' },
  isource:   { title: 'Gen. corrente', text: 'In arrivo: sorgente di corrente ideale.' },

  // Strumenti toolbar
  select:    { title: 'Seleziona', text: 'Sposta, ruota (E) e modifica componenti. Doppio-click per rinominare.' },
  wire:      { title: 'Filo', text: 'Collega due terminali: clic sul primo pin, poi sul secondo. Scorciatoia: W.' },
  delete:    { title: 'Elimina', text: 'Rimuove componente, filo o etichetta selezionata. Tasto Canc.' },
  text:      { title: 'Testo', text: 'Inserisci etichette libere sullo schema. Scorciatoia: T.' },
  rotate:    { title: 'Ruota', text: 'Ruota di 90° il componente selezionato. Scorciatoia: E.' },
  example:   { title: 'Esempio RC', text: 'Carica il filtro passa-basso R=10 kΩ, C=47 nF con fc ≈ 338 Hz.' },
  simulate:  { title: 'Simula', text: 'Esegue l\'analisi scelta (AC, transitorio, sinusoide, DC) e aggiorna grafici e osservazioni.' },
  scope:     { title: 'Oscilloscopio', text: 'Visualizza fino a 4 forme d\'onda su nodi diversi. Zoom rotella, pan tasto destro.' },
  bode_mag:  { title: 'Bode — Ampiezza', text: 'Risposta in frequenza in dB. Clicca per aggiornare le osservazioni. Usa ⤢ per ingrandire.' },
  bode_phase:{ title: 'Bode — Fase', text: 'Sfasamento in gradi vs frequenza. −45° indica la frequenza di taglio.' },
  chart_vt:  { title: 'Grafico V(t)', text: 'Tensione nel tempo sul nodo sonda. Utile per transitorio e regime sinusoidale.' },
  canvas:    { title: 'Schema circuito', text: 'Area di disegno. Rotella = zoom, Spazio+drag = pan, clic su nodo = sonda di misura.' },
  nodes:     { title: 'Nodi', text: 'Mostra i nodi di rete e le tensioni calcolate dopo la simulazione.' },
  param_pa:  { title: 'Parametri circuito', text: 'Calcolo automatico di τ, fc, Q, guadagno da topologia RC/RL/RLC/BJT.' },
  analyst:   { title: 'Osservazioni', text: 'Analisi automatica dei risultati: taglio, guadagno, avvisi e suggerimenti.' },
  save:      { title: 'Salva', text: 'Esporta schema, componenti e fili in file JSON.' },
  load:      { title: 'Carica', text: 'Importa un circuito salvato in precedenza.' },
  calculator:{ title: 'Calcolatrice', text: 'Calcolatrice standard e formule elettroniche (fc, τ, dB, XL, Xc, R parallelo). Apri dal menu Strumenti.' },
  cap_converter:{ title: 'Conv. condensatori', text: 'Converte pF/nF/µF, trova valori E12 commerciali e calcola C da fc e R per scegliere il componente.' },
  filter_calc:{ title: 'Calcolo filtri', text: 'Calcola R, C, L, fc, τ e Q in base al tipo di filtro (passa-basso, passa-alto, passa-banda).' },
  freq_meter:{ title: 'Frequenzimetro', text: 'Misura f da periodo T, da conta-cicli o legge frequenza e fc dall\'ultima simulazione.' },
  default:   { title: 'CircuitSim', text: 'Passa il mouse su componenti, grafici o pulsanti per una guida contestuale.' },
};

// ─── Popup modale parametri ──────────────────────────────────────────────────

class CompHelpModal {
  constructor() {
    this._overlay = document.getElementById('comp-help-overlay');
    this._title   = document.getElementById('comp-help-title');
    this._body    = document.getElementById('comp-help-body');
    if (!this._overlay) return;

    this._overlay.addEventListener('click', e => {
      if (e.target === this._overlay) this.close();
    });
    document.getElementById('comp-help-close')?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._overlay.style.display !== 'none') this.close();
    });
  }

  open(helpId) {
    const data = COMP_HELP[helpId];
    if (!data || !this._overlay) return;

    this._title.textContent = data.title;
    const rows = data.params.map(p => `
      <tr>
        <td class="ch-sym">${p.sym}</td>
        <td class="ch-name">${p.name}</td>
        <td class="ch-unit">${p.unit}</td>
        <td class="ch-note">${p.note}</td>
      </tr>`).join('');

    this._body.innerHTML = `
      <p class="ch-desc">${data.desc}</p>
      <table class="ch-table">
        <thead><tr><th>Simbolo</th><th>Parametro</th><th>Unità</th><th>Descrizione</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${data.tips ? `<p class="ch-tips">💡 ${data.tips}</p>` : ''}`;

    this._overlay.style.display = 'flex';
  }

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
  }
}

// ─── Guida contestuale (pannello osservazioni — sezione hover) ─────────────────

class ContextHelp {
  constructor(titleId, textId) {
    this._titleEl = document.getElementById(titleId);
    this._textEl  = document.getElementById(textId);
    this._default  = HOVER_HELP.default;
  }

  show(helpId) {
    const h = HOVER_HELP[helpId] || this._default;
    if (this._titleEl) this._titleEl.textContent = h.title;
    if (this._textEl)  this._textEl.textContent  = h.text;
  }

  reset() {
    this.show('default');
  }

  /** Registra mouseenter/mouseleave su elementi con data-help-id */
  bind(root = document) {
    root.querySelectorAll('[data-help-id]').forEach(el => {
      if (el.classList.contains('comp-help-btn')) return;
      const id = el.dataset.helpId;
      el.addEventListener('mouseenter', () => this.show(id));
      el.addEventListener('mouseleave', () => this.reset());
    });

    root.querySelectorAll('.comp-help-btn[data-help]').forEach(btn => {
      btn.addEventListener('mouseenter', () => this.show(btn.dataset.help));
      btn.addEventListener('mouseleave', () => this.reset());
    });
  }
}

// Esportazione globale
window.COMP_HELP     = COMP_HELP;
window.CompHelpModal = CompHelpModal;
window.ContextHelp   = ContextHelp;
