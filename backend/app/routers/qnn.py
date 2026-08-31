"""
Module 7 – QNN Converter  (FastAPI Router)
Routes:
  GET  /api/module7/status         – Module status
  POST /api/module7/analyze        – Parse + validate a described classical
                                      architecture (Parser stage only, no
                                      quantum mapping yet)
  POST /api/module7/convert        – Parse, then map a classical MLP
                                      architecture to a QNN spec + structural
                                      comparison (Mapping Engine)
  POST /api/module7/simulate       – Forward-only pass of a QNN spec through
                                      the real simulation kernel (no training)
  POST /api/module7/train-compare  – Train the classical MLP and the mapped
                                      QNN (from-scratch AND classical-weight-
                                      warm-started) on the shared toy dataset
"""
from __future__ import annotations

from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..modules.module6_optimizer.dataset import FEATURE_DIM, get_toy_classification_dataset
from ..modules.module7_qnn import (
    ArchitectureError,
    convert_architecture,
    parse_architecture,
    run_qnn_forward,
    train_classical_mlp,
    train_qnn,
    train_qnn_warm_started,
)

router = APIRouter(prefix="/api/module7", tags=["Module 7 – QNN Converter"])


@router.get("/status")
async def status():
    return {"module": 7, "name": "QNN Converter", "status": "active"}


class LayerSpecModel(BaseModel):
    type:       str           = Field(default="dense", description="'dense' or 'dropout'")
    units:      Optional[int] = Field(default=4, ge=1, le=16, description="Required for 'dense'")
    activation: Optional[str] = Field(default="relu", description="relu | tanh | sigmoid (dense only)")


class AnalyzeRequest(BaseModel):
    layers: List[LayerSpecModel] = Field(default=[LayerSpecModel(), LayerSpecModel()], min_length=1, max_length=4)


def _parse_or_400(req_layers: List[LayerSpecModel]):
    raw_layers = [l.model_dump() for l in req_layers]
    try:
        return parse_architecture(raw_layers, input_dim=FEATURE_DIM, output_dim=1)
    except ArchitectureError as e:
        raise HTTPException(400, str(e))


@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    """Parser stage only: validate the described architecture and report what was understood."""
    parsed = _parse_or_400(req.layers)
    return parsed.to_dict()


class ConvertRequest(BaseModel):
    layers: List[LayerSpecModel] = Field(default=[LayerSpecModel(), LayerSpecModel()], min_length=1, max_length=4)


@router.post("/convert")
def convert(req: ConvertRequest):
    parsed = _parse_or_400(req.layers)
    report = convert_architecture(parsed)
    return report.to_dict()


class SimulateRequest(BaseModel):
    n_qubits: int = Field(ge=1, le=6)
    layers:   int = Field(ge=1, le=4)
    angles:   Optional[List[float]] = Field(default=None, description="Omit to use a small-angle (near-identity) default")


@router.post("/simulate")
def simulate(req: SimulateRequest):
    """Run the generated QNN through the simulator with no training — a quick sanity check
    that the circuit executes and produces sane probabilities before committing to training."""
    expected = req.n_qubits * req.layers * 2
    if req.angles is not None and len(req.angles) != expected:
        raise HTTPException(400, f"Expected {expected} angles for {req.n_qubits} qubits x {req.layers} layers, got {len(req.angles)}.")

    angles_arr = np.array(req.angles) if req.angles is not None else None

    X, y = get_toy_classification_dataset()
    predictions, used_angles = run_qnn_forward(req.n_qubits, req.layers, X, angles_arr)
    accuracy = sum(int((p > 0.5) == bool(yi)) for p, yi in zip(predictions, y)) / len(y)
    return {
        "predictions": predictions,
        "labels": y,
        "accuracy": accuracy,
        "angles_used": used_angles.tolist(),
    }


class TrainCompareRequest(BaseModel):
    layers:     List[LayerSpecModel] = Field(default=[LayerSpecModel(), LayerSpecModel()], min_length=1, max_length=4)
    iterations: int = Field(default=30, ge=10, le=100)


@router.post("/train-compare")
def train_compare(req: TrainCompareRequest):
    parsed = _parse_or_400(req.layers)
    report = convert_architecture(parsed)

    X, y = get_toy_classification_dataset()

    classical_curve, classical_acc, classical_model = train_classical_mlp(parsed, X, y, req.iterations)
    quantum_curve, quantum_acc = train_qnn(report.qnn.n_qubits, report.qnn.n_layers, X, y, req.iterations)
    warm_curve, warm_acc = train_qnn_warm_started(
        report.qnn.n_qubits, report.qnn.n_layers, X, y, classical_model, req.iterations
    )

    return {
        "conversion":                report.to_dict(),
        "classical_loss_curve":      classical_curve,
        "quantum_loss_curve":        quantum_curve,
        "quantum_warm_loss_curve":   warm_curve,
        "classical_accuracy":        classical_acc,
        "quantum_accuracy":          quantum_acc,
        "quantum_warm_accuracy":     warm_acc,
    }
