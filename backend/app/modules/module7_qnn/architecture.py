"""
Module 7 - QNN Converter
architecture.py - Architecture Parser: validates a user-described classical
network *before* anything is mapped to quantum. This is the "Parser" stage
of the module's data flow:

    Classical Model -> Parser -> Feature Representation -> Mapping Engine
    -> QNN Generator -> Quantum Circuit -> Simulator -> Measurement
    -> Classical Output

Scope is deliberately small: two layer types are recognised (Dense,
Dropout), matching an FYP-practical activation set (ReLU / Tanh / Sigmoid).
Softmax is recognised by name but explicitly rejected with an explanation
rather than silently mapped to something else -- and anything outside this
set (Conv2D, LSTM, attention, ...) is rejected with a clear message, per
the module's "do not claim every classical network converts" requirement
(§4 of the spec). Dropout is recognised-but-not-mapped: it's a
training-time regulariser with no gate-level analogue, so it's kept in the
parsed architecture for bookkeeping but skipped when the Mapping Engine
builds the quantum circuit, and that skip is surfaced as a warning rather
than happening silently.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

SUPPORTED_LAYER_TYPES = {"dense", "dropout"}
SUPPORTED_ACTIVATIONS = {"relu", "tanh", "sigmoid"}
UNSUPPORTED_ACTIVATIONS_WITH_REASON = {
    "softmax": (
        "Softmax implies a multi-class readout, but this module's quantum "
        "readout is a single Z-expectation mapped to one probability "
        "(binary classification only). Use 'sigmoid', or express the "
        "problem as binary."
    ),
}
MIN_UNITS, MAX_UNITS = 1, 16
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
        raise ArchitectureError("At least one layer is required (nothing between input and output).")
    if len(raw_layers) > MAX_LAYERS:
        raise ArchitectureError(f"At most {MAX_LAYERS} layers are supported in this FYP-scope build.")
    if output_dim != 1:
        raise ArchitectureError(
            "Only single-output (binary classification) networks are supported: the quantum "
            "readout is one Z-expectation. Multi-class output (output_dim > 1) is not implemented."
        )

    layers: List[LayerSpec] = []
    warnings: List[str] = []

    for i, raw in enumerate(raw_layers):
        layer_type = str(raw.get("type", "dense")).lower()
        if layer_type not in SUPPORTED_LAYER_TYPES:
            raise ArchitectureError(
                f"Layer {i}: unsupported layer type '{layer_type}'. Supported: {sorted(SUPPORTED_LAYER_TYPES)}. "
                "Convolutional / recurrent / attention layers have no direct gate-level analogue in "
                "this module and are not approximated -- remove them or express the network with "
                "Dense layers only."
            )

        if layer_type == "dropout":
            layers.append(LayerSpec(type="dropout"))
            warnings.append(
                f"Layer {i}: Dropout is a training-time regulariser with no quantum-circuit "
                "equivalent (a variational circuit has no 'units' to randomly drop). It is kept in "
                "the parsed architecture for bookkeeping but skipped when generating the quantum circuit."
            )
            continue

        units = raw.get("units")
        if not isinstance(units, int) or isinstance(units, bool) or not (MIN_UNITS <= units <= MAX_UNITS):
            raise ArchitectureError(f"Layer {i}: 'units' must be an integer in [{MIN_UNITS}, {MAX_UNITS}].")

        activation = str(raw.get("activation", "relu")).lower()
        if activation in UNSUPPORTED_ACTIVATIONS_WITH_REASON:
            raise ArchitectureError(f"Layer {i}: {UNSUPPORTED_ACTIVATIONS_WITH_REASON[activation]}")
        if activation not in SUPPORTED_ACTIVATIONS:
            raise ArchitectureError(
                f"Layer {i}: unsupported activation '{activation}'. Supported: {sorted(SUPPORTED_ACTIVATIONS)}."
            )

        layers.append(LayerSpec(type="dense", units=units, activation=activation))

    dense_layers = [l for l in layers if l.type == "dense"]
    if not dense_layers:
        raise ArchitectureError("At least one Dense layer is required -- Dropout alone has nothing to map.")

    return ParsedArchitecture(
        input_dim=input_dim, output_dim=output_dim,
        layers=layers, dense_layers=dense_layers, warnings=warnings,
    )
