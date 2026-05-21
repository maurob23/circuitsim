# CircuitSim — Documentazione

Questa cartella contiene tutta la documentazione ufficiale del progetto CircuitSim, organizzata per destinatario e scopo.

---

## Indice dei Documenti

### 01 · Architettura Tecnica
**File:** [`01_architettura_tecnica.md`](01_architettura_tecnica.md)  
**Per chi:** sviluppatori, collaboratori umani e agenti AI che contribuiscono al codice  
**Contiene:**
- Stack tecnologico completo (Django, NumPy, Canvas API, Chart.js)
- Struttura delle directory e dei moduli
- Formato netlist JSON (input/output API)
- Descrizione del solver MNA e del modello BJT hybrid-π
- Architettura frontend (moduli JS, coordinate canvas)
- Guida per aggiungere nuovi componenti o tipi di analisi
- Setup ambiente di sviluppo
- Convenzioni di codice

---

### 02 · Manuale Utente
**File:** [`02_manuale_utente.md`](02_manuale_utente.md)  
**Per chi:** utenti finali che vogliono usare l'applicazione senza conoscere la parte tecnica  
**Contiene:**
- Cos'è CircuitSim e a cosa serve
- Come avviare l'applicazione
- Come disegnare un circuito (componenti, fili, rotazione, spostamento)
- Come modificare i valori dei componenti
- Come simulare e leggere i grafici
- Animazione della corrente e controlli
- Nodi di misura e selezione del punto di sonda
- Scorciatoie da tastiera
- Domande frequenti

---

### 03 · Proposte e Miglioramenti
**File:** [`03_proposte_miglioramenti.md`](03_proposte_miglioramenti.md)  
**Per chi:** team di sviluppo, stakeholder, agenti AI per pianificazione evolutiva  
**Contiene:**
- Strumenti di misura virtuali (oscilloscopio, multimetro, analizzatore FFT)
- Nuovi componenti (MOSFET, diodo, induttore, trasformatore)
- Estensioni del solver (Newton-Raphson, analisi rumore, polo-zero)
- Integrazione AI a tre livelli: assistente, co-progettista, ingegnere autonomo
- Integrazione con Cursor AI SDK per agenti di progettazione automatica
- Miglioramenti UI (salvataggio, export, collaborazione real-time)
- Infrastruttura cloud (Docker, deploy, CI/CD)
- Roadmap con priorità

---

## Aggiornare la Documentazione

Quando vengono aggiunte nuove funzionalità al progetto:

1. **Nuova feature tecnica** → aggiorna `01_architettura_tecnica.md` nella sezione pertinente
2. **Nuova funzione utente** → aggiungi una voce in `02_manuale_utente.md`
3. **Feature implementata dalla roadmap** → sposta la voce da `03_proposte_miglioramenti.md` alla documentazione tecnica/utente e aggiorna la tabella delle priorità

---

*Documentazione generata: Maggio 2026 — CircuitSim v1.0*
