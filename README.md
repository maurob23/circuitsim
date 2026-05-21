# CircuitSim

Simulatore di circuiti elettronici web-based — progetto di supporto a **LINEA AMP**
(amplificatore per chitarra con processore di effetti digitali).

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | JavaScript vanilla · Canvas API · Chart.js |
| Backend | Django 5.x · Django REST Framework |
| Solver Tier 1 | Modified Nodal Analysis (MNA) — numpy/scipy |
| Solver Tier 2 | ngspice/PySpice *(roadmap)* |
| Solver Tier 3 | LTSpice headless + AI Agent *(roadmap)* |

## Quick start

```powershell
# 1. Install dependencies
pip install -r requirements.txt

# 2. Apply migrations (SQLite)
python manage.py migrate

# 3. Start development server
python manage.py runserver

# 4. Open in browser
#    http://127.0.0.1:8000
```

### Keyboard shortcuts (circuit editor)

| Tasto | Azione |
|---|---|
| S | Strumento selezione |
| W | Disegna filo |
| R | Posiziona resistenza |
| C | Posiziona condensatore |
| V | Posiziona generatore V |
| G | Posiziona massa |
| E | Ruota componente selezionato |
| Del | Elimina componente selezionato |
| Esc | Annulla azione corrente |

## API

### `POST /api/simulate/`

**Body** — Netlist JSON:

```json
{
  "components": [
    {"id": "V1", "type": "voltage_source", "value": 1, "nodes": ["n1", "gnd"]},
    {"id": "R1", "type": "resistor",       "value": 10000, "nodes": ["n1", "n2"]},
    {"id": "C1", "type": "capacitor",      "value": 47e-9, "nodes": ["n2", "gnd"]}
  ],
  "analysis": {"type": "ac", "start_freq": 10, "stop_freq": 100000, "points_per_decade": 100},
  "output_nodes": ["n2"]
}
```

**Response**:

```json
{
  "simulation_id": "uuid",
  "tier_used": 1,
  "analysis_type": "ac",
  "results": {"frequencies": [...], "magnitude_db": [...], "phase_deg": [...]},
  "metrics": {
    "cutoff_frequency_hz": 338.9,
    "time_constant_ms": 0.4701,
    "phase_at_cutoff_deg": -45.02,
    "dc_gain_db": -0.004
  },
  "solver_info": {"solver": "mna_python", "elapsed_ms": 1, "convergence": true}
}
```

## Struttura

```
circuitsim/
├── config/               # Django settings, URL root
├── api/                  # REST endpoint /api/simulate/
├── solver/
│   ├── router.py         # Seleziona tier in base alla complessità
│   └── tier1/mna.py      # MNA solver: AC, DC, Transient
├── templates/index.html  # SPA shell (3 pannelli)
├── static/
│   ├── css/style.css
│   └── js/
│       ├── circuit-canvas.js   # Editor schematico interattivo
│       ├── bode-plot.js        # Chart.js Bode + Transient
│       └── app.js              # Orchestratore frontend
└── test_mna.py           # Validazione solver vs filtro RC
```

## Validazione

Il solver MNA è stato validato contro il filtro RC R=10kΩ, C=47nF (LINEA AMP Modulo 1):

| Metrica | MNA calcolato | Atteso (LTSpice) |
|---|---|---|
| fc | 338.9 Hz | 338.6 Hz |
| τ | 0.4701 ms | 0.4700 ms |
| Fase @ fc | −45.02° | −45.00° |
| Guadagno DC | −0.004 dB | 0.000 dB |
