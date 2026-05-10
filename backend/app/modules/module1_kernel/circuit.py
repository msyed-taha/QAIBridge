"""
Module 1 – Custom Simulation Kernel
circuit.py  –  High-level quantum circuit builder and execution engine

A QuantumCircuit is an ordered list of Operation objects.
Calling `.run()` creates a fresh QuantumStateVector and executes all
operations in sequence, returning a SimulationResult.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any

from .state_vector import QuantumStateVector
from .memory_manager import check_memory


# ──────────────────────────────────────────────────────────────────────────────
# Data Types
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Operation:
    """Single quantum operation in the circuit."""
    gate:   str
    qubits: List[int]
    params: List[float] = field(default_factory=list)

    def to_dict(self) -> Dict:
        d = {"gate": self.gate, "qubits": self.qubits}
        if self.params:
            d["params"] = self.params
        return d


@dataclass
class SimulationResult:
    """Full result returned after circuit execution."""
    n_qubits:       int
    gate_count:     int
    elapsed_ms:     float
    amplitudes:     List[Dict]       # top-N amplitude snapshots
    probabilities:  Dict[str, float] # all non-negligible basis states
    counts:         Dict[str, int]   # sample counts (1 024 shots default)
    is_entangled:   bool
    summary:        Dict
    phases:         List[Dict]       # phase info for Bloch-sphere-like vis
    operations:     List[Dict]       # circuit operations (for circuit diagram)
    memory_report:  Dict

    def to_dict(self) -> Dict:
        return {
            "n_qubits":      self.n_qubits,
            "gate_count":    self.gate_count,
            "elapsed_ms":    round(self.elapsed_ms, 3),
            "amplitudes":    self.amplitudes,
            "probabilities": self.probabilities,
            "counts":        self.counts,
            "is_entangled":  self.is_entangled,
            "summary":       self.summary,
            "phases":        self.phases,
            "operations":    self.operations,
            "memory_report": self.memory_report,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Circuit Builder
# ──────────────────────────────────────────────────────────────────────────────

class QuantumCircuit:
    """
    Fluent builder for quantum circuits.

    Usage:
        circuit = QuantumCircuit(n_qubits=3)
        circuit.h(0).cnot(0, 1).cnot(0, 2)
        result = circuit.run(shots=1024)
    """

    MAX_GATES = 500  # Safety limit to prevent runaway circuits

    def __init__(self, n_qubits: int, name: str = ""):
        if n_qubits < 1 or n_qubits > 20:
            raise ValueError(f"n_qubits must be between 1 and 20, got {n_qubits}.")
        self.n_qubits = n_qubits
        self.name = name or f"{n_qubits}-qubit circuit"
        self._ops: List[Operation] = []

    # ── Single-Qubit Gates ────────────────────────────────────────────────

    def h(self, qubit: int) -> "QuantumCircuit":
        return self._add("H", [qubit])

    def x(self, qubit: int) -> "QuantumCircuit":
        return self._add("X", [qubit])

    def y(self, qubit: int) -> "QuantumCircuit":
        return self._add("Y", [qubit])

    def z(self, qubit: int) -> "QuantumCircuit":
        return self._add("Z", [qubit])

    def s(self, qubit: int) -> "QuantumCircuit":
        return self._add("S", [qubit])

    def t(self, qubit: int) -> "QuantumCircuit":
        return self._add("T", [qubit])

    def rx(self, theta: float, qubit: int) -> "QuantumCircuit":
        return self._add("RX", [qubit], [theta])

    def ry(self, theta: float, qubit: int) -> "QuantumCircuit":
        return self._add("RY", [qubit], [theta])

    def rz(self, theta: float, qubit: int) -> "QuantumCircuit":
        return self._add("RZ", [qubit], [theta])

    def u(self, theta: float, phi: float, lam: float, qubit: int) -> "QuantumCircuit":
        return self._add("U", [qubit], [theta, phi, lam])

    def p(self, phi: float, qubit: int) -> "QuantumCircuit":
        return self._add("P", [qubit], [phi])

    # ── Two-Qubit Gates ───────────────────────────────────────────────────

    def cnot(self, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CNOT", [ctrl, tgt])

    def cx(self, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CNOT", [ctrl, tgt])

    def cz(self, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CZ", [ctrl, tgt])

    def swap(self, q1: int, q2: int) -> "QuantumCircuit":
        return self._add("SWAP", [q1, q2])

    def crx(self, theta: float, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CRX", [ctrl, tgt], [theta])

    def cry(self, theta: float, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CRY", [ctrl, tgt], [theta])

    def crz(self, theta: float, ctrl: int, tgt: int) -> "QuantumCircuit":
        return self._add("CRZ", [ctrl, tgt], [theta])

    # ── Convenience: common multi-gate patterns ───────────────────────────

    def bell_state(self, q0: int = 0, q1: int = 1) -> "QuantumCircuit":
        """Prepare the Bell state |Φ+⟩ = (|00⟩ + |11⟩)/√2."""
        return self.h(q0).cnot(q0, q1)

    def ghz_state(self) -> "QuantumCircuit":
        """Prepare the GHZ state for all qubits."""
        self.h(0)
        for i in range(self.n_qubits - 1):
            self.cnot(i, i + 1)
        return self

    def qft(self, qubits: Optional[List[int]] = None) -> "QuantumCircuit":
        """Append the Quantum Fourier Transform over the specified qubits."""
        import math
        qs = qubits if qubits is not None else list(range(self.n_qubits))
        n = len(qs)
        for i in range(n):
            self.h(qs[i])
            for j in range(i + 1, n):
                angle = 2 * math.pi / (2 ** (j - i + 1))
                self.crz(angle, qs[j], qs[i])
        # Reverse qubit order (SWAP pairs)
        for i in range(n // 2):
            self.swap(qs[i], qs[n - 1 - i])
        return self

    # ── Execution ─────────────────────────────────────────────────────────

    def run(self, shots: int = 1024) -> SimulationResult:
        """
        Execute the circuit on a fresh QuantumStateVector.

        Args:
            shots: Number of measurement samples for histogram counts.

        Returns:
            SimulationResult with amplitudes, probabilities, counts, and metadata.
        """
        mem_report = check_memory(self.n_qubits)
        if not mem_report.is_safe:
            raise MemoryError(mem_report.warning)

        sv = QuantumStateVector(self.n_qubits)
        t0 = time.perf_counter()

        for op in self._ops:
            sv.apply_gate(op.gate, op.qubits, op.params)

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        # Collect probabilities (filter near-zero)
        probs_arr = sv.probabilities()
        probabilities = {
            f"|{i:0{self.n_qubits}b}>": round(float(p), 8)
            for i, p in enumerate(probs_arr)
            if p > 1e-9
        }

        # Phase information
        phases = [
            {
                "state":     f"|{i:0{self.n_qubits}b}>",
                "phase_rad": round(float(import_cmath().phase(sv._state[i])), 6),
                "phase_deg": round(float(import_cmath().phase(sv._state[i])) * 180 / 3.14159265, 4),
            }
            for i in range(sv.dim)
            if abs(sv._state[i]) > 1e-9
        ]

        return SimulationResult(
            n_qubits=self.n_qubits,
            gate_count=len(self._ops),
            elapsed_ms=elapsed_ms,
            amplitudes=sv.get_amplitudes(max_states=min(64, sv.dim)),
            probabilities=probabilities,
            counts=sv.measure_all(shots=shots),
            is_entangled=sv.is_entangled(),
            summary=sv.summary(),
            phases=phases,
            operations=[op.to_dict() for op in self._ops],
            memory_report={
                "n_qubits":     mem_report.n_qubits,
                "required_gb":  round(mem_report.required_gb, 4),
                "available_gb": round(mem_report.available_gb, 2),
                "is_safe":      mem_report.is_safe,
                "warning":      mem_report.warning,
            },
        )

    # ── Serialisation ─────────────────────────────────────────────────────

    def to_dict(self) -> Dict:
        return {
            "name":      self.name,
            "n_qubits":  self.n_qubits,
            "gate_count": len(self._ops),
            "operations": [op.to_dict() for op in self._ops],
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "QuantumCircuit":
        """Reconstruct a circuit from a serialised dict (e.g. from frontend)."""
        circuit = cls(n_qubits=data["n_qubits"], name=data.get("name", ""))
        for op in data.get("operations", []):
            circuit._add(op["gate"], op["qubits"], op.get("params", []))
        return circuit

    # ── Internals ─────────────────────────────────────────────────────────

    def _add(self, gate: str, qubits: List[int], params: List[float] = None) -> "QuantumCircuit":
        if len(self._ops) >= self.MAX_GATES:
            raise RuntimeError(
                f"Circuit exceeds maximum gate count of {self.MAX_GATES}. "
                "Increase QuantumCircuit.MAX_GATES if needed."
            )
        for q in qubits:
            if not (0 <= q < self.n_qubits):
                raise IndexError(
                    f"Qubit {q} out of range for {self.n_qubits}-qubit circuit."
                )
        self._ops.append(Operation(gate=gate, qubits=qubits, params=params or []))
        return self

    def __len__(self) -> int:
        return len(self._ops)

    def __repr__(self) -> str:
        return f"<QuantumCircuit name='{self.name}' qubits={self.n_qubits} gates={len(self._ops)}>"


# ── Utility ──────────────────────────────────────────────────────────────────

def import_cmath():
    import cmath
    return cmath


# ── Pre-built Circuit Factory ─────────────────────────────────────────────────

class CircuitLibrary:
    """
    Ready-made circuits used by the SFOD suite and educational simulator.
    """

    @staticmethod
    def bell_state(n_qubits: int = 2) -> QuantumCircuit:
        assert n_qubits >= 2
        return QuantumCircuit(n_qubits, "Bell State").bell_state(0, 1)

    @staticmethod
    def ghz_state(n_qubits: int = 3) -> QuantumCircuit:
        assert n_qubits >= 2
        return QuantumCircuit(n_qubits, f"GHZ-{n_qubits}").ghz_state()

    @staticmethod
    def grover_oracle_2qubit() -> QuantumCircuit:
        """
        2-qubit Grover search — marks target state |11⟩.
        Full circuit: H⊗2 → Oracle (CZ) → Diffuser.
        """
        circ = QuantumCircuit(2, "Grover-2q")
        # Superposition
        circ.h(0).h(1)
        # Oracle: flip phase of |11⟩
        circ.cz(0, 1)
        # Diffuser: 2|s⟩⟨s| - I
        circ.h(0).h(1)
        circ.x(0).x(1)
        circ.cz(0, 1)
        circ.x(0).x(1)
        circ.h(0).h(1)
        return circ

    @staticmethod
    def qft_circuit(n_qubits: int = 4) -> QuantumCircuit:
        circ = QuantumCircuit(n_qubits, f"QFT-{n_qubits}q")
        circ.qft()
        return circ

    @staticmethod
    def parametric_ansatz(n_qubits: int, layers: int = 2) -> QuantumCircuit:
        """
        Hardware-efficient ansatz for VQE / QAOA.
        Each layer: RY on every qubit → CNOT chain.
        """
        import math
        circ = QuantumCircuit(n_qubits, f"Ansatz-{n_qubits}q-{layers}L")
        for _ in range(layers):
            for q in range(n_qubits):
                circ.ry(math.pi / 4, q)
            for q in range(n_qubits - 1):
                circ.cnot(q, q + 1)
        return circ
