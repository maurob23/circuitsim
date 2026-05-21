# CircuitSim — Documentazione Tecnica

> **Destinatari:** sviluppatori, collaboratori umani e agenti AI che partecipano al progetto.  
> **Versione:** 1.0 — Maggio 2026

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
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
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
│       └── current-animator.js # Animazione flusso di corrente
├── templates/
│   └── index.html        # SPA entry point
├── doc/                  # Documentazione (questa cartella)
├── manage.py
├── requirements.txt
└── test_mna.py           # Test di validazione del solver
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
    { "id": "C1", "type": "capacitor",     "nodes": ["n1","n2"], "value": 4.7e-8 },
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
| `inductor` | Induttore | `value` (H) |
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

**Sinusoidal:**
```json
{
  "times": [...],
  "vin":   [...],
  "vout":  [...],
  "metrics": { "gain_db": -3.01, "phase_deg": -45.0, ... }
}
```

### 4.4 Solver MNA (Tier 1)

Il solver implementa la **Modified Nodal Analysis** per circuiti lineari:

```
[G  B] [v]   [i]
[C  D] [j] = [e]
```

- `G` = matrice delle conduttanze nodali (n×n)
- `B`, `C` = matrici di accoppiamento sorgenti di tensione
- `v` = vettore tensioni nodali
- `j` = correnti nei rami delle sorgenti di tensione

**Metodi di integrazione:**
- **AC**: domain complesso (jω), risolta con `numpy.linalg.solve` per ogni frequenza
- **Transient / Sinusoidal**: Backward Euler companion model (`C/dt` per condensatori)

**Modello BJT NPN (hybrid-π small-signal):**
- `gm = Ic_Q / VT` (VT = 26 mV @ 300 K)
- `rπ = β / gm`  (resistenza base-emettitore)
- `ro = 100 kΩ`   (resistenza d'uscita, VA≈100 V @ 1 mA)
- VCCS: `ic = gm · vbe` (corrente controllata da tensione, stamp asimmetrico)

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
  │     ├── computeNodeMap()    — calcola posizioni nodi
  │     ├── render()            — disegno canvas (componenti, fili, nodi, particelle)
  │     └── openInlineEditor()  — editing inline etichette testo
  ├── BodePlot       (bode-plot.js)   — grafici Bode (Chart.js)
  ├── CurrentAnimator (current-animator.js) — animazione particelle corrente
  └── Chart.js instances (vtChart, vfChart) — grafici V(t) e V(f)
```

### 5.2 Aggiungere un Nuovo Componente

Per aggiungere un componente (es. `inductor`) seguire questi passi:

1. **`circuit-canvas.js` — `COMP_DEFS`:** aggiungere la definizione con terminali, valore di default, unità e `netlistType`.
2. **`circuit-canvas.js` — `_drawComponent()`:** aggiungere un `case` nello switch e implementare il metodo `_drawXxx(ctx)`.
3. **`circuit-canvas.js` — `formatValue()`:** aggiungere la formattazione dell'unità (es. H, mH, µH).
4. **`solver/tier1/mna.py` — `_build_mna()`**: aggiungere il caso `elif ctype == "inductor"` con lo stamp corretto.
5. **`solver/tier1/mna.py` — `_build_mna_transient()` e `_build_mna_sine()`**: gestire il modello companion per l'analisi nel tempo.
6. **`templates/index.html`**: aggiungere il pulsante toolbar con icona SVG.
7. **`static/js/app.js` — `renderCompEditor()`**: eventuale campo valore specializzato nel sidebar.

### 5.3 Aggiungere un Nuovo Tipo di Analisi

1. **`solver/router.py`**: aggiungere la route verso la nuova funzione del solver.
2. **`solver/tier1/mna.py`**: implementare `solve_nuova_analisi(netlist)`.
3. **`api/views.py`**: aggiungere i nuovi campi alla risposta JSON se necessario.
4. **`templates/index.html`**: aggiungere il radio button nella sezione analisi.
5. **`static/js/app.js`**: implementare `handleSimResult()` per il nuovo tipo, aggiungere l'aggiornamento dei grafici.

### 5.4 Coordinate Canvas

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
  -d '{"components":[...],"analysis":{"type":"ac"}}'
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
# Test del solver MNA (validazione numerica)
python test_mna.py

# Test API (richiede server attivo)
curl -X POST http://localhost:8000/api/simulate/ \
  -H "Content-Type: application/json" \
  -d @doc/examples/rc_filter.json
```

---

## 9. Convenzioni di Codice

- **Python**: PEP 8, type hints dove possibile, docstring per funzioni pubbliche
- **JavaScript**: ES2022, `const`/`let`, nessun framework esterno nel core
- **Commit**: messaggio in inglese, formato `type: short description`
- **Nodi GND**: sempre denominati `"gnd"`, `"0"` o `"GND"` (case-insensitive, set `_GND` nel solver)

---

## 10. Roadmap Tecnica

Vedi `doc/03_proposte_miglioramenti.md` per la lista dettagliata di estensioni pianificate.
