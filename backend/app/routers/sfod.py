"""
Module 2 - SFOD Model Comparison Suite
Routes:
  POST /api/module2/run        - Run classical vs quantum comparison
  GET  /api/module2/info       - Static metadata about all 4 algorithms
  POST /api/module2/tutorial   - Get step-by-step walkthrough tutorial
"""
from __future__ import annotations
import math
import time
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field
from ..modules.module2_sfod.tutorial import generate_tutorial, TutorialSession

router = APIRouter(prefix="/api/module2", tags=["Module 2 - SFOD Comparison Suite"])

AlgoType = Literal["search", "factoring", "optimization", "database"]

class RunRequest(BaseModel):
    algorithm:  AlgoType
    input_size: int = Field(..., ge=4, le=10000)

class TutorialRequest(BaseModel):
    algorithm:  AlgoType
    input_size: int = Field(..., ge=4, le=10000)

class AlgoResult(BaseModel):
    algorithm:            str
    input_size:           int
    classical_algo:       str
    classical_complexity: str
    classical_steps:      int
    classical_time_ms:    float
    quantum_algo:         str
    quantum_complexity:   str
    quantum_steps:        int
    quantum_time_ms:      float
    speedup_factor:       float
    qubits_required:      int
    accuracy_pct:         float
    step_reduction_pct:   float
    explanation:          str

def _simulate_search(n: int) -> AlgoResult:
    classical_steps = n
    quantum_steps   = max(1, int(math.sqrt(n)))
    t0 = time.perf_counter(); _ = sum(range(n)); classical_ms = (time.perf_counter()-t0)*1000
    t0 = time.perf_counter(); _ = sum(range(quantum_steps)); quantum_ms = (time.perf_counter()-t0)*1000
    qubits  = max(1, math.ceil(math.log2(n+1)))
    speedup = classical_steps / quantum_steps
    return AlgoResult(
        algorithm="search", input_size=n,
        classical_algo="Linear Search", classical_complexity="O(N)",
        classical_steps=classical_steps, classical_time_ms=round(classical_ms,4),
        quantum_algo="Grover's Algorithm", quantum_complexity="O(sqrt(N))",
        quantum_steps=quantum_steps, quantum_time_ms=round(quantum_ms,4),
        speedup_factor=round(speedup,2), qubits_required=qubits,
        accuracy_pct=99.5, step_reduction_pct=round((1-quantum_steps/classical_steps)*100,1),
        explanation=(f"Grover's algorithm searches {n:,} unsorted items in ~{quantum_steps:,} oracle calls "
                     f"vs {n:,} classical comparisons - a {speedup:.1f}x speedup. Requires {qubits} qubits."),
    )

def _simulate_factoring(n: int) -> AlgoResult:
    classical_steps = max(1, int(math.sqrt(n)))
    log_n           = max(1, int(math.log2(n+1)))
    quantum_steps   = max(1, log_n**3)
    t0 = time.perf_counter(); _ = [i for i in range(2,int(math.sqrt(n))+1) if n%i==0]; classical_ms=(time.perf_counter()-t0)*1000
    t0 = time.perf_counter(); _ = sum(range(quantum_steps)); quantum_ms=(time.perf_counter()-t0)*1000
    qubits  = 2*log_n+3
    speedup = classical_steps/max(1,quantum_steps)
    return AlgoResult(
        algorithm="factoring", input_size=n,
        classical_algo="Trial Division", classical_complexity="O(sqrt(N))",
        classical_steps=classical_steps, classical_time_ms=round(classical_ms,4),
        quantum_algo="Shor's Algorithm (QFT)", quantum_complexity="O((log N)^3)",
        quantum_steps=quantum_steps, quantum_time_ms=round(quantum_ms,4),
        speedup_factor=round(max(speedup,1.0),2), qubits_required=qubits,
        accuracy_pct=97.8,
        step_reduction_pct=round(max(0.0,(1-quantum_steps/classical_steps)*100),1),
        explanation=(f"Factoring N={n:,}: Trial Division needs ~{classical_steps:,} steps. "
                     f"Shor's QFT algorithm needs only ~{quantum_steps:,} steps. Requires {qubits} qubits."),
    )

