"""
Module 1 – Custom Simulation Kernel
state_vector.py  –  Core quantum state-vector engine

Design principles
─────────────────
• Uses NumPy complex128 arrays for state storage.
• Gate application uses tensor-product reshaping (no explicit kron for
  large circuits) — O(2^n) memory and O(2^n) time per gate.
• Two-qubit gates are applied via einsum over the reshaped tensor, giving
  efficient operation without building the full 2^n × 2^n unitary.
• All public methods validate inputs and raise informative exceptions.
"""

from __future__ import annotations

import time
import numpy as np
from typing import Dict, List, Tuple, Optional, Callable, Any

from .gates import get_gate_matrix, SINGLE_QUBIT_GATES, TWO_QUBIT_GATES
from .memory_manager import check_memory


class QuantumStateVector:
    """
    Proprietary state-vector simulator for n_qubits (1 – 20).

    The quantum state is stored as a flat 1-D complex128 NumPy array of
    length 2^n.  Qubit ordering follows the big-endian convention:
    qubit 0 is the most-significant bit.

        |ψ⟩ = Σ_k  amplitude[k]  |k⟩
        where k is read as  q0 q1 q2 … q_{n-1}  in binary.
    """

    def __init__(self, n_qubits: int):
        report = check_memory(n_qubits)
        if not report.is_safe:
            raise MemoryError(report.warning)

        self.n_qubits = n_qubits
        self.dim = 2 ** n_qubits
        self._state: np.ndarray = self._zero_state()
        self._gate_count: int = 0
        self._elapsed_ms: float = 0.0

    # ──────────────────────────────────────────────────────────────────────
    # Initializers
    # ──────────────────────────────────────────────────────────────────────

    def _zero_state(self) -> np.ndarray:
        """Return |00…0⟩ state vector."""
        sv = np.zeros(self.dim, dtype=complex)
        sv[0] = 1.0
        return sv

    def reset(self) -> None:
        """Reset to |00…0⟩."""
        self._state = self._zero_state()
        self._gate_count = 0

    def set_state(self, amplitudes: List[complex]) -> None:
        """
        Manually set the state vector.  Must have exactly 2^n elements
        and be normalised to unit norm.
        """
        if len(amplitudes) != self.dim:
            raise ValueError(
                f"Expected {self.dim} amplitudes for {self.n_qubits} qubits, "
                f"got {len(amplitudes)}."
            )
        sv = np.array(amplitudes, dtype=complex)
        norm = np.linalg.norm(sv)
        if not np.isclose(norm, 1.0, atol=1e-6):
            raise ValueError(f"State vector must be normalised (norm={norm:.6f}).")
        self._state = sv

    # ──────────────────────────────────────────────────────────────────────
    # Core Gate Application (tensor-reshape method)
    # ──────────────────────────────────────────────────────────────────────

    def _apply_single(self, gate: np.ndarray, qubit: int) -> None:
        """
        Apply a 2×2 unitary to a single qubit.

        Reshape the flat state into a tensor of shape (2, 2, …, 2) — one
        axis per qubit.  Contract the gate over the target axis, then
        flatten back.
        """
        self._validate_qubit(qubit)
        tensor = self._state.reshape([2] * self.n_qubits)
        # Contract: new[i, …, j_out, …, k] = Σ_{j_in} gate[j_out, j_in] * tensor[i, …, j_in, …, k]
        tensor = np.tensordot(gate, tensor, axes=([1], [qubit]))
        # tensordot puts the contracted axis first → move it back to `qubit`
        tensor = np.moveaxis(tensor, 0, qubit)
        self._state = tensor.reshape(self.dim)
        self._gate_count += 1

    def _apply_two(self, gate: np.ndarray, qubit1: int, qubit2: int) -> None:
        """
        Apply a 4×4 unitary to two qubits (qubit1 = control / first operand).

        Strategy: reshape state tensor, move the two target axes to positions
        0 and 1, reshape to (4, rest), matrix-multiply, reshape back.
        """
        self._validate_qubit(qubit1)
        self._validate_qubit(qubit2)
        if qubit1 == qubit2:
            raise ValueError("qubit1 and qubit2 must be different.")

        n = self.n_qubits
        tensor = self._state.reshape([2] * n)

        # Move target qubits to front: axes [qubit1, qubit2] → [0, 1]
        other_axes = [i for i in range(n) if i not in (qubit1, qubit2)]
        perm = [qubit1, qubit2] + other_axes
        tensor = np.transpose(tensor, perm)                   # (2, 2, 2, …)
        rest_shape = tensor.shape[2:]
        rest_size = int(np.prod(rest_shape)) if rest_shape else 1
        matrix = tensor.reshape(4, rest_size)                 # (4, rest)

        # Apply the 4×4 gate
        matrix = gate @ matrix                                # (4, rest)

        # Restore original axis order
        tensor = matrix.reshape((2, 2) + rest_shape)
        inv_perm = [0] * n
        for new_idx, old_idx in enumerate(perm):
            inv_perm[old_idx] = new_idx
        tensor = np.transpose(tensor, inv_perm)

        self._state = tensor.reshape(self.dim)
        self._gate_count += 1

    # ──────────────────────────────────────────────────────────────────────
    # Public Gate Interface
    # ──────────────────────────────────────────────────────────────────────

    def apply_gate(self, name: str, qubits: List[int], params: List[float] = None) -> None:
        """
        Universal gate application entry-point.

        Args:
            name:   Gate name string (case-insensitive), e.g. "H", "CNOT", "RX".
            qubits: List of target qubits.  Length must match gate type.
            params: Optional rotation angles / phase parameters in radians.
        """
        params = params or []
        matrix = get_gate_matrix(name, params)

        if matrix.shape == (2, 2):
            if len(qubits) != 1:
                raise ValueError(f"Single-qubit gate '{name}' expects exactly 1 qubit.")
            self._apply_single(matrix, qubits[0])
        elif matrix.shape == (4, 4):
            if len(qubits) != 2:
                raise ValueError(f"Two-qubit gate '{name}' expects exactly 2 qubits.")
            self._apply_two(matrix, qubits[0], qubits[1])
        else:
            raise ValueError(f"Unsupported gate matrix shape: {matrix.shape}")

    # Convenience wrappers
    def h(self, qubit: int) -> None:            self.apply_gate("H",    [qubit])
    def x(self, qubit: int) -> None:            self.apply_gate("X",    [qubit])
    def y(self, qubit: int) -> None:            self.apply_gate("Y",    [qubit])
    def z(self, qubit: int) -> None:            self.apply_gate("Z",    [qubit])
    def s(self, qubit: int) -> None:            self.apply_gate("S",    [qubit])
    def t(self, qubit: int) -> None:            self.apply_gate("T",    [qubit])
    def rx(self, theta: float, qubit: int) -> None: self.apply_gate("RX", [qubit], [theta])
    def ry(self, theta: float, qubit: int) -> None: self.apply_gate("RY", [qubit], [theta])
    def rz(self, theta: float, qubit: int) -> None: self.apply_gate("RZ", [qubit], [theta])
    def cnot(self, ctrl: int, tgt: int) -> None: self.apply_gate("CNOT", [ctrl, tgt])
    def cz(self, ctrl: int, tgt: int) -> None:   self.apply_gate("CZ",   [ctrl, tgt])
    def swap(self, q1: int, q2: int) -> None:    self.apply_gate("SWAP", [q1, q2])

    # ──────────────────────────────────────────────────────────────────────
    # Measurement
    # ──────────────────────────────────────────────────────────────────────

    def probabilities(self) -> np.ndarray:
        """Return probability of each basis state (array of length 2^n)."""
        return np.abs(self._state) ** 2

    def measure_all(self, shots: int = 1024) -> Dict[str, int]:
        """
        Sample the probability distribution `shots` times.

        Returns a dict mapping basis state strings to counts,
        e.g. {'|000>': 512, '|111>': 512}.
        """
        probs = self.probabilities()
        indices = np.random.choice(self.dim, size=shots, p=probs)
        counts: Dict[str, int] = {}
        for idx in indices:
            key = f"|{idx:0{self.n_qubits}b}>"
            counts[key] = counts.get(key, 0) + 1
        return dict(sorted(counts.items()))

    def measure_qubit(self, qubit: int, collapse: bool = True) -> Tuple[int, float]:
        """
        Measure a single qubit.  Returns (outcome, probability).

        If collapse=True, the state vector is projected onto the measurement
        outcome and renormalised (simulates wavefunction collapse).
        """
        self._validate_qubit(qubit)
        n = self.n_qubits
        tensor = self._state.reshape([2] * n)

        # Sum probabilities over all basis states where this qubit = 1
        prob_1 = float(
            np.sum(np.abs(np.take(tensor, 1, axis=qubit)) ** 2)
        )
        prob_0 = 1.0 - prob_1
        outcome = int(np.random.choice([0, 1], p=[prob_0, prob_1]))

        if collapse:
            # Zero out amplitudes inconsistent with measurement outcome
            mask = np.take(tensor, outcome, axis=qubit)  # slice with qubit=outcome
            # Zero the OTHER slice
            tensor_collapsed = np.zeros_like(tensor)
            slices_out = [slice(None)] * n
            slices_out[qubit] = outcome
            tensor_collapsed[tuple(slices_out)] = mask
            # Renormalise
            norm = np.linalg.norm(tensor_collapsed)
            if norm > 1e-12:
                tensor_collapsed /= norm
            self._state = tensor_collapsed.reshape(self.dim)

        return outcome, prob_1 if outcome == 1 else prob_0

    # ──────────────────────────────────────────────────────────────────────
    # Diagnostics & Visualisation Helpers
    # ──────────────────────────────────────────────────────────────────────

    def get_amplitudes(self, max_states: int = 64) -> List[Dict]:
        """
        Return amplitude data for frontend visualisation.

        Limits output to `max_states` basis states (sorted by probability).
        """
        probs = self.probabilities()
        top_indices = np.argsort(probs)[::-1][:max_states]

        result = []
        for idx in sorted(top_indices):
            amp = self._state[idx]
            result.append({
                "state":       f"|{idx:0{self.n_qubits}b}>",
                "index":       int(idx),
                "real":        round(float(amp.real), 8),
                "imag":        round(float(amp.imag), 8),
                "probability": round(float(probs[idx]), 8),
                "magnitude":   round(float(np.abs(amp)), 8),
                "phase_deg":   round(float(np.degrees(np.angle(amp))), 4),
            })
        return result

    def is_entangled(self) -> bool:
        """
        Heuristic entanglement check using Schmidt decomposition across the
        first bipartition (qubit 0 vs. rest).

        Returns True if Schmidt rank > 1 (state is non-separable).
        """
        if self.n_qubits < 2:
            return False
        # Bipartite reshape: (2, 2^{n-1})
        matrix = self._state.reshape(2, 2 ** (self.n_qubits - 1))
        singular_values = np.linalg.svd(matrix, compute_uv=False)
        return int(np.sum(singular_values > 1e-9)) > 1

    def is_superposition(self, qubit: int = 0) -> bool:
        """
        Returns True if the given qubit is in superposition
        (probability of |0> is not 0 or 1).
        """
        probs = self.probabilities()
        prob_1 = float(
            np.sum(probs[i] for i in range(self.dim) if (i >> (self.n_qubits - 1 - qubit)) & 1)
        )
        return not (np.isclose(prob_1, 0.0, atol=1e-9) or np.isclose(prob_1, 1.0, atol=1e-9))

    def fidelity(self, other: "QuantumStateVector") -> float:
        """Compute |⟨ψ|φ⟩|² between this state and another."""
        if self.dim != other.dim:
            raise ValueError("State vectors have different dimensions.")
        return float(np.abs(np.dot(np.conj(self._state), other._state)) ** 2)

    def summary(self) -> Dict:
        """Return a JSON-serialisable summary of the current state."""
        probs = self.probabilities()
        return {
            "n_qubits":    self.n_qubits,
            "dim":         self.dim,
            "gate_count":  self._gate_count,
            "norm":        round(float(np.sum(probs)), 10),
            "is_entangled": self.is_entangled(),
            "max_prob_state": f"|{int(np.argmax(probs)):0{self.n_qubits}b}>",
            "max_prob":    round(float(np.max(probs)), 8),
        }

    # ──────────────────────────────────────────────────────────────────────
    # Internals
    # ──────────────────────────────────────────────────────────────────────

    def _validate_qubit(self, qubit: int) -> None:
        if not (0 <= qubit < self.n_qubits):
            raise IndexError(
                f"Qubit index {qubit} out of range for {self.n_qubits}-qubit system "
                f"(valid: 0–{self.n_qubits - 1})."
            )

    @property
    def state(self) -> np.ndarray:
        return self._state.copy()
