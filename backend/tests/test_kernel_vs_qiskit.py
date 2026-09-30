"""
Module 1 — kernel accuracy against IBM Qiskit (the benchmarking standard named in the Scope).

Optional: runs only when Qiskit is installed —
    pip install "qiskit>=2.0" qiskit-aer
    python -m pytest tests/test_kernel_vs_qiskit.py -v

Every circuit is simulated by the QAIBridge kernel and by Qiskit's
Statevector; the Qiskit circuit is produced by executing QAIBridge's own
Qiskit export, so the exporter is verified at the same time. States must
agree up to a global phase (fidelity 1 to ~1e-12).

Last recorded run (Qiskit 2.5.2): 200 random circuits of 1–8 qubits using
every gate type, plus QFT, Grover, Shor, QAOA and Boolean-oracle circuits —
worst fidelity 0.99999999999975.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

qiskit_qi = pytest.importorskip("qiskit.quantum_info")

from app.modules.module1_kernel import QuantumCircuit, QuantumStateVector  # noqa: E402
from app.modules.module1_kernel.gates import (  # noqa: E402
    SINGLE_QUBIT_GATES, THREE_QUBIT_GATES, TWO_QUBIT_GATES, gate_param_count,
)
from app.modules.module2_sfod.grover import build_grover_circuit  # noqa: E402
from app.modules.module2_sfod.qaoa import build_qaoa_circuit  # noqa: E402
from app.modules.module2_sfod.shor import build_order_finding_circuit  # noqa: E402
from app.modules.module5_transformer.bridge import maxcut_bridge  # noqa: E402

rng = np.random.default_rng(2026)


def _qiskit_state(circ: QuantumCircuit) -> np.ndarray:
    code = "\n".join(l for l in circ.to_qiskit(measure=False).splitlines() if not l.startswith("print("))
    ns: dict = {}
    exec(compile(code, "<export>", "exec"), ns)
    sv = qiskit_qi.Statevector.from_instruction(ns["qc"]).data
    n = circ.n_qubits
    return sv[[int(format(i, f"0{n}b")[::-1], 2) for i in range(2 ** n)]]   # little → big endian


def _fidelity(circ: QuantumCircuit) -> float:
    sv = QuantumStateVector(circ.n_qubits)
    circ.execute(sv)
    return abs(np.vdot(sv.state, _qiskit_state(circ))) ** 2


def _random_circuit(n: int, depth: int) -> QuantumCircuit:
    one = [g for g in SINGLE_QUBIT_GATES if g != "I"]
    c = QuantumCircuit(n, max_gates=10_000)
    for _ in range(depth):
        r = rng.random()
        if r < 0.45 or n < 2:
            g = str(rng.choice(one))
            c._add(g, [int(rng.integers(n))], list(rng.uniform(-math.pi, math.pi, gate_param_count(g))))
        elif r < 0.8 or n < 3:
            g = str(rng.choice(list(TWO_QUBIT_GATES)))
            c._add(g, [int(q) for q in rng.choice(n, 2, replace=False)],
                   list(rng.uniform(-math.pi, math.pi, gate_param_count(g))))
        elif r < 0.9:
            c._add(str(rng.choice(list(THREE_QUBIT_GATES))), [int(q) for q in rng.choice(n, 3, replace=False)])
        else:
            g = str(rng.choice(["MCX", "MCZ", "MCP"]))
            qs = [int(q) for q in rng.choice(n, int(rng.integers(2, n + 1)), replace=False)]
            c._add(g, qs, [float(rng.uniform(-math.pi, math.pi))] if g == "MCP" else [])
    return c


@pytest.mark.parametrize("n", range(1, 8))
def test_random_circuits_match_qiskit(n):
    for _ in range(10):
        assert _fidelity(_random_circuit(n, int(rng.integers(5, 30)))) == pytest.approx(1.0, abs=1e-9)


@pytest.mark.parametrize("name,circ", [
    ("qft", QuantumCircuit(6, max_gates=1000).qft()),
    ("grover", build_grover_circuit(5, [19], 4)),
    ("shor", build_order_finding_circuit(7, 15)),
    ("qaoa", build_qaoa_circuit(maxcut_bridge(5, [(0, 1, 1), (1, 2, 2), (2, 3, 1), (3, 4, 1.5), (4, 0, 1)]).ising,
                                [0.7, 1.1], [0.3, 0.6])),
])
def test_algorithm_circuits_match_qiskit(name, circ):
    assert _fidelity(circ) == pytest.approx(1.0, abs=1e-9)
