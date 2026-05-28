"""Validation helpers for the simulation API contract."""

from __future__ import annotations

from numbers import Real

from solver.registry import (
    COMPONENT_REGISTRY,
    SUPPORTED_ANALYSES,
    VALUE_NUMERIC,
    VALUE_POSITIVE,
)


def validate_netlist(netlist: dict) -> None:
    """Raise ValueError if a simulation netlist violates the API contract."""
    if not isinstance(netlist, dict):
        raise ValueError("Netlist must be a JSON object")

    components = netlist.get("components")
    analysis = netlist.get("analysis")
    if not isinstance(components, list) or not components:
        raise ValueError("Netlist must contain a non-empty 'components' list")
    if not isinstance(analysis, dict):
        raise ValueError("Netlist must contain an 'analysis' object")

    _validate_analysis(analysis)
    for index, component in enumerate(components):
        _validate_component(component, index)


def _validate_analysis(analysis: dict) -> None:
    analysis_type = analysis.get("type")
    if analysis_type not in SUPPORTED_ANALYSES:
        raise ValueError(f"Unsupported analysis type: {analysis_type!r}")

    if analysis_type == "ac":
        start = _positive_number(analysis.get("start_freq", 10), "start_freq")
        stop = _positive_number(analysis.get("stop_freq", 100_000), "stop_freq")
        if stop <= start:
            raise ValueError("AC analysis requires stop_freq > start_freq")
        ppd = _positive_int(analysis.get("points_per_decade", 100), "points_per_decade")
        if ppd < 1:
            raise ValueError("points_per_decade must be >= 1")

    elif analysis_type == "transient":
        points = _positive_int(analysis.get("points", 500), "points")
        if points < 2:
            raise ValueError("Transient analysis requires at least 2 points")
        t_end = analysis.get("t_end", 0)
        if not isinstance(t_end, Real):
            raise ValueError("t_end must be numeric")
        if float(t_end) < 0:
            raise ValueError("t_end must be >= 0")

    elif analysis_type == "sinusoidal":
        _positive_number(analysis.get("frequency", 1000.0), "frequency")
        _positive_number(analysis.get("amplitude", 1.0), "amplitude")
        _positive_number(analysis.get("periods", 6.0), "periods")
        ppc = _positive_int(analysis.get("points_per_cycle", 60), "points_per_cycle")
        if ppc < 2:
            raise ValueError("points_per_cycle must be >= 2")


def _validate_component(component: dict, index: int) -> None:
    if not isinstance(component, dict):
        raise ValueError(f"Component #{index + 1} must be an object")

    ctype = component.get("type")
    spec = COMPONENT_REGISTRY.get(ctype)
    if spec is None:
        raise ValueError(f"Unsupported component type at #{index + 1}: {ctype!r}")

    nodes = component.get("nodes")
    if not isinstance(nodes, list) or len(nodes) != spec.terminal_count:
        raise ValueError(
            f"{ctype} components must define exactly {spec.terminal_count} nodes"
        )
    if not all(isinstance(node, str) and node for node in nodes):
        raise ValueError(f"Component #{index + 1} contains an invalid node name")

    if spec.value_rule == VALUE_POSITIVE:
        value = component.get("value")
        _positive_number(value, f"{ctype}.value")
    elif spec.value_rule == VALUE_NUMERIC:
        _number(component.get("value"), f"{ctype}.value")

    if ctype == "bjt_npn":
        _positive_number(component.get("ic_q_ma", 1.0), "bjt_npn.ic_q_ma")
    elif ctype == "voltage_source":
        _validate_voltage_source(component)


def _validate_voltage_source(component: dict) -> None:
    signal = component.get("signal", "dc")
    if signal not in {"dc", "sine", "step", "ac"}:
        raise ValueError(f"voltage_source.signal is not supported: {signal!r}")

    _optional_number(component, "dc")
    _optional_number(component, "offset")
    _optional_number(component, "phase")
    _optional_number(component, "step_initial")
    _optional_number(component, "step_final")

    amplitude = _optional_number(component, "amplitude")
    if amplitude is not None and amplitude < 0:
        raise ValueError("voltage_source.amplitude must be >= 0")

    ac_amplitude = _optional_number(component, "ac_amplitude")
    if ac_amplitude is not None and ac_amplitude < 0:
        raise ValueError("voltage_source.ac_amplitude must be >= 0")

    frequency = _optional_number(component, "frequency")
    if frequency is not None and frequency <= 0:
        raise ValueError("voltage_source.frequency must be > 0")

    step_time = _optional_number(component, "step_time")
    if step_time is not None and step_time < 0:
        raise ValueError("voltage_source.step_time must be >= 0")


def _optional_number(component: dict, field: str) -> float | None:
    if field not in component:
        return None
    return _number(component.get(field), f"voltage_source.{field}")


def _number(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} must be numeric")
    return float(value)


def _positive_number(value, name: str) -> float:
    value = _number(value, name)
    if value <= 0:
        raise ValueError(f"{name} must be > 0")
    return value


def _positive_int(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    if value <= 0:
        raise ValueError(f"{name} must be > 0")
    return value
