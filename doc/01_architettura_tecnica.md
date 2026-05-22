# CircuitSim — Documentazione Tecnica

> **Destinatari:** sviluppatori, collaboratori umani e agenti AI che partecipano al progetto.  
> **Versione:** 1.0 — Maggio 2026

---

## Changelog

| Versione | Data | Modifiche |
|---|---|---|
| 1.0 | Mag 2026 | Prima release: RC filter, AC/DC/transient/sinusoidal, BJT NPN, canvas zoom/pan, oscilloscopio mono-canale |
| 1.1 | Mag 2026 | **Sprint 1**: salvataggio/caricamento JSON, induttore con companion Backward Euler, oscilloscopio multi-canale 4 CH, `node_traces` nel solver |

---

## 1. Panoramica del Progetto

CircuitSim è un simulatore di circuiti elettronici interattivo, accessibile via browser. Consente di disegnare schemi elettrici su una canvas, configurare i componenti, lanciare una simulazione numerica sul backend e visualizzare i risultati in grafici analitici in tempo reale.

### Obiettivi tecnici
- Architettura **client-server** con API REST
- Solver numerico estendibile a livelli (*tiers*): Tier 1 = MNA lineare, Tier 2+ riservato a solutori non lineari e SPICE-level
- Frontend **zero-dipendenze framework**: Vanilla JS + Canvas API
- Facile da estendere con nuovi tipi di componenti, nuovi tipi di analisi, nuovi strumenti di misura

---

## 2. Stack Tecnologico

| Layer | Tecnologia | Versione |
|---|---|---|
| Backend web | Django | ≥ 4.2 |
| API REST | Django REST Framework | ≥ 3.15 |
| Solver numerico | NumPy / SciPy | ≥ 2.0 / ≥ 1.14 |
| Runtime Python | CPython | 3.14 |
| Frontend | Vanilla JavaScript (ES2022) | — |
| Rendering schemi | HTML5 Canvas API | — |
| Grafici | Chart.js | 4.x (CDN) |
| Zoom grafici | chartjs-plugin-zoom + Hammer.js | CDN |
| Gestione repo | Git + GitHub CLI | 2.51 / 2.92 |

---

## 3. Struttura delle Directory

```
circuitsim/
├── config/               # Configurazione Django (settings, urls, wsgi)
├── api/                  # App Django: endpoint REST
│   ├── views.py          # SimulateView (POST /api/simulate/)
│   └── urls.py
├── solver/               # Motore di simulazione
│   ├── router.py         # Routing verso il tier corretto
│   └── tier1/
│       └── mna.py        # Modified Nodal Analysis (lineare)
├── static/
│   ├── css/style.css     # Tutti gli stili dell'applicazione
│   └── js/
│       ├── app.js              # Controller principale (UI logic)
│       ├── circuit-canvas.js   # Editor schematico interattivo
│       ├── bode-plot.js        # Wrapper Chart.js per Bode plot
│       ├── current-animator.js # Animazione flusso di corrente
│       ├── oscilloscope.js     # Oscilloscopio multi-canale (Sprint 1)
│       ├── settings.js         # Temi e preferenze utente (localStorage)
│       ├── chart-theme.js      # Colori assi Chart.js da CSS
│       ├── comp-help.js        # Popup parametri componenti + guida hover
│       ├── app-help.js         # Help on line (modale manuale)
│       ├── sim-analyst.js      # Osservazioni post-simulazione
│       ├── param-analyzer.js   # Analisi parametrica topologia
│       ├── calculator.js       # Calcolatrice / formule
│       └── tools.js            # Conv. C, filtri, frequenzimetro
├── templates/
│   └── index.html        # SPA entry point
├── doc/                  # Documentazione (questa cartella)
├── manage.py
├── requirements.txt
├── test_mna.py           # Test di validazione del solver MNA base
└── test_roadmap.py       # Test di regressione Sprint 1 (induttore, node_traces)
```

---

## 4. Architettura Backend

### 4.1 Flusso di una Richiesta di Simulazione

```
Browser
  │
  │  POST /api/simulate/   { netlist JSON }
  ▼
api/views.py  ──►  SimulateView.post()
  │
  ▼
solver/router.py  ──►  route(netlist)
  │
  ├── analysis.type == "ac"           ──►  tier1.solve_ac()
  ├── analysis.type == "transient"    ──►  tier1.solve_transient()
  ├── analysis.type == "dc"           ──►  tier1.solve_dc()
  └── analysis.type == "sinusoidal"   ──►  tier1.solve_sinusoidal()
  │
  ▼
Risposta JSON  ──►  Browser
```

### 4.2 Formato Netlist (input JSON)

