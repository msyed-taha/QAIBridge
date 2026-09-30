"""
Module 5 – Classical → Quantum Logic Transformer
Paste classical code → the engine (LLM or offline analyzer) understands it → the
Mathematical Bridge builds the QUBO / Ising Hamiltonian / oracle → the circuit
runs on the Module 1 kernel → the answer is verified against the classical one.

Routes:
  GET  /api/module5/status          – Which understanding engine is active (LLM / offline)
  GET  /api/module5/examples        – Built-in example programs
  POST /api/module5/analyze         – Step 1 only: code → problem spec (editable by the user)
  POST /api/module5/execute         – Steps 2-6: spec → bridge → circuit → run → verify → Qiskit
  POST /api/module5/transform       – Everything in one call
  POST /api/module5/logic           – Boolean formula → oracle, reversible circuit, Hamiltonian, Grover
  POST /api/module5/bridge          – Problem data → QUBO / Ising only (no simulation)
  POST /api/module5/run-classical   – Run the user's classical Python in the sandbox (login required)
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..models.benchmark import KIND_TRANSFORM
from ..models.user import User
from ..modules.module8_dashboard import history
from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module2_sfod.suite import _clean
from ..modules.module5_transformer import pipeline
from ..modules.module5_transformer.boolean_logic import run_logic_pipeline
from ..modules.module5_transformer.examples import EXAMPLES
from ..modules.module5_transformer.llm import llm_status
from ..modules.module5_transformer.sandbox import run_python
from ..routers.auth import get_current_user, get_optional_user

router = APIRouter(prefix="/api/module5", tags=["Module 5 – Classical→Quantum Logic Transformer"])

Mode = Literal["auto", "llm", "local"]


class CodeRequest(BaseModel):
    code:     str = Field(..., max_length=20_000)
    mode:     Mode = "auto"
    language: str = "python"


class ExecuteRequest(BaseModel):
    spec:   Dict[str, Any]
    layers: int = Field(2, ge=1, le=4)
    shots:  int = Field(1024, ge=64, le=8192)
    seed:   Optional[int] = None


class TransformRequest(CodeRequest):
    layers: int = Field(2, ge=1, le=4)
    shots:  int = Field(1024, ge=64, le=8192)
    seed:   Optional[int] = None


class LogicRequest(BaseModel):
    expression: str = Field(..., max_length=500)
    shots:      int = Field(1024, ge=64, le=8192)


class BridgeRequest(BaseModel):
    problem_type: Literal["tsp", "knapsack", "maxcut", "partition", "portfolio"]
    parameters:   Dict[str, Any]


class ClassicalRequest(BaseModel):
    code:     str = Field(..., max_length=20_000)
    language: str = "python"


def _guard(fn):
    try:
        with simulation_slot():
            return fn()
    except MemoryError as e:
        raise HTTPException(400, str(e))
    except (ValueError, KeyError, TypeError, IndexError) as e:
        msg = str(e)
        if isinstance(e, KeyError):
            msg = f"Missing parameter {msg} for this problem type."
        raise HTTPException(422, msg)


@router.get("/status")
def status():
    return {"module": 5, "name": "Classical→Quantum Logic Transformer", "engine": llm_status()}


@router.get("/examples")
def get_examples():
    return {"examples": [{**ex, "language": "python"} for ex in EXAMPLES]}


@router.post("/analyze")
def analyze(req: CodeRequest):
    try:
        return {"spec": pipeline.analyze(req.code, req.mode), "engine": llm_status()}
    except ValueError as e:
        raise HTTPException(422, str(e))


def _record(user: Optional[User], spec: Dict[str, Any], result: Dict[str, Any]) -> None:
    if user is not None:
        title, summary = history.transform_summary(spec, result)
        history.record_run(user.id, KIND_TRANSFORM, title, summary, duration_ms=result.get("total_ms"))


@router.post("/execute")
def execute(req: ExecuteRequest, user: Optional[User] = Depends(get_optional_user)):
    result = _guard(lambda: pipeline.execute(req.spec, layers=req.layers, shots=req.shots, seed=req.seed))
    _record(user, req.spec, result)
    return result


@router.post("/transform")
def transform(req: TransformRequest, user: Optional[User] = Depends(get_optional_user)):
    out = _guard(lambda: pipeline.transform(req.code, req.mode, layers=req.layers, shots=req.shots, seed=req.seed))
    _record(user, out["spec"], out["result"])
    return out


@router.post("/logic")
def logic(req: LogicRequest):
    def run():
        r = run_logic_pipeline(req.expression, shots=req.shots)
        circuit = r.pop("_circuit")
        r["qiskit"] = circuit.to_qiskit()
        return _clean(r)
    return _guard(run)


@router.post("/bridge")
def bridge(req: BridgeRequest):
    def run():
        b = pipeline._bridge_for(req.problem_type, req.parameters)
        return _clean({"bridge": b.summary(), "exact": b.solve_exactly() if b.qubo.n <= 20 else None})
    try:
        return run()
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(422, str(e))


@router.post("/run-classical")
def run_classical(req: ClassicalRequest, current_user: User = Depends(get_current_user)):
    """Run classical Python in the sandbox (see modules/module5_transformer/sandbox.py). Login required."""
    if req.language.lower().strip() != "python":
        return {"output": "", "error": f"'{req.language}' is not supported. Supported: python",
                "success": False, "time_ms": 0}
    return run_python(req.code)
