"""
Module 2 - SFOD Model Comparison Suite
Routes:
  POST /api/module2/run        - Run the classical algorithm AND the quantum algorithm
                                 (on the Module 1 kernel) and compare them
  GET  /api/module2/info       - Static metadata about all 4 algorithms
  GET  /api/module2/presets    - Ready-made inputs for the UI (cities, queries, N values)
  POST /api/module2/tutorial   - Get step-by-step walkthrough tutorial
"""
from __future__ import annotations

import math
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..models.benchmark import KIND_SFOD
from ..models.user import User
from ..modules.module8_dashboard import history
from ..routers.auth import get_optional_user

from ..modules.module1_kernel.limits import simulation_slot
from ..modules.module2_sfod.suite import (
    DEFAULT_CITIES, MAX_TSP_CITIES, compare_database, compare_factoring,
    compare_optimization, compare_search, synthetic_records,
)
from ..modules.module2_sfod.grover import MAX_GROVER_QUBITS
from ..modules.module2_sfod.shor import MAX_SHOR_N
from ..modules.module2_sfod.tutorial import generate_tutorial, TutorialSession
from ..modules.module5_transformer.bridge import KNOWN_CITIES

router = APIRouter(prefix="/api/module2", tags=["Module 2 - SFOD Comparison Suite"])

AlgoType = Literal["search", "factoring", "optimization", "database"]


class RunRequest(BaseModel):
    algorithm:    AlgoType
    # Search
    n_qubits:     Optional[int] = Field(None, ge=1, le=MAX_GROVER_QUBITS, description="Search space = 2^n items")
    target_index: Optional[int] = Field(None, ge=0)
    items:        Optional[List[str]] = None
    target:       Optional[str] = None
    # Factoring
    N:            Optional[int] = Field(None, ge=3, le=10 ** 18)
    a:            Optional[int] = Field(None, ge=2)
    # Optimisation
    cities:       Optional[List[str]] = None
    layers:       int = Field(2, ge=1, le=4, description="QAOA depth p")
    # Database
    records:      Optional[List[str]] = None
    n_records:    Optional[int] = Field(None, ge=4, le=2 ** MAX_GROVER_QUBITS)
    query:        Optional[str] = None
    # Common
    shots:        int = Field(1024, ge=16, le=8192)
    seed:         Optional[int] = None
    input_size:   Optional[int] = Field(None, ge=2, description="Legacy single-number input")


class TutorialRequest(BaseModel):
    algorithm:  AlgoType
    input_size: int = Field(..., ge=4, le=10000)


def run_comparison_request(req: RunRequest) -> dict:
    """Shared by this router and the benchmark dashboard."""
    algo = req.algorithm
    if algo == "search":
        n_qubits = req.n_qubits
        if n_qubits is None and req.items is None:
            n_qubits = min(12, max(2, math.ceil(math.log2(req.input_size)))) if req.input_size else 6
        return compare_search(n_qubits=n_qubits, target_index=req.target_index, items=req.items,
                              target=req.target, shots=req.shots, seed=req.seed)
    if algo == "factoring":
        N = req.N or req.input_size or 21
        return compare_factoring(N=N, a=req.a, shots=req.shots, seed=req.seed)
    if algo == "optimization":
        cities = req.cities
        if not cities:
            k = min(MAX_TSP_CITIES, max(3, req.input_size or 4))
            cities = DEFAULT_CITIES[:k]
        return compare_optimization(cities=cities, p=req.layers, shots=req.shots, seed=req.seed)
    # database
    n_records = req.n_records or (min(req.input_size, 2 ** MAX_GROVER_QUBITS) if req.input_size else None)
    return compare_database(records=req.records, query=req.query or "Research",
                            n_records=n_records, shots=req.shots, seed=req.seed)


@router.post("/run")
def run_comparison(req: RunRequest, user: Optional[User] = Depends(get_optional_user)):
    """
    Run both sides for real: the classical baseline on the CPU and the quantum
    algorithm on the QAIBridge state-vector kernel. Returns answers, step
    counts, success probabilities, circuit statistics, chart data and the
    equivalent Qiskit code. Signed-in users' runs are saved to the Module 8
    dashboard history.
    """
    try:
        with simulation_slot():
            result = run_comparison_request(req)
    except MemoryError as e:
        raise HTTPException(400, str(e))
    except (ValueError, IndexError) as e:
        raise HTTPException(422, str(e))
    if user is not None:
        title, summary = history.sfod_summary(result)
        result["run_id"] = history.record_run(user.id, KIND_SFOD, title, summary,
                                              duration_ms=result["quantum"].get("time_ms"))
    return result


@router.post("/tutorial", response_model=TutorialSession)
def get_tutorial(req: TutorialRequest):
    """Get step-by-step walkthrough tutorial for an algorithm."""
    return generate_tutorial(req.algorithm, req.input_size)


@router.get("/presets")
def presets():
    return {
        "search": {"max_qubits": MAX_GROVER_QUBITS, "default_qubits": 6},
        "factoring": {"max_N": MAX_SHOR_N, "examples": [15, 21, 33, 35, 39, 51, 55, 77, 85, 91, 119]},
        "optimization": {"max_cities": MAX_TSP_CITIES, "default": DEFAULT_CITIES[:4],
                         "known_cities": sorted(name.title() for name in KNOWN_CITIES)},
        "database": {"default_records": 256, "sample": synthetic_records(6),
                     "queries": ["Research", "age > 60", "city = Lahore", "Data Science", "age < 25"]},
    }


@router.get("/info")
def algorithm_info():
    return {"algorithms": [
        {"key": "search", "label": "Search", "tagline": "Find a target in an unsorted dataset",
         "classical": {"algo": "Linear Search", "complexity": "O(N)"},
         "quantum": {"algo": "Grover's Algorithm", "complexity": "O(√N)"}, "speedup_type": "Quadratic"},
        {"key": "factoring", "label": "Factoring", "tagline": "Decompose a number into prime factors",
         "classical": {"algo": "Trial Division", "complexity": "O(√N)"},
         "quantum": {"algo": "Shor's Algorithm (QFT)", "complexity": "O((log N)³)"}, "speedup_type": "Exponential"},
        {"key": "optimization", "label": "Optimization", "tagline": "Find the shortest route through cities",
         "classical": {"algo": "Exhaustive search / greedy", "complexity": "O(N!) / O(N²)"},
         "quantum": {"algo": "QAOA", "complexity": "variational (p layers)"}, "speedup_type": "Heuristic"},
        {"key": "database", "label": "Database", "tagline": "Query matching records in unstructured data",
         "classical": {"algo": "Sequential Scan", "complexity": "O(N)"},
         "quantum": {"algo": "Amplitude Amplification", "complexity": "O(√(N/M))"}, "speedup_type": "Quadratic"},
    ]}
