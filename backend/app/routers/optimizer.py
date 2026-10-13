"""
Neural Optimizer
Routes (signed-in users):
  POST /api/module6/plateau-study  – how gradient size changes with circuit size, from random and near-zero starts
  POST /api/module6/race           – train one quantum classifier four ways, fairly, over several seeds
  POST /api/module6/qaoa-angles    – a neural network that predicts QAOA angles (γ, β) from a graph, compared
                                     with the full optimiser and with simple starts on the same budget
"""
from __future__ import annotations

from typing import Any, Dict, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module6_optimizer import trainer
from ..modules.module6_optimizer.qaoa_angles import train_and_evaluate
from .auth import get_current_user

router = APIRouter(prefix="/api/module6", tags=["Neural Optimizer"], dependencies=[Depends(get_current_user)])


def _heavy(work):
    try:
        with simulation_slot():
            return work()
    except MemoryError as e:
        raise HTTPException(503, str(e))


@router.post("/plateau-study")
def plateau_study() -> Dict[str, Any]:
    """Gradient size vs number of qubits. Also starts preparing the race presets in the background."""
    trainer.warm_up()
    return _heavy(trainer.plateau_study)


class RaceRequest(BaseModel):
    n_qubits: int = Field(3, ge=2, le=10)
    layers:   int = Field(2, ge=1, le=20)
    shots:    Literal[0, 100, 1000] = trainer.DEFAULT_SHOTS     # 0: exact gradients, as a perfect simulator gives


@router.post("/race")
def race(req: RaceRequest) -> Dict[str, Any]:
    return _heavy(lambda: trainer.race(req.n_qubits, req.layers, req.shots))


class QaoaAnglesRequest(BaseModel):
    train_graphs: int = Field(default=40, ge=10, le=120, description="Random graphs used to train the predictor")
    test_graphs:  int = Field(default=10, ge=3, le=30, description="Unseen graphs used for the comparison")
    layers:       int = Field(default=2, ge=1, le=3, description="QAOA depth p (2p angles)")
    seed:         int = Field(default=11)


@router.post("/qaoa-angles")
def qaoa_angles(req: QaoaAnglesRequest) -> Dict[str, Any]:
    """
    Neural QAOA angle predictor: learns graph → (γ, β) from optimised training
    graphs, then compares cold-start optimisation with a neural warm start on
    unseen graphs (circuit evaluations needed and approximation ratio reached).
    """
    return _heavy(lambda: train_and_evaluate(req.train_graphs, req.test_graphs, req.layers, req.seed))
