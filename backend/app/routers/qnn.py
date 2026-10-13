"""
Neural Network Converter
Routes (signed-in users):
  GET  /api/module7/datasets       – the four datasets (points to learn from and test points)
  POST /api/module7/analyze        – read and check a described classical network, without converting it
  POST /api/module7/convert        – the quantum network it becomes, layer by layer (or, while the network is
                                     being edited into something that can't convert, the plain reason why)
  POST /api/module7/simulate       – run the converted circuit once, untrained, on a dataset's test points
  POST /api/module7/train-compare  – train the classical network, the converted one, and the converted one
                                     warm-started from the classical weights, fairly, over several seeds
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module7_qnn import (
    DATASETS,
    ArchitectureError,
    compare,
    convert_architecture,
    parse_architecture,
    points,
    untrained,
)
from ..modules.module7_qnn.trainer import DEFAULT_STEPS, warm_up
from .auth import get_current_user

router = APIRouter(prefix="/api/module7", tags=["Neural Network Converter"], dependencies=[Depends(get_current_user)])

DatasetName = Literal["xor", "circles", "moons", "groups"]


class LayerSpecModel(BaseModel):
    type:       str           = Field(default="dense", description="'dense' or 'dropout'")
    units:      Optional[int] = Field(default=4, description="1 to 8 (one qubit each); dense only")
    activation: Optional[str] = Field(default="relu", description="relu | tanh | sigmoid; dense only")


def _default_layers() -> List[LayerSpecModel]:
    return [LayerSpecModel(), LayerSpecModel()]


class NetworkRequest(BaseModel):
    layers: List[LayerSpecModel] = Field(default_factory=_default_layers, min_length=1, max_length=4)


def _raw(layers: List[LayerSpecModel]) -> List[Dict[str, Any]]:
    return [l.model_dump() for l in layers]


def _parse_or_400(layers: List[LayerSpecModel]):
    try:
        return parse_architecture(_raw(layers), input_dim=2, output_dim=1)
    except ArchitectureError as e:
        raise HTTPException(400, str(e))


def _heavy(work):
    try:
        with simulation_slot():
            return work()
    except ArchitectureError as e:
        raise HTTPException(400, str(e))
    except MemoryError as e:
        raise HTTPException(503, str(e))


@router.get("/datasets")
def datasets() -> Dict[str, Any]:
    """The datasets, for the page to draw. Also starts preparing the default network on each in the background."""
    warm_up()
    return {name: points(name) for name in DATASETS}


@router.post("/analyze")
def analyze(req: NetworkRequest) -> Dict[str, Any]:
    """Read and check the described network: what was understood, and any warnings."""
    return _parse_or_400(req.layers).to_dict()


@router.post("/convert")
def convert(req: NetworkRequest) -> Dict[str, Any]:
    """
    The quantum network the described one becomes, with the layer-by-layer mapping and its limits.
    The page asks after every edit, so a network that can't convert is an answer too: ok=false and the reason.
    """
    try:
        parsed = parse_architecture(_raw(req.layers), input_dim=2, output_dim=1)
    except ArchitectureError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "parsed": parsed.to_dict(), **convert_architecture(parsed).to_dict()}


class SimulateRequest(NetworkRequest):
    dataset: DatasetName = "xor"
    seed:    int = Field(default=0, ge=0, le=1000)


@router.post("/simulate")
def simulate(req: SimulateRequest) -> Dict[str, Any]:
    """The converted circuit from a fresh start, run once on the test points with no training."""
    _parse_or_400(req.layers)
    return _heavy(lambda: untrained(_raw(req.layers), req.dataset, req.seed))


class TrainCompareRequest(NetworkRequest):
    dataset: DatasetName = "xor"
    steps:   int = Field(default=DEFAULT_STEPS, ge=20, le=200)


@router.post("/train-compare")
def train_compare(req: TrainCompareRequest) -> Dict[str, Any]:
    _parse_or_400(req.layers)
    return _heavy(lambda: compare(_raw(req.layers), req.dataset, req.steps))
