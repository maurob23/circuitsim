# CircuitSim — Manuale Utente

> **Per chi è questo manuale:** chiunque voglia usare CircuitSim per disegnare e simulare circuiti elettronici, senza necessità di conoscere la parte tecnica interna.  
> **Versione:** 1.0 — Maggio 2026

---

## Cos'è CircuitSim?

CircuitSim è un simulatore di circuiti elettronici che funziona direttamente nel browser. Permette di:

- **Disegnare schemi elettrici** trascinando componenti su una griglia
- **Collegare i componenti** con fili
- **Simulare il comportamento** del circuito (correnti, tensioni, frequenze)
- **Visualizzare i risultati** in grafici interattivi
- **Animare la corrente** che scorre nel circuito
- **Salvare e ricaricare** i propri circuiti come file JSON
- **Analizzare segnali** con l'oscilloscopio virtuale multi-canale

Non serve installare nulla: basta aprire il browser all'indirizzo fornito dall'amministratore (di solito `http://localhost:8000`).

### Help on line nell'applicazione

Accanto al nome **CircuitSim** (in alto a sinistra) trovi il pulsante **?**. Apre un manuale integrato con sezioni navigabili (avvio rapido, selezione, simulazione, strumenti, scorciatoie). Per il testo completo in Markdown vedi anche `doc/02_manuale_utente.md` nel repository.

---

## 1. Avvio dell'Applicazione

1. Apri il browser (Chrome, Firefox o Edge)
2. Vai all'indirizzo `http://localhost:8000`
3. Vedrai l'interfaccia divisa in tre aree principali:

```
┌──────────────────────────────────────────────────────────────┐
│  BARRA STRUMENTI (in alto)                                    │
├──────────────────┬───────────────────────────────────────────┤
│  PANNELLO        │                                            │
│  CONTROLLI       │   CANVAS (area di disegno)                │
│  (sinistra)      │                                            │
│                  │                                            │
│  - Analisi       │                                            │
│  - Parametri     │                                            │
│  - Netlist       ├───────────────────────────────────────────┤
│  - Editor comp.  │  GRAFICI (in basso)                        │
└──────────────────┴───────────────────────────────────────────┘
```

---

## 2. Disegnare un Circuito

### 2.1 Strumenti Disponibili

Nella barra in alto trovi i pulsanti degli strumenti:

| Pulsante | Tasto | Cosa fa |
|---|---|---|
| **Seleziona** | `S` | Seleziona e sposta componenti; trascina un rettangolo su area vuota per selezione multipla |
| **Help ?** | — | Apre il manuale *Help on line* nell'header |
| **Filo** | `W` | Collega terminali con un filo |
| **Elimina** | `D` | Cancella componenti, fili o etichette |
| **R** | `R` | Posiziona una resistenza |
| **C** | `C` | Posiziona un condensatore |
| **L** | `L` | Posiziona un induttore *(Sprint 1)* |
| **V** | `V` | Posiziona un generatore di tensione |
| **GND** | `G` | Posiziona una massa (riferimento 0 V) |
| **NPN** | `Q` | Posiziona un transistore BJT NPN |
| **Testo** | `T` | Inserisce un'etichetta di testo libero |
| **Ruota** | `E` | Ruota il componente selezionato |
| **Salva** | — | Scarica il circuito come file JSON *(Sprint 1)* |
| **Carica** | — | Carica un circuito da file JSON *(Sprint 1)* |
| **Scope** | — | Apre/chiude l'oscilloscopio multi-canale *(Sprint 1)* |

### 2.2 Posizionare un Componente

1. Clicca il pulsante del componente desiderato (es. **R** per una resistenza)
2. Il cursore cambierà forma
3. Clicca sulla griglia nel punto dove vuoi posizionarlo
4. Il componente appare sulla canvas

> **Suggerimento:** I componenti si agganciano automaticamente ai punti della griglia. Usa lo zoom per lavorare più comodamente.

### 2.3 Collegare i Componenti con un Filo

1. Clicca **Filo** (o premi `W`)
2. Clicca sul terminale di un componente (appare un cerchietto evidenziato quando ci passi sopra)
3. Clicca sul terminale di destinazione
4. Il filo viene disegnato automaticamente

