"""Module 7 - Classical to Quantum Neural Network (QNN) Converter."""
from .architecture import (
    ArchitectureError, LayerSpec, ParsedArchitecture, parse_architecture,
    MAX_LAYERS, SUPPORTED_LAYER_TYPES, SUPPORTED_ACTIVATIONS,
)
from .converter import ConversionReport, QNNSpec, convert_architecture
from .classical_nn import build_mlp, train_classical_mlp
from .parameter_mapping import map_classical_weights_to_angles
from .qnn_trainer import run_qnn_forward, train_qnn, train_qnn_warm_started

__all__ = [
    "ArchitectureError", "LayerSpec", "ParsedArchitecture", "parse_architecture",
    "MAX_LAYERS", "SUPPORTED_LAYER_TYPES", "SUPPORTED_ACTIVATIONS",
    "ConversionReport", "QNNSpec", "convert_architecture",
    "build_mlp", "train_classical_mlp",
    "map_classical_weights_to_angles",
    "run_qnn_forward", "train_qnn", "train_qnn_warm_started",
]
