"""
Solver router — selects the appropriate tier based on circuit complexity
and analysis type, then dispatches the simulation request.

Current tiers:
  Tier 1 — MNA Python (linear circuits, AC/DC/transient, ≤ 20 passives)
  Tier 2 — ngspice/PySpice  [not yet implemented]
  Tier 3 — LTSpice headless  [not yet implemented]
"""

from __future__ import annotations

from .registry import (
    NONLINEAR_COMPONENT_TYPES,
    SUPPORTED_ANALYSES,
    passive_component_types,
    tier1_component_types,
)
from .tier1 import mna as tier1

_TIER1_TYPES = tier1_component_types()
_PASSIVE_TYPES = passive_component_types()

_TIER1_MAX_PASSIVES = 50


def route_simulation(netlist: dict) -> dict:
    """
    Analyse the netlist and dispatch to the appropriate solver tier.
    Returns a dict with tier, solver, and analysis results.
    """
    components = netlist["components"]
    analysis_type = netlist["analysis"]["type"]

    comp_types = {c["type"] for c in components}
    n_passives = sum(1 for c in components if c["type"] in _PASSIVE_TYPES)
    has_nonlinear = bool(comp_types & NONLINEAR_COMPONENT_TYPES)

    # --- Tier 1: pure Python MNA for linear circuits ---
    if (
        not has_nonlinear
        and n_passives <= _TIER1_MAX_PASSIVES
        and analysis_type in SUPPORTED_ANALYSES
        and comp_types <= _TIER1_TYPES
    ):
        return _run_tier1(netlist, analysis_type)

    # --- Tier 2 / 3: not yet available ---
    if has_nonlinear:
        raise ValueError(
            "Circuito non lineare rilevato (diodi/transistor). "
            "Tier 2 (ngspice) non ancora implementato."
        )

    raise ValueError(
        f"Nessun solver disponibile per questo circuito "
        f"(tipo analisi='{analysis_type}', componenti non lineari={has_nonlinear})."
    )


def _run_tier1(netlist: dict, analysis_type: str) -> dict:
    if analysis_type == "ac":
        result = tier1.solve_ac(netlist)
    elif analysis_type == "transient":
        result = tier1.solve_transient(netlist)
    elif analysis_type == "sinusoidal":
        result = tier1.solve_sinusoidal(netlist)
    elif analysis_type == "dc":
        result = tier1.solve_dc(netlist)
    else:
        raise ValueError(f"Tipo di analisi non supportato: '{analysis_type}'")

    result["tier"] = 1
    result["solver"] = "mna_python"
    result.setdefault("convergence", True)
    return result