> I terminali sono i pallini alle estremità dei componenti. Ogni terminale deve essere collegato a qualcosa (altro componente, massa o altro filo).

### 2.4 Spostare un Componente

1. Clicca **Seleziona** (o premi `S`)
2. Clicca sul componente — diventa evidenziato
3. Tieni premuto e trascina nella nuova posizione

### 2.4b Selezione multipla

Con lo strumento **Seleziona**:

1. **Trascina** il mouse su un'area vuota del circuito: compare un rettangolo blu; al rilascio si selezionano tutti i componenti nell'area.
2. **Shift + trascina** per aggiungere alla selezione senza deselezionare gli altri.
3. **Shift + click** su un componente per aggiungerlo o rimuoverlo dal gruppo.
4. **Trascina** un componente del gruppo: si spostano tutti i selezionati insieme.
5. **Del** / **Backspace** o strumento **Elimina**: cancella tutti i componenti selezionati (con conferma se attiva in Impostazioni).
6. Click su area vuota (senza trascinare) deseleziona tutto.

Nel pannello **Componente selezionato** compare un riepilogo quando sono selezionati più elementi.

### 2.5 Ruotare un Componente

1. Seleziona il componente
2. Clicca **Ruota** o premi `E`
3. Il componente ruota di 90° ad ogni pressione

### 2.6 Eliminare un Componente o Filo

- Seleziona lo strumento **Elimina** poi clicca sull'elemento
- Oppure seleziona uno o più componenti (con **Seleziona**) e premi `Canc` o `Backspace`
- Con più componenti selezionati, l'eliminazione riguarda l'intero gruppo e i fili collegati

### 2.7 Caricare il Circuito di Esempio

Clicca **Esempio RC** per caricare automaticamente un filtro RC passa-basso classico (R=10 kΩ, C=47 nF, frequenza di taglio 338 Hz) pronto per essere simulato.

---

## 3. Modificare i Componenti

### 3.1 Editor del Componente (pannello sinistro)

Cliccando su un componente con lo strumento **Seleziona**, il pannello di sinistra mostra i suoi parametri modificabili:

- **Nome**: etichetta visibile sulla canvas (es. R1, C_filtro)
- **Tipo**: il tipo di componente (non modificabile)
- **Valore**: il valore fisico del componente
- **Rotazione**: orientamento (0°, 90°, 180°, 270°)

**Per il transistore BJT NPN** compaiono due campi aggiuntivi:
- **β (hFE)**: guadagno di corrente (tipicamente 100–500)
- **Ic_Q (mA)**: corrente di collettore di polarizzazione (tipicamente 0.1–10 mA)

### 3.2 Slider Rapidi (per R e C)

Nel pannello sinistro, sotto la sezione analisi, trovi due slider per variare rapidamente:
- **Resistenza R** (da 100 Ω a 1 MΩ)
- **Capacità C** (da 1 pF a 100 µF)

I grafici si aggiornano istantaneamente mentre sposti lo slider.

### 3.3 Rinominare un Componente

1. Seleziona il componente
2. Nel pannello sinistro, modifica il campo **Nome**
3. Premi `Invio` — il nuovo nome appare sulla canvas

### 3.4 Aggiungere Etichette di Testo

1. Clicca **Testo** (o premi `T`)
2. Clicca nel punto della canvas dove vuoi l'etichetta
3. Digita il testo nel campo che appare
4. Premi `Invio` per confermare
5. Per modificare: doppio-click sull'etichetta

---

## 4. Navigare la Canvas

### 4.1 Zoom

- **Rotella del mouse**: zoom in/out nel punto del cursore
- **Pulsanti ＋ e －** nella barra strumenti
- **Pulsante ⊡**: adatta il circuito alla finestra

### 4.2 Pan (spostamento)

- **Tasto centrale del mouse** (rotella premuta) + trascina
- **Barra spaziatrice** tenuta premuta + trascina con il tasto sinistro

---

## 5. Simulare il Circuito

### 5.1 Scegliere il Tipo di Analisi

Nel pannello sinistro, sezione **Analisi**, seleziona una delle quattro opzioni:

