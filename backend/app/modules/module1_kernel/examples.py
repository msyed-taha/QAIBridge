"""
Module 1 – Custom Simulation Kernel
examples.py  –  Example circuits for the Quantum Simulator page, as OpenQASM text.

They load into the editor, so a person can read and change them. Each one
can be made 2 to 28 qubits wide. When a run's circuit is still exactly an
example, the result is checked against what the maths says it must be.
"""

from __future__ import annotations

import random
from functools import lru_cache
from typing import List, Optional, Tuple

from .memory_manager import MAX_QUBITS
from .qasm import QasmProgram, parse_qasm

EXAMPLES = ("ghz", "qft_pattern", "layered", "random")
MIN_QUBITS = 2
PATTERN_PERIOD = 4                 # the qft_pattern input repeats every 4 steps
RANDOM_LAYERS = 8


def _pi_over(k: int) -> str:
    """π/2^k written the way people write it: pi, pi/2, pi/4 …"""
    return "pi" if k == 0 else f"pi/{2 ** k}"


def _file(title: List[str], n: int, body: List[str]) -> str:
    lines = ["OPENQASM 2.0;", 'include "qelib1.inc";', ""]
    lines += [f"// {t}" for t in title]
    lines += [f"qreg q[{n}];", f"creg c[{n}];", ""]
    lines += body
    lines += ["", "measure q -> c;", ""]
    return "\n".join(lines)


def _ghz(n: int) -> str:
    body = ["h q[0];"] + [f"cx q[{i}], q[{i + 1}];" for i in range(n - 1)]
    return _file(["Entangle all: every qubit ends up linked to the others,",
                  "so they are all 0 or all 1, half the time each."], n, body)


def _qft_pattern(n: int) -> str:
    k = PATTERN_PERIOD.bit_length() - 1
    body = [f"// An even mix of 0, {PATTERN_PERIOD}, {2 * PATTERN_PERIOD}, … : a pattern that repeats "
            f"every {PATTERN_PERIOD} steps."]
    body += [f"h q[{i}];" for i in range(n - k)]
    body += ["", "// Quantum Fourier transform: turns the repeat into evenly spaced peaks."]
    for i in range(n):
        body.append(f"h q[{i}];")
        body += [f"cp({_pi_over(j - i)}) q[{j}], q[{i}];" for j in range(i + 1, n)]
    body += [f"swap q[{i}], q[{n - 1 - i}];" for i in range(n // 2)]
    return _file(["Find a repeating pattern, the key step in Shor's algorithm.",
                  f"Expect {PATTERN_PERIOD} evenly spaced peaks, 25% each."], n, body)


def _layered(n: int, layers: int = 2) -> str:
    body: List[str] = []
    for layer in range(layers):
        body.append(f"// Layer {layer + 1}: turn every qubit, then link neighbours.")
        body += [f"ry(pi/4) q[{i}];" for i in range(n)]
        body += [f"cx q[{i}], q[{i + 1}];" for i in range(n - 1)]
    return _file(["Layers of turns and links: the shape used by VQE and QAOA."], n, body)


def _random(n: int) -> str:
    rng = random.Random(1000 + n)              # the same circuit every time for a given size
    choices = ["h", "sx", "t", "ry(pi/3)", "rz(pi/5)"]
    body: List[str] = []
    for layer in range(RANDOM_LAYERS):
        body.append(f"// Layer {layer + 1}")
        body += [f"{rng.choice(choices)} q[{i}];" for i in range(n)]
        body += [f"cz q[{i}], q[{i + 1}];" for i in range(layer % 2, n - 1, 2)]
    return _file([f"{RANDOM_LAYERS} layers of random gates and links between neighbours,",
                  "the kind of circuit used to test quantum computers."], n, body)


_BUILDERS = {"ghz": _ghz, "qft_pattern": _qft_pattern, "layered": _layered, "random": _random}


def example_qasm(example_id: str, n_qubits: int) -> str:
    if example_id not in _BUILDERS:
        raise KeyError(example_id)
    if not MIN_QUBITS <= n_qubits <= MAX_QUBITS:
        raise ValueError(f"Examples can be {MIN_QUBITS} to {MAX_QUBITS} qubits wide.")
    return _BUILDERS[example_id](n_qubits)


@lru_cache(maxsize=256)
def _signature(example_id: str, n_qubits: int) -> Tuple:
    return parse_qasm(example_qasm(example_id, n_qubits)).signature()


def match_example(program: QasmProgram) -> Optional[str]:
    """Which example this circuit still is (comments and spacing aside), if any."""
    n = program.n_qubits
    if not MIN_QUBITS <= n <= MAX_QUBITS:
        return None
    sig = program.signature()
    return next((e for e in EXAMPLES if _signature(e, n) == sig), None)
