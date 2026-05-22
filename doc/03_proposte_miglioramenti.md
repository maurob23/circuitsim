# CircuitSim — Proposte di Miglioramento e Visione Futura

> **Destinatari:** team di sviluppo, stakeholder, agenti AI di sviluppo.  
> **Scopo:** definire la roadmap evolutiva a partire dall'architettura attuale, con focus su strumenti di misura virtuali, integrazione AI e frontiere della simulazione elettronica intelligente.  
> **Versione:** 1.1 — Maggio 2026 (aggiornata dopo Sprint 1)

---

## 1. Strumenti di Misura Virtuali

### 1.1 Oscilloscopio Virtuale

**Stato attuale:** i grafici V(t) mostrano la tensione in un solo nodo alla volta.

**Proposta:** implementare un oscilloscopio a canali multipli, con:
- 2–4 canali visualizzabili simultaneamente
- Trigger configurabile (rising/falling edge, livello)
- Cursori di misura per Δt, ΔV, frequenza, periodo
- Modalità XY (Lissajous)
- Scala tempo e tensione variabili con drag sui bordi del grafico

**Implementazione suggerita:**
- Canvas overlay dedicata sulla finestra oscilloscopio
- Dati provenienti da `solve_sinusoidal()` su più nodi in parallelo
- Interfaccia drag-and-drop per associare nodi ai canali

---

### 1.2 Multimetro Virtuale

Un pannello compatto che mostra, per un nodo selezionato:
- Tensione DC (media temporale)
- Tensione AC (RMS)
- Frequenza del segnale
- Corrente nel ramo selezionato

**Integrazione UI:** widget flottante trascinabile sulla canvas, che si aggiorna ad ogni simulazione.

---

### 1.3 Analizzatore di Spettro (FFT)

**Proposta:**
- Calcolo FFT del segnale temporale di un nodo
- Visualizzazione spettro di ampiezza e fase
- Identificazione automatica delle frequenze dominanti
- Utile per analizzare distorsioni armoniche in circuiti non lineari

**Backend:** `numpy.fft.rfft` applicato al vettore `vout` già disponibile in `solve_sinusoidal()`.

---

### 1.4 Generatore di Segnali Avanzato

Estensione del generatore di tensione attuale per supportare:
- Onda quadra (duty cycle configurabile)
- Onda triangolare / rampa
- Impulso (larghezza e ritardo)
- Segnale arbitrario (caricabile come array JSON)
- Rumore bianco (per analisi di risposta al rumore)

---

### 1.5 Analizzatore di Impedenza (Bode Avanzato)

Attualmente il Bode plot mostra solo |H(jω)|. Estensioni:
- Impedenza di ingresso Z_in(ω)
- Impedenza di uscita Z_out(ω)
- Guadagno di corrente
- Diagramma di Nyquist

---

## 2. Estensione dei Componenti

### 2.1 Componenti Passivi Mancanti
- **Induttore** (già previsto nel solver, manca solo il simbolo canvas)
- **Trasformatore** (mutua induzione, modello MNA con ramo accoppiato)
- **Diodo ideale** (modello switching: cortocircuito in forward, open in reverse)
- **Interruttore** (aperto/chiuso, gestibile da UI o da agente AI)
- **Sorgente di corrente controllata** (CCCS, VCCS, CCVS — già parzialmente supportate)

### 2.2 Transistori Avanzati
- **BJT PNP** (già predisposto in `_drawBJT` con `pnp=true`)
- **MOSFET N-channel / P-channel** (modello small-signal: gm, ro, Cgs)
- **JFET**
- **IGBT** (per applicazioni di potenza)

### 2.3 Componenti Optoelettronici
- LED (con modello corrente-tensione semplificato)
- Fotoresistenza (valore variabile da UI o da segnale esterno)
- Optoisolatore

### 2.4 Componenti RF
- Linea di trasmissione (modello π distribuito)
- Accoppiatore direzionale
- Risuonatore

---

## 3. Estensione del Solver

### 3.1 Tier 2 — Solver Non Lineare (Newton-Raphson)

**Motivazione:** l'attuale Tier 1 è limitato a circuiti lineari o linearizzati (small-signal). Per simulare:
- Transistori in regime large-signal
- Diodi (equazione di Shockley)
- Amplificatori in saturazione/clipping

**Approccio:** iterazione Newton-Raphson con aggiornamento Jacobiano ad ogni step temporale:
```
x_{n+1} = x_n - J(x_n)^{-1} · F(x_n)
```

**Riferimento:** struttura di SPICE3 / NGSpice (open source, reimplementabile in Python con NumPy).

### 3.2 Integrazione Numerica di Ordine Superiore