| Analisi | Cosa calcola | Quando usarla |
|---|---|---|
| **AC** | Risposta in frequenza (diagramma di Bode) | Filtri, amplificatori — vedere guadagno e fase vs frequenza |
| **Transitorio** | Risposta a gradino nel tempo | Come si carica un condensatore, risposta impulsiva |
| **Sinusoide** | Ingresso e uscita sinusoidale nel tempo | Vedere transitorio + regime permanente con segnale sinusoidale |
| **DC** | Tensioni continue in ogni nodo | Verificare la polarizzazione statica del circuito |

### 5.2 Impostare i Parametri

Dopo aver selezionato il tipo di analisi, appare una sezione con i parametri specifici:

**AC:** frequenza iniziale, frequenza finale

**Sinusoide:** frequenza (Hz), ampiezza (V), numero di periodi

### 5.3 Avviare la Simulazione

Clicca il pulsante verde **▶ Simula** in alto.

Il risultato appare nei grafici in basso in pochi istanti.

---

## 6. Leggere i Grafici

### 6.1 Grafico V(t) — Tensione nel Tempo

Mostra come varia la tensione nel tempo. Apparirà quando usi le analisi **Transitorio** o **Sinusoide**.

- **Linea blu/verde**: segnale di ingresso
- **Linea arancione/rossa**: segnale di uscita

### 6.2 Grafico V(f) — Risposta in Frequenza (Bode)

Mostra guadagno (dB) e fase (°) al variare della frequenza. Appare con l'analisi **AC**.

- **Linea verde**: diagramma di Bode calcolato numericamente (MNA)
- **Linea tratteggiata**: risposta analitica (solo per filtri RC semplici)

### 6.3 Interagire con i Grafici

- **Rotella del mouse** sul grafico: zoom in/out
- **Clicca e trascina**: pan
- **Pulsante Reset** (in basso a destra del grafico): torna alla vista originale

### 6.4 Metriche (pannello sinistro)

Dopo la simulazione, nella sezione **Metriche** compaiono valori calcolati come:
- Frequenza di taglio (-3 dB)
- Costante di tempo τ
- Guadagno in DC
- Roll-off (dB/decade)

---

## 7. Animazione della Corrente

Dopo ogni simulazione avviata con successo, partono automaticamente dei piccoli **pallini colorati** che si muovono lungo i componenti e i fili:

- **Pallini verdi** → corrente nel verso positivo (destra)
- **Pallini arancioni** → corrente nel verso negativo (sinistra)
- La **velocità** dei pallini è proporzionale all'intensità della corrente

### Controlli animazione

Nella barra strumenti (destra):
- **⏸ / ▶**: metti in pausa o riprendi l'animazione
- **⏹**: ferma completamente l'animazione
- **Velocità**: trascina il cursore per aumentare o diminuire la velocità

---

## 8. Nodi di Misura

### 8.1 Visualizzare i Nodi

Clicca il pulsante **◎ Nodi** per mostrare/nascondere i **nodi** del circuito (i punti di connessione elettrica).

Ogni nodo è visualizzato con un cerchio colorato e la tensione calcolata:
- **Giallo**: nodo generico
- **Blu**: nodo di ingresso (connesso al generatore)
- **Verde**: nodo di uscita selezionato come punto di misura
- **Grigio**: massa (0 V)

### 8.2 Selezionare un Nodo come Punto di Misura

1. Mostra i nodi (pulsante **◎ Nodi**)
2. Clicca su un nodo colorato
3. La simulazione si riesegue automaticamente
4. I grafici mostrano la risposta misurata in quel punto specifico

---

## 9. Oscilloscopio Virtuale Multi-Canale

L'oscilloscopio è disponibile dopo aver eseguito un'analisi di tipo **Sinusoide** o **Transitorio**.

### 9.1 Aprire l'Oscilloscopio

Clicca il pulsante **Scope** nella barra strumenti. Il pannello dell'oscilloscopio appare in basso sotto i grafici normali. Per chiuderlo, clicca la **✕** in alto a destra del pannello.

### 9.2 Configurare i Canali

