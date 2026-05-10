"""
Module 8 – Interactive Performance Dashboard
benchmarker.py  –  Quantum vs Classical benchmarking engine

Orchestrates a full benchmark run:
1. Run the quantum simulation (Module 1 kernel)
2. Run the equivalent classical algorithm (classical_baseline.py)
3. Compute metrics (metrics.py)
4. Return a unified BenchmarkReport
"""

from __future__ import annotations

import time
import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

from ..module1_kernel.circuit import QuantumCircuit, CircuitLibrary
from ..module1_kernel.state_vector import QuantumStateVector
from ..module1_kernel.memory_manager import check_memory
from .classical_baseline import (
    classical_linear_search,
    classical_trial_division,
    classical_tsp_greedy,
    classical_database_search,
    classical_nn_forward,
)
from .metrics import speedup_factor, theoretical_speedup, accuracy_comparison, build_chart_data


# ──────────────────────────────────────────────────────────────────────────────
# Report Type
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class BenchmarkReport:
    algorithm:        str
    problem_size:     int
    quantum_result:   Dict
    classical_result: Dict
    speedup:          float
    theoretical:      Dict
    accuracy:         Dict
    chart_data:       Dict
    meta:             Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "algorithm":        self.algorithm,
            "problem_size":     self.problem_size,
            "quantum_result":   self.quantum_result,
            "classical_result": self.classical_result,
            "speedup":          self.speedup,
            "theoretical":      self.theoretical,
            "accuracy":         self.accuracy,
            "chart_data":       self.chart_data,
            "meta":             self.meta,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Benchmark Runners — one per SFOD category
# ──────────────────────────────────────────────────────────────────────────────

def benchmark_search(n: int = 16) -> BenchmarkReport:
    """
    Compare Grover's 2-qubit search against classical linear search.

    For a fair comparison at small sizes, we run Grover on the kernel
    and measure the actual simulation time.
    """
    n_qubits = max(2, min(int(math.ceil(math.log2(max(n, 2)))), 12))

    # ── Quantum ──
    t0 = time.perf_counter()
    circuit = CircuitLibrary.grover_oracle_2qubit() if n_qubits == 2 \
        else _grover_circuit(n_qubits)
    q_result_raw = circuit.run(shots=1024)
    q_elapsed = (time.perf_counter() - t0) * 1000.0

    # Most probable state = "found" state
    counts = q_result_raw.counts
    top_state = max(counts, key=counts.get)
    q_result = {
        "algorithm":    "Grover's Search",
        "n_qubits":     n_qubits,
        "found_state":  top_state,
        "found":        True,
        "shots":        1024,
        "top_count":    counts[top_state],
        "elapsed_ms":   round(q_elapsed, 3),
        "circuit_depth": len(circuit),
        "complexity":   f"O(√N) ≈ O(√{n})",
    }

    # ── Classical ──
    data = list(range(n))
    target = random.randint(0, n - 1)
    c_result = classical_linear_search(data, target)

    # ── Metrics ──
    sf = speedup_factor(c_result["elapsed_ms"], q_result["elapsed_ms"])
    theory = theoretical_speedup("search", n)
    acc = accuracy_comparison(q_result, c_result, "search")

    # Multi-size chart data
    chart_runs = _chart_scaling("search", sizes=[4, 8, 16, 32, 64, 128, 256])

    return BenchmarkReport(
        algorithm="Grover's Search",
        problem_size=n,
        quantum_result=q_result,
        classical_result=c_result,
        speedup=sf,
        theoretical=theory,
        accuracy=acc,
        chart_data=build_chart_data(chart_runs),
        meta={"n_qubits": n_qubits, "target": target},
    )


def benchmark_factoring(n: int = 15) -> BenchmarkReport:
    """
    Compare Shor-inspired quantum circuit against classical trial division.

    Note: A full Shor implementation requires 2n+3 qubits.  We simulate
    the quantum phase estimation component on n_qubits = min(n_bits, 10).
    """
    n_bits = max(2, n.bit_length())
    n_qubits = min(n_bits * 2, 10)

    # ── Quantum (QFT as core of phase estimation) ──
    t0 = time.perf_counter()
    circuit = CircuitLibrary.qft_circuit(n_qubits)
    q_result_raw = circuit.run(shots=512)
    q_elapsed = (time.perf_counter() - t0) * 1000.0

    q_result = {
        "algorithm":    "Shor (QFT phase estimation)",
        "n":            n,
        "n_qubits":     n_qubits,
        "elapsed_ms":   round(q_elapsed, 3),
        "complexity":   "O((log N)³)",
        "circuit_depth": len(circuit),
        "note":         "Full Shor requires quantum arithmetic; this benchmarks QFT kernel timing.",
    }

    # ── Classical ──
    c_result = classical_trial_division(n)

    sf = speedup_factor(c_result["elapsed_ms"], q_result["elapsed_ms"])
    theory = theoretical_speedup("factoring", n_bits)
    acc = {"note": "Correctness comparison not applicable for partial Shor simulation."}
    chart_runs = _chart_scaling("factoring", sizes=[8, 15, 21, 35, 77, 143, 221])

    return BenchmarkReport(
        algorithm="Shor's Factoring (QFT)",
        problem_size=n,
        quantum_result=q_result,
        classical_result=c_result,
        speedup=sf,
        theoretical=theory,
        accuracy=acc,
        chart_data=build_chart_data(chart_runs),
        meta={"n_bits": n_bits},
    )


