# CircuitSim Frontend Structure

Updated: 2026-05-25

This file describes the JavaScript frontend for collaborators and AI models.

## Frontend Purpose

The frontend is a vanilla JavaScript single-page app served by Django. It owns:

- circuit drawing and editing;
- component palette and component editor;
- netlist generation;
- simulation request orchestration;
- charts, oscilloscope, metrics, overlays;
- help panels and manual links.

There is no React/Vue/Svelte framework. The frontend uses browser APIs, Canvas,
Chart.js, and plain JavaScript modules loaded as scripts.

## Main Files

| File | Responsibility |
|---|---|
| `templates/index.html` | Static SPA shell, toolbar, sidebar, panels, script loading. |
| `static/css/style.css` | Application styling. |
| `static/js/component-registry.js` | Frontend component catalog and manual topic registry. |
| `static/js/circuit-canvas.js` | Circuit editor, drawing, selection, wires, netlist extraction. |
| `static/js/app.js` | Main UI coordinator and simulation controller. |
| `static/js/bode-plot.js` | Bode and transient plot wrappers. |
| `static/js/oscilloscope.js` | Multi-channel oscilloscope panel. |
| `static/js/current-animator.js` | Current-flow animation. |
| `static/js/settings.js` | User settings and localStorage persistence. |
| `static/js/comp-help.js` | Component help modal and contextual help. |
| `static/js/app-help.js` | Application help modal. |
| `static/js/param-analyzer.js` | Parameter/topology helper panel. |
| `static/js/calculator.js` | Calculator modal. |
| `static/js/tools.js` | Cap converter, filter calculator, frequency meter. |
| `static/js/sim-analyst.js` | Post-simulation observations. |

## Load Order

`templates/index.html` loads `component-registry.js` before
`circuit-canvas.js` and `app.js`. This is required.

Critical dependency:

```js
window.CIRCUIT_COMPONENT_REGISTRY
```

Both `circuit-canvas.js` and `app.js` fail early if the registry is missing.

## Frontend Component Registry

File: `static/js/component-registry.js`

The registry is the current frontend contract for components.

Example shape:

```js
window.CIRCUIT_COMPONENT_REGISTRY = Object.freeze({
  resistor: {
    label: "Resistenza",
    terminals: [{ id: "a", lx: 0, ly: 0 }, { id: "b", lx: 80, ly: 0 }],
    defaultValue: 10000,
    unit: "\\u03a9",
    netlistType: "resistor",
    prefix: "R",
    toolMessage: "Resistenza: clicca sulla canvas per piazzare (R)"
  }
});
```

Current frontend component types:

| Frontend type | Backend output |
|---|---|
| `resistor` | `resistor` |
| `capacitor` | `capacitor` |
| `inductor` | `inductor` |
| `vsource` | `voltage_source` |
| `gnd` | skipped, creates ground node |
| `bjt_npn` | `bjt_npn` |
| `potentiometer` | two `resistor` entries |
| `switch_spst` | one `resistor`, value depends on open/closed state |
| `led_red`, `led_green`, `led_yellow`, `led_blue`, `led_white` | `voltage_source` plus `resistor` |

## CircuitCanvas

File: `static/js/circuit-canvas.js`

Main class:

```js
class CircuitCanvas
```

Core responsibilities:

- manage component list, wire list, text labels;
- draw components and wires on HTML Canvas;
- handle zoom, pan, snap-to-grid;
- handle selection and multi-selection;
- emit circuit change/select events;
- export/import circuit state;
- build simulation netlists.

Important methods:

| Method | Purpose |
|---|---|
| `_makeComp(type, x, y, rotation, value)` | Creates a component instance with defaults. |
| `getTerminals(comp)` | Calculates terminal world coordinates. |
| `generateNetlist(analysisOverrides)` | Converts the canvas state into API netlist JSON. |
| `computeNodeMap(outputNodeName)` | Maps electrical nodes to visual positions. |
| `exportCircuit()` | Serializes the drawing state. |
| `importCircuit(data)` | Loads a previously exported drawing state. |
| `render()` | Redraws the canvas. |

## Netlist Generation

`generateNetlist()` uses a Union-Find algorithm:

1. create one key per component terminal;
2. union terminals that occupy the same rounded position;
3. union terminals connected by wires;
4. name ground-connected roots as `gnd`;
5. assign names `n1`, `n2`, ... to other roots;
6. convert components to solver entries;
7. select an output node unless a probe override exists.

Special expansions:

- potentiometer: total resistance split by `wiper`;
- switch: `1e-3` ohm when closed, `1e12` ohm when open;
- LED: simplified model as voltage source `Vf` plus small series resistor;
- voltage source: includes component-specific signal fields.

Voltage source netlist fields:

```json
{
  "signal": "dc | sine | step | ac",
  "dc": 5,
  "amplitude": 1,
  "frequency": 1000,
  "offset": 0,
  "phase": 0,
  "step_initial": 0,
  "step_final": 5,
  "step_time": 0,
  "ac_amplitude": 1
}
```

## `app.js`

`app.js` is the main coordinator. It is powerful but currently too large.

Responsibilities:

- create `CircuitCanvas`;
- initialize settings, charts, scope, help, tools;
- handle toolbar and palette clicks;
- render selected-component editor;
- build analysis options;
- call `/api/simulate/`;
- update plots, metrics, overlays, and analyst panel.

Current analysis controls:

- `dc`: DC operating point;
- `ac`: AC sweep/Bode;
- `transient`: time-domain simulation.

Legacy support still exists in some code for `sinusoidal`; this should be
kept only as compatibility or removed after migration.

## Component Editor

The selected-component editor is rendered in `renderCompEditor()`.

Current component-specific editor logic includes:

- BJT: beta and quiescent collector current;
- potentiometer: total resistance and wiper percent;
- switch: open/closed state;
- LED: forward voltage and internal model resistance;
- voltage source: signal type and per-source signal parameters.

Recommended next step: move editor definitions into the component registry as
schema data rather than hard-coding each branch in `app.js`.

## Charts And Scope

Chart-related objects:

- `BodePlot`
- `TransientPlot`
- bottom `vtChart`
- bottom `vfChart`
- `Oscilloscope`

The backend can return `node_traces`. When present, the frontend feeds them to
the oscilloscope and auto-assigns initial channels.

## Help System

There are two help systems:

- component help: `static/js/comp-help.js`;
- application help: `static/js/app-help.js`.

Manual PDF links are stored in `window.CIRCUIT_MANUAL_REGISTRY`. Category book
icons call `POST /api/manual/open/`, which opens SumatraPDF locally.

## Frontend Weak Points

- `app.js` mixes sidebar, simulation, charts, settings, and help.
- Component editor branches are hard-coded.
- Drawing symbols are embedded in `CircuitCanvas`.
- Some legacy sinusoidal code remains after moving signals into voltage sources.
- Frontend and backend registries can diverge.

## Recommended Frontend Modularization

Suggested modules:

```text
static/js/
  core/
    simulation-client.js
    event-bus.js
  components/
    component-registry.js
    component-editor.js
    component-drawers.js
    netlist-adapters.js
  canvas/
    circuit-canvas.js
    selection.js
    wiring.js
  charts/
    chart-coordinator.js
    bode-plot.js
    oscilloscope.js
  help/
    comp-help.js
    app-help.js
```

Recommended migration order:

1. extract API call logic from `app.js`;
2. extract component editor rendering;
3. move component editor schema into registry;
4. extract drawing functions by component family;
5. add tests for netlist generation.