L'oscilloscopio ha **4 canali** (CH1, CH2, CH3, CH4), ognuno con colore distinto:

| Canale | Colore |
|---|---|
| CH1 | Blu |
| CH2 | Verde |
| CH3 | Rosso |
| CH4 | Viola |

Per ogni canale:
1. Seleziona il **nodo** da monitorare nel menu a tendina accanto all'etichetta del canale
2. Imposta i **V/div** (volt per divisione) nel campo numerico accanto

Dopo la simulazione, il **CH1 viene assegnato automaticamente** al primo nodo disponibile.

### 9.3 Base dei Tempi

Il menu **Base tempi** in alto a destra del pannello controlla quanti millisecondi corrispondono a una divisione orizzontale. Scegli tra 0.1 ms/div e 50 ms/div in base alla frequenza del segnale.

### 9.4 Cursori di Misura

- **Click** sul display dell'oscilloscopio: posiziona il cursore C1 (giallo) poi C2 (ciano)
- **Trascina** un cursore per spostarlo
- Quando entrambi i cursori sono posizionati, in basso appare: **Δt** (differenza di tempo) e la **frequenza** corrispondente
- **Doppio click**: rimuove entrambi i cursori

### 9.5 Trigger

L'oscilloscopio si sincronizza automaticamente sul **fronte di salita** del CH1 all'incrocio con 0 V. Questo stabilizza la visualizzazione dei segnali periodici.

---

## 10. Impostazioni e temi

Nella sidebar sinistra, sezione **Impostazioni** (in fondo):

| Opzione | Descrizione |
|---|---|
| **Tema** | Notte, Ardesia, Oceano, Chiaro |
| **Dimensione testo** | Compatta / Normale / Grande |
| **Griglia canvas** | Mostra o nasconde i punti griglia |
| **Snap alla griglia** | Aggancia posizione componenti |
| **Etichette componenti** | Nome e valore sullo schema |
| **Conferma eliminazione** | Dialogo prima di cancellare |
| **Analisi predefinita** | AC, Gradino o Sinusoide all'avvio |
| **Animazione corrente** | Pallini dopo Simula |
| **Pannelli all'avvio** | Grafici destra e assistente |

**Ripristina predefiniti** riporta tutte le opzioni ai valori iniziali.

---

## 11. Scorciatoie da Tastiera — Riepilogo

| Tasto | Azione |
|---|---|
| `S` | Strumento Seleziona |
| `W` | Strumento Filo |
| `D` | Strumento Elimina |
| `R` | Posiziona Resistenza |
| `C` | Posiziona Condensatore |
| `V` | Posiziona Generatore V |
| `G` | Posiziona Massa |
| `Q` | Posiziona Transistore NPN |
| `T` | Strumento Testo |
| `E` | Ruota componente selezionato |
| `L` | Posiziona Induttore |
| `Canc` / `Backspace` | Elimina selezione (anche multipla) |
| `Shift` + click / trascina | Aggiungi o togli dalla selezione multipla |
| `Esc` | Deseleziona / annulla |
| Rotella mouse | Zoom canvas |
| Spazio + trascina | Pan canvas |

---

## 12. Domande Frequenti

**Il circuito non produce risultati dopo "Simula".**  
Verifica che: ogni componente abbia almeno un terminale collegato, ci sia almeno una massa (GND) nel circuito, e ci sia almeno un generatore di tensione.

**I grafici sono vuoti.**  
Assicurati che il circuito abbia almeno due nodi distinti (ingresso e uscita) e che siano correttamente collegati.

**L'animazione della corrente non parte.**  
L'animazione parte automaticamente dopo una simulazione andata a buon fine. Se non vedi i pallini, verifica che la simulazione abbia prodotto risultati nelle metriche.

**Come resetto tutto?**  
Clicca il pulsante **Cancella** nella barra strumenti. Questa azione rimuove tutti i componenti, i fili e i grafici.

**Posso salvare il circuito?**  
Sì. Clicca il pulsante **Salva** nella toolbar: il browser scaricherà automaticamente un file `.json` con il circuito completo (componenti, fili, etichette). Per ricaricare un circuito salvato, clicca **Carica** e seleziona il file.
