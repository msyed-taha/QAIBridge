"""Neural Network Converter: a classical network, the quantum network it becomes, and a fair comparison of the two."""
from .architecture import (
    ArchitectureError, LayerSpec, ParsedArchitecture, parse_architecture,
    MAX_LAYERS, MAX_UNITS, SUPPORTED_LAYER_TYPES, SUPPORTED_ACTIVATIONS,
)
from .converter import ConversionReport, QNNSpec, convert_architecture
from .data import DATASETS, dataset, points
from .parameter_mapping import warm_start
from .trainer import METHODS, compare, untrained

__all__ = [
    "ArchitectureError", "LayerSpec", "ParsedArchitecture", "parse_architecture",
    "MAX_LAYERS", "MAX_UNITS", "SUPPORTED_LAYER_TYPES", "SUPPORTED_ACTIVATIONS",
    "ConversionReport", "QNNSpec", "convert_architecture",
    "DATASETS", "dataset", "points",
    "warm_start",
    "METHODS", "compare", "untrained",
]
