"""
Modified Nodal Analysis (MNA) solver — Tier 1.

Supports linear circuits with resistors, capacitors, inductors and
independent voltage/current sources for AC, DC, and transient analysis.

MNA formulation:
  [G  B] [v]   [i]
  [C  D] [j] = [e]

where v = node voltages, j = branch currents through voltage sources,
i = known current injections, e = voltage source values.
"""

from __future__ import annotations

import numpy as np

# Nodes treated as ground reference
_GND = frozenset({"gnd", "0", "GND"})


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def solve_ac(netlist: dict) -> dict:
    """AC sweep: returns frequency, magnitude (dB), phase (°) arrays."""
    analysis = netlist["analysis"]
    start = float(analysis.get("start_freq", 10))
    stop = float(analysis.get("stop_freq", 100_000))
    ppd = int(analysis.get("points_per_decade", 100))
    decades = np.log10(stop / start)
    n_pts = max(2, int(decades * ppd))
    frequencies = np.logspace(np.log10(start), np.log10(stop), n_pts)

    node_list, node_idx, vsources = _build_topology(netlist["components"])
    n_nodes = len(node_list)
    n_src = len(vsources)
    size = n_nodes + n_src

    output_node = _resolve_output_node(netlist, node_idx)
    v_in_mag = _source_amplitude(vsources)

    mag_db: list[float] = []
    phase_deg: list[float] = []

    for freq in frequencies:
        omega = 2.0 * np.pi * freq
        A, b = _build_mna(
            netlist["components"], node_idx, vsources, n_nodes, size, omega
        )
        try:
            v = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            mag_db.append(float("nan"))
            phase_deg.append(float("nan"))
            continue

        v_out = _node_voltage(v, output_node, node_idx)
        H = v_out / v_in_mag if v_in_mag != 0 else 0.0
        mag = abs(H)
        mag_db.append(20.0 * np.log10(mag) if mag > 1e-30 else -300.0)
        phase_deg.append(float(np.angle(H, deg=True)))

    metrics = _compute_metrics(frequencies, mag_db, phase_deg)

    return {
        "frequencies": frequencies.tolist(),
        "magnitude_db": mag_db,
        "phase_deg": phase_deg,
        "metrics": metrics,
    }