```json
{
  "components": [
    { "id": "R1", "type": "resistor",      "nodes": ["n1","gnd"], "value": 10000 },
    { "id": "C1", "type": "capacitor",     "nodes": ["n1","n2"],  "value": 4.7e-8 },
    { "id": "L1", "type": "inductor",      "nodes": ["n2","n3"],  "value": 1e-3 },
    { "id": "V1", "type": "voltage_source","nodes": ["n1","gnd"], "value": 1.0 },
    { "id": "Q1", "type": "bjt_npn",       "nodes": ["nb","nc","gnd"],
                                            "value": 100, "ic_q_ma": 1.0 }
  ],
  "analysis": {
    "type":       "ac",
    "start_freq": 10,
    "stop_freq":  100000,
    "points_per_decade": 100
  },
  "output_nodes": ["n2"]
}
```

**Tipi di componente riconosciuti dal solver:**

| `type` | Descrizione | Campi aggiuntivi |
|---|---|---|
| `resistor` | Resistenza | `value` (Ω) |
| `capacitor` | Condensatore | `value` (F) |
| `inductor` | **Induttore** *(Sprint 1)* | `value` (H) |
| `voltage_source` | Generatore tensione | `value` (V), `amplitude` (V picco) |
| `current_source` | Generatore corrente | `value` (A) |
| `bjt_npn` | Transistore BJT NPN (hybrid-π) | `value`=β, `ic_q_ma` (mA) |

**Parametri di analisi per tipo:**

| Tipo | Parametri |
|---|---|
| `ac` | `start_freq`, `stop_freq`, `points_per_decade` |
| `transient` | `t_end` (s), `points` |
| `sinusoidal` | `frequency` (Hz), `amplitude` (V), `periods`, `points_per_cycle` |
| `dc` | — |

### 4.3 Formato Risposta JSON

**AC:**
```json
{
  "frequencies": [...],
  "magnitude_db": [...],
  "phase_deg": [...],
  "metrics": { "cutoff_frequency_hz": 338.1, "dc_gain_db": 0.0, ... }
}
```

**Transient / Sinusoidal** *(node_traces aggiunto in Sprint 1)*:
```json
{
  "times":       [...],
  "voltages":    [...],
  "node_traces": { "n1": [...], "n2": [...] },
  "metrics":     { "time_constant_ms": 0.47, ... }
}
```

Il campo `node_traces` contiene le tensioni di **tutti i nodi** campionate ad ogni istante. È usato dall'oscilloscopio multi-canale per visualizzare forme d'onda arbitrarie.

### 4.4 Solver MNA (Tier 1)

Il solver implementa la **Modified Nodal Analysis** per circuiti lineari:

```
[G  B] [v]   [i]
[C  D] [j] = [e]
```

**Metodi di integrazione temporale (Backward Euler):**

| Elemento | Companion model | Conduttanza | Corrente storica |
|---|---|---|---|
| Condensatore C | G_eq = C/dt in parallelo a I_hist | C/dt | I_hist = G_eq · V_C(n-1), direzione **n→p** |
| Induttore L | G_eq = dt/L in parallelo a I_hist | dt/L | I_hist = i_L(n-1), direzione **p→n** |

> **Nota importante sulla direzione della corrente storica:**  
> Il Norton companion del condensatore inietta corrente nella direzione **opposta** al flusso di riferimento (oppone la variazione di tensione). L'induttore inietta nella direzione **concorde** al flusso (mantiene la corrente). Questo differisce nel segno e deve essere rispettato per la stabilità numerica.

**Aggiornamento stato induttore dopo ogni step:**
```python
i_L(n) = i_L(n-1) + (dt/L) * V_L(n)
```

