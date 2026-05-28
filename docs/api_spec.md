# CircuitSim API Specification

Updated: 2026-05-25

This document describes the public HTTP API used by the CircuitSim frontend.

Base URL in development:

```text
http://127.0.0.1:8000
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Serve the browser application. |
| `GET` | `/api/health/` | Return backend health status. |
| `POST` | `/api/simulate/` | Validate and simulate a circuit netlist. |
| `POST` | `/api/manual/open/` | Open the configured PDF manual locally. |

## `GET /api/health/`

Response:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## `POST /api/simulate/`

Request content type:

```text
application/json
```

### Request Shape

```json
{
  "components": [
    {
      "id": "V1",
      "type": "voltage_source",
      "nodes": ["n1", "gnd"],
      "value": 5,
      "signal": "dc",
      "dc": 5
    },
    {
      "id": "R1",
      "type": "resistor",
      "nodes": ["n1", "n2"],
      "value": 10000
    }
  ],
  "analysis": {
    "type": "dc"
  },
  "output_nodes": ["n2"]
}
```

Required top-level fields:

- `components`: non-empty array;
- `analysis`: object.

Optional top-level fields:

- `output_nodes`: array of node names. The first valid node is used as output.

### Supported Analysis Types

| Type | Purpose | Parameters |
|---|---|---|
| `dc` | DC operating point | none |
| `ac` | Small-signal AC sweep | `start_freq`, `stop_freq`, `points_per_decade` |
| `transient` | Time-domain simulation | `points`, optional `t_end`, optional `periods` |
| `sinusoidal` | Legacy time-domain sinusoidal mode | `frequency`, `amplitude`, `periods`, `points_per_cycle` |

Recommended frontend usage:

- use `dc` for operating point;
- use `ac` for Bode plots;
- use `transient` for DC, sine, and step source time-domain behavior;
- avoid new UI work on `sinusoidal`; keep it only for compatibility.

### AC Analysis Example

```json
{
  "components": [
    {"id": "V1", "type": "voltage_source", "nodes": ["n1", "gnd"], "value": 1, "signal": "ac", "ac_amplitude": 1},
    {"id": "R1", "type": "resistor", "nodes": ["n1", "n2"], "value": 10000},
    {"id": "C1", "type": "capacitor", "nodes": ["n2", "gnd"], "value": 47e-9}
  ],
  "analysis": {"type": "ac", "start_freq": 10, "stop_freq": 100000, "points_per_decade": 100},
  "output_nodes": ["n2"]
}
```

### Transient Sine Example

```json
{
  "components": [
    {
      "id": "V1",
      "type": "voltage_source",
      "nodes": ["n1", "gnd"],
      "value": 0,
      "signal": "sine",
      "amplitude": 2,
      "frequency": 1000,
      "offset": 1,
      "phase": 0
    },
    {"id": "R1", "type": "resistor", "nodes": ["n1", "gnd"], "value": 1000}
  ],
  "analysis": {"type": "transient", "points": 600, "periods": 6},
  "output_nodes": ["n1"]
}
```

### Transient Step Example

```json
{
  "components": [
    {
      "id": "V1",
      "type": "voltage_source",
      "nodes": ["n1", "gnd"],
      "value": 5,
      "signal": "step",
      "step_initial": 0,
      "step_final": 5,
      "step_time": 0.001
    },
    {"id": "R1", "type": "resistor", "nodes": ["n1", "n2"], "value": 10000},
    {"id": "C1", "type": "capacitor", "nodes": ["n2", "gnd"], "value": 47e-9}
  ],
  "analysis": {"type": "transient", "points": 600, "t_end": 0.005},
  "output_nodes": ["n2"]
}
```

## Component Contract

Backend-supported component types:

| Type | Nodes | `value` rule | Notes |
|---|---:|---|---|
| `resistor` | 2 | positive | Ohms |
| `capacitor` | 2 | positive | Farads |
| `inductor` | 2 | positive | Henry |
| `voltage_source` | 2 | numeric | Can be DC, AC, sine, step |
| `current_source` | 2 | numeric | Basic source support |
| `bjt_npn` | 3 | positive | Small-signal hybrid-pi |

Node names:

- any non-empty string is accepted;
- ground should be `gnd`, `0`, or `GND`;
- frontend normally creates `n1`, `n2`, ... automatically.

## Voltage Source Fields

| Field | Type | Meaning |
|---|---|---|
| `signal` | string | `dc`, `sine`, `step`, or `ac` |
| `dc` | number | DC value used by DC operating point |
| `amplitude` | number >= 0 | Sine peak amplitude |
| `ac_amplitude` | number >= 0 | Small-signal AC sweep amplitude |
| `frequency` | number > 0 | Sine frequency in Hz |
| `offset` | number | Sine DC offset |
| `phase` | number | Sine phase in degrees |
| `step_initial` | number | Step value before `step_time` |
| `step_final` | number | Step value after `step_time` |
| `step_time` | number >= 0 | Step time in seconds |

## Response Shape

Successful response:

```json
{
  "simulation_id": "uuid",
  "tier_used": 1,
  "analysis_type": "dc",
  "results": {
    "frequencies": [],
    "magnitude_db": [],
    "phase_deg": [],
    "times": [],
    "voltages": [],
    "vin": [],
    "vout": [],
    "node_traces": {},
    "node_voltages": {"n1": 5.0, "gnd": 0.0}
  },
  "metrics": {},
  "solver_info": {
    "solver": "mna_python",
    "elapsed_ms": 0,
    "convergence": true
  }
}
```

Result fields by analysis:

| Analysis | Main result fields |
|---|---|
| `dc` | `node_voltages` |
| `ac` | `frequencies`, `magnitude_db`, `phase_deg` |
| `transient` | `times`, `voltages`, `node_traces` |
| `sinusoidal` | `times`, `vin`, `vout`, `node_traces` |

## Error Responses

Invalid JSON:

```json
{"error": "Invalid JSON: ..."}
```

Validation error:

```json
{"error": "voltage_source.frequency must be > 0"}
```

Solver error:

```json
{"error": "Solver error: ..."}
```

Status codes:

| Status | Meaning |
|---:|---|
| `400` | Invalid JSON |
| `422` | Invalid netlist or unsupported circuit |
| `500` | Unexpected solver/runtime error |

## `POST /api/manual/open/`

Request:

```json
{"topic": "passivi"}
```

Successful response:

```json
{"status": "ok", "topic": "passivi", "page": 71}
```

This endpoint opens the PDF under `static/docs/` with SumatraPDF. The executable
is resolved from `SUMATRA_PDF_PATH`, `%LOCALAPPDATA%`, `%ProgramFiles%`,
`%ProgramFiles(x86)%`, or `PATH`.