- **Trapezoidal (TRAP)**: più accurato di Backward Euler, standard in SPICE
- **Gear (BDF)**: per circuiti con dinamiche molto diverse (stiff systems)
- **Runge-Kutta 4**: per applicazioni didattiche

### 3.3 Analisi di Stabilità e Polo-Zero

- Calcolo poli e zeri della funzione di trasferimento
- Mappa s-plane (piano complesso)
- Margini di guadagno e di fase dalla risposta AC
- Analisi di sensibilità parametrica (Monte Carlo)

### 3.4 Analisi del Rumore

- Rumore termico Johnson-Nyquist (resistori)
- Rumore di shot (giunzioni)
- Densità spettrale di potenza di rumore in uscita
- Figura di rumore (NF) per catene di amplificatori

---

## 4. Integrazione con Agenti AI

Questa è l'area di sviluppo con il potenziale trasformativo più elevato. Si delineano tre livelli di integrazione AI.

### 4.1 Livello 1 — AI come Assistente (già realizzabile)

**Design Assistant:**
> *"Progetta un amplificatore common-emitter con guadagno 20 dB e banda passante 1–100 kHz"*

L'agente AI:
1. Calcola i valori dei componenti necessari (tramite formule o ottimizzazione numerica)
2. Genera il netlist JSON
3. Lo carica automaticamente sulla canvas tramite `canvas.loadNetlist(json)`
4. Avvia la simulazione e verifica il risultato

**Debug Assistant:**
> *"Il mio circuito oscilla inaspettatamente, cosa c'è di sbagliato?"*

L'agente analizza il Bode plot, i poli della funzione di trasferimento e suggerisce correzioni (es. aggiungere un condensatore di bypass, modificare la rete di feedback).

**Implementazione tecnica:**
- API endpoint aggiuntivo `/api/ai-assist/` che accetta prompt in linguaggio naturale
- L'agente usa il solver come strumento di verifica (tool call: `simulate(netlist)`)
- Risposta: netlist corretto + spiegazione

---

### 4.2 Livello 2 — AI come Co-progettista (prossimo futuro)

**Ottimizzazione automatica dei parametri:**

L'agente AI usa il solver come black-box e ottimizza i valori dei componenti per soddisfare specifiche:
- Frequenza di taglio target
- Guadagno target
- Massimizzazione della banda passante con vincoli di stabilità
- Minimizzazione del rumore

**Strumenti tecnici:**
- `scipy.optimize.minimize` con il solver come funzione obiettivo
- Algoritmi evolutivi (NSGA-II) per ottimizzazione multi-obiettivo
- Bayesian optimization per spazi dei parametri ampi

**Esempio di flusso:**
```python
def objective(params):
    R, C = params
    netlist = build_rc_netlist(R, C)
    result = solve_ac(netlist)
    fc = result["metrics"]["cutoff_frequency_hz"]
    return abs(fc - target_fc)   # minimizzare la distanza dal target

result = scipy.optimize.minimize(objective, x0=[10000, 47e-9])
```

---

### 4.3 Livello 3 — AI come Ingegnere Autonomo (orizzonte 2027+)

**Sintesi automatica di circuiti da specifiche:**

Input: *"Progetta un filtro passa-banda centrato a 10 kHz con Q=5 e guadagno passante 0 dB"*

Output: schema completo del circuito, valori ottimizzati, analisi di sensitività, report in PDF.

**Architettura proposta:**
```
Utente (linguaggio naturale)
    │
    ▼
LLM (pianificazione): sceglie topologia (Butterworth, Chebyshev, Sallen-Key…)
    │
    ▼
Solver Agent: calcola valori, simula, verifica
    │
    ├── non soddisfa specs → itera
    └── soddisfa specs → genera schema + report
```

**Strumenti di misura controllati da AI:**
L'agente può posizionare "sonde virtuali" su qualsiasi nodo, variare parametri in tempo reale, e presentare risultati aggregati come farebbe un ingegnere al banco di misura.

---

### 4.4 Integrazione con Cursor AI Agents (SDK)

Il progetto è già ospitato su GitHub e si presta all'integrazione con il **Cursor SDK** per creare agenti specializzati:

```typescript
import { Agent } from "@cursor/sdk";

const circuitAgent = Agent.create({
  systemPrompt: "Sei un ingegnere elettronico specializzato in...",
  tools: [
    { name: "simulate", fn: (netlist) => callCircuitSimAPI(netlist) },
    { name: "loadCircuit", fn: (json) => updateCanvasViaWebSocket(json) },
  ]
});
```

Questo consente di:
- Creare un chatbot embedded nell'interfaccia di CircuitSim
- Controllare la canvas via WebSocket dal codice dell'agente
- Eseguire campagne di simulazione automatizzate (es. sweep di temperatura, Monte Carlo)

