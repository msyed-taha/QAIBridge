"""
Module 7 - Classical to Quantum Neural Network (QNN) Converter
converter.py - Mapping Engine: rule-based mapping from a *parsed* classical
MLP architecture (architecture.py) to an equivalent quantum variational
circuit spec, plus structural comparison metrics.

Mapping rules (see architecture.py for the Parser stage that runs first):
  * Input features -> one qubit each, angle-encoded via RX(x_i). Qubits are
    fixed at the feature count and REUSED across every block -- unlike a
    classical layer, a variational circuit doesn't grow a qubit per hidden
    unit, so "neurons per layer" has no 1:1 quantum counterpart. This is
    the single most important thing to get right in an FYP viva: the
    mapping is structural (same number of *transformation stages*), not a
    literal neuron-for-qubit substitution.
  * Each classical Dense layer -> one variational block: RY(theta)+RZ(phi)
    on every qubit (the trainable transformation, playing the role of that
    layer's weights) followed by a CNOT entangling chain (there is no
    classical analogue of entanglement -- it's what lets the circuit
    represent correlations between features that a single qubit alone
    could not, loosely analogous to why a Dense layer mixes all its
    inputs rather than treating them independently).
  * Dropout layers contribute no block (see architecture.py) -- this is
    recorded as a warning, not silently dropped.
  * Final layer -> Z-expectation of qubit 0, mapped through (<Z>+1)/2 into
    a class probability -- the quantum analogue of an output neuron+sigmoid.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Dict, List, Union

from .architecture import ParsedArchitecture


@dataclass
class QNNSpec:
    n_qubits:          int
    n_layers:           int
    trainable_angles:   int
    circuit_depth:       int
    encoding:            str
    gate_sequence:        List[str] = field(default_factory=list)  # e.g. ["RX x2", "RY x4", "RZ x4", "CNOT x2"]


@dataclass
class ConversionReport:
    classical_layer_sizes: List[int]
    classical_neurons:      int
    classical_params:       int
    classical_depth:        int
    qnn:                     QNNSpec
    mapping_steps:            List[str]
    comparison_rows:           List[Dict[str, Union[str, int]]] = field(default_factory=list)
    approximation_notes:        List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


def _classical_param_count(layer_sizes: List[int]) -> int:
    total = 0
    for a, b in zip(layer_sizes[:-1], layer_sizes[1:]):
        total += a * b + b  # weights + biases
    return total


def convert_architecture(parsed: ParsedArchitecture) -> ConversionReport:
    n_qubits = parsed.input_dim  # one qubit per input feature (angle-encoding register)
    n_hidden_layers = len(parsed.dense_layers)

    layer_sizes = [parsed.input_dim, *(l.units for l in parsed.dense_layers), parsed.output_dim]
    trainable_angles = n_qubits * n_hidden_layers * 2  # theta (RY) + phi (RZ) per qubit per layer
    circuit_depth = 1 + n_hidden_layers * 2            # 1 encoding round + (rotation + entangle) per layer
    n_entangling_gates = n_hidden_layers * max(n_qubits - 1, 0)

    gate_sequence = [f"RX x{n_qubits}"]
    if n_hidden_layers:
        gate_sequence += [
            f"RY x{n_qubits * n_hidden_layers}",
            f"RZ x{n_qubits * n_hidden_layers}",
            f"CNOT x{n_entangling_gates}",
        ]

    classical_neurons = sum(layer_sizes)
    classical_params = _classical_param_count(layer_sizes)
    classical_depth = len(layer_sizes) - 1
    activations_used = sorted({l.activation for l in parsed.dense_layers if l.activation})

    mapping_steps = [
        f"Scale the {parsed.input_dim} classical input feature(s) into [0, π] (MinMaxScaler) "
        f"so they're ready for angle-encoding.",
        f"Encode each feature onto its own qubit via an RX(x_i) rotation — {n_qubits} qubit(s) total.",
        f"Map each of the {n_hidden_layers} classical Dense layer(s) to one variational block: "
        f"RY(θ)+RZ(φ) on every qubit, followed by a CNOT entangling chain. Qubits are reused across "
        f"blocks the same way neurons are reused across a forward pass — not one qubit per hidden unit.",
        "Read out the final layer as the Z-expectation of qubit 0, mapped through (⟨Z⟩+1)/2 into a "
        "class probability — the quantum analogue of a classical output neuron + sigmoid.",
    ]

    approximation_notes = [
        "This is a structural mapping (same number of transformation stages), not a claim of "
        "mathematical equivalence — a variational circuit's expressible function class is not "
        "identical to an MLP's.",
    ]
    approximation_notes.extend(parsed.warnings)

    comparison_rows: List[Dict[str, Union[str, int]]] = [
        {"metric": "Neurons / Qubits",        "classical": classical_neurons,      "quantum": n_qubits},
        {"metric": "Trainable parameters",    "classical": classical_params,       "quantum": trainable_angles},
        {"metric": "Layers / Blocks",         "classical": len(layer_sizes) - 1,   "quantum": n_hidden_layers},
        {"metric": "Network / Circuit depth", "classical": classical_depth,        "quantum": circuit_depth},
        {"metric": "Activation",              "classical": ", ".join(activations_used) or "n/a",
                                                "quantum": "n/a (fixed RY/RZ rotation, not a pointwise nonlinearity)"},
        {"metric": "Gates",                   "classical": "n/a", "quantum": ", ".join(gate_sequence)},
        {"metric": "Encoding",                "classical": "n/a", "quantum": "Angle encoding (RX)"},
        {"metric": "Measurement",             "classical": "n/a (raw output activation)",
                                                "quantum": "⟨Z⟩ on qubit 0 → class probability"},
        {"metric": "Entanglement",            "classical": "n/a", "quantum": f"CNOT chain ({n_entangling_gates} gate(s))"},
    ]

    return ConversionReport(
        classical_layer_sizes=layer_sizes,
        classical_neurons=classical_neurons,
        classical_params=classical_params,
        classical_depth=classical_depth,
        qnn=QNNSpec(
            n_qubits=n_qubits,
            n_layers=n_hidden_layers,
            trainable_angles=trainable_angles,
            circuit_depth=circuit_depth,
            encoding="Angle encoding (RX) + RY/RZ variational blocks + CNOT chain",
            gate_sequence=gate_sequence,
        ),
        mapping_steps=mapping_steps,
        comparison_rows=comparison_rows,
        approximation_notes=approximation_notes,
    )