def solve_transient(netlist: dict) -> dict:
    """
    Transient analysis (step response) using Backward Euler companion models.

    For simple RC circuits this matches the analytical solution V(t) = V∞(1 - e^{-t/τ}).
    The numerical approach generalises to any linear circuit topology.
    """
    analysis = netlist["analysis"]
    t_end = float(analysis.get("t_end", 0))
    n_pts = int(analysis.get("points", 500))

    # Auto-set t_end to 5τ if not specified
    if t_end <= 0:
        sine_freqs = [
            float(c.get("frequency", 0))
            for c in netlist["components"]
            if c.get("type") == "voltage_source"
            and c.get("signal") == "sine"
            and float(c.get("frequency", 0)) > 0
        ]
        if sine_freqs:
            t_end = float(analysis.get("periods", 6.0)) / min(sine_freqs)
        else:
            R = next(
                (c["value"] for c in netlist["components"] if c["type"] == "resistor"), None
            )
            C = next(
                (c["value"] for c in netlist["components"] if c["type"] == "capacitor"), None
            )
            tau = (R * C) if (R and C) else 1e-3
            t_end = 5.0 * tau

    times = np.linspace(0, t_end, n_pts)
    dt = times[1] - times[0]

    node_list, node_idx, vsources = _build_topology(netlist["components"])
    n_nodes = len(node_list)
    n_src = len(vsources)
    size = n_nodes + n_src

    output_node = _resolve_output_node(netlist, node_idx)
    v_in_mag = _source_amplitude(vsources)

    v_prev    = np.zeros(n_nodes, dtype=float)
    # Corrente storica degli induttori (Backward Euler companion)
    ind_curr: dict[str, float] = {
        c.get("id", f"_ind_{id(c)}"): 0.0
        for c in netlist["components"]
        if c["type"] == "inductor"
    }
    voltages: list[float] = []
    node_traces: dict[str, list[float]] = {n: [] for n in node_list}

    for t in times:
        A, b = _build_mna_transient(
            netlist["components"],
            node_idx,
            vsources,
            n_nodes,
            size,
            dt,
            float(t),
            v_prev,
            ind_curr,
        )
        try:
            v = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            voltages.append(float("nan"))
            for n in node_list:
                node_traces[n].append(float("nan"))
            continue

        v_out = _node_voltage(v, output_node, node_idx)
        voltages.append(float(v_out.real))
        for n, idx in node_idx.items():
            node_traces[n].append(float(v[idx].real))
        v_prev = np.real(v[:n_nodes])
        # Aggiorna corrente induttori: i_L(n) = G_eq*V_L(n) + i_L(n-1)
        for comp in netlist["components"]:
            if comp["type"] == "inductor":
                cid = comp.get("id", f"_ind_{id(comp)}")
                pi = node_idx.get(comp["nodes"][0]) if comp["nodes"][0] not in _GND else None
                ni = node_idx.get(comp["nodes"][1]) if comp["nodes"][1] not in _GND else None
                vL = (float(v[pi].real) if pi is not None else 0.0) \
                   - (float(v[ni].real) if ni is not None else 0.0)
                ind_curr[cid] += (dt / comp["value"]) * vL

    tau = t_end / 5.0
    metrics = {
        "time_constant_ms": round(tau * 1000, 4),
        "final_voltage_v":  round(float(v_in_mag), 4),
        "t_end_ms":         round(t_end * 1000, 4),
    }

    return {
        "times":       (times * 1000).tolist(),
        "voltages":    voltages,
        "node_traces": node_traces,
        "metrics":     metrics,
    }


def solve_sinusoidal(netlist: dict) -> dict:
    """
    Analisi sinusoidale nel dominio del tempo.

    Applica Vin(t) = A·sin(2πf·t) e simula la risposta completa (transitorio +
    regime permanente) usando il modello companion Backward Euler per i condensatori.

    L'uscita mostra:
      • vin   — segnale di ingresso campionato
      • vout  — risposta del circuito (transitorio + regime)

    I parametri di analisi nel netlist JSON:
      analysis.frequency        — frequenza Hz (default 1000)
      analysis.amplitude        — ampiezza picco V (default 1.0)
      analysis.periods          — numero di periodi da simulare (default 6)
      analysis.points_per_cycle — campioni per periodo (default 60)
    """
    analysis  = netlist["analysis"]
    freq      = float(analysis.get("frequency", 1000.0))
    amplitude = float(analysis.get("amplitude", 1.0))
    n_periods = float(analysis.get("periods", 6.0))
    ppc       = int(analysis.get("points_per_cycle", 60))

    T     = 1.0 / freq
    t_end = n_periods * T
    n_pts = max(120, int(n_periods * ppc))

    times = np.linspace(0.0, t_end, n_pts)
    dt    = times[1] - times[0]

    node_list, node_idx, vsources = _build_topology(netlist["components"])
    n_nodes = len(node_list)
    n_src   = len(vsources)
    size    = n_nodes + n_src

    output_node = _resolve_output_node(netlist, node_idx)
    v_prev   = np.zeros(n_nodes, dtype=float)
    ind_curr = {c.get("id", f"_ind_{id(c)}"): 0.0
                for c in netlist["components"] if c["type"] == "inductor"}

    vin_vals:  list[float] = []
    vout_vals: list[float] = []
    node_traces: dict[str, list[float]] = {n: [] for n in node_list}

    primary = vsources[0] if vsources else {}
    for t in times:
        v_now = _source_value(primary, float(t), analysis)
        A, b  = _build_mna_sine(
            netlist["components"], node_idx, vsources,
            n_nodes, size, dt, v_prev, float(t), analysis, ind_curr,
        )
        try:
            v = np.linalg.solve(A, b)
        except np.linalg.LinAlgError:
            vin_vals.append(float(v_now))
            vout_vals.append(float("nan"))
            for n in node_list:
                node_traces[n].append(float("nan"))
            continue

        v_out = _node_voltage(v, output_node, node_idx)
        vin_vals.append(float(v_now))
        vout_vals.append(float(v_out.real))
        for n, idx in node_idx.items():
            node_traces[n].append(float(v[idx].real))
        v_prev = np.real(v[:n_nodes])
        for comp in netlist["components"]:
            if comp["type"] == "inductor":
                pi = node_idx.get(comp["nodes"][0]) if comp["nodes"][0] not in _GND else None
                ni = node_idx.get(comp["nodes"][1]) if comp["nodes"][1] not in _GND else None
                vL = (float(v[pi].real) if pi is not None else 0.0) \
                   - (float(v[ni].real) if ni is not None else 0.0)
                ind_curr[comp.get("id", f"_ind_{id(comp)}")] += (dt / comp["value"]) * vL

    metrics = _compute_sine_metrics(times, vin_vals, vout_vals, freq, amplitude)

    return {
        "times":        (times * 1000).tolist(),   # in ms
        "vin":          vin_vals,
        "vout":         vout_vals,
        "node_traces":  node_traces,               # tutti i nodi (per oscilloscopio)
        "metrics":      metrics,
    }


