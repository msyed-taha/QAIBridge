"""
Module 1 – Custom Simulation Kernel
qiskit_export.py  –  Turn a kernel QuantumCircuit into runnable Qiskit code.

The export is what makes our results checkable against the industry
standard: run the exported file with Qiskit Aer and the printed counts use
the same (big-endian) labels as QAIBridge, so the two distributions can be
compared directly.
"""

from __future__ import annotations

from typing import List, TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:  # pragma: no cover
    from .circuit import QuantumCircuit

_SIMPLE_1Q = {
    "H": "h", "X": "x", "Y": "y", "Z": "z", "S": "s", "SDAG": "sdg", "SDG": "sdg",
    "T": "t", "TDAG": "tdg", "TDG": "tdg", "SX": "sx", "I": "id",
}
_PARAM_1Q = {"RX": "rx", "RY": "ry", "RZ": "rz", "P": "p", "U": "u"}
_SIMPLE_2Q = {"CNOT": "cx", "CY": "cy", "CZ": "cz", "CH": "ch", "SWAP": "swap", "ISWAP": "iswap"}
_PARAM_2Q = {"CRX": "crx", "CRY": "cry", "CRZ": "crz", "CP": "cp", "CPHASE": "cp",
             "RXX": "rxx", "RYY": "ryy", "RZZ": "rzz"}
_SIMPLE_3Q = {"CCX": "ccx", "TOFFOLI": "ccx", "CCZ": "ccz", "CSWAP": "cswap", "FREDKIN": "cswap"}

MAX_EXPORTED_DIAGONAL_QUBITS = 10


def _num(x: float) -> str:
    return repr(round(float(x), 12))


def circuit_to_qiskit(circ: "QuantumCircuit", measure: bool = True) -> str:
    n = circ.n_qubits
    ops = circ.operations
    uses = {op.gate for op in ops}

    head: List[str] = [
        '"""',
        f"{circ.name} — exported from QAIBridge (Module 1 simulation kernel).",
        "",
        "Run it:  pip install qiskit qiskit-aer   then   python this_file.py",
        "QAIBridge labels basis states big-endian (qubit 0 = leftmost bit) while",
        "Qiskit prints little-endian (qubit 0 = rightmost), so the counts printed at",
        "the end are re-keyed to QAIBridge's convention for a direct comparison.",
        '"""',
        "from qiskit import QuantumCircuit, transpile",
        "from qiskit_aer import AerSimulator",
    ]
    if "CPERM" in uses:
        head += ["import numpy as np", "from qiskit.circuit.library import UnitaryGate"]
    if "DIAGONAL" in uses:
        head += ["from qiskit.circuit.library import DiagonalGate"]
    head.append("")

    helpers: List[str] = []
    if "ORACLE" in uses:
        helpers += [
            "def phase_oracle(qc, marked, n):",
            '    """Flip the sign of every marked basis state (big-endian labels)."""',
            "    for m in marked:",
            '        zeros = [q for q, b in enumerate(format(m, f"0{n}b")) if b == "0"]',
            "        for q in zeros:",
            "            qc.x(q)",
            "        if n == 1:",
            "            qc.z(0)",
            "        else:",
            "            qc.h(n - 1)",
            "            qc.mcx(list(range(n - 1)), n - 1)",
            "            qc.h(n - 1)",
            "        for q in zeros:",
            "            qc.x(q)",
            "",
        ]
    if "CPERM" in uses:
        helpers += [
            "def permutation_gate(perm):",
            '    """Unitary U|x> = |perm[x]> (e.g. modular multiplication in Shor\'s algorithm)."""',
            "    u = np.zeros((len(perm), len(perm)))",
            "    for x, y in enumerate(perm):",
            "        u[y, x] = 1",
            "    return UnitaryGate(u)",
            "",
        ]

    body: List[str] = [f"qc = QuantumCircuit({n}, {n})" if measure else f"qc = QuantumCircuit({n})"]
    for op in ops:
        g, q, p = op.gate, op.qubits, op.params
        if g in _SIMPLE_1Q:
            body.append(f"qc.{_SIMPLE_1Q[g]}({q[0]})")
        elif g in _PARAM_1Q:
            body.append(f"qc.{_PARAM_1Q[g]}({', '.join(_num(x) for x in p)}, {q[0]})")
        elif g in _SIMPLE_2Q:
            body.append(f"qc.{_SIMPLE_2Q[g]}({q[0]}, {q[1]})")
        elif g in _PARAM_2Q:
            body.append(f"qc.{_PARAM_2Q[g]}({_num(p[0])}, {q[0]}, {q[1]})")
        elif g in _SIMPLE_3Q:
            body.append(f"qc.{_SIMPLE_3Q[g]}({q[0]}, {q[1]}, {q[2]})")
        elif g == "MCX":
            body.append(f"qc.x({q[0]})" if len(q) == 1 else f"qc.mcx({q[:-1]}, {q[-1]})")
        elif g == "MCZ":
            if len(q) == 1:
                body.append(f"qc.z({q[0]})")
            else:
                body += [f"qc.h({q[-1]})", f"qc.mcx({q[:-1]}, {q[-1]})", f"qc.h({q[-1]})"]
        elif g == "MCP":
            body.append(f"qc.p({_num(p[0])}, {q[0]})" if len(q) == 1
                        else f"qc.mcp({_num(p[0])}, {q[:-1]}, {q[-1]})")
        elif g == "BARRIER":
            body.append(f"qc.barrier()  # {op.label}" if op.label else "qc.barrier()")
        elif g == "ORACLE":
            body.append(f"phase_oracle(qc, {op.meta['marked']}, {n})  # {op.label}")
        elif g == "CPERM":
            ctrls, tgts = op.meta["controls"], op.meta["targets"]
            gate = f"permutation_gate({op.meta['permutation']})"
            if ctrls:
                gate += f".control({len(ctrls)})"
            # Qiskit matrices are little-endian in their qubit list → reverse the targets.
            body.append(f"qc.append({gate}, {ctrls + tgts[::-1]})  # {op.label}")
        elif g == "DIAGONAL":
            if n > MAX_EXPORTED_DIAGONAL_QUBITS:
                body.append(f"# {op.label}: {n}-qubit diagonal operator omitted (too large to export literally)")
            else:
                diag = np.asarray(op.meta["diagonal"])
                # re-index big-endian → little-endian
                rev = [int(format(i, f"0{n}b")[::-1], 2) for i in range(2 ** n)]
                entries = ", ".join(f"complex({_num(diag[j].real)}, {_num(diag[j].imag)})" for j in rev)
                body.append(f"qc.append(DiagonalGate([{entries}]), list(range({n})))  # {op.label}")
        else:
            body.append(f"# unsupported operation {g} on {q}")

    tail: List[str] = [""]
    if measure:
        tail += [
            f"qc.measure(range({n}), range({n}))",
            "",
            "sim = AerSimulator()",
            "counts = sim.run(transpile(qc, sim), shots=1024).result().get_counts()",
            "# Re-key to QAIBridge's big-endian labels (qubit 0 first):",
            "counts = {k[::-1]: v for k, v in sorted(counts.items(), key=lambda kv: -kv[1])}",
            "print(counts)",
        ]
    else:
        tail += ["print(qc.draw())"]

    return "\n".join(head + helpers + body + tail) + "\n"
