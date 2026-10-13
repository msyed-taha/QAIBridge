"""Neural Optimizer: barren plateaus, a fair training race, and a neural QAOA angle predictor."""
from .dataset import get_toy_classification_dataset, FEATURE_DIM
from .quantum_layer import QuantumClassifierLoss, predict_z, predict_proba, bce_loss, param_shift_grad_single
from .angle_net import AngleNet
from .barren_monitor import PlateauMonitor, PlateauEvent
from .trainer import METHODS, plateau_study, race

__all__ = [
    # used by the Neural Network Converter
    "get_toy_classification_dataset", "FEATURE_DIM",
    "QuantumClassifierLoss", "predict_z", "predict_proba", "bce_loss", "param_shift_grad_single",
    "AngleNet",
    # the Neural Optimizer
    "PlateauMonitor", "PlateauEvent", "METHODS", "plateau_study", "race",
]
