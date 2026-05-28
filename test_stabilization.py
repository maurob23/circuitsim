"""Regression checks for the first API/solver stabilization pass."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
from django.test import Client

from solver.router import route_simulation
from solver.registry import (
    COMPONENT_REGISTRY,
    passive_component_types,
    tier1_component_types,
)


django.setup()


assert "resistor" in COMPONENT_REGISTRY
assert "bjt_npn" in tier1_component_types()
assert passive_component_types() == frozenset({"resistor", "capacitor", "inductor"})
print("[OK] Component registry backend espone il contratto base")


def post_simulate(payload):
    return Client().post(
        "/api/simulate/",
        data=json.dumps(payload),
        content_type="application/json",
    )


dc_netlist = {
    "components": [
        {"id": "V1", "type": "voltage_source", "value": 5.0, "nodes": ["n1", "gnd"]},
        {"id": "R1", "type": "resistor", "value": 1000, "nodes": ["n1", "gnd"]},
    ],
    "analysis": {"type": "dc"},
    "output_nodes": ["n1"],
}

response = post_simulate(dc_netlist)
assert response.status_code == 200, response.content
body = response.json()
assert body["results"]["node_voltages"]["n1"] == 5.0
print("[OK] API DC espone node_voltages")


invalid_netlist = {
    "components": [
        {"id": "R1", "type": "resistor", "value": 0, "nodes": ["n1", "gnd"]},
    ],
    "analysis": {"type": "dc"},
    "output_nodes": ["n1"],
}

response = post_simulate(invalid_netlist)
assert response.status_code == 422, response.content
assert "resistor.value" in response.json()["error"]
print("[OK] API rifiuta valori fisicamente invalidi")


negative_source_netlist = {
    "components": [
        {"id": "V1", "type": "voltage_source", "value": -5.0, "nodes": ["n1", "gnd"]},
        {"id": "R1", "type": "resistor", "value": 1000, "nodes": ["n1", "gnd"]},
    ],
    "analysis": {"type": "dc"},
    "output_nodes": ["n1"],
}

response = post_simulate(negative_source_netlist)
assert response.status_code == 200, response.content
assert response.json()["results"]["node_voltages"]["n1"] == -5.0
print("[OK] API accetta sorgenti negative coerenti con la convenzione di segno")


bjt_netlist = {
    "components": [
        {"id": "V1", "type": "voltage_source", "value": 1.0, "nodes": ["vin", "gnd"]},
        {"id": "RB", "type": "resistor", "value": 1000, "nodes": ["vin", "base"]},
        {"id": "Q1", "type": "bjt_npn", "value": 100, "ic_q_ma": 1.0, "nodes": ["base", "collector", "gnd"]},
        {"id": "RC", "type": "resistor", "value": 4700, "nodes": ["collector", "gnd"]},
    ],
    "analysis": {"type": "ac", "start_freq": 10, "stop_freq": 1000, "points_per_decade": 10},
    "output_nodes": ["collector"],
}

result = route_simulation(bjt_netlist)
assert result["tier"] == 1
assert result["solver"] == "mna_python"
print("[OK] Router accetta bjt_npn small-signal in Tier 1")

print()
print("=== Stabilization checks passed ===")
