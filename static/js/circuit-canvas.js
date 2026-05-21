/**
 * CircuitCanvas — interactive schematic editor
 *
 * Components are snapped to a 40 px grid. Each component has:
 *   • A position (x, y) which is the location of terminal A in canvas pixels
 *   • A rotation (degrees, multiples of 90°)
 *   • A value (Ω, F, H, V …)
 *
 * Terminals in canvas space are computed by rotating the local offset
 * (80, 0) around (x, y) for two-terminal parts.
 *
 * Node detection uses Union-Find over (compId, termId) keys.
 * Two terminals are merged when:
 *   1. They share the same rounded canvas position (co-location), OR
 *   2. An explicit wire connects them.
 * GND component terminals seed the 'gnd' node.
 */

'use strict';

/** Formatta un valore di tensione per il display sul canvas. */
function _fmtV(v) {
  if (v === undefined || v === null) return '';
  const abs = Math.abs(v);
  if (abs === 0)         return '0 V';
  if (abs < 0.001)       return (v * 1000).toFixed(2) + ' mV';
  if (abs < 1)           return (v * 1000).toFixed(1) + ' mV';
  return v.toFixed(3)    + ' V';
}

// ─── Component catalogue ────────────────────────────────────────────────────

const COMP_DEFS = {
  resistor: {
    label: 'Resistenza',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 10_000,
    unit: 'Ω',
    netlistType: 'resistor',
  },
  capacitor: {
    label: 'Condensatore',
    terminals: [
      { id: 'a', lx: 0,  ly: 0 },
      { id: 'b', lx: 80, ly: 0 },
    ],
    defaultValue: 47e-9,
    unit: 'F',
    netlistType: 'capacitor',
  },
  vsource: {
    label: 'Generatore V',
    terminals: [
      { id: 'pos', lx: 0,  ly: 0 },   // + terminal
      { id: 'neg', lx: 80, ly: 0 },   // − terminal
    ],
    defaultValue: 1,
    unit: 'V',
    netlistType: 'voltage_source',
  },
  gnd: {
    label: 'Massa',
    terminals: [
      { id: 'g', lx: 0, ly: 0 },
    ],
    defaultValue: null,
    unit: '',
    netlistType: null,   // GND is not a netlist component — it labels a node
  },

  // BJT NPN — terminali: b=Base (origine), c=Collettore, e=Emettitore
  // Layout: B a sinistra (0,0), C in alto a destra (40,-40), E in basso a destra (40,40)
  bjt_npn: {
    label: 'BJT NPN',
    terminals: [
      { id: 'b', lx:  0, ly:  0  },   // Base   (origine)
      { id: 'c', lx: 40, ly: -40 },   // Collettore
      { id: 'e', lx: 40, ly:  40 },   // Emettitore
    ],
    defaultValue: 100,   // β (hFE)
    unit: 'β',
    netlistType: 'bjt_npn',
  },
};

// ─── Utility ─────────────────────────────────────────────────────────────────

function snapGrid(v, g) {
  return Math.round(v / g) * g;
}

/** Rotate local offset (lx, ly) by `deg` degrees CCW, return {dx, dy} in canvas space. */
function rotateOffset(lx, ly, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    dx: lx * cos - ly * sin,
    dy: lx * sin + ly * cos,
  };
}

function formatValue(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'resistor') {
    if (value >= 1e6)  return `${+(value / 1e6).toPrecision(4)} MΩ`;
    if (value >= 1e3)  return `${+(value / 1e3).toPrecision(4)} kΩ`;
    return `${+value.toPrecision(4)} Ω`;
  }
  if (type === 'capacitor') {
    if (value >= 1e-3)  return `${+(value / 1e-3).toPrecision(4)} mF`;
    if (value >= 1e-6)  return `${+(value / 1e-6).toPrecision(4)} µF`;
    if (value >= 1e-9)  return `${+(value / 1e-9).toPrecision(4)} nF`;
    return `${+(value / 1e-12).toPrecision(4)} pF`;
  }
  if (type === 'vsource')  return `${+value.toPrecision(4)} V`;
  if (type === 'bjt_npn') return `β=${+value}`;
  return String(value);
}

// ─── Union-Find ───────────────────────────────────────────────────────────────

class UnionFind {
  constructor() { this._p = {}; this._rank = {}; }

  ensure(k) {
    if (!(k in this._p)) { this._p[k] = k; this._rank[k] = 0; }
  }

  find(k) {
    this.ensure(k);
    if (this._p[k] !== k) this._p[k] = this.find(this._p[k]);
    return this._p[k];
  }

  union(a, b) {
    this.ensure(a); this.ensure(b);
    const pa = this.find(a), pb = this.find(b);
    if (pa === pb) return;
    if (this._rank[pa] < this._rank[pb]) { this._p[pa] = pb; }
    else if (this._rank[pa] > this._rank[pb]) { this._p[pb] = pa; }
    else { this._p[pb] = pa; this._rank[pa]++; }
  }
}

// ─── CircuitCanvas class ──────────────────────────────────────────────────────

class CircuitCanvas {
  constructor(canvasEl) {
    this.el  = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.GRID = 40;

    this.components = [];   // [{id, type, x, y, rotation, value}]
    this.wires      = [];   // [{from: {compId, termId}, to: {compId, termId}}]
    this.texts      = [];   // [{id, x, y, text, fontSize, color}]

    this.tool        = 'select';
    this.wireState   = null;    // {compId, termId} — first terminal of wire being drawn
    this.dragState   = null;    // {comp, ox, oy} — dragging a component
    this.selected    = null;    // comp or null
    this.mousePos    = {x: 0, y: 0};
    this.hovTerm     = null;    // {compId, termId, x, y}

    // ── Vista (zoom + pan) ─────────────────────────────────────────────────
    this._zoom   = 1.0;
    this._panX   = 0;
    this._panY   = 0;
    this._panDrag = null;  // {startX, startY, startPanX, startPanY}

    this._nextId = 1;

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(canvasEl.parentElement);

    this._setupEvents();
    this._onResize();
  }

