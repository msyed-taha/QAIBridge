"""
Neural Network Converter — reads the described classical network and checks it
before anything is converted.

Two layer types: Dense (1 to 8 neurons, relu, tanh or sigmoid) and Dropout. Each
neuron becomes one qubit, so 8 neurons is the widest layer (8 qubits). Softmax
is turned away with the reason (the quantum read-out is one chance, so the
network must answer yes or no), and so is any other layer type, rather than
being converted into something it isn't. Dropout is kept for the classical
network but has nothing to become in the circuit, and the report says so.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

SUPPORTED_LAYER_TYPES = {"dense", "dropout"}
SUPPORTED_ACTIVATIONS = {"relu", "tanh", "sigmoid"}
UNSUPPORTED_ACTIVATIONS_WITH_REASON = {
    "softmax": (
        "Softmax picks between many classes, but the quantum network answers with one "
        "chance (class 1 or not). Use relu, tanh or sigmoid."
    ),
}
MIN_UNITS, MAX_UNITS = 1, 8          # one qubit per unit
MAX_LAYERS = 4


class ArchitectureError(ValueError):
    """Raised when a described classical architecture cannot be parsed or mapped."""


@dataclass
class LayerSpec:
    type: str                          # "dense" | "dropout"
    units: Optional[int] = None        # required for dense, unused for dropout
    activation: Optional[str] = None   # required for dense, unused for dropout


@dataclass
class ParsedArchitecture:
    input_dim: int
    output_dim: int
    layers: List[LayerSpec]
    dense_layers: List[LayerSpec]      # the subset actually mapped to quantum blocks
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "input_dim": self.input_dim,
            "output_dim": self.output_dim,
            "layers": [{"type": l.type, "units": l.units, "activation": l.activation} for l in self.layers],
            "dense_layer_count": len(self.dense_layers),
            "warnings": self.warnings,
        }


def parse_architecture(raw_layers: List[Dict], input_dim: int, output_dim: int = 1) -> ParsedArchitecture:
    if not raw_layers:
        raise ArchitectureError("Add at least one layer between the input and the output.")
    if len(raw_layers) > MAX_LAYERS:
        raise ArchitectureError(f"A network can have at most {MAX_LAYERS} layers here.")
    if output_dim != 1:
        raise ArchitectureError(
            "The network must have one output (class 1 or not): the quantum network answers with one chance."
        )

    layers: List[LayerSpec] = []
    warnings: List[str] = []

    for i, raw in enumerate(raw_layers):
        layer_type = str(raw.get("type", "dense")).lower()
        if layer_type not in SUPPORTED_LAYER_TYPES:
            raise ArchitectureError(
                f"Layer {i + 1}: '{layer_type}' layers can't be converted. Use Dense and Dropout layers: "
                "convolution, recurrent and attention layers have no counterpart in this circuit, and "
                "they aren't approximated."
            )

        if layer_type == "dropout":
            layers.append(LayerSpec(type="dropout"))
            warnings.append(
                f"Layer {i + 1} (Dropout) has nothing to become in the circuit: it switches off random "
                "neurons while the classical network trains, and a circuit has no neurons to switch off. "
                "The classical network keeps it; the circuit skips it."
            )
            continue

        units = raw.get("units")
        if not isinstance(units, int) or isinstance(units, bool) or not (MIN_UNITS <= units <= MAX_UNITS):
            raise ArchitectureError(f"Layer {i + 1}: the number of neurons must be a whole number from {MIN_UNITS} to {MAX_UNITS} (one qubit each).")

        activation = str(raw.get("activation", "relu")).lower()
        if activation in UNSUPPORTED_ACTIVATIONS_WITH_REASON:
            raise ArchitectureError(f"Layer {i + 1}: {UNSUPPORTED_ACTIVATIONS_WITH_REASON[activation]}")
        if activation not in SUPPORTED_ACTIVATIONS:
            raise ArchitectureError(f"Layer {i + 1}: the activation '{activation}' isn't available. Use relu, tanh or sigmoid.")

        layers.append(LayerSpec(type="dense", units=units, activation=activation))

    dense_layers = [l for l in layers if l.type == "dense"]
    if not dense_layers:
        raise ArchitectureError("Add at least one Dense layer: Dropout on its own has nothing to convert.")

    return ParsedArchitecture(
        input_dim=input_dim, output_dim=output_dim,
        layers=layers, dense_layers=dense_layers, warnings=warnings,
    )
