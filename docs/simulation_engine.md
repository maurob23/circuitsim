# CircuitSim Simulation Engine

Updated: 2026-05-25

This file explains the current simulation engine and its limits.

## Current Solver Strategy

CircuitSim currently uses a tiered solver architecture.

Implemented:

- Tier 1: Python Modified Nodal Analysis (MNA), file `solver/tier1/mna.py`.

Planned:

- Tier 2: nonlinear solver or ngspice/PySpice integration;
- Tier 3: external SPICE/headless workflows and AI-assisted verification.

## Tier 1 Scope

Tier 1 is intended for:

- resistors;
- capacitors;
- inductors;
- independent voltage sources;
- independent current sources;
- BJT NPN in a simplified small-signal hybrid-pi model;
- frontend-expanded approximations of switches, potentiometers, and LEDs.

Tier 1 is not a full SPICE replacement. It is suitable for teaching, early
design exploration, simple filters, linear circuits, and small-signal analysis.

## Supported Analyses

| Analysis | Function | Description |
|---|---|---|
| `dc` | `solve_dc` | DC operating point. Capacitors open; inductors approximated as shorts. |
| `ac` | `solve_ac` | Frequency sweep using complex admittance. |
| `transient` | `solve_transient` | Time-domain simulation using Backward Euler companion models. |
| `sinusoidal` | `solve_sinusoidal` | Legacy sine-specific time-domain mode kept for compatibility. |

Recommended future usage:

- use `transient` for all time-domain source waveforms;
- keep `sinusoidal` only until UI and tests are fully migrated.

## MNA Matrix

Modified Nodal Analysis solves:

```text
[G  B] [v]   [i]
[C  D] [j] = [e]
```

Where:

- `v` is the vector of node voltages;
- `j` is the vector of currents through voltage sources;
- `i` is the vector of known current injections;
- `e` is the vector of voltage source values.

The solver builds the matrix for each frequency or time step and solves it with
`numpy.linalg.solve`.

## Ground Nodes

The solver treats these names as ground:

```python
{"gnd", "0", "GND"}
```

Ground nodes are not included as unknown node voltages.

## AC Analysis

Function:

```python
solve_ac(netlist: dict) -> dict
```

AC analysis:

1. creates a logarithmic frequency vector;
2. builds the MNA matrix with complex admittances;
3. solves each frequency point;
4. computes magnitude and phase at the selected output node;
5. extracts metrics such as cutoff frequency.

Element behavior:

| Element | AC admittance |
|---|---|
| Resistor | `1 / R` |
| Capacitor | `j * omega * C` |
| Inductor | `1 / (j * omega * L)` |
| Voltage source | Uses `ac_amplitude` when available |

## DC Analysis

Function:

```python
solve_dc(netlist: dict) -> dict
```

DC behavior:

- capacitor: open circuit;
- inductor: very large conductance approximation;
- voltage source: uses `dc` when available, otherwise `value`;
- result: `node_voltages`.

## Transient Analysis

Function:

```python
solve_transient(netlist: dict) -> dict
```

Transient analysis uses Backward Euler companion models.

Capacitor:

```text
G_eq = C / dt
I_hist = G_eq * V_prev
```

Inductor:

```text
G_eq = dt / L
i_L(n) = i_L(n-1) + (dt / L) * V_L(n)
```

The solver returns:

- `times` in milliseconds;
- `voltages` at the selected output node;
- `node_traces` for all non-ground nodes;
- transient metrics.

Automatic time-window behavior:

- if `analysis.t_end` is provided, it is used;
- if sine voltage sources exist, `t_end = periods / min(source_frequency)`;
- otherwise a simple RC fallback estimates `t_end = 5 * tau`.

## Voltage Source Waveforms

Voltage source behavior is centralized in:

```python
_source_value(comp: dict, t: float, analysis: dict | None = None) -> float
```

Supported waveforms:

### DC

```text
V(t) = dc
```

### Sine

```text
V(t) = offset + amplitude * sin(2*pi*frequency*t + phase)
```

`phase` is specified in degrees in the API and converted to radians internally.

### Step

```text
V(t) = step_initial, if t < step_time
V(t) = step_final,   if t >= step_time
```

### AC small-signal

In AC sweep, the MNA builder uses `ac_amplitude`. In transient mode, `signal:
"ac"` behaves like a DC source unless extended later.

## BJT NPN Model

Tier 1 implements a small-signal hybrid-pi approximation:

```text
gm = Ic_Q / 0.02585
rpi = beta / gm
ro = 100 kOhm
```

This is not a large-signal transistor model. It is useful for local linear
behavior around a chosen operating point.

## Frontend-Expanded Components

Some visible components do not exist as primitive backend solver components.
They are expanded by `CircuitCanvas.generateNetlist()`.

| Visible component | Solver expansion |
|---|---|
| Potentiometer | two resistors, A-W and W-B |
| SPST switch | resistor: `1e-3` ohm closed, `1e12` ohm open |
| LED | voltage source for `Vf` plus series resistor |

Important limitation: the LED model is a linear simplification. It does not
capture exponential diode behavior, reverse breakdown, or current-dependent
forward voltage.

## Output Node Selection

If `output_nodes` is provided and valid, the first node is used.

If no output node is provided, the solver uses a heuristic:

1. collect nodes connected to voltage sources;
2. choose the last non-source node alphabetically;
3. fallback to the first available node;
4. fallback to `gnd`.

The frontend usually sends an output node based on probe selection or a canvas
heuristic.

## Known Numerical Limits

- Uses dense matrix solve, not optimized sparse solving.
- No nonlinear Newton iteration.
- No adaptive time step.
- Backward Euler is stable but can be numerically damped.
- Floating nodes produce singular matrix errors.
- Inductor DC behavior uses a large conductance approximation.

## Recommended Solver Roadmap

1. Add automated solver tests for each component type and waveform.
2. Split MNA stamps into component-specific functions or classes.
3. Define a `SolverTier` interface:

```python
class SolverTier:
    name: str
    supported_components: set[str]
    supported_analyses: set[str]

    def can_solve(self, netlist: dict) -> bool: ...
    def solve(self, netlist: dict) -> dict: ...
```

4. Add a nonlinear Tier 2:
   - diode Shockley equation;
   - LED nonlinear model;
   - BJT large-signal model;
   - Newton-Raphson operating point;
   - transient nonlinear iteration.
5. Add optional ngspice/PySpice integration for reference comparisons.
6. Add batch simulation and optimization endpoints for AI agents.

