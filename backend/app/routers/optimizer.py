"""
Module 6 – Neural Angle Optimizer  (FastAPI Router)
Routes:
  GET  /api/module6/status  – Module status
  POST /api/module6/train   – Train a variational classifier two ways
                               (classical raw-angle gradient descent vs a
                               PyTorch AngleNet hypernetwork) and return
                               loss curves, accuracy, convergence speed, and
                               a barren-plateau gradient-variance study.
  POST /api/module6/qaoa-angles – Train a neural network that predicts QAOA
                               angles (γ, β) from graph features and compare
                               cold-start vs neural warm-start optimisation
                               on unseen Max-Cut graphs.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module6_optimizer import run_full_report
from ..modules.module6_optimizer.qaoa_angles import train_and_evaluate

router = APIRouter(prefix="/api/module6", tags=["Module 6 – Neural Angle Optimizer"])


@router.get("/status")
async def status():
    return {"module": 6, "name": "Neural Angle Optimizer", "status": "active"}


class TrainRequest(BaseModel):
    n_qubits:   int = Field(default=3, ge=2, le=4, description="Qubits in the variational classifier")
    layers:     int = Field(default=2, ge=1, le=3, description="Rotation+entangle blocks")
    iterations: int = Field(default=30, ge=10, le=100, description="Gradient-descent steps per method")


@router.post("/train")
def train(req: TrainRequest):
    """
    Run both training methods on the shared toy classification dataset and
    return a full comparison report (loss curves, accuracy, iterations-to-
    converge, and the barren-plateau gradient-variance study).
    """
    report = run_full_report(req.n_qubits, req.layers, req.iterations)
    return report.to_dict()


class QaoaAnglesRequest(BaseModel):
    train_graphs: int = Field(default=40, ge=10, le=120, description="Random graphs used to train the predictor")
    test_graphs:  int = Field(default=10, ge=3, le=30, description="Unseen graphs used for the comparison")
    layers:       int = Field(default=2, ge=1, le=3, description="QAOA depth p (2p angles)")
    seed:         int = Field(default=11)


@router.post("/qaoa-angles")
def qaoa_angles(req: QaoaAnglesRequest):
    """
    Neural QAOA angle predictor: learns graph → (γ, β) from optimised training
    graphs, then compares cold-start optimisation with a neural warm start on
    unseen graphs (circuit evaluations needed and approximation ratio reached).
    """
    with simulation_slot():
        return train_and_evaluate(req.train_graphs, req.test_graphs, req.layers, req.seed)