def _simulate_optimization(n: int) -> AlgoResult:
    classical_steps = n*n
    p_layers        = max(1, int(math.log2(n+1)))
    quantum_steps   = p_layers*n
    t0 = time.perf_counter(); _ = [[0]*min(n,100) for _ in range(min(n,100))]; classical_ms=(time.perf_counter()-t0)*1000
    t0 = time.perf_counter(); _ = sum(range(quantum_steps)); quantum_ms=(time.perf_counter()-t0)*1000
    qubits  = min(n,20)
    speedup = classical_steps/max(1,quantum_steps)
    return AlgoResult(
        algorithm="optimization", input_size=n,
        classical_algo="Greedy Nearest-Neighbour", classical_complexity="O(N^2)",
        classical_steps=classical_steps, classical_time_ms=round(classical_ms,4),
        quantum_algo="QAOA", quantum_complexity="O(p*N)",
        quantum_steps=quantum_steps, quantum_time_ms=round(quantum_ms,4),
        speedup_factor=round(speedup,2), qubits_required=qubits,
        accuracy_pct=94.2,
        step_reduction_pct=round((1-quantum_steps/classical_steps)*100,1),
        explanation=(f"TSP with {n} cities: Greedy NN needs {classical_steps:,} comparisons. "
                     f"QAOA (p={p_layers} layers) solves it in {quantum_steps:,} steps - {speedup:.1f}x faster."),
    )

def _simulate_database(n: int) -> AlgoResult:
    classical_steps = n
    quantum_steps   = max(1, int(math.sqrt(n)))
    t0 = time.perf_counter(); _ = list(range(n)); classical_ms=(time.perf_counter()-t0)*1000
    t0 = time.perf_counter(); _ = list(range(quantum_steps)); quantum_ms=(time.perf_counter()-t0)*1000
    qubits  = max(1, math.ceil(math.log2(n+1)))
    speedup = classical_steps/quantum_steps
    return AlgoResult(
        algorithm="database", input_size=n,
        classical_algo="Sequential Scan", classical_complexity="O(N)",
        classical_steps=classical_steps, classical_time_ms=round(classical_ms,4),
        quantum_algo="Amplitude Amplification", quantum_complexity="O(sqrt(N))",
        quantum_steps=quantum_steps, quantum_time_ms=round(quantum_ms,4),
        speedup_factor=round(speedup,2), qubits_required=qubits,
        accuracy_pct=99.1,
        step_reduction_pct=round((1-quantum_steps/classical_steps)*100,1),
        explanation=(f"Searching {n:,} records: Classical scan reads all {n:,} entries. "
                     f"Amplitude Amplification finds the target in ~{quantum_steps:,} queries - {speedup:.1f}x speedup."),
    )

_RUNNERS = {"search":_simulate_search,"factoring":_simulate_factoring,
            "optimization":_simulate_optimization,"database":_simulate_database}

@router.post("/run", response_model=AlgoResult)
def run_comparison(req: RunRequest):
    return _RUNNERS[req.algorithm](req.input_size)

@router.post("/tutorial", response_model=TutorialSession)
def get_tutorial(req: TutorialRequest):
    """Get step-by-step walkthrough tutorial for an algorithm."""
    return generate_tutorial(req.algorithm, req.input_size)

@router.get("/info")
def algorithm_info():
    return {"algorithms":[
        {"key":"search","label":"Search","tagline":"Find a target in an unsorted dataset",
         "classical":{"algo":"Linear Search","complexity":"O(N)"},
         "quantum":{"algo":"Grover's Algorithm","complexity":"O(sqrt(N))"},"speedup_type":"Quadratic"},
        {"key":"factoring","label":"Factoring","tagline":"Decompose a number into prime factors",
         "classical":{"algo":"Trial Division","complexity":"O(sqrt(N))"},
         "quantum":{"algo":"Shor's Algorithm (QFT)","complexity":"O((log N)^3)"},"speedup_type":"Exponential"},
        {"key":"optimization","label":"Optimization","tagline":"Find the shortest route through cities",
         "classical":{"algo":"Greedy Nearest-Neighbour","complexity":"O(N^2)"},
         "quantum":{"algo":"QAOA","complexity":"O(p*N)"},"speedup_type":"Polynomial"},
        {"key":"database","label":"Database","tagline":"Query matching records in unstructured data",
         "classical":{"algo":"Sequential Scan","complexity":"O(N)"},
         "quantum":{"algo":"Amplitude Amplification","complexity":"O(sqrt(N))"},"speedup_type":"Quadratic"},
    ]}
