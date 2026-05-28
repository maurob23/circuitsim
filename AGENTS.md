# CircuitSim - Agent Briefing
Aggiornato: 2026-05-28

## Cos'e questo progetto
Simulatore web di circuiti elettronici per scopi didattici.
Stack: Django + JavaScript Canvas + solver MNA Python.
Target: circuiti audio per amplificatore per chitarra (progetto LINEA AMP).

## Struttura - 4 blocchi, responsabilita separate

frontend/     -> UI browser, canvas, grafici. Nessuna logica.
api/          -> Django REST. Valida netlist JSON, instrada al solver.
solver/       -> Matematica pura. Nessuna dipendenza da Django.
services/     -> Servizi sistema: SumatraPDF, DeepSeek, config.

## Contratto netlist JSON (frontend -> backend)
{
  "components": [{"id","type","value","unit","nodes"}],
  "analysis": {"type":"ac|transient|dc", ...params},
  "output_nodes": ["n1"]
}
Tipi componente: resistor, capacitor, voltage_source,
                 current_source, diode, opamp, inductor
Validazione: api/serializers.py
Modello interno solver: solver/netlist.py (frozen dataclass)

## Tier system (router.py sceglie automaticamente)
Tier 1: MNA Python   -> circuiti lineari < 20 componenti
Tier 2: ngspice      -> placeholder, non implementato
Tier 3: LTSpice      -> placeholder, non implementato

## Servizi esterni attivi
DeepSeek API: traduzione EN<->IT - services/translation.py
SumatraPDF: apertura manuale PDF - services/pdf_viewer.py
Credenziali: file .env nella root (NON committare)

## Regole architetturali - NON violare
1. solver/ non importa nulla da Django o api/
2. Il netlist JSON e l'unico contratto frontend<->backend
3. Nessuna logica di simulazione in api/views.py
4. Nessun commit senza approvazione umana

## Stato attuale
Task 01 completato: refactoring struttura cartelle.
In attesa di commit dopo revisione di services/translation.py.

## Prossimo task
Task 02: implementare to_mna_matrices() in solver/netlist.py
collegandolo a solver/tier1/mna.py.
Poi: aggiungere analisi transiente al solver MNA.

## Riferimento umano
Per decisioni architetturali consultare Claude (conversazione
separata) prima di procedere. Codex/Cursor eseguono,
Claude valida l'architettura.