**Modello BJT NPN (hybrid-π small-signal):**
- `gm = Ic_Q / VT` (VT = 26 mV @ 300 K)
- `rπ = β / gm`  (resistenza base-emettitore)
- `ro = 100 kΩ`   (resistenza d'uscita, VA ≈ 100 V @ 1 mA)
- VCCS: `ic = gm · vbe` (stamp asimmetrico sulla matrice G)

---

## 5. Architettura Frontend

### 5.1 Moduli JavaScript

```
app.js  (controller)
  ├── CircuitCanvas  (circuit-canvas.js)
  │     ├── COMP_DEFS           — catalogo componenti + terminali
  │     ├── UnionFind           — algoritmo per generazione netlist
  │     ├── setTool()           — gestione tool attivo
  │     ├── generateNetlist()   — produce JSON netlist
  │     ├── exportCircuit()     — serializza circuito (Sprint 1)
  │     ├── importCircuit()     — carica circuito da JSON (Sprint 1)
  │     ├── computeNodeMap()    — calcola posizioni nodi
  │     ├── render()            — disegno canvas (componenti, fili, nodi, particelle)
  │     └── openInlineEditor()  — editing inline etichette testo
  ├── BodePlot       (bode-plot.js)         — grafici Bode (Chart.js)
  ├── CurrentAnimator (current-animator.js) — animazione particelle corrente
  ├── Oscilloscope   (oscilloscope.js)      — oscilloscopio 4 canali (Sprint 1)
  └── Chart.js instances (vtChart, vfChart) — grafici V(t) e V(f)
```

### 5.2 Classe Oscilloscope (`oscilloscope.js`)

```javascript
const scope = new Oscilloscope('scope-canvas', 'oscilloscope-panel');

// Caricamento dati dopo simulazione
scope.setData(times_ms_array, nodeTracesObject);

// Assegnare un nodo a un canale (0–3)
scope.setChannel(0, 'n2');    // CH1 → nodo n2

// Mostrare/nascondere il pannello
scope.show(true);
scope.toggle();
```

**Proprietà configurabili per canale (`scope.channels[i]`):**
- `nodeId`: nome del nodo da monitorare
- `vdiv`: volt per divisione (default 1.0 V)
- `offset`: offset verticale in V (default 0)
- `enabled`: visibilità del canale

**Proprietà globali:**
- `scope.tdiv`: ms per divisione temporale (base dei tempi)
- `scope.trigLevel`: soglia di trigger in V (default 0)
- `scope._cursors[0/1]`: posizione pixel dei cursori di misura

### 5.3 Serializzazione Circuito

**Formato del file JSON prodotto da `exportCircuit()`:**
```json
{
  "version":    "1.0",
  "nextId":     12,
  "components": [ { "id": "resistor_1", "type": "resistor", "x": 120, "y": 200, ... } ],
  "wires":      [ { "from": { "compId": "...", "termId": "a" }, "to": { ... } } ],
  "texts":      [ { "id": "text_5", "x": 80, "y": 100, "text": "Output", ... } ]
}
```

### 5.4 Aggiungere un Nuovo Componente

1. **`circuit-canvas.js` — `COMP_DEFS`:** aggiungere la definizione con terminali, valore di default, unità e `netlistType`.
2. **`circuit-canvas.js` — `_drawComponent()`:** aggiungere un `case` nello switch e implementare il metodo `_drawXxx(ctx)`.
3. **`circuit-canvas.js` — `formatValue()`:** aggiungere la formattazione dell'unità.
4. **`circuit-canvas.js` — `_makeComp()`:** aggiungere il prefisso label nel dizionario `prefix`.
5. **`solver/tier1/mna.py` — `_build_mna()`**: stamp per AC/DC.
6. **`solver/tier1/mna.py` — `_build_mna_transient()` e `_build_mna_sine()`**: companion model temporale.
7. **`templates/index.html`**: pulsante toolbar con SVG.
8. **`static/js/app.js` — `renderCompEditor()`**: campi editor nel sidebar.
9. **`static/js/app.js` — toolbar `msgs`**: messaggio di stato per il tool.

### 5.5 Coordinate Canvas

La canvas supporta zoom e pan. Le conversioni coordinate sono:

```javascript
// Screen → World
wx = (sx - this._panX) / this._zoom;
wy = (sy - this._panY) / this._zoom;

// World → Screen
sx = wx * this._zoom + this._panX;
sy = wy * this._zoom + this._panY;
```

I componenti sono posizionati in coordinate **world**. La griglia di snap è 40 px (world).

---

## 6. API REST

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/simulate/` | POST | Invia un netlist JSON, riceve i risultati della simulazione |
| `/` | GET | Serve la SPA (index.html) |

**Esempio chiamata cURL:**
```bash
curl -X POST http://localhost:8000/api/simulate/ \
  -H "Content-Type: application/json" \
  -d '{"components":[...],"analysis":{"type":"sinusoidal","frequency":1000}}'
```

---

## 7. Setup Ambiente di Sviluppo

```bash
# 1. Clona il repository
git clone https://github.com/maurob23/circuitsim.git
cd circuitsim

# 2. Crea e attiva virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 3. Installa dipendenze
pip install -r requirements.txt

# 4. Avvia il server Django
python manage.py runserver

# 5. Apri nel browser
# http://localhost:8000
```

**Requisiti:**
- Python ≥ 3.11 (testato su 3.14)
- Browser moderno (Chrome 120+, Firefox 120+, Edge 120+)
- Nessun database necessario (tutto in memoria)

---

## 8. Test

```bash
# Test del solver MNA base (RC, AC, metriche)
python test_mna.py

# Test regressione Sprint 1 (induttore, node_traces, RL transitorio)
python test_roadmap.py
```

**Copertura attuale di `test_roadmap.py`:**
1. `solve_sinusoidal` → `node_traces` presente e correttamente dimensionato
2. `solve_transient` → `node_traces` presente e correttamente dimensionato
3. Filtro RL bassa-passa → fc = 15 915 Hz (errore < 2%)
4. Transitorio RL → V_L a regime ≈ 0 V (errore < 0.5 V)

---

## 9. Convenzioni di Codice

- **Python**: PEP 8, type hints dove possibile, docstring per funzioni pubbliche
- **JavaScript**: ES2022, `const`/`let`, nessun framework esterno nel core
- **Commit**: formato `type: short description` (feat/fix/docs/test/refactor)
- **Nodi GND**: sempre denominati `"gnd"`, `"0"` o `"GND"` (set `_GND` nel solver)
- **id componente**: obbligatorio nel netlist prodotto dalla canvas; il solver accetta anche componenti senza `id` usando `id(obj)` Python come fallback

---

## 10. Roadmap Tecnica

Vedi `doc/03_proposte_miglioramenti.md` per la lista dettagliata di estensioni pianificate.
