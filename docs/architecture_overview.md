# CircuitSim - Architecture Overview
Aggiornato: dopo Task 01 - Refactoring struttura cartelle

## Struttura del progetto

Il progetto e organizzato in 4 blocchi logici con
responsabilita separate:

### 1. Frontend (cartella: frontend/)
Tutto cio che riguarda il browser - interfaccia utente,
canvas interattivo per il disegno del circuito, grafici
Bode e oscilloscopio, catalogo componenti.

File principali:
- frontend/templates/index.html   -> pagina principale
- frontend/static/js/app.js       -> orchestratore JS
- frontend/static/js/circuit-canvas.js -> editor circuito
- frontend/static/js/component-registry.js -> catalogo
- frontend/static/js/charts/      -> Bode plot, oscilloscopio

### 2. API Backend (cartella: api/)
Layer Django REST. Riceve il netlist JSON dal frontend,
lo valida, lo instrada al solver corretto e restituisce
i risultati in formato JSON. Non contiene logica
di simulazione.

File principali:
- api/views.py        -> endpoint /simulate e /manual/open
- api/urls.py         -> routing URL
- api/serializers.py  -> validazione netlist JSON in ingresso

### 3. Simulation Core (cartella: solver/)
Motore di simulazione puro. Non sa nulla del browser
o di Django. Riceve un NetlistModel e restituisce
risultati numerici.

File principali:
- solver/router.py    -> sceglie il tier in base
                        alla complessita del circuito
- solver/netlist.py   -> modello dati interno del circuito
- solver/tier1/mna.py -> solver MNA Python (circuiti
                        lineari fino a ~20 componenti)
- solver/tier2/       -> placeholder ngspice (futuro)
- solver/tier3/       -> placeholder LTSpice (futuro)

### 4. System Services (cartella: services/)
Servizi di sistema indipendenti dal dominio
elettronico - apertura PDF, configurazione percorsi,
variabili d'ambiente.

File principali:
- services/config.py      -> costanti e percorsi
- services/pdf_viewer.py  -> apertura SumatraPDF

## Flusso di una simulazione

1. Utente disegna il circuito su circuit-canvas.js
2. app.js serializza il circuito in netlist JSON
3. POST /api/simulate/ con il netlist JSON
4. api/serializers.py valida il netlist
5. solver/router.py sceglie il tier appropriato
6. solver/tier1/mna.py esegue la simulazione
7. Risultati JSON restituiti al frontend
8. Grafici aggiornati (Bode plot o oscilloscopio)

## Tier system

| Tier | Solver | Componenti | Latenza |
|------|--------|------------|---------|
| 0 | WebAssembly (futuro) | < 5 RC/RL | < 10ms |
| 1 | MNA Python | < 20 lineari | < 100ms |
| 2 | ngspice (futuro) | < 100 | < 1s |
| 3 | LTSpice headless (futuro) | illimitato | 1-10s |

## Regole architetturali

1. Il frontend non conosce quale tier viene usato
2. Il netlist JSON e il contratto tra frontend e backend
3. Il solver non importa nulla da Django o dal frontend
4. I servizi di sistema non contengono logica elettronica
5. Nessuna modifica alla documentazione senza revisione umana
