"""
OpenQASM reader — test suite.

Run from backend/:  python -m pytest tests/test_qasm.py -v

The Quantum Simulator reads circuits written in OpenQASM 2 and 3. These tests
check the language it understands, that every mistake is reported on the
right line in plain words, and — when Qiskit is installed — that circuits
exported by Qiskit itself give exactly Qiskit's answer.
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.modules.module1_kernel import QuantumStateVector
from app.modules.module1_kernel.examples import EXAMPLES, example_qasm, match_example
from app.modules.module1_kernel.qasm import MAX_GATES, QasmError, parse_qasm

HEAD2 = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n'
HEAD3 = 'OPENQASM 3.0;\ninclude "stdgates.inc";\n'


def _state(source: str) -> np.ndarray:
    program = parse_qasm(source)
    sv = QuantumStateVector(program.n_qubits)
    program.circuit.execute(sv)
    return sv.state


def _probs(source: str) -> np.ndarray:
    return np.abs(_state(source)) ** 2


def _error(source: str) -> QasmError:
    with pytest.raises(QasmError) as e:
        parse_qasm(source)
    return e.value


# ── The language ─────────────────────────────────────────────────────────────

def test_a_bell_pair_in_openqasm_2_and_3():
    v2 = HEAD2 + "qreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];\nmeasure q -> c;\n"
    v3 = HEAD3 + "qubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc = measure q;\n"
    for src in (v2, v3):
        assert _probs(src) == pytest.approx([0.5, 0, 0, 0.5])
    assert parse_qasm(v3).version == "3.0"


def test_a_whole_register_is_one_gate_per_qubit():
    p = parse_qasm(HEAD2 + "qreg a[3];\nqreg b[3];\nh a;\ncx a, b;\n")
    assert [(op.gate, op.qubits) for op in p.circuit.operations] == [
        ("H", [0]), ("H", [1]), ("H", [2]), ("CNOT", [0, 3]), ("CNOT", [1, 4]), ("CNOT", [2, 5])]
    assert p.labels == ["a[0]", "a[1]", "a[2]", "b[0]", "b[1]", "b[2]"]


def test_one_qubit_with_a_whole_register():
    p = parse_qasm(HEAD2 + "qreg c[1];\nqreg t[3];\ncx c[0], t;\n")
    assert [op.qubits for op in p.circuit.operations] == [[0, 1], [0, 2], [0, 3]]


@pytest.mark.parametrize("text,value", [
    ("pi", math.pi), ("-pi/2", -math.pi / 2), ("3*pi/4", 3 * math.pi / 4), ("2^-3", 0.125), ("2**3", 8),
    ("(1+2)*3", 9), ("1e-3", 1e-3), (".5", 0.5), ("sin(pi/2)", 1), ("sqrt(4)", 2), ("ln(exp(2))", 2),
    ("π/4", math.pi / 4), ("tau", math.tau), ("-2^2", -4),
])
def test_angles_are_worked_out(text, value):
    op = parse_qasm(HEAD2 + f"qreg q[1];\nrz({text}) q[0];\n").circuit.operations[0]
    assert op.params[0] == pytest.approx(value)


def test_custom_gates_with_angles_and_nesting():
    src = HEAD2 + """
