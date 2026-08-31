"""Module 6 - Neural Angle Optimizer."""
from .dataset import get_toy_classification_dataset, FEATURE_DIM
from .quantum_layer import QuantumClassifierLoss, predict_z, predict_proba, bce_loss, param_shift_grad_single
from .angle_net import AngleNet
from .barren_monitor import BarrenPlateauMonitor, PlateauEvent
from .trainer import (
    OptimizationReport, run_full_report,
    train_classical_baseline, train_neural_optimizer, measure_barren_plateau,
)

__all__ = [
    "get_toy_classification_dataset", "FEATURE_DIM",
    "QuantumClassifierLoss", "predict_z", "predict_proba", "bce_loss", "param_shift_grad_single",
    "AngleNet",
    "BarrenPlateauMonitor", "PlateauEvent",
    "OptimizationReport", "run_full_report",
    "train_classical_baseline", "train_neural_optimizer", "measure_barren_plateau",
]