  // ── Zoom / pan API ────────────────────────────────────────────────────────

  /** Trasforma coordinate schermo → mondo. */
  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._panX) / this._zoom,
      y: (sy - this._panY) / this._zoom,
    };
  }

  zoomBy(factor, cx, cy) {
    const w = this.el.width, h = this.el.height;
    const sx = cx ?? w / 2, sy = cy ?? h / 2;
    const wx = (sx - this._panX) / this._zoom;
    const wy = (sy - this._panY) / this._zoom;
    this._zoom = Math.max(0.2, Math.min(4.0, this._zoom * factor));
    this._panX = sx - wx * this._zoom;
    this._panY = sy - wy * this._zoom;
    this.render();
  }

  /** Adatta la vista per mostrare tutti i componenti. */
  fitAll() {
    if (!this.components.length) { this.resetView(); return; }
    const terms = this.getAllTerminals();
    const xs = terms.map(t => t.x);
    const ys = terms.map(t => t.y);
    const margin = this.GRID * 2;
    const xMin = Math.min(...xs) - margin;
    const xMax = Math.max(...xs) + margin;
    const yMin = Math.min(...ys) - margin;
    const yMax = Math.max(...ys) + margin;
    const cw = this.el.width, ch = this.el.height;
    const zx = cw / (xMax - xMin);
    const zy = ch / (yMax - yMin);
    this._zoom = Math.max(0.2, Math.min(4.0, Math.min(zx, zy)));
    this._panX = (cw - (xMin + xMax) * this._zoom) / 2;
    this._panY = (ch - (yMin + yMax) * this._zoom) / 2;
    this.render();
  }

  resetView() {
    this._zoom = 1.0;
    this._panX = 0;
    this._panY = 0;
    this.render();
  }

  // ── Tool / state API ──────────────────────────────────────────────────────

  setTool(tool) {
    this.tool      = tool;
    this.wireState = null;
    this.dragState = null;
    this.render();
    this._updateCursor();
  }

  clearAll() {
    this.components = [];
    this.wires      = [];
    this.texts      = [];
    this.selected   = null;
    this.wireState  = null;
    this.dragState  = null;
    this._nextId    = 1;
    this.render();
    this._emitChange();
  }

  rotateSelected() {
    if (!this.selected) return;
    this.selected.rotation = ((this.selected.rotation || 0) + 90) % 360;
    this.render();
    this._emitChange();
  }

  loadExample() {
    this.clearAll();
    const G = this.GRID;

    // Pre-built RC low-pass filter layout (values from the LINEA AMP spec)
    const v1 = this._makeComp('vsource',  2*G, 5*G,  90, 1);
    const r1 = this._makeComp('resistor', 2*G, 5*G,   0, 10_000);
    const c1 = this._makeComp('capacitor',6*G, 5*G,  90, 47e-9);
    const g1 = this._makeComp('gnd',      2*G, 9*G,   0, null);
    const g2 = this._makeComp('gnd',      6*G, 9*G,   0, null);
    this.components = [v1, r1, c1, g1, g2];

    // V1.pos (2G,5G) connects to R1.a (2G,5G) — same position (co-location)
    // R1.b (6G,5G) connects to C1.a (6G,5G) — same position (co-location)
    // V1.neg (2G,9G) connects to GND1 (2G,9G) — same position
    // C1.b  (6G,9G) connects to GND2 (6G,9G) — same position
    // Only explicit wire needed: connect V1.pos/R1.a node to itself (they're co-located)
    // Actually no wire needed at all — all joints are co-located!

    this._nextId = 6;
    this.render();
    this._emitChange();
  }

  _makeComp(type, x, y, rotation, value) {
    const n      = this._nextId++;
    const prefix = { resistor: 'R', capacitor: 'C', vsource: 'V', gnd: 'GND',
                     bjt_npn: 'Q' }[type] ?? type[0].toUpperCase();
    const label  = type === 'gnd' ? 'GND' : `${prefix}${n}`;
    const comp   = { id: `${type}_${n}`, label, type, x, y, rotation: rotation || 0, value };
    if (type === 'bjt_npn') comp.ic_q_ma = 1.0;   // IC quiescente default 1 mA
    return comp;
  }

  // ── Terminal geometry ─────────────────────────────────────────────────────

  getTerminals(comp) {
    const def = COMP_DEFS[comp.type];
    const rot = comp.rotation || 0;
    return def.terminals.map((t) => {
      const { dx, dy } = rotateOffset(t.lx, t.ly, rot);
      return {
        compId: comp.id,
        termId: t.id,
        x: comp.x + dx,
        y: comp.y + dy,
      };
    });
  }

  getAllTerminals() {
    return this.components.flatMap((c) => this.getTerminals(c));
  }

  findTerminalNear(cx, cy, radius = 14) {
    const r2 = radius * radius;
    for (const comp of this.components) {
      for (const t of this.getTerminals(comp)) {
        if ((t.x - cx) ** 2 + (t.y - cy) ** 2 <= r2) return t;
      }
    }
    return null;
  }

  findComponentAt(cx, cy) {
    // Hit-test in reverse order (top-most drawn last)
    for (let i = this.components.length - 1; i >= 0; i--) {
      if (this._hitTest(this.components[i], cx, cy)) return this.components[i];
    }
    return null;
  }

  _hitTest(comp, cx, cy) {
    const terms = this.getTerminals(comp);
    const xs = terms.map((t) => t.x);
    const ys = terms.map((t) => t.y);
    const margin = 20;
    const minX = Math.min(...xs) - margin;
    const maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin;
    const maxY = Math.max(...ys) + margin;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }

  findWireNear(cx, cy, tol = 7) {
    for (let i = this.wires.length - 1; i >= 0; i--) {
      const w = this.wires[i];
      const a = this._resolveTermPos(w.from);
      const b = this._resolveTermPos(w.to);
      if (!a || !b) continue;

      // Check distance to the orthogonal wire segment
      const pts = this._wirePoints(a, b);
      for (let j = 0; j < pts.length - 1; j++) {
        if (pointSegDist(cx, cy, pts[j].x, pts[j].y, pts[j+1].x, pts[j+1].y) <= tol) {
          return i;
        }
      }
    }
    return -1;
  }

  _resolveTermPos(ref) {
    const comp = this.components.find((c) => c.id === ref.compId);
    if (!comp) return null;
    return this.getTerminals(comp).find((t) => t.termId === ref.termId) || null;
  }

  // ── Netlist extraction ────────────────────────────────────────────────────

  generateNetlist(analysisOverrides = {}) {
    if (this.components.length === 0) return null;

    const allTerms = this.getAllTerminals();
    const uf = new UnionFind();

    // Key for each terminal
    const key = (t) => `${t.compId}__${t.termId}`;
    for (const t of allTerms) uf.ensure(key(t));

    // 1. Co-location: terminals at the same rounded pixel are connected
    const byPos = {};
    for (const t of allTerms) {
      const pk = `${Math.round(t.x)},${Math.round(t.y)}`;
      if (!byPos[pk]) byPos[pk] = [];
      byPos[pk].push(key(t));
    }
    for (const keys of Object.values(byPos)) {
      for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
    }

    // 2. Explicit wires
    for (const w of this.wires) {
      const ka = `${w.from.compId}__${w.from.termId}`;
      const kb = `${w.to.compId}__${w.to.termId}`;
      uf.union(ka, kb);
    }

    // 3. Assign node names — GND first
    const nodeNames = {};

    for (const comp of this.components) {
      if (comp.type !== 'gnd') continue;
      const t = this.getTerminals(comp)[0];
      const root = uf.find(key(t));
      nodeNames[root] = 'gnd';
    }

    let nodeCounter = 1;
    for (const t of allTerms) {
      const root = uf.find(key(t));
      if (!nodeNames[root]) nodeNames[root] = `n${nodeCounter++}`;
    }

    // 4. Build netlist components
    const netComps = [];
    for (const comp of this.components) {
      if (comp.type === 'gnd') continue;
      const def = COMP_DEFS[comp.type];
      const terms = this.getTerminals(comp);
      const nodes = terms.map((t) => nodeNames[uf.find(key(t))]);

      const entry = {
        id: comp.id,
        type: def.netlistType,
        value: comp.value,
        nodes,
      };
      if (comp.type === 'bjt_npn') entry.ic_q_ma = comp.ic_q_ma ?? 1.0;
      netComps.push(entry);
    }

    if (netComps.length === 0) return null;

    // 5. Detect output node (first non-gnd, non-vsource node)
    const vsourceNodes = new Set(
      netComps
        .filter((c) => c.type === 'voltage_source')
        .flatMap((c) => c.nodes)
        .filter((n) => n !== 'gnd')
    );

    let outputNode = null;
    const allNetNodes = [...new Set(netComps.flatMap((c) => c.nodes))];
    for (const n of allNetNodes) {
      if (n !== 'gnd' && !vsourceNodes.has(n)) {
        outputNode = n;
        break;
      }
    }

    // Override nodo di uscita se l'utente ha selezionato una sonda
    if (analysisOverrides.probe_node) outputNode = analysisOverrides.probe_node;

    const analysis = Object.assign(
      { type: 'ac', start_freq: 10, stop_freq: 100_000, points_per_decade: 100 },
      analysisOverrides
    );
    delete analysis.probe_node;  // non deve finire nel payload JSON

    return {
      components: netComps,
      analysis,
      output_nodes: outputNode ? [outputNode] : [],
    };
  }

  // ── Text labels ───────────────────────────────────────────────────────────

  addText(x, y, text, fontSize = 13, color = '#e6edf3') {
    const id = `text_${this._nextId++}`;
    this.texts.push({ id, x, y, text, fontSize, color });
    this.render();
    this._emitChange();
    return id;
  }

  findTextAt(x, y) {
    const HIT = 12;
    // Iterate in reverse to pick top-most
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      if (Math.abs(x - t.x) < 80 && Math.abs(y - t.y) < HIT) return t;
    }
    return null;
  }

  _drawTexts() {
    const ctx = this.ctx;
    for (const t of this.texts) {
      const isSel = this.selected === t;
      ctx.save();
      ctx.font      = `${t.fontSize}px JetBrains Mono, monospace`;
      ctx.fillStyle = isSel ? '#e3b341' : (t.color || '#e6edf3');
      ctx.textAlign = 'left';
      ctx.fillText(t.text, t.x, t.y);
      if (isSel) {
        const m = ctx.measureText(t.text);
        ctx.strokeStyle = '#e3b341';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(t.x - 3, t.y - t.fontSize - 2, m.width + 6, t.fontSize + 6);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  /**
   * Apre un input inline posizionato sullo schermo al punto (wx,wy) in coordinate mondo.
   * onConfirm(text) viene chiamato con il valore finale.
   */
  openInlineEditor(wx, wy, initialValue, onConfirm) {
    const wrap  = document.getElementById('inline-editor-wrap');
    const input = document.getElementById('inline-editor-input');
    if (!wrap || !input) return;

    // Converti coordinate mondo → schermo
    const rect = this.el.getBoundingClientRect();
    const sx   = rect.left + wx * this._zoom + this._panX;
    const sy   = rect.top  + wy * this._zoom + this._panY;

    wrap.style.display = '';
    wrap.style.left    = sx + 'px';
    wrap.style.top     = (sy - 20) + 'px';
    input.value        = initialValue;
    input.style.fontSize = Math.max(11, Math.min(24, 13 * this._zoom)) + 'px';

    // Flag per ignorare il primo blur causato dal mousedown sul canvas
    let _blurGuard = true;

    const finish = (save) => {
      if (wrap.style.display === 'none') return;  // già chiuso
      wrap.style.display = 'none';
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur',    onBlur);
      if (save && input.value.trim()) onConfirm(input.value.trim());
    };
    const onKey  = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); finish(true);  }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    const onBlur = () => {
      if (_blurGuard) { _blurGuard = false; return; }
      finish(true);
    };

    input.addEventListener('keydown', onKey);
    input.addEventListener('blur',    onBlur);

    // Delay focus per evitare il blur immediato da mousedown
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
        _blurGuard = false;
      });
    });
  }

  // ── Node map ──────────────────────────────────────────────────────────────

  /**
   * Calcola la posizione visuale di ogni nodo elettrico usando lo stesso
   * Union-Find di generateNetlist. Ritorna [{name, x, y, isOutput}].
   */
  computeNodeMap(outputNodeName = null) {
    const allTerms = this.getAllTerminals();
    if (allTerms.length === 0) return [];

    const uf  = new UnionFind();
    const key = (t) => `${t.compId}__${t.termId}`;
    for (const t of allTerms) uf.ensure(key(t));

    // Co-location
    const byPos = {};
    for (const t of allTerms) {
      const pk = `${Math.round(t.x)},${Math.round(t.y)}`;
      if (!byPos[pk]) byPos[pk] = [];
      byPos[pk].push(key(t));
    }
    for (const keys of Object.values(byPos)) {
      for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
    }

    // Explicit wires
    for (const w of this.wires) {
      uf.union(`${w.from.compId}__${w.from.termId}`, `${w.to.compId}__${w.to.termId}`);
    }

    // GND first
    const nodeNames = {};
    for (const comp of this.components) {
      if (comp.type !== 'gnd') continue;
      const t = this.getTerminals(comp)[0];
      nodeNames[uf.find(key(t))] = 'gnd';
    }
    let nodeCounter = 1;
    const rootPos = {};
    for (const t of allTerms) {
      const root = uf.find(key(t));
      if (!nodeNames[root]) nodeNames[root] = `n${nodeCounter++}`;
      if (!rootPos[root]) rootPos[root] = { xs: [], ys: [] };
      rootPos[root].xs.push(t.x);
      rootPos[root].ys.push(t.y);
    }

    const seen = new Set();
    const result = [];
    for (const t of allTerms) {
      const root = uf.find(key(t));
      if (seen.has(root)) continue;
      seen.add(root);
      const p = rootPos[root];
      result.push({
        name:     nodeNames[root],
        x:        p.xs.reduce((a, b) => a + b, 0) / p.xs.length,
        y:        p.ys.reduce((a, b) => a + b, 0) / p.ys.length,
        isOutput: nodeNames[root] === outputNodeName,
        voltage:  undefined,
      });
    }
    return result;
  }

  /** Imposta il layer di nodi visibili (chiamato da app.js dopo la simulazione). */
  setNodeOverlay(nodes) {
    this._nodeOverlay = nodes;
    this.render();
  }

  clearNodeOverlay() {
    this._nodeOverlay = null;
    this.render();
  }

  _renderNodes() {
    const ctx   = this.ctx;
    const nodes = this._nodeOverlay;
    if (!nodes?.length) return;

    ctx.save();
    ctx.textAlign = 'center';

    for (const node of nodes) {
      const isGnd      = node.name === 'gnd';
      const isSelected = node.name === this._selectedNode;
      // Usa il colore della palette (impostato da app.js), con fallback
      const baseColor  = isGnd    ? '#6e7681'
                       : (node.color ?? (node.isOutput ? '#3fb950' : '#e3b341'));
      const R = isGnd ? 5 : 8;

      // Alone esterna (più intensa se selezionato)
      ctx.beginPath();
      ctx.arc(node.x, node.y, R + 4, 0, Math.PI * 2);
      ctx.fillStyle = baseColor + (isSelected ? '50' : '20');
      ctx.fill();

      // Cerchio del nodo
      ctx.beginPath();
      ctx.arc(node.x, node.y, R, 0, Math.PI * 2);
      ctx.fillStyle = baseColor + (isSelected ? '60' : '33');
      ctx.fill();
      ctx.strokeStyle = baseColor;
      ctx.lineWidth   = isSelected ? 2.2 : (isGnd ? 1 : 1.6);
      ctx.stroke();

      // Punto centrale
      ctx.beginPath();
      ctx.arc(node.x, node.y, isSelected ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();

      // Anello tratteggiato per nodo selezionato (sonda)
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, R + 7, 0, Math.PI * 2);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth   = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (!isGnd) {
        // Nome nodo sopra
        ctx.font      = `${isSelected ? 'bold ' : ''}11px monospace`;
        ctx.fillStyle = baseColor;
        ctx.fillText(node.name, node.x, node.y - R - 5);

        // Badge "SONDA" sotto il nome se selezionato
        if (isSelected) {
          ctx.font      = '9px monospace';
          ctx.fillStyle = baseColor + 'cc';
          ctx.fillText('● SONDA', node.x, node.y - R - 16);
        }

        // Tensione sotto (se disponibile)
        if (node.voltage !== undefined && node.voltage !== null) {
          ctx.font      = '10px monospace';
          ctx.fillStyle = baseColor + 'cc';
          ctx.fillText(_fmtV(node.voltage), node.x, node.y + R + 14);
        }
      }
    }
    ctx.restore();
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _setupEvents() {
    this.el.addEventListener('mousedown',  (e) => this._onMouseDown(e));
    this.el.addEventListener('mousemove',  (e) => this._onMouseMove(e));
    this.el.addEventListener('mouseup',    (e) => this._onMouseUp(e));
    this.el.addEventListener('mouseleave', ()  => this._onMouseLeave());
    this.el.addEventListener('dblclick',   (e) => this._onDblClick(e));

    // Zoom con rotella del mouse
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x: sx, y: sy } = this._posScreen(e);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoomBy(factor, sx, sy);
    }, { passive: false });

    // Spazio: attiva modalità pan temporanea (come Figma)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.matches('input,textarea')) {
        if (!this._spaceDown) {
          this._spaceDown = true;
          this.el.style.cursor = 'grab';
        }
        e.preventDefault();
      }
      this._onKey(e);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spaceDown = false;
        if (!this._panDrag) this._updateCursor();
      }
    });
  }

  _posScreen(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Coordinate mondo (applica inverso zoom+pan). */
  _pos(e) {
    const { x: sx, y: sy } = this._posScreen(e);
    return this._screenToWorld(sx, sy);
  }

  _onMouseDown(e) {
    // ── Pan: tasto centrale OPPURE Spazio+tasto sinistro ─────────────────────
    const isPanTrigger = (e.button === 1) || (e.button === 0 && this._spaceDown);
    if (isPanTrigger) {
      e.preventDefault();
      const { x: sx, y: sy } = this._posScreen(e);
      this._panDrag = { sx, sy, px: this._panX, py: this._panY };
      this.el.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;
    const { x, y } = this._pos(e);
    const gx = snapGrid(x, this.GRID);
    const gy = snapGrid(y, this.GRID);

    // ── Controllo click su nodo overlay (ha priorità sugli altri tool) ────────
    if (this._nodeOverlay?.length && this.tool === 'select') {
      const HIT_R = 14;
      for (const node of this._nodeOverlay) {
        if (node.name === 'gnd') continue;
        if (Math.hypot(x - node.x, y - node.y) <= HIT_R) {
          // Toggle selezione nodo
          this._selectedNode = (this._selectedNode === node.name) ? null : node.name;
          this.render();
          this.el.dispatchEvent(new CustomEvent('node-selected', {
            bubbles: true,
            detail: { node: this._selectedNode },
          }));
          e.stopPropagation();
          return;
        }
      }
    }

    switch (this.tool) {
      case 'select': {
        // Controlla prima le etichette testo
        const txt = this.findTextAt(x, y);
        if (txt) {
          this.selected  = txt;
          this.dragState = { comp: txt, ox: x - txt.x, oy: y - txt.y };
          this._emitSelect(null);
          break;
        }
        const term = this.findTerminalNear(x, y);
        const comp = term ? null : this.findComponentAt(x, y);
        if (comp) {
          this.selected = comp;
          this.dragState = { comp, ox: x - comp.x, oy: y - comp.y };
          this._emitSelect(comp);
        } else if (!term) {
          this.selected = null;
          this._emitSelect(null);
        }
        break;
      }

      case 'wire': {
        const term = this.findTerminalNear(x, y);
        if (!term) break;

        if (!this.wireState) {
          this.wireState = { compId: term.compId, termId: term.termId };
          this._setStatus(`Filo: clicca sul terminale di destinazione`);
        } else {
          // Complete wire if target is a different terminal
          const same =
            this.wireState.compId === term.compId &&
            this.wireState.termId === term.termId;
          if (!same) {
            this.wires.push({ from: { ...this.wireState }, to: { compId: term.compId, termId: term.termId } });
          }
          this.wireState = null;
          this._setStatus(`Filo aggiunto`);
          this._emitChange();
        }
        break;
      }

      case 'delete': {
        // Cancella etichette testo
        const tDel = this.findTextAt(x, y);
        if (tDel) { this.texts = this.texts.filter(t => t !== tDel); this._emitChange(); break; }
        const wIdx = this.findWireNear(x, y);
        if (wIdx >= 0) {
          this.wires.splice(wIdx, 1);
          this._emitChange();
          break;
        }
        const comp = this.findComponentAt(x, y);
        if (comp) {
          this.components = this.components.filter((c) => c !== comp);
          this.wires = this.wires.filter(
            (w) => w.from.compId !== comp.id && w.to.compId !== comp.id
          );
          if (this.selected === comp) { this.selected = null; this._emitSelect(null); }
          this._emitChange();
        }
        break;
      }

      case 'text': {
        // Apri editor inline per nuova etichetta
        this.openInlineEditor(gx, gy, '', (txt) => {
          this.addText(gx, gy, txt);
        });
        break;
      }

      default:
        // Placement tool
        if (COMP_DEFS[this.tool]) {
          const comp = this._makeComp(this.tool, gx, gy, 0, COMP_DEFS[this.tool].defaultValue);
          this.components.push(comp);
          this.selected = comp;
          this._emitSelect(comp);
          this._emitChange();
          this.setTool('select');
          this._setStatus(`${COMP_DEFS[this.tool].label} aggiunto`);
        }
        break;
    }

    this.render();
  }

  _onMouseMove(e) {
    // ── Pan attivo ────────────────────────────────────────────────────────────
    if (this._panDrag) {
      const { x: sx, y: sy } = this._posScreen(e);
      this._panX = this._panDrag.px + (sx - this._panDrag.sx);
      this._panY = this._panDrag.py + (sy - this._panDrag.sy);
      this.render();
      return;
    }

    const { x, y } = this._pos(e);
    this.mousePos = { x, y };

    // Hover terminal detection
    const prevHov = this.hovTerm;
    this.hovTerm = this.findTerminalNear(x, y);
    const hovChanged =
      (!prevHov && this.hovTerm) ||
      (prevHov && !this.hovTerm) ||
      (prevHov && this.hovTerm &&
        (prevHov.compId !== this.hovTerm.compId || prevHov.termId !== this.hovTerm.termId));

    // Drag
    if (this.dragState && this.tool === 'select') {
      const { comp, ox, oy } = this.dragState;
      comp.x = snapGrid(x - ox, this.GRID);
      comp.y = snapGrid(y - oy, this.GRID);
      this._emitChange();
    }

    if (this.dragState || this.wireState || hovChanged) this.render();
  }

  _onMouseUp(e) {
    if (this._panDrag) {
      this._panDrag = null;
      this.el.style.cursor = this._spaceDown ? 'grab' : '';
      this._updateCursor();
      return;
    }
    if (this.dragState) {
      this.dragState = null;
      this.render();
    }
  }

  _onMouseLeave() {
    this._panDrag = null;
    this.hovTerm  = null;
    this.render();
  }

  _onDblClick(e) {
    if (this.tool !== 'select') return;
    const { x, y } = this._pos(e);

    // Doppio-click su etichetta testo: apri editor
    const txt = this.findTextAt(x, y);
    if (txt) {
      this.openInlineEditor(txt.x, txt.y, txt.text, (newTxt) => {
        txt.text = newTxt;
        this.render();
        this._emitChange();
      });
      return;
    }

    const comp = this.findComponentAt(x, y);
    if (comp) {
      this.selected = comp;
      this._emitSelect(comp);
    }
  }

  _onKey(e) {
    if (e.code === 'Space') return;   // gestito in _setupEvents
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case 's': case 'S': this.setTool('select');    break;
      case 'w': case 'W': this.setTool('wire');      break;
      case 'r': case 'R': this.setTool('resistor');  break;
      case 'c': case 'C': this.setTool('capacitor'); break;
      case 'v': case 'V': this.setTool('vsource');   break;
      case 'g': case 'G': this.setTool('gnd');       break;
      case 'q': case 'Q': this.setTool('bjt_npn');  break;
      case 'e': case 'E': this.rotateSelected();     break;
      case 'Delete':
      case 'Backspace': {
        if (this.selected) {
          // Etichetta testo
          if (this.selected.text !== undefined && this.selected.id?.startsWith('text_')) {
            this.texts = this.texts.filter(t => t !== this.selected);
          } else {
            this.components = this.components.filter((c) => c !== this.selected);
            this.wires = this.wires.filter(
              (w) => w.from.compId !== this.selected.id && w.to.compId !== this.selected.id
            );
          }
          this.selected = null;
          this._emitSelect(null);
          this._emitChange();
          this.render();
        }
        break;
      }
      case 'Escape':
        this.wireState = null;
        this.setTool('select');
        break;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  _onResize() {
    const parent = this.el.parentElement;
    this.el.width  = parent.clientWidth;
    this.el.height = parent.clientHeight;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.el.width;
    const h = this.el.height;

    // Background (schermo intero, fuori dal transform)
    ctx.fillStyle = '#1a1f2e';
    ctx.fillRect(0, 0, w, h);

    // Applica trasformazione zoom + pan
    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    // Grid (in coordinate mondo)
    this._drawGrid();

    // Text labels (dietro a tutto)
    this._drawTexts();

    // Wires
    this._drawWires();

    // Rubber-band wire
    if (this.wireState) this._drawRubberBand();

    // Components
    for (const comp of this.components) {
      this._drawComponent(comp);
    }

    // Node overlay (probe points)
    if (this._nodeOverlay) this._renderNodes();

    // Animated current particles
    if (this._animParticles?.length) this._renderParticles();

    ctx.restore();

    // Indicatore zoom (in screen space, fuori dal transform)
    this._drawZoomBadge();
  }

  _drawZoomBadge() {
    if (Math.abs(this._zoom - 1.0) < 0.01) return;  // non mostrare a 100%
    const ctx = this.ctx;
    const txt = Math.round(this._zoom * 100) + '%';
    ctx.save();
    ctx.font      = '11px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(20,26,40,0.75)';
    ctx.fillRect(6, this.el.height - 22, 44, 16);
    ctx.fillStyle = '#8b949e';
    ctx.fillText(txt, 10, this.el.height - 10);
    ctx.restore();
  }

  // ── Current particle rendering ────────────────────────────────────────────

  _renderParticles() {
    const ctx      = this.ctx;
    const I_norm   = this._animI_norm ?? 0;
    const DOT_R    = 2.8;

    // Color: green = positive current, orange = negative
    const color    = I_norm >= 0 ? '#3fb950' : '#f0883e';
    const colorDim = I_norm >= 0 ? 'rgba(63,185,80,0.35)' : 'rgba(240,136,62,0.35)';

    const passiveComps = this._animPassiveComps ?? [];

    for (const p of this._animParticles) {
      let pts = null;

      if (p.segType === 'wire') {
        const wire = this.wires[p.segIdx];
        if (!wire) continue;
        const a = this._resolveTermPos(wire.from);
        const b = this._resolveTermPos(wire.to);
        if (!a || !b) continue;
        pts = this._wirePoints(a, b);

      } else if (p.segType === 'comp') {
        const comp = passiveComps[p.segIdx];
        if (!comp) continue;
        const terms = this.getTerminals(comp);
        if (terms.length < 2) continue;
        // Segmento lineare da terminale[0] a terminale[1]
        pts = [{ x: terms[0].x, y: terms[0].y }, { x: terms[1].x, y: terms[1].y }];
      }

      if (!pts || pts.length < 2) continue;

      const pos = this._posAlongPath(pts, p.phase);
      if (!pos) continue;

      // Glow esterno
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, DOT_R * 2, 0, Math.PI * 2);
      ctx.fillStyle = colorDim;
      ctx.fill();

      // Pallino pieno
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /**
   * Calcola la posizione (x, y) lungo un percorso polilineare a parametro t ∈ [0, 1].
   * t=0 = primo punto, t=1 = ultimo punto.
   */
  _posAlongPath(pts, t) {
    // Lunghezza totale
    let segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push(l);
      total += l;
    }
    if (total < 0.5) return { x: pts[0].x, y: pts[0].y };

    const target = t * total;
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= target - 1e-6) {
        const frac = segs[i] > 0 ? (target - acc) / segs[i] : 0;
        return {
          x: pts[i].x + frac * (pts[i + 1].x - pts[i].x),
          y: pts[i].y + frac * (pts[i + 1].y - pts[i].y),
        };
      }
      acc += segs[i];
    }
    return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
  }

  _drawGrid() {
    const ctx  = this.ctx;
    const g    = this.GRID;
    // Area visibile in coordinate mondo
    const x0 = Math.floor((-this._panX / this._zoom) / g) * g;
    const y0 = Math.floor((-this._panY / this._zoom) / g) * g;
    const x1 = Math.ceil((this.el.width  - this._panX) / this._zoom / g) * g;
    const y1 = Math.ceil((this.el.height - this._panY) / this._zoom / g) * g;
    // Raggio del punto adattato allo zoom (rimane ~1.5 px a schermo)
    const r  = 1.5 / this._zoom;

    ctx.fillStyle = '#1e2740';
    for (let x = x0; x <= x1; x += g) {
      for (let y = y0; y <= y1; y += g) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawWires() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    for (const wire of this.wires) {
      const a = this._resolveTermPos(wire.from);
      const b = this._resolveTermPos(wire.to);
      if (!a || !b) continue;

      const pts = this._wirePoints(a, b);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      // Junction dot if more than two terminals share a position
      this._drawJunction(a.x, a.y);
      this._drawJunction(b.x, b.y);
    }
  }

  _drawJunction(jx, jy) {
    // Count how many wire endpoints are at this position
    let count = 0;
    for (const w of this.wires) {
      const a = this._resolveTermPos(w.from);
      const b = this._resolveTermPos(w.to);
      if (a && Math.abs(a.x - jx) < 2 && Math.abs(a.y - jy) < 2) count++;
      if (b && Math.abs(b.x - jx) < 2 && Math.abs(b.y - jy) < 2) count++;
    }
    if (count >= 3) {
      const ctx = this.ctx;
      ctx.fillStyle = '#3fb950';
      ctx.beginPath();
      ctx.arc(jx, jy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _wirePoints(a, b) {
    // Orthogonal routing: horizontal first, then vertical
    const mid = { x: a.x + (b.x - a.x) / 2, y: a.y };
    if (Math.abs(a.x - b.x) < 2) return [a, b];           // vertical
    if (Math.abs(a.y - b.y) < 2) return [a, b];           // horizontal
    return [a, { x: b.x, y: a.y }, b];                    // L-shape
  }

  _drawRubberBand() {
    const ctx  = this.ctx;
    const from = this._resolveTermPos(this.wireState);
    if (!from) return;
    const to = this.hovTerm
      ? this._resolveTermPos(this.hovTerm)
      : this.mousePos;

    ctx.save();
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineCap     = 'round';

    const pts = this._wirePoints(from, to);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  _drawComponent(comp) {
    const ctx = this.ctx;
    const isSelected = comp === this.selected;
    const color = isSelected ? '#e3b341' : '#79c0ff';

    ctx.save();
    ctx.translate(comp.x, comp.y);
    ctx.rotate(((comp.rotation || 0) * Math.PI) / 180);

    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = isSelected ? 2.5 : 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    switch (comp.type) {
      case 'resistor':   this._drawResistor(ctx);  break;
      case 'capacitor':  this._drawCapacitor(ctx); break;
      case 'vsource':    this._drawVSource(ctx);   break;
      case 'gnd':        this._drawGnd(ctx);       break;
      case 'bjt_npn':    this._drawBJT(ctx, false); break;
    }

    ctx.restore();

    // Value label (drawn in canvas space, above/beside the component)
    this._drawLabel(comp, color);

    // Terminals (drawn in canvas space)
    for (const term of this.getTerminals(comp)) {
      const isHov = this.hovTerm &&
        this.hovTerm.compId === term.compId &&
        this.hovTerm.termId === term.termId;

      ctx.beginPath();
      ctx.arc(term.x, term.y, isHov ? 6 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle   = isHov ? '#3fb950' : (isSelected ? '#e3b341' : '#30363d');
      ctx.strokeStyle = isHov ? '#3fb950' : color;
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawResistor(ctx) {
    const segs = 6;
    const bodyStart = 16, bodyEnd = 64;
    const bodyLen = bodyEnd - bodyStart;
    const segW = bodyLen / segs;
    const amp  = 8;

    // Left lead
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bodyStart, 0);
    ctx.stroke();

    // Zigzag
    ctx.beginPath();
    ctx.moveTo(bodyStart, 0);
    for (let i = 0; i <= segs; i++) {
      const px = bodyStart + i * segW;
      const py = i % 2 === 0 ? -amp : amp;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(bodyEnd, 0);
    ctx.stroke();

    // Right lead
    ctx.beginPath();
    ctx.moveTo(bodyEnd, 0);
    ctx.lineTo(80, 0);
    ctx.stroke();
  }

  _drawCapacitor(ctx) {
    const plateH = 22;
    const gap    = 8;
    const cx     = 40;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cx - gap / 2, 0);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - gap / 2, -plateH / 2);
    ctx.lineTo(cx - gap / 2,  plateH / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + gap / 2, -plateH / 2);
    ctx.lineTo(cx + gap / 2,  plateH / 2);
    ctx.stroke();
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(cx + gap / 2, 0);
    ctx.lineTo(80, 0);
    ctx.stroke();
  }

  _drawVSource(ctx) {
    const r = 18;
    const cx = 40, cy = 0;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cx - r, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + r, 0);
    ctx.lineTo(80, 0);
    ctx.stroke();

    // + symbol near the positive terminal (left side of circle)
    ctx.lineWidth = 1.5;
    const plusX = cx - 7;
    ctx.beginPath();
    ctx.moveTo(plusX - 4, 0); ctx.lineTo(plusX + 4, 0);
    ctx.moveTo(plusX, -4);    ctx.lineTo(plusX, 4);
    ctx.stroke();

    // − symbol near negative terminal (right side)
    const minX = cx + 7;
    ctx.beginPath();
    ctx.moveTo(minX - 4, 0); ctx.lineTo(minX + 4, 0);
    ctx.stroke();

    ctx.lineWidth = 2;
  }

  _drawGnd(ctx) {
    const lines = [
      { y: 8,  w: 24 },
      { y: 14, w: 14 },
      { y: 20, w: 6  },
    ];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 8);
    ctx.stroke();

    for (const ln of lines) {
      ctx.beginPath();
      ctx.moveTo(-ln.w / 2, ln.y);
      ctx.lineTo( ln.w / 2, ln.y);
      ctx.stroke();
    }
  }

  /**
   * BJT NPN symbol (coordinate locali: B all'origine, C a (40,-40), E a (40,40)).
   * pnp=true disegna PNP con freccia inversa (riservato a sviluppi futuri).
   */
  _drawBJT(ctx, pnp = false) {
    ctx.lineWidth = 2;
    ctx.lineCap   = 'round';

    // ── Filo di base ──────────────────────────────────────────────────────────
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();

    // ── Barra verticale del corpo ─────────────────────────────────────────────
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(18, -22); ctx.lineTo(18, 22); ctx.stroke();
    ctx.lineWidth = 2;

    // ── Collettore ────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(18, -12); ctx.lineTo(40, -40);
    ctx.stroke();

    // ── Emettitore con freccia ────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(18, 12); ctx.lineTo(40, 40);
    ctx.stroke();

    // Freccia sull'emettitore (NPN: punta verso l'esterno)
    const ex = 40, ey = 40;
    const ax = 18, ay = 12;
    const angle = Math.atan2(ey - ay, ex - ax);
    const AL = 9, AW = 0.42;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - AL * Math.cos(angle - AW), ey - AL * Math.sin(angle - AW));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - AL * Math.cos(angle + AW), ey - AL * Math.sin(angle + AW));
    ctx.stroke();

    // ── Etichette terminali ───────────────────────────────────────────────────
    ctx.save();
    ctx.font      = '8px JetBrains Mono, monospace';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = 'center';
    ctx.fillText('B', -8,  4);
    ctx.fillText('C', 46, -42);
    ctx.fillText('E', 46,  46);
    ctx.restore();
  }

  _drawLabel(comp, color) {
    if (!comp.value && comp.type !== 'gnd') return;

    const ctx    = this.ctx;
    const terms  = this.getTerminals(comp);
    const cx     = terms.reduce((s, t) => s + t.x, 0) / terms.length;
    const cy     = terms.reduce((s, t) => s + t.y, 0) / terms.length;
    const rot    = comp.rotation || 0;

    const valueTxt = formatValue(comp.value, comp.type);
    const nameTxt  = comp.label || comp.id;

    ctx.save();
    ctx.font      = '10px JetBrains Mono, monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';

    // Offset label: BJT ha 3 terminali (B/C/E) → etichetta a sinistra del corpo
    const perp = comp.type === 'bjt_npn'
      ? { dx: -28, dy: 0 }
      : rot === 0 || rot === 180
        ? { dx: 0, dy: -18 }
        : { dx: 22, dy: 0  };

    // Nome (bold) + valore
    ctx.font      = 'bold 10px JetBrains Mono, monospace';
    ctx.fillText(nameTxt, cx + perp.dx, cy + perp.dy);
    if (valueTxt) {
      ctx.font      = '9px JetBrains Mono, monospace';
      ctx.fillStyle = color + 'cc';
      ctx.fillText(valueTxt, cx + perp.dx, cy + perp.dy + 11);
    }
    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _updateCursor() {
    const cursors = {
      select:    'default',
      wire:      'crosshair',
      delete:    'not-allowed',
      text:      'text',
    };
    this.el.style.cursor = cursors[this.tool] || 'cell';
  }

  _setStatus(msg, type = '') {
    const el = document.getElementById('canvas-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'canvas-status' + (type ? ` ${type}` : '');
  }

  _emitChange() {
    this.el.dispatchEvent(new CustomEvent('circuit-change', { bubbles: true }));
  }

  _emitSelect(comp) {
    this.el.dispatchEvent(
      new CustomEvent('circuit-select', { bubbles: true, detail: { comp } })
    );
  }
}

// ─── Point-to-segment distance utility ───────────────────────────────────────

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
