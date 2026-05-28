# CircuitSim - Task 01 Refactoring struttura cartelle

## File spostati

- `templates/index.html` -> `frontend/templates/index.html`
- `static/js/app.js` -> `frontend/static/js/app.js`
- `static/js/circuit-canvas.js` -> `frontend/static/js/circuit-canvas.js`
- `static/js/component-registry.js` -> `frontend/static/js/component-registry.js`
- `static/css/style.css` -> `frontend/static/css/style.css`

## File creati

- `api/serializers.py`
- `solver/netlist.py`
- `solver/tier2/__init__.py`
- `solver/tier3/__init__.py`
- `services/__init__.py`
- `services/config.py`
- `services/pdf_viewer.py`
- `frontend/static/js/charts/.gitkeep`

## File modificati

- `config/settings.py`
  - Aggiornati i percorsi Django per template e statici:
    - `frontend/templates`
    - `frontend/static`
    - `static`
- `api/views.py`
  - Rimossa la logica diretta di apertura SumatraPDF.
  - Collegato il nuovo servizio `services.pdf_viewer`.

## Verifiche

- `.venv/Scripts/python.exe manage.py check` -> nessun errore
- `.venv/Scripts/python.exe test_stabilization.py` -> superato
- `http://127.0.0.1:8000/` -> risponde con HTTP 200 durante il controllo locale
- `manage.py findstatic` trova correttamente:
  - `frontend/static/js/app.js`
  - `frontend/static/js/circuit-canvas.js`
  - `frontend/static/js/component-registry.js`
  - `frontend/static/css/style.css`

## Note

- Nessun commit e nessun push eseguiti.
- La logica del solver MNA non e stata modificata.