def _build_mna_sine(
    components: list[dict],
    node_idx: dict,
    vsources: list[dict],
    n_nodes: int,
    size: int,
    dt: float,
    v_prev: np.ndarray,
    t: float,
    analysis: dict,
    ind_curr: dict[str, float] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """MNA Backward Euler con sorgente di tensione sinusoidale al passo t."""
    if ind_curr is None:
        ind_curr = {}
    A = np.zeros((size, size), dtype=float)
    b = np.zeros(size, dtype=float)

    for comp in components:
        ctype  = comp["type"]
        cnodes = comp["nodes"]

        if ctype == "resistor":
            _stamp_admittance(A, 1.0 / comp["value"], cnodes, node_idx)

        elif ctype == "capacitor":
            G_eq   = comp["value"] / dt
            _stamp_admittance(A, G_eq, cnodes, node_idx)
            p_node, n_node = cnodes[0], cnodes[1]
            pi = node_idx.get(p_node) if p_node not in _GND else None
            ni = node_idx.get(n_node) if n_node not in _GND else None
            v_cap = (v_prev[pi] if pi is not None else 0.0) \
                  - (v_prev[ni] if ni is not None else 0.0)
            i_hist = G_eq * v_cap
            if pi is not None: b[pi] += i_hist
            if ni is not None: b[ni] -= i_hist

        elif ctype == "inductor":
            G_eq   = dt / comp["value"]
            cid    = comp.get("id", f"_ind_{id(comp)}")
            i_hist = ind_curr.get(cid, 0.0)
            _stamp_admittance(A, G_eq, cnodes, node_idx)
            p_node, n_node = cnodes[0], cnodes[1]
            pi = node_idx.get(p_node) if p_node not in _GND else None
            ni = node_idx.get(n_node) if n_node not in _GND else None
            # Norton I_hist flows p->n (same dir as i_L)
            if pi is not None: b[pi] -= i_hist
            if ni is not None: b[ni] += i_hist

        elif ctype == "voltage_source":
            k       = vsources.index(comp)
            src_row = n_nodes + k
            p_node, n_node = cnodes[0], cnodes[1]
            if p_node not in _GND:
                pi = node_idx[p_node]
                A[pi][src_row] += 1.0
                A[src_row][pi] += 1.0
            if n_node not in _GND:
                ni = node_idx[n_node]
                A[ni][src_row] -= 1.0
                A[src_row][ni] -= 1.0
            b[src_row] = _source_value(comp, t, analysis)

        elif ctype == "bjt_npn":
            beta = float(comp.get("value", 100) or 100)
            ic_q = float(comp.get("ic_q_ma", 1.0)) * 1e-3
            gm   = ic_q / 0.02585
            rpi  = beta / gm
            ro   = 100e3
            _stamp_bjt_npn(A, cnodes, node_idx, float(gm), float(rpi), float(ro))

    return A, b


def _compute_sine_metrics(
    times: np.ndarray,
    vin_vals: list[float],
    vout_vals: list[float],
    freq: float,
    amplitude: float,
) -> dict:
    """
    Guadagno e sfasamento dalla parte in regime (ultimi 2 periodi).
    Usa la proiezione DFT alla frequenza di eccitazione.
    """
    T        = 1.0 / freq
    t_end    = times[-1]
    ss_start = max(0.0, t_end - 2.0 * T)
    idx_ss   = int(np.searchsorted(times, ss_start))

    if len(times) - idx_ss < 8:
        return {}

    vout_ss = np.array(vout_vals[idx_ss:], dtype=float)
    vin_ss  = np.array(vin_vals[idx_ss:],  dtype=float)
    dt_arr  = times[1] - times[0]
    N       = len(vout_ss)
    t_local = np.arange(N, dtype=float) * dt_arr

    # Proiezione sul fasore alla frequenza di eccitazione
    e      = np.exp(-1j * 2.0 * np.pi * freq * t_local)
    Vout_c = (2.0 / N) * np.dot(vout_ss, e)
    Vin_c  = (2.0 / N) * np.dot(vin_ss,  e)

    H = (Vout_c / Vin_c) if abs(Vin_c) > 1e-20 else 0.0

    gain_db   = float(20.0 * np.log10(abs(H))) if abs(H) > 1e-30 else -300.0
    phase_deg = float(np.angle(H, deg=True))

    return {
        "frequency_hz":  round(freq, 1),
        "gain_db":       round(gain_db, 2),
        "gain_ratio":    round(float(abs(H)), 4),
        "phase_deg":     round(phase_deg, 2),
        "vout_peak_v":   round(float(np.max(np.abs(vout_ss))), 4),
        "vin_peak_v":    round(float(amplitude), 4),
    }


def solve_dc(netlist: dict) -> dict:
    """DC operating point: capacitors → open circuit, inductors → short circuit."""
    node_list, node_idx, vsources = _build_topology(netlist["components"])
    n_nodes = len(node_list)
    n_src = len(vsources)
    size = n_nodes + n_src

    A, b = _build_mna(
        netlist["components"], node_idx, vsources, n_nodes, size, omega=0.0
    )
    try:
        v = np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        return {"error": "Singular matrix — check for floating nodes", "metrics": {}}

    node_voltages = {
        node: round(float(v[i].real), 6) for node, i in node_idx.items()
    }
    node_voltages["gnd"] = 0.0

    return {
        "node_voltages": node_voltages,
        "metrics": {},
    }


# ---------------------------------------------------------------------------
# MNA matrix builders
# ---------------------------------------------------------------------------

def _build_topology(components: list[dict]):
    """Enumerate non-ground nodes and voltage sources."""
    nodes: set[str] = set()
    vsources: list[dict] = []

    for comp in components:
        for node in comp["nodes"]:
            if node not in _GND:
                nodes.add(node)
        if comp["type"] == "voltage_source":
            vsources.append(comp)

    node_list = sorted(nodes)
    node_idx = {n: i for i, n in enumerate(node_list)}
    return node_list, node_idx, vsources


def _build_mna(
    components: list[dict],
    node_idx: dict,
    vsources: list[dict],
    n_nodes: int,
    size: int,
    omega: float,
) -> tuple[np.ndarray, np.ndarray]:
    A = np.zeros((size, size), dtype=complex)
    b = np.zeros(size, dtype=complex)

    for comp in components:
        ctype = comp["type"]
        cnodes = comp["nodes"]

        if ctype == "resistor":
            Y = 1.0 / comp["value"]
            _stamp_admittance(A, Y, cnodes, node_idx)

        elif ctype == "capacitor":
            # Open circuit at DC (omega == 0)
            Y = 1j * omega * comp["value"] if omega != 0 else 0.0
            _stamp_admittance(A, Y, cnodes, node_idx)

        elif ctype == "inductor":
            # Short circuit at DC → large conductance approximation
            if omega == 0:
                Y = 1e12
            else:
                Y = 1.0 / (1j * omega * comp["value"])
            _stamp_admittance(A, Y, cnodes, node_idx)

        elif ctype == "voltage_source":
            k = vsources.index(comp)
            src_row = n_nodes + k
            p_node, n_node = cnodes[0], cnodes[1]

            if p_node not in _GND:
                pi = node_idx[p_node]
                A[pi][src_row] += 1.0
                A[src_row][pi] += 1.0

            if n_node not in _GND:
                ni = node_idx[n_node]
                A[ni][src_row] -= 1.0
                A[src_row][ni] -= 1.0

            amplitude = float(
                comp.get(
                    "ac_amplitude" if omega != 0 else "dc",
                    comp.get("amplitude", comp.get("value", 1.0)),
                )
            )
            b[src_row] = amplitude

        elif ctype == "current_source":
            amplitude = float(comp.get("amplitude", comp.get("value", 0.0)))
            p_node, n_node = cnodes[0], cnodes[1]
            if p_node not in _GND:
                b[node_idx[p_node]] += amplitude
            if n_node not in _GND:
                b[node_idx[n_node]] -= amplitude

        elif ctype == "bjt_npn":
            beta    = float(comp.get("value", 100) or 100)
            ic_q    = float(comp.get("ic_q_ma", 1.0)) * 1e-3   # A
            gm      = ic_q / 0.02585                            # VT = 26 mV
            rpi     = beta / gm
            ro      = 100e3                                      # Early V ~ 100 V @ 1 mA
            _stamp_bjt_npn(A, cnodes, node_idx, float(gm), float(rpi), float(ro))

    return A, b


def _build_mna_transient(
    components: list[dict],
    node_idx: dict,
    vsources: list[dict],
    n_nodes: int,
    size: int,
    dt: float,
    t: float,
    v_prev: np.ndarray,
    ind_curr: dict[str, float] | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Backward Euler companion model for transient analysis.
    Capacitor  → G_eq = C/dt  parallel I_hist = C/dt * V_prev
    Inductor   → G_eq = dt/L  parallel I_hist = i_L(prev)
    """
    if ind_curr is None:
        ind_curr = {}
    A = np.zeros((size, size), dtype=float)
    b = np.zeros(size, dtype=float)

    for comp in components:
        ctype = comp["type"]
        cnodes = comp["nodes"]

        if ctype == "resistor":
            Y = 1.0 / comp["value"]
            _stamp_admittance(A, Y, cnodes, node_idx)

        elif ctype == "capacitor":
            G_eq = comp["value"] / dt
            _stamp_admittance(A, G_eq, cnodes, node_idx)
            p_node, n_node = cnodes[0], cnodes[1]
            pi = node_idx.get(p_node) if p_node not in _GND else None
            ni = node_idx.get(n_node) if n_node not in _GND else None
            v_cap_prev = (v_prev[pi] if pi is not None else 0.0) \
                       - (v_prev[ni] if ni is not None else 0.0)
            i_hist = G_eq * v_cap_prev
            if pi is not None: b[pi] += i_hist
            if ni is not None: b[ni] -= i_hist

        elif ctype == "inductor":
            G_eq   = dt / comp["value"]
            i_hist = ind_curr.get(comp.get("id", f"_ind_{id(comp)}"), 0.0)
            _stamp_admittance(A, G_eq, cnodes, node_idx)
            p_node, n_node = cnodes[0], cnodes[1]
            pi = node_idx.get(p_node) if p_node not in _GND else None
            ni = node_idx.get(n_node) if n_node not in _GND else None
            # Norton I_hist flows p->n (same dir as i_L)
            if pi is not None: b[pi] -= i_hist
            if ni is not None: b[ni] += i_hist

        elif ctype == "voltage_source":
            k = vsources.index(comp)
            src_row = n_nodes + k
            p_node, n_node = cnodes[0], cnodes[1]
            if p_node not in _GND:
                pi = node_idx[p_node]
                A[pi][src_row] += 1.0
                A[src_row][pi] += 1.0
            if n_node not in _GND:
                ni = node_idx[n_node]
                A[ni][src_row] -= 1.0
                A[src_row][ni] -= 1.0
            b[src_row] = _source_value(comp, t, {})

        elif ctype == "bjt_npn":
            beta = float(comp.get("value", 100) or 100)
            ic_q = float(comp.get("ic_q_ma", 1.0)) * 1e-3
            gm   = ic_q / 0.02585
            rpi  = beta / gm
            ro   = 100e3
            _stamp_bjt_npn(A, cnodes, node_idx, float(gm), float(rpi), float(ro))

    return A, b


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _stamp_admittance(A: np.ndarray, Y, cnodes: list[str], node_idx: dict) -> None:
    """Stamp admittance Y between two nodes into the MNA conductance matrix."""
    p_node, n_node = cnodes[0], cnodes[1]
    pi = node_idx.get(p_node) if p_node not in _GND else None
    ni = node_idx.get(n_node) if n_node not in _GND else None

    if pi is not None:
        A[pi][pi] += Y
    if ni is not None:
        A[ni][ni] += Y
    if pi is not None and ni is not None:
        A[pi][ni] -= Y
        A[ni][pi] -= Y


def _stamp_bjt_npn(A: np.ndarray, cnodes: list[str], node_idx: dict,
                   gm: float, rpi: float, ro: float) -> None:
    """
    Stamp BJT NPN hybrid-π small-signal model.

    Terminal order in cnodes: [base, collector, emitter]

    Model elements:
      rπ  — resistenza base-emettitore  (B↔E)
      ro  — resistenza uscita collector-emettitore  (C↔E)
      VCCS — gm·Vbe corrente da C verso E  (asimmetrica)
    """
    nb = node_idx.get(cnodes[0]) if cnodes[0] not in _GND else None   # base
    nc = node_idx.get(cnodes[1]) if cnodes[1] not in _GND else None   # collector
    ne = node_idx.get(cnodes[2]) if cnodes[2] not in _GND else None   # emitter

    # rπ  (B-E)
    for r, c, val in [
        (nb, nb, +1/rpi), (ne, ne, +1/rpi),
        (nb, ne, -1/rpi), (ne, nb, -1/rpi),
    ]:
        if r is not None and c is not None:
            A[r, c] += val

    # ro  (C-E)
    for r, c, val in [
        (nc, nc, +1/ro), (ne, ne, +1/ro),
        (nc, ne, -1/ro), (ne, nc, -1/ro),
    ]:
        if r is not None and c is not None:
            A[r, c] += val

    # VCCS  gm·Vbe  →  corrente entra in C, esce da E
    # ic = gm*(vb - ve);  KCL C: +ic;  KCL E: -ic
    for r, c, val in [
        (nc, nb, +gm), (nc, ne, -gm),
        (ne, nb, -gm), (ne, ne, +gm),
    ]:
        if r is not None and c is not None:
            A[r, c] += val


def _resolve_output_node(netlist: dict, node_idx: dict) -> str:
    """Pick the output node: explicit request first, then heuristic."""
    out_nodes = netlist.get("output_nodes", [])
    if out_nodes and out_nodes[0] not in _GND and out_nodes[0] in node_idx:
        return out_nodes[0]
    # Heuristic: last node alphabetically that is not connected to a vsource
    vsource_nodes = {
        node
        for c in netlist["components"]
        if c["type"] == "voltage_source"
        for node in c["nodes"]
        if node not in _GND
    }
    for node in sorted(node_idx.keys(), reverse=True):
        if node not in vsource_nodes:
            return node
    return next(iter(node_idx)) if node_idx else "gnd"


def _node_voltage(v: np.ndarray, node: str, node_idx: dict) -> complex:
    if node in _GND:
        return 0.0 + 0j
    idx = node_idx.get(node)
    return complex(v[idx]) if idx is not None else 0.0 + 0j


def _source_amplitude(vsources: list[dict]) -> float:
    if not vsources:
        return 1.0
    return float(
        vsources[0].get(
            "ac_amplitude",
            vsources[0].get("amplitude", vsources[0].get("value", 1.0)),
        )
    )


def _source_value(comp: dict, t: float, analysis: dict | None = None) -> float:
    analysis = analysis or {}
    signal = comp.get("signal", "dc")

    if signal == "sine":
        amp = float(comp.get("amplitude", analysis.get("amplitude", comp.get("value", 1.0))))
        freq = float(comp.get("frequency", analysis.get("frequency", 1000.0)))
        offset = float(comp.get("offset", 0.0))
        phase = np.deg2rad(float(comp.get("phase", 0.0)))
        return offset + amp * np.sin(2.0 * np.pi * freq * t + phase)

    if signal == "step":
        t_step = float(comp.get("step_time", 0.0))
        return float(comp.get("step_final", comp.get("value", 1.0))) if t >= t_step else float(comp.get("step_initial", 0.0))

    return float(comp.get("dc", comp.get("value", 0.0)))


# ---------------------------------------------------------------------------
# Metrics extraction
# ---------------------------------------------------------------------------

def _compute_metrics(
    frequencies: np.ndarray,
    mag_db: list[float],
    phase_deg: list[float],
) -> dict:
    freqs = np.asarray(frequencies)
    mags = np.asarray(mag_db, dtype=float)
    phases = np.asarray(phase_deg, dtype=float)

    valid = np.isfinite(mags)
    if not valid.any():
        return {}

    fv = freqs[valid]
    mv = mags[valid]
    pv = phases[valid]

    dc_gain = float(mv[0])
    metrics: dict = {"dc_gain_db": round(dc_gain, 3)}

    # -3 dB cutoff
    target = dc_gain - 3.0103  # exactly -3 dB
    fc_hz = None
    phase_at_fc = None

    for i in range(len(mv) - 1):
        if (mv[i] - target) * (mv[i + 1] - target) <= 0:
            t = (target - mv[i]) / (mv[i + 1] - mv[i] + 1e-300)
            t = max(0.0, min(1.0, t))
            log_fc = np.log10(fv[i]) + t * (np.log10(fv[i + 1]) - np.log10(fv[i]))
            fc_hz = float(10**log_fc)
            phase_at_fc = float(pv[i] + t * (pv[i + 1] - pv[i]))
            break

    if fc_hz is not None:
        metrics["cutoff_frequency_hz"] = round(fc_hz, 1)
        metrics["gain_at_cutoff_db"] = round(target, 3)
        metrics["phase_at_cutoff_deg"] = round(phase_at_fc, 2)
        metrics["time_constant_ms"] = round(1000.0 / (2.0 * np.pi * fc_hz), 4)

    # Roll-off estimate (dB/decade) measured one decade above fc
    if fc_hz is not None:
        target_f = fc_hz * 10
        if target_f <= fv[-1]:
            idx_fc = np.searchsorted(fv, fc_hz)
            idx_hi = np.searchsorted(fv, target_f)
            if idx_hi < len(mv):
                rolloff = mv[idx_hi] - mv[idx_fc]
                metrics["rolloff_db_per_decade"] = round(float(rolloff), 1)

    return metrics
