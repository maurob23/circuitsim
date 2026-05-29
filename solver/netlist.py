"""Internal netlist representation for solver-facing code."""

from __future__ import annotations

from dataclasses import dataclass, field
import math
from typing import Any


@dataclass(frozen=True)
class NetlistComponent:
    id: str
    type: str
    value: float | int | None
    nodes: tuple[str, ...]
    attrs: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class NetlistModel:
    components: tuple[NetlistComponent, ...]
    analysis: dict[str, Any]
    output_nodes: tuple[str, ...]

    @classmethod
    def from_json(cls, data: dict) -> "NetlistModel":
        components = []
        for component in data.get("components", []):
            known = {"id", "type", "value", "nodes"}
            components.append(
                NetlistComponent(
                    id=str(component.get("id", "")),
                    type=str(component.get("type", "")),
                    value=component.get("value"),
                    nodes=tuple(component.get("nodes", ())),
                    attrs={key: value for key, value in component.items() if key not in known},
                )
            )

        return cls(
            components=tuple(components),
            analysis=dict(data.get("analysis", {})),
            output_nodes=tuple(data.get("output_nodes", ())),
        )

    def get_nodes(self) -> list[str]:
        nodes = []
        seen = set()
        for component in self.components:
            for node in component.nodes:
                if node not in seen:
                    seen.add(node)
                    nodes.append(node)
        return nodes

    def get_components_by_type(self, type: str) -> list[NetlistComponent]:
        return [component for component in self.components if component.type == type]

    def to_mna_matrices(self) -> tuple:
        """
        Assemble Tier-1 MNA matrices from the immutable netlist model.

        Returns:
            tuple[np.ndarray, np.ndarray, dict[str, int], list[dict], list[str]]
            -> (A, b, node_idx, vsources, node_list)
        """
        from .tier1 import mna as tier1_mna

        analysis_type = str(self.analysis.get("type", "dc")).lower()
        omega = 0.0
        if analysis_type == "ac":
            start_freq = float(self.analysis.get("start_freq", 0.0) or 0.0)
            omega = 2.0 * math.pi * start_freq if start_freq > 0 else 0.0

        netlist_dict = {
            "components": [
                {
                    "id": component.id,
                    "type": component.type,
                    "value": component.value,
                    "nodes": list(component.nodes),
                    **component.attrs,
                }
                for component in self.components
            ],
            "analysis": dict(self.analysis),
            "output_nodes": list(self.output_nodes),
        }
        return tier1_mna.build_mna_matrices(netlist_dict, omega=omega)
