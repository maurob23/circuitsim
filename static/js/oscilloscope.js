/**
 * Oscilloscopio virtuale multi-canale per CircuitSim.
 *
 * Visualizza fino a 4 canali (nodi) simultaneamente con:
 *  - Colori distinti per canale
 *  - Cursori verticali di misura (Δt, ΔV)
 *  - Scala tempo (div/ms) e tensione (V/div) per canale
 *  - Trigger sul canale 1 (rising edge)
 */

'use strict';

class Oscilloscope {
  static CH_COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff'];
  static CH_NAMES  = ['CH1', 'CH2', 'CH3', 'CH4'];

  constructor(canvasId, panelId) {
    this.canvas   = document.getElementById(canvasId);
    this.ctx      = this.canvas ? this.canvas.getContext('2d') : null;
    this.panel    = document.getElementById(panelId);

    // Stato canali: { nodeId, label, vdiv, offset, enabled }
    this.channels = [
      { nodeId: null, label: 'CH1', vdiv: 1.0, offset: 0, enabled: true  },
      { nodeId: null, label: 'CH2', vdiv: 1.0, offset: 0, enabled: false },
      { nodeId: null, label: 'CH3', vdiv: 1.0, offset: 0, enabled: false },
      { nodeId: null, label: 'CH4', vdiv: 1.0, offset: 0, enabled: false },
    ];

    this.times      = [];         // array tempi in ms
    this.nodeTraces = {};         // { nodeId: [v0, v1, ...] }
    this.tdiv       = 1.0;        // ms per divisione
    this.trigLevel  = 0.0;        // V soglia trigger
    this.trigOffset = 0;          // campione di riferimento (post-trigger)
    this._cursors   = [null, null]; // posizioni pixel cursori [C1, C2]
    this._dragging  = null;

    this._setupCanvasEvents();
  }

  /** Aggiorna i dati e ri-disegna. */
  setData(times, nodeTraces) {
    this.times      = times       ?? [];
    this.nodeTraces = nodeTraces  ?? {};
    this._findTrigger();
    this.draw();
  }

  /** Assegna un nodo a un canale (0-3). */
  setChannel(chIdx, nodeId) {
    if (chIdx < 0 || chIdx >= 4) return;
    this.channels[chIdx].nodeId  = nodeId;
    this.channels[chIdx].enabled = !!nodeId;
    this.draw();
  }

  /** Mostra o nasconde il pannello. */
  show(visible) {
    if (this.panel) this.panel.style.display = visible ? 'flex' : 'none';
  }

