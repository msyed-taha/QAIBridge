"""
Neural Network Converter — the conversion rules, and the report the page shows.

    classical                         quantum (circuit.py)
    a Dense layer of u units      →   a block on qubits q0…q(u−1)
    neuron j: act(w_j · x + b_j)  →   qubit j turned by RY(w_j · x + b_j), then RZ(φ_j)
    the next layer mixes them     →   CNOTs q(u−1)→…→q0 pass each qubit's result down to q0
    Dropout                       →   nothing (no counterpart; the report says so)
    output neuron + sigmoid       →   measure q0: its chance of 1

The activation has no gate of its own: a qubit's chance of 1 follows a cosine
curve of its angle, which is the circuit's built-in non-linearity. The report
says that too, and that this converts the structure, not the exact function.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Union

from .architecture import ParsedArchitecture
from .circuit import classical_size, quantum_size


@dataclass
class QNNSpec:
    n_qubits: int
    blocks: List[int]                   # qubits used by each block, in order
    trainable: int                      # weights, biases and phases: 4 per qubit per block
    depth: int                          # gate steps, CNOTs one after another
    gates: Dict[str, int]


@dataclass
class ConversionReport:
    classical_layer_sizes: List[int]    # inputs, each Dense layer, output
    classical_params: int
    qnn: QNNSpec
    rows: List[Dict[str, Optional[Union[str, int]]]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


def convert_architecture(parsed: ParsedArchitecture) -> ConversionReport:
    layers = [{"type": l.type, "units": l.units, "activation": l.activation} for l in parsed.layers]
    units = [l.units for l in parsed.dense_layers]
    sizes = [parsed.input_dim, *units, parsed.output_dim]

    rows: List[Dict[str, Optional[Union[str, int]]]] = []
    inputs, block = parsed.input_dim, 0
    for layer in parsed.layers:
        if layer.type == "dropout":
            rows.append({"classical": "Dropout (switches off 20% of neurons while training)", "classical_params": 0,
                         "quantum": "Nothing: a circuit has no neurons to switch off, so it skips this layer",
                         "quantum_params": None})
            continue
        u = layer.units
        block += 1
        last = f"q{u - 1}"
        rows.append({
            "classical": f"Dense: {u} neuron{'s' if u > 1 else ''}, {layer.activation}",
            "classical_params": u * (inputs + 1),
            "quantum": f"Block {block}: qubit q0, turned by RY(w·x + b) and RZ(φ)" if u == 1 else
                       f"Block {block}: qubits q0–{last}, each turned by RY(w·x + b) and RZ(φ), "
                       f"then {u - 1} CNOT{'s' if u > 2 else ''} into q0",
            "quantum_params": 4 * u,
        })
        inputs = u
    rows.append({"classical": "Output: 1 neuron, sigmoid", "classical_params": inputs + 1,
                 "quantum": "Measure q0: its chance of 1 is the chance of class 1", "quantum_params": 0})

    notes = [
        "Each neuron becomes one qubit, and its weights and bias become the angle that turns it: "
        "the qubit's RY(w·x + b) uses the neuron's own w·x + b.",
        "A classical neuron is fed numbers, but a qubit can only be turned, so every block reads the two inputs again "
        "(this is called data re-uploading). The qubits carry their state forward from block to block.",
    ]
    activations = sorted({l.activation for l in parsed.dense_layers if l.activation})
    notes.append(
        f"The activation ({', '.join(activations)}) has no gate of its own. A qubit's chance of 1 follows a cosine curve "
        "of its angle, and that curve is the circuit's built-in activation, so relu, tanh and sigmoid all become the same gates."
    )
    notes.append(
        "This converts the network's structure, not exactly what it computes: the two networks can learn different "
        "functions, which is why the page trains both and compares them."
    )
    notes.extend(parsed.warnings)

    return ConversionReport(
        classical_layer_sizes=sizes,
        classical_params=classical_size(layers),
        qnn=QNNSpec(
            n_qubits=max(units),
            blocks=units,
            trainable=quantum_size(units),
            depth=sum(u + 1 for u in units),
            gates={"RY": sum(units), "RZ": sum(units), "CNOT": sum(u - 1 for u in units)},
        ),
        rows=rows,
        notes=notes,
    )
