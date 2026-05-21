"""Quick validation of the MNA solver against the known RC filter fc=338.6 Hz."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from solver.tier1.mna import solve_ac

netlist = {
    "components": [
        {"id": "V1", "type": "voltage_source", "value": 1, "nodes": ["n1", "gnd"]},
        {"id": "R1", "type": "resistor",        "value": 10_000, "nodes": ["n1", "n2"]},
        {"id": "C1", "type": "capacitor",       "value": 47e-9,  "nodes": ["n2", "gnd"]},
    ],
    "analysis": {
        "type": "ac",
        "start_freq": 10,
        "stop_freq": 100_000,
        "points_per_decade": 100,
    },
    "output_nodes": ["n2"],
}

result = solve_ac(netlist)
m = result["metrics"]

print("=== MNA solver validation: RC low-pass fc=338 Hz ===")
print(f"  fc   = {m.get('cutoff_frequency_hz', 'n/a')} Hz    (expected 338.6)")
print(f"  tau  = {m.get('time_constant_ms', 'n/a')} ms   (expected 0.4700)")
print(f"  phi  = {m.get('phase_at_cutoff_deg', 'n/a')} deg  (expected -45.0)")
print(f"  DC   = {m.get('dc_gain_db', 'n/a')} dB  (expected 0.0)")
print(f"  dB/d = {m.get('rolloff_db_per_decade', 'n/a')} dB/dec (expected -20)")

fc_ok  = abs(m.get("cutoff_frequency_hz", 0) - 338.6) < 2
tau_ok = abs(m.get("time_constant_ms", 0) - 0.470)    < 0.01
phi_ok = abs(m.get("phase_at_cutoff_deg", 0) + 45.0)  < 1

print()
print("PASS" if (fc_ok and tau_ok and phi_ok) else "FAIL",
      "— fc:", "OK" if fc_ok else "FAIL",
      "| tau:", "OK" if tau_ok else "FAIL",
      "| phase:", "OK" if phi_ok else "FAIL")
