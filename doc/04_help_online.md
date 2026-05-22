# CircuitSim — Help on line

> **Versione:** 1.0 — Maggio 2026

## Accesso

Nell'header, accanto al nome **CircuitSim**, è presente il pulsante **?** (icona circolare).

- **Click** — apre il pannello modale *Help on line*
- **Esc** o click fuori dal riquadro — chiude il pannello
- Navigazione a sinistra tra le sezioni del manuale integrato

## Sezioni integrate

| Sezione | Contenuto |
|---|---|
| Benvenuto | Panoramica e riferimento a `doc/02_manuale_utente.md` |
| Avvio rapido | Esempio RC, fili, analisi, Simula |
| Selezione e modifica | Selezione multipla (rettangolo), editor, help componenti |
| Layout e pannelli | Focus, grafici, assistente, impostazioni |
| Simulazione | Tipi AC / Gradino / Sinusoide |
| Strumenti | Calcolatrice, filtri, frequenzimetro, Scope, JSON |
| Scorciatoie | Tabella tasti |
| Altri aiuti | Guida hover, osservazioni SimAnalyst |

## Implementazione tecnica

| File | Ruolo |
|---|---|
| `static/js/app-help.js` | Contenuto HTML sezioni + `AppHelpModal` |
| `templates/index.html` | Pulsante `#btn-app-help`, overlay `#app-help-overlay` |
| `static/css/style.css` | Stili `.app-help-*` |

Il contenuto è in JavaScript (`APP_HELP_SECTIONS`) per aggiornamenti rapidi senza ricaricare il server Django. Per testi estesi o immagini, si può estendere con fetch di Markdown o HTML statico.

## Altri tipi di aiuto nell'app

- **?** sulla palette componenti → popup parametri (`comp-help.js` / `COMP_HELP`)
- **Guida contestuale** → pannello assistente (hover su `data-help-id`)
- **Osservazioni simulazione** → `sim-analyst.js` dopo Simula
