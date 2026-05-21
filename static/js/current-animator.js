/**
 * CurrentAnimator — visualizzazione animata della corrente di loop.
 *
 * Dopo una simulazione (sinusoidale o transitorio), anima piccoli pallini
 * lungo i fili e i corpi dei componenti:
 *   • Verde   (#3fb950) → corrente positiva (verso convenzionale)
 *   • Arancione (#f0883e) → corrente negativa (verso inverso)
 *   • Velocità proporzionale a |I(t)| / I_max
 *
 * La timeline della simulazione viene riprodotta a velocità ridotta:
 *   1 periodo del segnale = 1 secondo di animazione (visibilità ottimale).
 *
 * Utilizzo:
 *   const anim = new CurrentAnimator(circuitCanvasInstance);
 *   anim.start(times_ms, currents_A, frequency_Hz);
 *   anim.stop();
 */

'use strict';

class CurrentAnimator {
  constructor(cc) {
    this.cc = cc;          // istanza CircuitCanvas

    this._active    = false;
    this._paused    = false;
    this._raf       = null;
    this._wallStart = 0;
    this._pausedElapsed = 0;   // ms di simulazione accumulati prima di una pausa

    // Dati della simulazione
    this._times_ms  = null;
    this._currents  = null;
    this._I_max     = 1;
    this._T_ms      = 1;      // periodo segnale in ms

    // Particelle: [{segType, segIdx, phase, polarity}]
    this._particles = [];
    this._I_norm    = 0;      // valore corrente normalizzato [-1..+1]

    // Costanti di rendering
    this.N_PER_SEG      = 4;     // particelle per segmento
    this.DOT_R          = 2.8;   // raggio pallino px
    this.BASE_SPEED     = 0.018; // avanzamento fase per frame a |I|=I_max (a speedMultiplier=1)
    this.MIN_SPEED      = 0.003; // velocità minima (sempre visibili)
    this.speedMultiplier = 1.0;  // controllabile dall'esterno (1..10)
  }

  // ── API pubblica ────────────────────────────────────────────────────────────

  /**
   * Avvia l'animazione.
   * @param {number[]} times_ms   - array di tempi della simulazione (ms)
   * @param {number[]} currents   - corrente istantanea (A) per ogni punto
   * @param {number}   freq_hz    - frequenza del segnale (Hz), usata per la velocità di playback
   */
  start(times_ms, currents, freq_hz = 0) {
    this.stop();

    this._times_ms = times_ms;
    this._currents = currents;
    this._I_max    = Math.max(...currents.map(Math.abs), 1e-12);
    this._T_ms     = freq_hz > 0 ? (1000 / freq_hz) : times_ms[times_ms.length - 1];

    this._active    = true;
    this._wallStart = performance.now();

    this._buildParticles();

    const nWires = this.cc.wires.length;
    const nComps = (this.cc._animPassiveComps || []).length;
    console.log(`[CurrentAnim] avviato — ${this._particles.length} particelle (${nWires} fili + ${nComps} comp), T=${this._T_ms.toFixed(2)} ms, I_max=${this._I_max.toExponential(2)}`);

    this._loop();
  }

  stop() {
    this._active  = false;
    this._paused  = false;
    this._pausedElapsed = 0;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this.cc._animParticles = null;
    this.cc._animI_norm    = 0;
    this.cc.render();
  }

  pause() {
    if (!this._active || this._paused) return;
    this._paused = true;
    // Salva quanti ms di wall-clock erano trascorsi
    this._pausedElapsed = performance.now() - this._wallStart;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  resume() {
    if (!this._active || !this._paused) return;
    this._paused    = false;
    // Riposiziona wallStart in modo che la simulazione riparta da dove era rimasta
    this._wallStart = performance.now() - this._pausedElapsed;
    this._loop();
  }

  togglePause() {
    if (this._paused) this.resume(); else this.pause();
  }

  get running() { return this._active; }
  get paused()  { return this._paused; }

  // ── Costruzione particelle ──────────────────────────────────────────────────

  _buildParticles() {
    this._particles = [];
    const N = this.N_PER_SEG;

    // Segmenti: fili espliciti
    for (let w = 0; w < this.cc.wires.length; w++) {
      for (let p = 0; p < N; p++) {
        this._particles.push({
          segType: 'wire',
          segIdx:  w,
          phase:   p / N,
          polarity: 1,   // filo: da from→to è direzione positiva
        });
      }
    }

    // Segmenti: corpi dei componenti (escluso gnd)
    const passiveComps = this.cc.components.filter(c => c.type !== 'gnd');
    for (let c = 0; c < passiveComps.length; c++) {
      const comp = passiveComps[c];
      // Per la sorgente di tensione la corrente interna va da neg→pos (inverso rispetto ai terminali)
      const polarity = (comp.type === 'vsource') ? -1 : 1;
      for (let p = 0; p < N; p++) {
        this._particles.push({
          segType:  'comp',
          segIdx:   c,
          phase:    p / N,
          polarity,
        });
      }
    }

    // Condividi con CircuitCanvas per il rendering
    this.cc._animParticles = this._particles;
    this.cc._animPassiveComps = passiveComps;
  }

  // ── Loop di animazione ──────────────────────────────────────────────────────

  _loop() {
    if (!this._active || this._paused) return;

    const wallElapsed = performance.now() - this._wallStart;  // ms

    // Playback: 1 periodo del segnale in 1 secondo di tempo reale
    const playRatio = this._T_ms / 1000.0;
    const t_sim = (wallElapsed * playRatio) % this._times_ms[this._times_ms.length - 1];

    const idx    = this._bisect(this._times_ms, t_sim);
    const I      = this._currents[Math.min(idx, this._currents.length - 1)];
    const I_norm = I / this._I_max;

    this._I_norm = I_norm;

    const speed = (Math.abs(I_norm) * this.BASE_SPEED + this.MIN_SPEED) * this.speedMultiplier;
    const dir   = I_norm >= 0 ? 1 : -1;

    for (const p of this._particles) {
      const advance = dir * p.polarity * speed;
      p.phase = ((p.phase + advance) % 1 + 1) % 1;
    }

    this.cc._animI_norm = I_norm;
    this.cc.render();

    this._raf = requestAnimationFrame(() => this._loop());
  }

  _bisect(arr, val) {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < val) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
}
