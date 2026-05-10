"""
Module 2 - Algorithm Walkthrough Tutorial System
Provides step-by-step execution of classical vs quantum algorithms
with explanations and intermediate states.
"""

from __future__ import annotations
import math
from typing import Literal, List
from pydantic import BaseModel, Field
from dataclasses import dataclass, asdict


# ── Data Models ───────────────────────────────────────────────────────────────

class AlgorithmStep(BaseModel):
    """Represents a single step in the algorithm walkthrough."""
    step_number: int
    phase: str  # "initialization", "processing", "measurement", "verification"
    
    # Classical approach
    classical_action: str
    classical_state: str
    classical_explanation: str
    
    # Quantum approach
    quantum_action: str
    quantum_state: str
    quantum_explanation: str
    
    # Educational content
    tooltip: str  # What the user should learn here
    visual_hint: str  # CSS class or data for visualization
    metrics: dict  # Current metrics (steps so far, time so far, etc.)


class TutorialSession(BaseModel):
    """Complete tutorial walkthrough for an algorithm."""
    algorithm: str
    input_size: int
    problem_description: str
    total_steps: int
    steps: List[AlgorithmStep]
    
    # Summary
    classical_final_steps: int
    quantum_final_steps: int
    speedup: float
    key_insight: str


# ── Search Algorithm Tutorial ─────────────────────────────────────────────────

