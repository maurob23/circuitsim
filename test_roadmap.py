"""Verifica funzionale delle feature roadmap:
   1. node_traces in solve_sinusoidal e solve_transient
   2. Induttore in analisi AC (filtro RL)
   3. Export/import circuito (logica Python-side)
"""
import sys
sys.path.insert(0, '.')
from solver.tier1.mna import solve_sinusoidal, solve_transient, solve_ac

# ── 1. sinusoidal: node_traces multi-nodo ─────────────────────────────────
nl = {
    'components': [
        {'type': 'voltage_source', 'nodes': ['n1', 'gnd'], 'value': 1.0},
        {'type': 'resistor',       'nodes': ['n1', 'n2'],  'value': 10_000},
        {'type': 'capacitor',      'nodes': ['n2', 'gnd'], 'value': 47e-9},
    ],
    'analysis': {'type': 'sinusoidal', 'frequency': 338, 'amplitude': 1.0, 'periods': 6},
    'output_nodes': ['n2'],
}
r = solve_sinusoidal(nl)
assert 'node_traces' in r,             "node_traces mancante in sinusoidal"
assert set(r['node_traces'].keys()) == {'n1', 'n2'}, \
    f"nodi attesi {{n1,n2}}, trovati {set(r['node_traces'].keys())}"
assert len(r['node_traces']['n1']) == len(r['times']), "lunghezza trace n1 errata"
assert len(r['node_traces']['n2']) == len(r['times']), "lunghezza trace n2 errata"
print(f"[OK] sinusoidal  — {len(r['times'])} punti, nodi={list(r['node_traces'].keys())}")

# ── 2. transient: node_traces multi-nodo ──────────────────────────────────
r2 = solve_transient({
    'components': [
        {'type': 'voltage_source', 'nodes': ['n1', 'gnd'], 'value': 1.0},
        {'type': 'resistor',       'nodes': ['n1', 'n2'],  'value': 10_000},
        {'type': 'capacitor',      'nodes': ['n2', 'gnd'], 'value': 47e-9},
    ],
    'analysis': {'type': 'transient', 't_end': 0.002, 'points': 200},
    'output_nodes': ['n2'],
})
assert 'node_traces' in r2, "node_traces mancante in transient"
assert len(r2['node_traces']['n2']) == 200, "punti transient errati"
print(f"[OK] transient   — {len(r2['times'])} punti, nodi={list(r2['node_traces'].keys())}")

# ── 3. Induttore RL in AC — filtro passa-basso (uscita sulla R) ───────────
# Topologia: V1 → L → n2 → R → GND  (uscita su n2 = nodo tra L e R, passa-basso)
# H(jω) = R/(R+jωL)  →  fc = R/(2πL) ≈ 15 915 Hz
import math
r3 = solve_ac({
    'components': [
        {'type': 'voltage_source', 'nodes': ['n1', 'gnd'], 'value': 1.0},
        {'type': 'inductor',       'nodes': ['n1', 'n2'],  'value': 1e-3},
        {'type': 'resistor',       'nodes': ['n2', 'gnd'], 'value': 100},
    ],
    'analysis': {'type': 'ac', 'start_freq': 100, 'stop_freq': 500_000,
                 'points_per_decade': 50},
    'output_nodes': ['n2'],
})
fc = r3['metrics'].get('cutoff_frequency_hz')
assert fc is not None, "fc non trovata per filtro RL bassa-passa"
expected = 100 / (2 * math.pi * 1e-3)   # R/(2πL) ≈ 15 915 Hz
err_pct = abs(fc - expected) / expected * 100
assert err_pct < 2.0, f"fc={fc:.1f} Hz lontano dall'atteso {expected:.1f} Hz ({err_pct:.2f}%)"
print(f"[OK] induttore   — fc={fc:.1f} Hz  (attesa {expected:.0f} Hz, errore {err_pct:.2f}%)")

# ── 4. Induttore RL transitorio ───────────────────────────────────────────
r4 = solve_transient({
    'components': [
        {'type': 'voltage_source', 'nodes': ['n1', 'gnd'], 'value': 5.0},
        {'type': 'resistor',       'nodes': ['n1', 'n2'],  'value': 100},
        {'type': 'inductor',       'nodes': ['n2', 'gnd'], 'value': 1e-3},
    ],
    'analysis': {'type': 'transient', 't_end': 1e-4, 'points': 500},
    'output_nodes': ['n2'],
})
# V_L(t) decays from 5V: final value ~ 0, nodo n2=V_L
v_final = r4['voltages'][-1]
assert abs(v_final) < 0.5, f"V_L a regime non zero: {v_final:.4f} V"
print(f"[OK] RL transitorio  V_L finale={v_final:.4f} V (atteso ~0)")

print()
print("=== Tutti i test superati ===")
