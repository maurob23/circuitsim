/**
 * app-help.js — Help on line (manuale integrato nell'applicazione).
 */
'use strict';

const APP_HELP_SECTIONS = [
  {
    id: 'intro',
    title: 'Benvenuto in CircuitSim',
    html: `
      <p>CircuitSim è un simulatore di circuiti nel browser: disegna lo schema, collega i componenti,
         esegui <strong>Simula</strong> e leggi grafici, metriche e oscilloscopio.</p>
      <p>Documentazione completa in cartella <code>doc/</code> del progetto
         (<code>02_manuale_utente.md</code>).</p>`,
  },
  {
    id: 'quick',
    title: 'Avvio rapido',
    html: `
      <ol>
        <li>Clicca <strong>Esempio RC</strong> o componi un circuito dalla palette a sinistra.</li>
        <li>Usa <strong>Filo (W)</strong> per collegare i terminali (pallini verdi al passaggio mouse).</li>
        <li>In <strong>Analisi</strong> scegli AC, Gradino o Sinusoide.</li>
        <li>Premi <strong>▶ Simula</strong>.</li>
        <li>Consulta Bode e metriche a destra; opzionale Scope e grafici in basso.</li>
      </ol>`,
  },
  {
    id: 'select',
    title: 'Selezione e modifica',
    html: `
      <ul>
        <li><strong>Seleziona (S)</strong>: click su un componente; trascina per spostarlo.</li>
        <li><strong>Selezione multipla</strong>: trascina un rettangolo su area vuota; <kbd>Shift</kbd> per aggiungere/togliere; <kbd>Del</kbd> elimina il gruppo.</li>
        <li><strong>Ruota (E)</strong>: ruota di 90° il componente o tutti quelli selezionati.</li>
        <li>Pannello <strong>Componente selezionato</strong>: nome, valore, rotazione.</li>
        <li>Pulsante <strong>?</strong> accanto ai componenti in palette: parametri e formule.</li>
      </ul>`,
  },
  {
    id: 'layout',
    title: 'Layout e pannelli',
    html: `
      <ul>
        <li><strong>⊞</strong> — massimo spazio (solo canvas + palette componenti).</li>
        <li><strong>▸</strong> — mostra/nascondi grafici e metriche (destra).</li>
        <li><strong>◧</strong> — assistente analisi (guida hover + osservazioni simulazione).</li>
        <li>Sezioni sidebar collassabili: clic sul titolo per aprire/chiudere.</li>
        <li><strong>Impostazioni</strong>: temi colore, griglia, snap, animazione corrente, analisi predefinita.</li>
      </ul>`,
  },
  {
    id: 'sim',
    title: 'Simulazione',
    html: `
      <table class="app-help-table">
        <thead><tr><th>Analisi</th><th>Risultato</th></tr></thead>
        <tbody>
          <tr><td>AC (Bode)</td><td>Modulo (dB) e fase vs frequenza</td></tr>
          <tr><td>Gradino</td><td>Risposta V(t) al gradino unitario</td></tr>
          <tr><td>Sinusoide</td><td>Vin/Vout nel tempo; alimenta l'oscilloscopio</td></tr>
        </tbody>
      </table>
      <p>Requisiti minimi: almeno un generatore V, un passivo (R/C/L), una massa GND e nodi di uscita collegati.</p>`,
  },
  {
    id: 'tools',
    title: 'Strumenti',
    html: `
      <ul>
        <li><strong>Calcolatrice</strong> — formule elettroniche (fc, τ, dB, …).</li>
        <li><strong>Conv. condensatori</strong> — valori commerciali E12.</li>
        <li><strong>Calcolo filtri</strong> — R, C, L da tipo filtro e fc.</li>
        <li><strong>Frequenzimetro</strong> — da periodo o ultima simulazione.</li>
        <li><strong>Scope</strong> — 4 canali, V/div, zoom/pan sul display.</li>
        <li><strong>Salva / Carica</strong> — circuito in JSON.</li>
      </ul>`,
  },
  {
    id: 'keys',
    title: 'Scorciatoie tastiera',
    html: `
      <table class="app-help-table">
        <tbody>
          <tr><td><kbd>S</kbd></td><td>Seleziona</td></tr>
          <tr><td><kbd>W</kbd></td><td>Filo</td></tr>
          <tr><td><kbd>R C L V G Q</kbd></td><td>Posiziona componente</td></tr>
          <tr><td><kbd>E</kbd></td><td>Ruota</td></tr>
          <tr><td><kbd>Del</kbd></td><td>Elimina selezione</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Annulla / deseleziona</td></tr>
          <tr><td>Rotella</td><td>Zoom canvas o grafico</td></tr>
          <tr><td><kbd>Spazio</kbd>+trascina</td><td>Pan canvas</td></tr>
        </tbody>
      </table>`,
  },
  {
    id: 'help',
    title: 'Altri aiuti',
    html: `
      <ul>
        <li>Passa il mouse su pulsanti e aree con <code>data-help-id</code> — guida nel pannello assistente.</li>
        <li>Dopo <strong>Simula</strong>, le <strong>Osservazioni</strong> commentano taglio, guadagno e avvisi.</li>
        <li>Per problemi tecnici o estensioni del solver, vedi <code>doc/01_architettura_tecnica.md</code>.</li>
      </ul>`,
  },
];

class AppHelpModal {
  constructor() {
    this._overlay = document.getElementById('app-help-overlay');
    this._nav     = document.getElementById('app-help-nav');
    this._body    = document.getElementById('app-help-body');
    if (!this._overlay) return;

    this._buildNav();
    this._overlay.addEventListener('click', e => {
      if (e.target === this._overlay) this.close();
    });
    document.getElementById('app-help-close')?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._overlay.style.display !== 'none') this.close();
    });
  }

  _buildNav() {
    if (!this._nav) return;
    this._nav.innerHTML = APP_HELP_SECTIONS.map((s, i) =>
      `<button type="button" class="app-help-nav-btn${i === 0 ? ' active' : ''}" data-section="${s.id}">${s.title}</button>`
    ).join('');
    this._nav.querySelectorAll('.app-help-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this._showSection(btn.dataset.section));
    });
  }

  _showSection(id) {
    const sec = APP_HELP_SECTIONS.find(s => s.id === id) || APP_HELP_SECTIONS[0];
    if (!this._body) return;
    this._body.innerHTML = `<h4 class="app-help-section-title">${sec.title}</h4>${sec.html}`;
    this._nav?.querySelectorAll('.app-help-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sec.id);
    });
  }

  open(sectionId) {
    if (!this._overlay) return;
    this._showSection(sectionId || 'intro');
    this._overlay.style.display = 'flex';
    document.getElementById('btn-app-help')?.setAttribute('aria-expanded', 'true');
  }

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
    document.getElementById('btn-app-help')?.setAttribute('aria-expanded', 'false');
  }

  toggle() {
    if (this._overlay?.style.display === 'flex') this.close();
    else this.open();
  }
}

window.AppHelpModal = AppHelpModal;
window.appHelp = new AppHelpModal();

document.getElementById('btn-app-help')?.addEventListener('click', () => window.appHelp.toggle());
