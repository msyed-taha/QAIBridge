"""
Module 1 — Custom Simulation Kernel — correctness tests.

Run from backend/:  python -m pytest tests/test_module1_kernel.py -v

Every gate path of the in-place kernel (dense, diagonal, controlled,
permutation, multi-controlled, black-box oracles) is checked against an
independent reference implementation (a plain einsum over the full tensor),
and the QFT is checked against the textbook DFT matrix.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.modules.module1_kernel import QuantumCircuit, QuantumStateVector
from app.modules.module1_kernel.gates import (
    SINGLE_QUBIT_GATES, TWO_QUBIT_GATES, THREE_QUBIT_GATES, get_gate_matrix, gate_param_count,
)

RNG = np.random.default_rng(1234)


def _random_state(n: int) -> np.ndarray:
    v = RNG.normal(size=2 ** n) + 1j * RNG.normal(size=2 ** n)
    return v / np.linalg.norm(v)


def _reference_apply(state: np.ndarray, gate: np.ndarray, qubits, n: int) -> np.ndarray:
    """Independent einsum implementation (qubit 0 = most significant bit)."""
    k = len(qubits)
    psi = state.reshape([2] * n)
    g = gate.reshape([2] * (2 * k))
    letters = "abcdefghijklmnopqrstuvwxyz"
    in_idx = list(letters[:n])
    out_idx = in_idx.copy()
    g_out, g_in = [], []
    for j, q in enumerate(qubits):
        new = letters[j].upper()
        g_out.append(new)
        g_in.append(in_idx[q])
        out_idx[q] = new
    expr = "".join(g_out + g_in) + "," + "".join(in_idx) + "->" + "".join(out_idx)
    return np.einsum(expr, g, psi).reshape(-1)


def _sv_with(state: np.ndarray, n: int) -> QuantumStateVector:
    sv = QuantumStateVector(n)
    sv.set_state(state)
    return sv


ALL_FIXED_GATES = [(name, 1) for name in SINGLE_QUBIT_GATES] + \
                  [(name, 2) for name in TWO_QUBIT_GATES] + \
                  [(name, 3) for name in THREE_QUBIT_GATES]


@pytest.mark.parametrize("name,arity", ALL_FIXED_GATES)
def test_every_gate_matches_reference(name, arity):
    n = 5
    params = list(RNG.uniform(-math.pi, math.pi, gate_param_count(name)))
    matrix = get_gate_matrix(name, params)
    assert np.allclose(matrix.conj().T @ matrix, np.eye(2 ** arity)), f"{name} is not unitary"
    for _ in range(4):
        qubits = list(RNG.choice(n, size=arity, replace=False))
        psi = _random_state(n)
        sv = _sv_with(psi, n)
        sv.apply_gate(name, qubits, params)
        expected = _reference_apply(psi, matrix, qubits, n)
        assert np.allclose(sv.state, expected, atol=1e-12), f"{name} on {qubits}"


def test_multi_controlled_gates_match_reference():
    n = 6
    for _ in range(5):
        qubits = list(RNG.choice(n, size=4, replace=False))
        psi = _random_state(n)
        # MCX = X on the target when all controls are 1
        mcx = np.eye(16, dtype=complex)
        mcx[[14, 15]] = mcx[[15, 14]]
        sv = _sv_with(psi, n)
        sv.apply_gate("MCX", qubits)
        assert np.allclose(sv.state, _reference_apply(psi, mcx, qubits, n))
        # MCZ / MCP = phase on |1111>
        mcz = np.diag([1] * 15 + [-1]).astype(complex)
        sv = _sv_with(psi, n)
        sv.apply_gate("MCZ", qubits)
        assert np.allclose(sv.state, _reference_apply(psi, mcz, qubits, n))
        phi = 0.73
        mcp = np.diag([1] * 15 + [np.exp(1j * phi)]).astype(complex)
        sv = _sv_with(psi, n)
        sv.apply_gate("MCP", qubits, [phi])
        assert np.allclose(sv.state, _reference_apply(psi, mcp, qubits, n))


def test_controlled_permutation_matches_reference():
    n = 6
    control, targets = 4, [0, 5, 2]
    perm = [3, 0, 6, 1, 7, 2, 5, 4]
    u = np.zeros((8, 8), dtype=complex)
    for x, y in enumerate(perm):
        u[y, x] = 1
    cu = np.block([[np.eye(8), np.zeros((8, 8))], [np.zeros((8, 8)), u]]).astype(complex)
    psi = _random_state(n)
    sv = _sv_with(psi, n)
    sv.apply_controlled_permutation([control], targets, perm)
    assert np.allclose(sv.state, _reference_apply(psi, cu, [control] + targets, n))


def test_phase_oracle_and_diagonal():
    n = 4
    psi = _random_state(n)
    sv = _sv_with(psi, n)
    sv.apply_phase_oracle([3, 9])
    expected = psi.copy()
    expected[[3, 9]] *= -1
    assert np.allclose(sv.state, expected)
    phases = np.exp(1j * RNG.uniform(0, 2 * math.pi, 2 ** n))
    sv.apply_diagonal(phases)
    assert np.allclose(sv.state, expected * phases)


@pytest.mark.parametrize("n", [1, 2, 3, 5])
def test_qft_equals_dft_matrix(n):
    """QFT|x> = 1/sqrt(N) Σ_y e^{2πi xy/N} |y>  (the textbook definition)."""
    N = 2 ** n
    omega = np.exp(2j * math.pi / N)
    dft = np.array([[omega ** (x * y) for x in range(N)] for y in range(N)]) / math.sqrt(N)
    qft = QuantumCircuit(n).qft()
    iqft = QuantumCircuit(n).iqft()
    for x in range(N):
        basis = np.zeros(N, dtype=complex)
        basis[x] = 1
        sv = _sv_with(basis, n)
        qft.execute(sv)
        assert np.allclose(sv.state, dft[:, x], atol=1e-12)
        iqft.execute(sv)
        assert np.allclose(sv.state, basis, atol=1e-12)


def test_bell_and_ghz_probabilities():
    res = QuantumCircuit(2).h(0).cnot(0, 1).run(shots=2000)
    assert set(res.probabilities) == {"|00>", "|11>"}
    assert all(abs(p - 0.5) < 1e-9 for p in res.probabilities.values())
    assert res.is_entangled
    assert sum(res.counts.values()) == 2000
    ghz = QuantumCircuit(5).ghz_state().run()
    assert set(ghz.probabilities) == {"|00000>", "|11111>"}


def test_entanglement_is_detected_on_any_pair():
    # q1-q2 entangled, q0 untouched: the old (q0 vs rest) test missed this case
    sv = QuantumStateVector(3)
    sv.h(1)
    sv.cnot(1, 2)
    assert sv.is_entangled()
    product = QuantumStateVector(3)
    product.h(0)
    product.ry(0.4, 1)
    product.x(2)
    assert not product.is_entangled()


def test_bloch_vectors():
    sv = QuantumStateVector(3)
    sv.h(0)                     # |+>  -> x = 1
    sv.apply_gate("SX", [1])    # √X|0> -> y = -1
    sv.x(2)                     # |1>  -> z = -1
    b = sv.bloch_vectors()
    assert b[0]["x"] == pytest.approx(1) and b[0]["length"] == pytest.approx(1)
    assert b[1]["y"] == pytest.approx(-1)
    assert b[2]["z"] == pytest.approx(-1)
    bell = QuantumStateVector(2)
    bell.h(0)
    bell.cnot(0, 1)
    assert bell.bloch_vector(0)["length"] == pytest.approx(0, abs=1e-9)   # maximally mixed


def test_marginal_and_top_states():
    sv = QuantumStateVector(3)
    sv.x(0)
    sv.h(2)
    marg = sv.marginal_probabilities([2, 0])   # order: q2 is the MSB of the result
    assert np.allclose(marg, [0, 0.5, 0, 0.5])
    top = sv.top_states(2)
    assert {i for i, _ in top} == {0b100, 0b101}


def test_measure_qubit_collapses():
    sv = QuantumStateVector(2)
    sv.h(0)
    sv.cnot(0, 1)
    outcome, prob = sv.measure_qubit(0)
    assert prob == pytest.approx(0.5)
    probs = sv.probabilities()
    assert probs[0b11 if outcome else 0b00] == pytest.approx(1)


def test_circuit_validation_errors():
    c = QuantumCircuit(3)
    with pytest.raises(ValueError):
        c._add("CNOT", [0])            # wrong arity
    with pytest.raises(ValueError):
        c._add("RX", [0])              # missing angle
    with pytest.raises(ValueError):
        c._add("CNOT", [1, 1])         # repeated qubit
    with pytest.raises(IndexError):
        c._add("H", [5])               # out of range
    with pytest.raises(ValueError):
        c._add("FOO", [0])             # unknown gate


def test_depth_and_stats():
    c = QuantumCircuit(3).h(0).h(1).h(2).cnot(0, 1).cnot(1, 2)
    assert c.depth() == 3
    assert c.stats()["gates"] == 5


def test_large_register_is_memory_light():
    """22 qubits (64 MB state) — gates, sampling and read-out work without copies of the state."""
    c = QuantumCircuit(22, max_gates=1000).ghz_state()
    res = c.run(shots=500)
    assert set(res.probabilities) == {"|" + "0" * 22 + ">", "|" + "1" * 22 + ">"}
    assert sum(res.counts.values()) == 500


def test_qiskit_export_is_valid_python():
    c = QuantumCircuit(3).h(0).cp(0.5, 0, 1).ccx(0, 1, 2).mcz([0, 1, 2]).barrier("x")
    c.oracle([5]).cperm([0], [1, 2], [1, 2, 3, 0])
    code = c.to_qiskit()
    compile(code, "<export>", "exec")   # syntax check (qiskit itself is optional)
    assert "phase_oracle(qc, [5], 3)" in code
    assert "qc.ccx(0, 1, 2)" in code