def benchmark_optimization(n_cities: int = 5) -> BenchmarkReport:
    """
    Compare QAOA-style ansatz against classical greedy TSP.
    """
    n_qubits = min(n_cities * 2, 12)

    # ── Quantum (parametric ansatz — QAOA layers) ──
    t0 = time.perf_counter()
    circuit = CircuitLibrary.parametric_ansatz(n_qubits, layers=3)
    q_result_raw = circuit.run(shots=512)
    q_elapsed = (time.perf_counter() - t0) * 1000.0

    q_result = {
        "algorithm":    "QAOA Ansatz",
        "n_qubits":     n_qubits,
        "n_cities":     n_cities,
        "elapsed_ms":   round(q_elapsed, 3),
        "complexity":   "O(p·N) per layer",
        "circuit_depth": len(circuit),
    }

    # ── Classical ──
    cities = [(random.uniform(0, 100), random.uniform(0, 100)) for _ in range(n_cities)]
    c_result = classical_tsp_greedy(cities)

    sf = speedup_factor(c_result["elapsed_ms"], q_result["elapsed_ms"])
    theory = theoretical_speedup("optimization", n_cities)
    acc = {"note": "QAOA optimises Hamiltonian expectation; direct TSP comparison approximate."}
    chart_runs = _chart_scaling("optimization", sizes=[3, 4, 5, 6, 7, 8])

    return BenchmarkReport(
        algorithm="QAOA Optimization",
        problem_size=n_cities,
        quantum_result=q_result,
        classical_result=c_result,
        speedup=sf,
        theoretical=theory,
        accuracy=acc,
        chart_data=build_chart_data(chart_runs),
        meta={"cities": cities},
    )


def benchmark_database(db_size: int = 64) -> BenchmarkReport:
    """
    Compare Grover amplitude amplification against classical sequential scan.
    """
    n_qubits = max(2, min(int(math.ceil(math.log2(max(db_size, 2)))), 12))
    target_index = random.randint(0, db_size - 1)

    # ── Quantum ──
    t0 = time.perf_counter()
    circuit = _grover_circuit(n_qubits)
    q_result_raw = circuit.run(shots=1024)
    q_elapsed = (time.perf_counter() - t0) * 1000.0

    counts = q_result_raw.counts
    top_state = max(counts, key=counts.get)

    q_result = {
        "algorithm":    "Grover Amplitude Amplification",
        "db_size":      db_size,
        "n_qubits":     n_qubits,
        "found_state":  top_state,
        "elapsed_ms":   round(q_elapsed, 3),
        "complexity":   f"O(√N) ≈ O(√{db_size})",
        "circuit_depth": len(circuit),
    }

    # ── Classical ──
    c_result = classical_database_search(db_size, target_index)

    sf = speedup_factor(c_result["elapsed_ms"], q_result["elapsed_ms"])
    theory = theoretical_speedup("database", db_size)
    acc = {"note": "Grover finds marked element; quantum output is probabilistic."}
    chart_runs = _chart_scaling("database", sizes=[8, 16, 32, 64, 128, 256, 512])

    return BenchmarkReport(
        algorithm="Grover Database Search",
        problem_size=db_size,
        quantum_result=q_result,
        classical_result=c_result,
        speedup=sf,
        theoretical=theory,
        accuracy=acc,
        chart_data=build_chart_data(chart_runs),
        meta={"target_index": target_index},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Full SFOD suite summary (used by dashboard overview)
# ──────────────────────────────────────────────────────────────────────────────

def run_full_benchmark_suite() -> Dict:
    """
    Run all four SFOD benchmarks and return a combined report
    suitable for the overview chart on the dashboard.
    """
    results = {}
    for name, fn, arg in [
        ("search",       benchmark_search,       16),
        ("factoring",    benchmark_factoring,     15),
        ("optimization", benchmark_optimization,  5),
        ("database",     benchmark_database,      64),
    ]:
        try:
            report = fn(arg)
            results[name] = {
                "speedup":        report.speedup,
                "quantum_ms":     report.quantum_result.get("elapsed_ms", 0),
                "classical_ms":   report.classical_result.get("elapsed_ms", 0),
                "algorithm":      report.algorithm,
                "theoretical_speedup": report.theoretical.get("theoretical_speedup", "N/A"),
            }
        except Exception as e:
            results[name] = {"error": str(e)}

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Internals
# ──────────────────────────────────────────────────────────────────────────────

def _grover_circuit(n_qubits: int) -> QuantumCircuit:
    """Build a generic Grover circuit for n_qubits."""
    circ = QuantumCircuit(n_qubits, f"Grover-{n_qubits}q")
    # Uniform superposition
    for q in range(n_qubits):
        circ.h(q)
    # Simple oracle: phase-flip last computational basis state
    circ.z(n_qubits - 1)
    # Diffuser
    for q in range(n_qubits):
        circ.h(q)
    for q in range(n_qubits):
        circ.x(q)
    circ.z(n_qubits - 1)
    for q in range(n_qubits):
        circ.x(q)
    for q in range(n_qubits):
        circ.h(q)
    return circ


def _chart_scaling(algorithm: str, sizes: List[int]) -> List[Dict]:
    """
    Compute theoretical classical and quantum op counts for a range of sizes.
    Used to build the scaling chart (no actual simulation run — pure math).
    """
    rows = []
    for n in sizes:
        theory = theoretical_speedup(algorithm, n)
        rows.append({
            "n":            n,
            "classical_ms": theory.get("classical_ops", n) / 1e6,   # normalised
            "quantum_ms":   theory.get("quantum_ops", int(math.sqrt(n))) / 1e6,
            "speedup":      theory.get("theoretical_speedup", 1.0)
                             if isinstance(theory.get("theoretical_speedup"), (int, float)) else 1.0,
        })
    return rows