---

## 5. Miglioramenti all'Interfaccia Utente

### 5.1 Salvataggio e Caricamento
- Salvataggio del circuito in file JSON locale (download)
- Caricamento da file JSON
- Libreria di circuiti di esempio organizzati per categoria

### 5.2 Modalità Presentazione
- Vista pulita senza griglia, con colori personalizzabili
- Export PNG/SVG dello schema
- Export PDF del report di simulazione (schema + grafici + metriche)

### 5.3 Collaborazione in Tempo Reale
- Editing collaborativo via WebSocket (architettura CRDT)
- Commenti su nodi e componenti
- Cronologia delle versioni del circuito

### 5.4 Modalità Didattica
- Guide passo-passo interattive ("tutorial mode")
- Evidenziazione del percorso della corrente con spiegazioni
- Quiz integrati: "Quale frequenza di taglio ha questo circuito?"

### 5.5 Personalizzazione Canvas
- Temi: dark mode (attuale), light mode, high contrast
- Colori componenti personalizzabili
- Font personalizzabile per le etichette

---

## 6. Infrastruttura e DevOps

### 6.1 Deployment Cloud
- Containerizzazione con **Docker** (Dockerfile + docker-compose)
- Deploy su **Railway**, **Render** o **Fly.io** (gratuiti per progetti open source)
- HTTPS automatico con Let's Encrypt
- URL pubblico permanente per demo e condivisione

### 6.2 Architettura Scalabile (futura)
- Separazione frontend (React/Vite) da backend (FastAPI o Django async)
- **WebSocket** per aggiornamenti in tempo reale senza polling
- **Redis** come cache per risultati di simulazioni frequenti
- **Celery** per simulazioni lunghe in background (task queue)

### 6.3 Testing Automatizzato
- Test unitari del solver con `pytest` e confronto con soluzioni analitiche note
- Test di integrazione dell'API con `pytest-django`
- Test E2E dell'interfaccia con **Playwright**
- CI/CD con GitHub Actions ad ogni push su `main`

---

## 7. Priorità Suggerite (Roadmap)

### Sprint 1 — Completato (Maggio 2026)

| Stato | Feature | Note |
|---|---|---|
| ✅ Done | Salvataggio/caricamento circuiti JSON | `exportCircuit()` / `importCircuit()` + toolbar |
| ✅ Done | Induttore (simbolo canvas + solver) | Companion Backward Euler corretto; shortcut `L` |
| ✅ Done | Oscilloscopio multi-canale 4 CH | Trigger, V/div, base tempi, cursori Δt |

### Sprint 2 — Prossimo (priorità alta)

| Priorità | Feature | Impatto | Complessità |
|---|---|---|---|
| 🔴 Alta | Solver non lineare (Newton-Raphson) | Molto alto | Alta |
| 🔴 Alta | Export PNG/PDF schema + grafici | Medio | Bassa |
| 🔴 Alta | Docker + deploy cloud (Railway/Render) | Alto | Media |
| 🔴 Alta | AI Design Assistant (Livello 1) | Alto | Media |

### Sprint 3+ — Futuro

| Priorità | Feature | Impatto | Complessità |
|---|---|---|---|
| 🟡 Media | MOSFET N/P-channel (small-signal) | Alto | Media |
| 🟡 Media | BJT PNP (già predisposto nel codice) | Medio | Bassa |
| 🟡 Media | Diodo ideale (switching model) | Alto | Media |
| 🟡 Media | Trasformatore (mutua induzione MNA) | Alto | Alta |
| 🟡 Media | Analisi di stabilità polo-zero | Alto | Alta |
| 🟢 Bassa | Analisi Monte Carlo / sensitività | Medio | Alta |
| 🟢 Bassa | AI Co-progettista (Livello 2) | Molto alto | Molto alta |
| 🟢 Bassa | Collaborazione real-time (CRDT) | Medio | Molto alta |

---

## 8. Riferimenti e Risorse

- **SPICE** (Simulation Program with Integrated Circuit Emphasis): il simulatore di riferimento del settore — [ngspice.sourceforge.io](https://ngspice.sourceforge.io)
- **PySPICE**: binding Python per ngspice
- **Modified Nodal Analysis**: Ho, Ruehli, Brennan — "The Modified Nodal Approach to Network Analysis" (IEEE Trans. Circuits Syst., 1975)
- **Cursor SDK**: [cursor.com/sdk](https://cursor.com) — per l'integrazione di agenti AI
- **Chart.js**: [chartjs.org](https://www.chartjs.org) — libreria grafici usata nel frontend
- **NumPy / SciPy**: [numpy.org](https://numpy.org) / [scipy.org](https://scipy.org) — backend numerico