def generate_search_tutorial(n: int) -> TutorialSession:
    """Generate step-by-step walkthrough for search problem."""
    target = n // 2  # Target is in the middle
    quantum_steps = max(1, int(math.sqrt(n)))
    qubits = max(1, math.ceil(math.log2(n + 1)))
    
    steps = []
    
    # Step 1: Initialization
    steps.append(AlgorithmStep(
        step_number=1,
        phase="initialization",
        classical_action="Create a list of items to search",
        classical_state=f"[0, 1, 2, ..., {n-1}]",
        classical_explanation=f"We have an unsorted list of {n:,} items. Target: {target}",
        quantum_action="Initialize qubits in superposition",
        quantum_state=f"|ψ⟩ = (1/√{n}) Σ|i⟩",
        quantum_explanation=f"All {n:,} items exist simultaneously. All {qubits} qubits start in equal superposition.",
        tooltip="Classical: Sequential search requires checking items one by one. Quantum: All possibilities exist at once!",
        visual_hint="init",
        metrics={"classical_steps": 0, "quantum_steps": 0, "accuracy": 0}
    ))
    
    # Step 2: Search Phase (Classical)
    for i in range(1, min(4, n)):
        steps.append(AlgorithmStep(
            step_number=1+i,
            phase="processing",
            classical_action=f"Check item at index {i-1}",
            classical_state=f"Current item: {i-1}, Target: {target}",
            classical_explanation=f"Classical algorithm checks item {i-1}. Not a match. Continue searching...",
            quantum_action=f"Apply Oracle: mark if item == {target}",
            quantum_state=f"|ψ⟩ with phase flip on target",
            quantum_explanation=f"The oracle applies a phase flip to the target state |{target}⟩ without revealing it.",
            tooltip=f"Classical has checked {i}/{n} items. Quantum superposition collapses gradually with each oracle call.",
            visual_hint="processing",
            metrics={"classical_steps": i, "quantum_steps": 1, "accuracy": min(99, i*25)}
        ))
    
    # Step 3: Amplitude Amplification
    steps.append(AlgorithmStep(
        step_number=len(steps) + 1,
        phase="processing",
        classical_action="Continue linear search...",
        classical_state=f"Checked {min(4, n)}/{n} items",
        classical_explanation=f"Classical search continues checking items sequentially.",
        quantum_action="Apply Diffusion Operator (Grover Diffusion)",
        quantum_state="Amplify target amplitude, suppress others",
        quantum_explanation="The diffusion operator amplifies the probability of the target state while suppressing others.",
        tooltip="Grover's magic: After log(N) iterations, the target probability becomes ~100%!",
        visual_hint="diffusion",
        metrics={"classical_steps": min(4, n), "quantum_steps": 2, "accuracy": 99}
    ))
    
    # Step 4: Measurement
    steps.append(AlgorithmStep(
        step_number=len(steps) + 1,
        phase="measurement",
        classical_action="Continue until found (total: ~N/2 checks on average)",
        classical_state=f"Found target after {n//2} checks",
        classical_explanation=f"On average, classical linear search needs {n//2} checks to find the target.",
        quantum_action=f"Measure: collapse superposition to target",
        quantum_state=f"|{target}⟩ with 99% probability",
        quantum_explanation=f"Measurement collapses the quantum state to the target |{target}⟩.",
        tooltip=f"Quantum result found in {quantum_steps} oracle calls vs {n//2} classical checks!",
        visual_hint="measurement",
        metrics={"classical_steps": n//2, "quantum_steps": quantum_steps, "accuracy": 99}
    ))
    
    # Step 5: Verification
    steps.append(AlgorithmStep(
        step_number=len(steps) + 1,
        phase="verification",
        classical_action="Verify result matches target",
        classical_state=f"Verified: item at index {target} == {target} ✓",
        classical_explanation="Classical search confirms the found item is correct.",
        quantum_action="Verify by re-measurement",
        quantum_state=f"|{target}⟩ confirmed",
        quantum_explanation="Verify by measuring again or running the algorithm twice.",
        tooltip="Speedup: √N times faster! For N=1,000,000: quantum=1,000 calls vs classical=500,000 checks.",
        visual_hint="success",
        metrics={"classical_steps": n//2, "quantum_steps": quantum_steps, "accuracy": 99}
    ))
    
    speedup = (n // 2) / quantum_steps
    
    return TutorialSession(
        algorithm="search",
        input_size=n,
        problem_description=f"Find target value {target} in unsorted list of {n:,} items",
        total_steps=len(steps),
        steps=steps,
        classical_final_steps=n//2,
        quantum_final_steps=quantum_steps,
        speedup=round(speedup, 2),
        key_insight=f"Grover's algorithm searches {n:,} items in √N = {quantum_steps} quantum oracle calls vs {n//2} classical comparisons."
    )


# ── Factoring Algorithm Tutorial ──────────────────────────────────────────────

def generate_factoring_tutorial(n: int) -> TutorialSession:
    """Generate step-by-step walkthrough for factoring problem."""
    # Find a simple composite number for demo
    factors = None
    for i in range(2, int(math.sqrt(n)) + 1):
        if n % i == 0:
            factors = (i, n // i)
            break
    if not factors:
        factors = (2, n // 2)  # fallback
    
    log_n = max(1, int(math.log2(n + 1)))
    qubits = 2 * log_n + 3
    
    steps = []
    
    steps.append(AlgorithmStep(
        step_number=1,
        phase="initialization",
        classical_action="Choose trial divisors to test",
        classical_state=f"Test divisors: 2, 3, 5, 7, 11, ..., √{n}",
        classical_explanation=f"Classical factoring checks if each number divides {n}.",
        quantum_action="Initialize quantum registers",
        quantum_state=f"|0⟩⊗(2*log₂{n}+3) qubits",
        quantum_explanation=f"Prepare {qubits} qubits for Shor's algorithm's quantum Fourier transform.",
        tooltip="Classical: Exponential time. Quantum: Polynomial time!",
        visual_hint="init",
        metrics={"classical_steps": 0, "quantum_steps": 0, "accuracy": 0}
    ))
    
    steps.append(AlgorithmStep(
        step_number=2,
        phase="processing",
        classical_action=f"Test: {n} % 2 = {n % 2} (not divisible)",
        classical_state=f"Testing divisor 2...",
        classical_explanation=f"Check if 2 divides {n}. No match.",
        quantum_action="Create superposition of all possible factors",
        quantum_state="√(superposition of candidates)",
        quantum_explanation="Quantum state superimposes all possible divisors simultaneously.",
        tooltip="Classical needs to test each divisor. Quantum tests all at once!",
        visual_hint="processing",
        metrics={"classical_steps": 1, "quantum_steps": 1, "accuracy": 10}
    ))
    
    steps.append(AlgorithmStep(
        step_number=3,
        phase="processing",
        classical_action=f"Test: {n} % 3 = {n % 3}, {n} % 5 = {n % 5}, ... (checking ~√{n} divisors)",
        classical_state=f"Checked 3-4 divisors, found none yet",
        classical_explanation=f"Continue testing divisors. This takes exponential time!",
        quantum_action="Compute period-finding via Quantum Fourier Transform",
        quantum_state="QFT identifies periodic patterns",
        quantum_explanation="The QFT finds the order (period) of a function, revealing the factors.",
        tooltip="This is where quantum shines - period finding is hard classically!",
        visual_hint="processing",
        metrics={"classical_steps": 4, "quantum_steps": 2, "accuracy": 40}
    ))
    
    steps.append(AlgorithmStep(
        step_number=4,
        phase="measurement",
        classical_action=f"After ~√{n} = {int(math.sqrt(n))} trials, find divisor...",
        classical_state=f"Found divisor: {factors[0]}",
        classical_explanation=f"Classical trial-and-error finally finds {factors[0]}.",
        quantum_action="Measure quantum state to extract factors",
        quantum_state=f"|factors⟩",
        quantum_explanation=f"Measurement yields the factors: {factors[0]} × {factors[1]} = {n}",
        tooltip=f"Shor's algorithm factors {n} in polynomial time vs exponential classical!",
        visual_hint="measurement",
        metrics={"classical_steps": int(math.sqrt(n)), "quantum_steps": 3, "accuracy": 97}
    ))
    
    steps.append(AlgorithmStep(
        step_number=5,
        phase="verification",
        classical_action=f"Verify: {factors[0]} × {factors[1]} = {n}",
        classical_state=f"Verified ✓",
        classical_explanation="Confirm the factors multiply to the original number.",
        quantum_action="Verify measurement result",
        quantum_state=f"{factors[0]} × {factors[1]} = {n}",
        quantum_explanation="Double-check by measurement or re-running.",
        tooltip=f"Speedup: Exponential! This breaks RSA encryption in polynomial time.",
        visual_hint="success",
        metrics={"classical_steps": int(math.sqrt(n)), "quantum_steps": 3, "accuracy": 97}
    ))
    
    speedup = int(math.sqrt(n)) / 3
    
    return TutorialSession(
        algorithm="factoring",
        input_size=n,
        problem_description=f"Factor {n} = {factors[0]} × {factors[1]}",
        total_steps=len(steps),
        steps=steps,
        classical_final_steps=int(math.sqrt(n)),
        quantum_final_steps=3,
        speedup=round(speedup, 2),
        key_insight=f"Shor's algorithm factors {n} via quantum Fourier transform in polynomial time, breaking classical RSA security."
    )


# ── Optimization Algorithm Tutorial ───────────────────────────────────────────

def generate_optimization_tutorial(n: int) -> TutorialSession:
    """Generate step-by-step walkthrough for TSP optimization."""
    steps = []
    
    steps.append(AlgorithmStep(
        step_number=1,
        phase="initialization",
        classical_action="Initialize distance matrix",
        classical_state=f"Create {n}×{n} matrix of distances",
        classical_explanation=f"Classical TSP with {n} cities requires computing {n}! possible tours.",
        quantum_action="Initialize QAOA circuit",
        quantum_state=f"Problem Hamiltonian: encode costs as phases",
        quantum_explanation=f"Encode TSP costs into quantum gates. Use {min(n, 20)} qubits.",
        tooltip="Classical: Factorial explosion! Quantum: Polynomial circuit depth.",
        visual_hint="init",
        metrics={"classical_steps": 0, "quantum_steps": 0, "accuracy": 0}
    ))
    
    steps.append(AlgorithmStep(
        step_number=2,
        phase="processing",
        classical_action="Greedy Nearest-Neighbor: Start at city 0",
        classical_state="Tour: [0, nearest(0), ...]",
        classical_explanation="Classical greedy picks closest unvisited city repeatedly.",
        quantum_action="QAOA p=1: Apply cost and mixer Hamiltonians",
        quantum_state="|ψ(γ,β)⟩ = e^(-i*β*Hm) e^(-i*γ*Hc) |+⟩⊗n",
        quantum_explanation="First QAOA layer: apply problem Hamiltonian Hc and mixer Hm.",
        tooltip="QAOA blends classical and quantum: classical optimizer tunes γ,β angles.",
        visual_hint="processing",
        metrics={"classical_steps": 1, "quantum_steps": 1, "accuracy": 35}
    ))
    
    steps.append(AlgorithmStep(
        step_number=3,
        phase="processing",
        classical_action="Continue greedy: [0, 2, 5, 1, ...]",
        classical_state=f"Current partial tour cost: ~{(n*n)//3}",
        classical_explanation="Greedy continues adding nearest cities. Gets stuck in local optima.",
        quantum_action="QAOA p=2,3,...: Iteratively improve",
        quantum_state="Increase p: exponentially improve solution quality",
        quantum_explanation="Higher p values allow QAOA to explore better solutions.",
        tooltip="QAOA can escape greedy local optima!",
        visual_hint="processing",
        metrics={"classical_steps": 3, "quantum_steps": 2, "accuracy": 68}
    ))
    
    steps.append(AlgorithmStep(
        step_number=4,
        phase="measurement",
        classical_action="Greedy tour found: cost ≈ {:.0f}".format(n * n * 0.6),
        classical_state=f"Final greedy tour cost: {n*n}",
        classical_explanation=f"Greedy solution for {n} cities usually ~60% above optimal.",
        quantum_action="Measure final QAOA state",
        quantum_state="|best⟩",
        quantum_explanation="Measurement collapses to a near-optimal tour.",
        tooltip=f"QAOA achieves ~94% solution quality for TSP on {n} cities.",
        visual_hint="measurement",
        metrics={"classical_steps": n*n, "quantum_steps": n, "accuracy": 94}
    ))
    
    steps.append(AlgorithmStep(
        step_number=5,
        phase="verification",
        classical_action="Verify greedy tour is valid",
        classical_state="Tour visits all cities once ✓",
        classical_explanation="Check greedy solution satisfies TSP constraints.",
        quantum_action="Verify QAOA tour is valid and better",
        quantum_state=f"QAOA tour cost < greedy cost ✓",
        quantum_explanation="QAOA solution outperforms classical greedy.",
        tooltip="Speedup: Polynomial time to near-optimal solution vs exponential classical.",
        visual_hint="success",
        metrics={"classical_steps": n*n, "quantum_steps": n, "accuracy": 94}
    ))
    
    speedup = (n * n) / n
    
    return TutorialSession(
        algorithm="optimization",
        input_size=n,
        problem_description=f"Traveling Salesman Problem (TSP) with {n} cities",
        total_steps=len(steps),
        steps=steps,
        classical_final_steps=n*n,
        quantum_final_steps=n,
        speedup=round(speedup, 2),
        key_insight=f"QAOA solves TSP({n} cities) in polynomial time, achieving ~94% solution quality near-optimally."
    )


# ── Database Query Tutorial ───────────────────────────────────────────────────

def generate_database_tutorial(n: int) -> TutorialSession:
    """Generate step-by-step walkthrough for database query."""
    quantum_steps = max(1, int(math.sqrt(n)))
    qubits = max(1, math.ceil(math.log2(n + 1)))
    
    steps = []
    
    steps.append(AlgorithmStep(
        step_number=1,
        phase="initialization",
        classical_action=f"Load {n:,} database records",
        classical_state=f"DB: [{n:,} records]",
        classical_explanation=f"Classical search must load and scan all {n:,} records.",
        quantum_action="Initialize qubits in superposition",
        quantum_state=f"|ψ⟩ = (1/√{n}) Σ|i⟩",
        quantum_explanation=f"All {n:,} records exist in superposition across {qubits} qubits.",
        tooltip="Classical: Sequential I/O for each record. Quantum: All records at once!",
        visual_hint="init",
        metrics={"classical_steps": 0, "quantum_steps": 0, "accuracy": 0}
    ))
    
    steps.append(AlgorithmStep(
        step_number=2,
        phase="processing",
        classical_action="Scan record 1: SELECT * WHERE age > 30",
        classical_state="Record 1: Read, check condition...",
        classical_explanation="Classical database sequentially reads each record and evaluates condition.",
        quantum_action="Apply Oracle: mark matching records",
        quantum_state="|ψ⟩ with phase flip on matching records",
        quantum_explanation="Quantum oracle marks (phase flips) all records where age > 30 simultaneously.",
        tooltip="Classical checks 1 record per access. Quantum checks all with superposition!",
        visual_hint="processing",
        metrics={"classical_steps": 1, "quantum_steps": 1, "accuracy": 5}
    ))
    
    steps.append(AlgorithmStep(
        step_number=3,
        phase="processing",
        classical_action="Scan records 2-100: read and check each...",
        classical_state=f"Read {min(100, n)} records, {min(40, n)} match condition",
        classical_explanation="Classical scanning continues. Each record accessed sequentially.",
        quantum_action="Apply Amplitude Amplification (Grover diffusion)",
        quantum_state="Amplify matching record probabilities",
        quantum_explanation="Grover diffusion amplifies amplitudes of matching records.",
        tooltip="After √N iterations, matching records have ~100% probability!",
        visual_hint="processing",
        metrics={"classical_steps": min(100, n), "quantum_steps": 2, "accuracy": 50}
    ))
    
    steps.append(AlgorithmStep(
        step_number=4,
        phase="measurement",
        classical_action=f"Finish scanning all {n:,} records, get all matches",
        classical_state=f"Result: {min(40, n)} matching records after {n} I/O operations",
        classical_explanation=f"Classical search reads all {n:,} records to get all matches.",
        quantum_action="Measure quantum state to reveal matching records",
        quantum_state="Matching records with high probability",
        quantum_explanation=f"Measurement reveals matching records in {quantum_steps} oracle calls.",
        tooltip=f"Found {min(40, n)} matching records in {quantum_steps} queries vs {n} classical scans!",
        visual_hint="measurement",
        metrics={"classical_steps": n, "quantum_steps": quantum_steps, "accuracy": 99}
    ))
    
    steps.append(AlgorithmStep(
        step_number=5,
        phase="verification",
        classical_action="Verify all matches satisfy WHERE condition",
        classical_state="Verified ✓",
        classical_explanation="Classical confirms all returned records match the query.",
        quantum_action="Verify quantum result",
        quantum_state="All measured records satisfy WHERE condition ✓",
        quantum_explanation="Verify by measuring again or classical post-processing.",
        tooltip=f"Speedup: √N times! For 1M records: quantum=1K queries vs classical=1M scans.",
        visual_hint="success",
        metrics={"classical_steps": n, "quantum_steps": quantum_steps, "accuracy": 99}
    ))
    
    speedup = n / quantum_steps
    
    return TutorialSession(
        algorithm="database",
        input_size=n,
        problem_description=f"Query {n:,} database records: SELECT * WHERE age > 30",
        total_steps=len(steps),
        steps=steps,
        classical_final_steps=n,
        quantum_final_steps=quantum_steps,
        speedup=round(speedup, 2),
        key_insight=f"Amplitude Amplification queries {n:,} records in √N = {quantum_steps} quantum oracle calls vs {n} classical scans."
    )


# ── Tutorial Generator ─────────────────────────────────────────────────────────

_TUTORIAL_GENERATORS = {
    "search": generate_search_tutorial,
    "factoring": generate_factoring_tutorial,
    "optimization": generate_optimization_tutorial,
    "database": generate_database_tutorial,
}

def generate_tutorial(algorithm: str, input_size: int) -> TutorialSession:
    """Generate tutorial for any algorithm."""
    if algorithm not in _TUTORIAL_GENERATORS:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    return _TUTORIAL_GENERATORS[algorithm](input_size)