  toggle() {
    if (!this.panel) return;
    const vis = this.panel.style.display === 'none' || !this.panel.style.display;
    this.show(vis);
    if (vis) this.draw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Disegno
  // ─────────────────────────────────────────────────────────────────────────

  draw() {
    if (!this.ctx || !this.canvas) return;
    const c   = this.canvas;
    const ctx = this.ctx;

    // Dimensioni responsive
    c.width  = c.offsetWidth  || 700;
    c.height = c.offsetHeight || 280;

    const W = c.width, H = c.height;
    const PAD = { top: 18, right: 12, bottom: 32, left: 52 };
    const pw = W - PAD.left - PAD.right;
    const ph = H - PAD.top  - PAD.bottom;
    const NDIV_X = 10, NDIV_Y = 8;

    ctx.clearRect(0, 0, W, H);

    // ── Sfondo ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // ── Griglia ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= NDIV_X; i++) {
      const x = PAD.left + (i / NDIV_X) * pw;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + ph); ctx.stroke();
    }
    for (let i = 0; i <= NDIV_Y; i++) {
      const y = PAD.top + (i / NDIV_Y) * ph;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + pw, y); ctx.stroke();
    }
    // Assi centrali più luminosi
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth   = 1;
    const cy = PAD.top + ph / 2;
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + pw, cy); ctx.stroke();

    // ── Etichette asse X (tempo) ─────────────────────────────────────────────
    ctx.fillStyle  = '#8b949e';
    ctx.font       = '10px JetBrains Mono, monospace';
    ctx.textAlign  = 'center';
    const totalMs  = this.tdiv * NDIV_X;
    for (let i = 0; i <= NDIV_X; i++) {
      const x = PAD.left + (i / NDIV_X) * pw;
      const t = (this.trigOffset / (this.times.length || 1)) * totalMs + (i / NDIV_X) * totalMs;
      ctx.fillText(t.toFixed(1), x, H - PAD.bottom + 14);
    }
    ctx.fillText('ms', PAD.left + pw + 18, H - PAD.bottom + 14);

    // ── Etichette asse Y (primo canale attivo) ────────────────────────────────
    const ch0 = this.channels.find(c => c.enabled && c.nodeId);
    const vdiv0 = ch0 ? ch0.vdiv : 1.0;
    const halfY = (NDIV_Y / 2) * vdiv0;
    ctx.textAlign = 'right';
    for (let i = 0; i <= NDIV_Y; i++) {
      const y  = PAD.top + (i / NDIV_Y) * ph;
      const vv = halfY - (i / NDIV_Y) * 2 * halfY;
      ctx.fillText(vv.toFixed(2), PAD.left - 4, y + 4);
    }

    // ── Tracce ────────────────────────────────────────────────────────────────
    if (this.times.length < 2) {
      ctx.fillStyle = '#484f58';
      ctx.font      = '13px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Nessun dato — esegui una simulazione Sinusoide o Transitorio', W / 2, H / 2);
    } else {
      this.channels.forEach((ch, ci) => {
        if (!ch.enabled || !ch.nodeId) return;
        const trace = this.nodeTraces[ch.nodeId];
        if (!trace || trace.length < 2) return;

        const color = Oscilloscope.CH_COLORS[ci];
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();

        const tTotal  = this.times[this.times.length - 1] - this.times[0];
        const tWindow = this.tdiv * NDIV_X;

        let first = true;
        for (let i = this.trigOffset; i < trace.length; i++) {
          const tRel = this.times[i] - (this.times[this.trigOffset] ?? 0);
          if (tRel > tWindow) break;
          const xPx = PAD.left + (tRel / tWindow) * pw;
          const v   = trace[i] + ch.offset;
          const yPx = cy - (v / (ch.vdiv * NDIV_Y / 2)) * (ph / 2);
          if (first) { ctx.moveTo(xPx, yPx); first = false; }
          else        { ctx.lineTo(xPx, yPx); }
        }
        ctx.stroke();

        // Etichetta canale
        ctx.fillStyle  = color;
        ctx.font       = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign  = 'left';
        ctx.fillText(`${ch.label} ${ch.nodeId} ${ch.vdiv}V/div`,
                     PAD.left + 6 + ci * 130, PAD.top + 12);
      });
    }

    // ── Cursori di misura ─────────────────────────────────────────────────────
    this._drawCursors(ctx, PAD, pw, ph);
  }

  _drawCursors(ctx, PAD, pw, ph) {
    const colors = ['#f0e040', '#40e0f0'];
    this._cursors.forEach((cx, i) => {
      if (cx === null) return;
      ctx.strokeStyle = colors[i];
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left + cx, PAD.top);
      ctx.lineTo(PAD.left + cx, PAD.top + ph);
      ctx.stroke();
      ctx.setLineDash([]);

      // etichetta tempo
      const tWindow = this.tdiv * 10;
      const tMs     = (cx / pw) * tWindow;
      ctx.fillStyle  = colors[i];
      ctx.font       = '9px JetBrains Mono, monospace';
      ctx.textAlign  = cx > pw * 0.7 ? 'right' : 'left';
      ctx.fillText(`C${i + 1}: ${tMs.toFixed(2)} ms`, PAD.left + cx + (i === 0 ? 3 : -3), PAD.top + 14 + i * 12);
    });

    // Δt tra i due cursori
    if (this._cursors[0] !== null && this._cursors[1] !== null) {
      const tWindow = this.tdiv * 10;
      const dt = Math.abs(this._cursors[1] - this._cursors[0]) / pw * tWindow;
      const fHz = dt > 0 ? (1000 / dt).toFixed(1) + ' Hz' : '—';
      ctx.fillStyle  = '#e6edf3';
      ctx.font       = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign  = 'center';
      ctx.fillText(`Δt=${dt.toFixed(3)} ms  f=${fHz}`,
                   PAD.left + pw / 2, PAD.top + ph - 6);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trigger
  // ─────────────────────────────────────────────────────────────────────────

  _findTrigger() {
    const ch = this.channels.find(c => c.enabled && c.nodeId);
    if (!ch) { this.trigOffset = 0; return; }
    const trace = this.nodeTraces[ch.nodeId];
    if (!trace || trace.length < 4) { this.trigOffset = 0; return; }

    // Rising edge crossing di trigLevel
    for (let i = 1; i < trace.length - 1; i++) {
      if (trace[i - 1] <= this.trigLevel && trace[i] > this.trigLevel) {
        this.trigOffset = i;
        return;
      }
    }
    this.trigOffset = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Interazione cursori (drag)
  // ─────────────────────────────────────────────────────────────────────────

  _setupCanvasEvents() {
    if (!this.canvas) return;
    const PAD_LEFT = 52;

    this.canvas.addEventListener('mousedown', e => {
      const rect = this.canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left - PAD_LEFT;
      // Verifica se stiamo cliccando vicino a un cursore esistente
      for (let i = 0; i < 2; i++) {
        if (this._cursors[i] !== null && Math.abs(x - this._cursors[i]) < 8) {
          this._dragging = i;
          return;
        }
      }
      // Posiziona il prossimo cursore libero
      const free = this._cursors.findIndex(c => c === null);
      if (free !== -1) {
        this._cursors[free] = Math.max(0, x);
        this.draw();
      } else {
        // Se entrambi occupati, il click sinistro sposta C1, destro C2
        const idx = e.button === 2 ? 1 : 0;
        this._cursors[idx] = Math.max(0, x);
        this.draw();
      }
    });

    this.canvas.addEventListener('mousemove', e => {
      if (this._dragging === null) return;
      const rect = this.canvas.getBoundingClientRect();
      const x    = e.clientX - rect.left - PAD_LEFT;
      const pw   = this.canvas.width - PAD_LEFT - 12;
      this._cursors[this._dragging] = Math.max(0, Math.min(pw, x));
      this.draw();
    });

    this.canvas.addEventListener('mouseup',   () => { this._dragging = null; });
    this.canvas.addEventListener('mouseleave',() => { this._dragging = null; });

    // Doppio click per rimuovere cursori
    this.canvas.addEventListener('dblclick', () => {
      this._cursors = [null, null];
      this.draw();
    });

    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
}
