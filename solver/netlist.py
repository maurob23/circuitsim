"""Internal netlist representation for solver-facing code."""

from __future__ import annotations

from dataclasses import dataclass, field
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
        raise NotImplementedError("MNA matrix assembly is implemented in solver/tier1/mna.py")
