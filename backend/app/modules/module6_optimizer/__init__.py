"""Neural Optimizer: barren plateaus, a fair training race, and a neural QAOA angle predictor."""
from .angle_net import AngleNet
from .barren_monitor import PlateauMonitor, PlateauEvent
from .trainer import METHODS, plateau_study, race

__all__ = ["AngleNet", "PlateauMonitor", "PlateauEvent", "METHODS", "plateau_study", "race"]
