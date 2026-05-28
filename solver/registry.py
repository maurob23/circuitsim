"""Component and analysis registry shared by backend modules.

This is the first platform contract for simulation modules: API validation,
solver routing, and future solver tiers should derive supported capabilities
from this registry instead of keeping local lists in sync by hand.
"""

from __future__ import annotations

from dataclasses import dataclass


VALUE_POSITIVE = "positive"
VALUE_NUMERIC = "numeric"
VALUE_NONE = "none"


@dataclass(frozen=True)
class ComponentSpec:
    netlist_type: str
    terminal_count: int
    value_rule: str
    tier1_supported: bool
    passive: bool = False


SUPPORTED_ANALYSES = frozenset({"ac", "dc", "transient", "sinusoidal"})

COMPONENT_REGISTRY: dict[str, ComponentSpec] = {
    "resistor": ComponentSpec(
        netlist_type="resistor",
        terminal_count=2,
        value_rule=VALUE_POSITIVE,
        tier1_supported=True,
        passive=True,
    ),
    "capacitor": ComponentSpec(
        netlist_type="capacitor",
        terminal_count=2,
        value_rule=VALUE_POSITIVE,
        tier1_supported=True,
        passive=True,
    ),
    "inductor": ComponentSpec(
        netlist_type="inductor",
        terminal_count=2,
        value_rule=VALUE_POSITIVE,
        tier1_supported=True,
        passive=True,
    ),
    "voltage_source": ComponentSpec(
        netlist_type="voltage_source",
        terminal_count=2,
        value_rule=VALUE_NUMERIC,
        tier1_supported=True,
    ),
    "current_source": ComponentSpec(
        netlist_type="current_source",
        terminal_count=2,
        value_rule=VALUE_NUMERIC,
        tier1_supported=True,
    ),
    "bjt_npn": ComponentSpec(
        netlist_type="bjt_npn",
        terminal_count=3,
        value_rule=VALUE_POSITIVE,
        tier1_supported=True,
    ),
}

NONLINEAR_COMPONENT_TYPES = frozenset(
    {"diode", "bjt", "mosfet", "opamp", "mosfet_n", "mosfet_p"}
)


def supported_component_types() -> frozenset[str]:
    return frozenset(COMPONENT_REGISTRY)


def tier1_component_types() -> frozenset[str]:
    return frozenset(
        ctype for ctype, spec in COMPONENT_REGISTRY.items() if spec.tier1_supported
    )


def passive_component_types() -> frozenset[str]:
    return frozenset(ctype for ctype, spec in COMPONENT_REGISTRY.items() if spec.passive)