qreg q[2];
gate turn(t) a { ry(t) a; }
gate pair(t) a, b { turn(t/2) a; cx a, b; turn(-t) b; }
pair(pi) q[0], q[1];
"""
    ops = parse_qasm(src).circuit.operations
    assert [(o.gate, o.qubits) for o in ops] == [("RY", [0]), ("CNOT", [0, 1]), ("RY", [1])]
    assert ops[0].params[0] == pytest.approx(math.pi / 2) and ops[2].params[0] == pytest.approx(-math.pi)


def test_comments_barriers_and_blank_statements_are_ignored():
    src = HEAD2 + "// hello\nqreg q[2]; /* a\nlong\ncomment */ barrier q;\n;\nh q[0]; // turn\nbarrier q[0], q[1];\n"
    assert [op.gate for op in parse_qasm(src).circuit.operations] == ["H"]


def test_the_rest_of_qelib1_is_built_in():
    src = HEAD2 + "qreg q[5];\nu2(0, pi) q[0];\ncu3(1, 2, 3) q[0], q[1];\ncsx q[0], q[1];\nrccx q[0], q[1], q[2];\n" \
                  "rc3x q[0], q[1], q[2], q[3];\nc3x q[0], q[1], q[2], q[3];\nc4x q[0], q[1], q[2], q[3], q[4];\n"
    assert parse_qasm(src).n_qubits == 5


def test_measuring_at_the_end_is_fine_and_remembered():
    p = parse_qasm(HEAD2 + "qreg q[2];\ncreg c[2];\nh q;\nmeasure q[1] -> c[1];\nbarrier q;\nx q[0];\nmeasure q[0] -> c[0];\n")
    assert p.measured == [0, 1]


# ── Examples ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("example", EXAMPLES)
@pytest.mark.parametrize("n", [2, 3, 7, 28])
def test_every_example_reads_back_as_itself(example, n):
    program = parse_qasm(example_qasm(example, n))
    assert program.n_qubits == n and match_example(program) == example


def test_examples_are_stable():
    assert example_qasm("random", 9) == example_qasm("random", 9)
    assert match_example(parse_qasm(example_qasm("ghz", 6))) == "ghz"
    assert match_example(parse_qasm(example_qasm("ghz", 6).replace("h q[0];", "x q[0];"))) is None


# ── Mistakes, on the right line, in plain words ──────────────────────────────

@pytest.mark.parametrize("body,line,words", [
    ("qreg q[2];\nh q[2];\n", 4, "q[2] doesn't exist: 'q' has 2 qubits (q[0] to q[1])."),
    ("qreg q[2];\nfoo q[0];\n", 4, "Unknown gate 'foo'"),
    ("qreg q[2]\nh q[0];\n", 3, "Missing ';' at the end of this line."),
    ("qreg q[2];\nh r[0];\n", 4, "Unknown register 'r'"),
    ("qreg q[2];\ncreg c[2];\nh c[0];\n", 5, "'c' holds classical bits"),
    ("qreg q[2];\ncx q[0], q[0];\n", 4, "can't use the same qubit twice"),
    ("qreg q[2];\ncx q[0];\n", 4, "'cx' acts on 2 qubits, got 1."),
    ("qreg q[2];\nrz q[0];\n", 4, "'rz' takes 1 angle, got 0."),
    ("qreg q[2];\nrz(1/0) q[0];\n", 4, "Division by zero"),
    ("qreg q[2];\nrz(theta) q[0];\n", 4, "Unknown name 'theta'"),
    ("qreg q[2];\ncreg c[2];\nmeasure q[0] -> c[0];\nx q[0];\n", 6, "q[0] is used after it was measured (line 5)"),
    ("qreg q[2];\nreset q[0];\n", 4, "'reset' isn't supported yet"),
    ("qreg q[2];\ncreg c[2];\nif (c == 1) x q[0];\n", 5, "'if' isn't supported yet"),
    ("qreg q[20];\nqreg r[10];\n", 4, "up to 28 qubits; this register brings the total to 30"),
    ("qreg q[2];\nqreg q[3];\n", 4, "'q' is already declared."),
    ('include "mygates.inc";\n', 3, "Only qelib1.inc and stdgates.inc are built in"),
    ("qreg q[2];\ngate g a { h b; }\n", 4, "'b' isn't one of gate 'g's qubits (a)."),
    ("qreg q[2];\ngate g a { nope a; }\n", 4, "A gate can only use gates defined before it."),
    ("qreg q[1];\ngate g(t) a {\n  rz(s) a;\n}\ng(1) q[0];\n", 5, "Unknown name 's'"),
    ("qreg q[1];\n/* never closed\nh q[0];\n", 4, "This comment is never closed with */."),
    ("qreg q[1];\nh q[0]; @\n", 4, "Unexpected '@'"),
    ("qreg q[2];\nctrl @ x q[0], q[1];\n", 4, "'ctrl' isn't supported"),
    ("qreg q[1];\ninv @ h q[0];\n", 4, "'inv' isn't supported"),
    ("qreg q[1];\nfor i in [0:2] { h q[0]; }\n", 4, "'for' isn't supported"),
])
def test_mistakes_name_their_line(body, line, words):
    e = _error(HEAD2 + body)
    assert e.line == line and words in e.message, (e.line, e.message)


def test_a_circuit_without_qubits_says_what_to_add():
    e = _error(HEAD2)
    assert e.line is None and "Declare at least one qubit" in e.message


def test_too_many_gates_or_too_much_work_is_refused():
    assert f"more than {MAX_GATES:,} gates" in _error(HEAD2 + "qreg q[2];\n" + "h q[0];\n" * (MAX_GATES + 1)).message
    e = _error(HEAD2 + "qreg q[28];\n" + "h q;\n" * 30)           # 840 gates on 28 qubits ≈ 3 minutes
    assert e.line is None and "too much for one run" in e.message


def test_an_unknown_version_is_refused():
    assert "OpenQASM 2 and 3" in _error("OPENQASM 1.0;\nqreg q[1];\n").message


# ── Same answers as Qiskit, from Qiskit's own exports ────────────────────────

def _random_qiskit_circuit(rng, n: int, depth: int):
    from qiskit import QuantumCircuit
    from qiskit.circuit.library import CU3Gate, CSXGate, RCCXGate, RC3XGate, iSwapGate

    qc = QuantumCircuit(n)
    angle = lambda: float(rng.uniform(-math.pi, math.pi))
    one = ["h", "x", "y", "z", "s", "sdg", "t", "tdg", "sx", "sxdg", "rx", "ry", "rz", "p", "u"]
    two = ["cx", "cy", "cz", "ch", "swap", "crx", "cry", "crz", "cp", "cu", "rxx", "ryy", "rzz",
           "cu3", "csx", "iswap", "ecr", "dcx"]
    for _ in range(depth):
        roll = rng.integers(10)
        if roll < 5:
            g, q = one[rng.integers(len(one))], int(rng.integers(n))
            if g in ("rx", "ry", "rz", "p"):
                getattr(qc, g)(angle(), q)
            elif g == "u":
                qc.u(angle(), angle(), angle(), q)
            else:
                getattr(qc, g)(q)
        elif roll < 9 or n < 3:
            g, q = two[rng.integers(len(two))], [int(x) for x in rng.choice(n, 2, replace=False)]
            if g in ("crx", "cry", "crz", "cp", "rxx", "ryy", "rzz"):
                getattr(qc, g)(angle(), *q)
            elif g == "cu":
                qc.cu(angle(), angle(), angle(), angle(), *q)
            elif g == "cu3":
                qc.append(CU3Gate(angle(), angle(), angle()), q)
            elif g == "csx":
                qc.append(CSXGate(), q)
            elif g == "iswap":
                qc.append(iSwapGate(), q)
            else:
                getattr(qc, g)(*q)
        else:
            q = [int(x) for x in rng.choice(n, 3, replace=False)]
            [qc.ccx, qc.cswap, lambda *a: qc.append(RCCXGate(), list(a))][rng.integers(3)](*q)
    if n >= 5:
        qc.mcx([0, 1, 2, 3], 4)
        qc.append(RC3XGate(), [1, 2, 3, 4])
        qc.mcx([0, 1, 2], 3)
    return qc


@pytest.mark.parametrize("version", ["qasm2", "qasm3"])
def test_circuits_exported_by_qiskit_give_qiskits_answer(version):
    pytest.importorskip("qiskit")
    from qiskit import qasm2, qasm3
    from qiskit.quantum_info import Statevector

    dumps = qasm2.dumps if version == "qasm2" else qasm3.dumps
    rng = np.random.default_rng(2026)
    for _ in range(25):
        qc = _random_qiskit_circuit(rng, int(rng.integers(2, 7)), 40)
        expected = Statevector(qc).reverse_qargs().data       # Qiskit counts qubits from the right
        fidelity = abs(np.vdot(expected, _state(dumps(qc)))) ** 2
        assert fidelity == pytest.approx(1, abs=1e-9), dumps(qc)


def test_our_examples_open_in_qiskit_with_the_same_answer():
    pytest.importorskip("qiskit")
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector

    for example in EXAMPLES:
        source = example_qasm(example, 6)
        qc = QuantumCircuit.from_qasm_str(source)
        qc.remove_final_measurements()
        expected = Statevector(qc).reverse_qargs().data
        assert abs(np.vdot(expected, _state(source))) ** 2 == pytest.approx(1, abs=1e-9), example
