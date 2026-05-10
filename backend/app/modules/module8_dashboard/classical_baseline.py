"""
Module 8 – Interactive Performance Dashboard
classical_baseline.py  –  Classical algorithm implementations

These mirror the quantum algorithms in the SFOD suite so the dashboard
can produce fair side-by-side timing and accuracy comparisons.
"""

from __future__ import annotations

import math
import time
import random
from typing import Dict, List, Tuple, Any


# ──────────────────────────────────────────────────────────────────────────────
# Search
# ──────────────────────────────────────────────────────────────────────────────

def classical_linear_search(data: List[Any], target: Any) -> Dict:
    """
    O(N) linear search — classical analogue of Grover's algorithm.
    Returns the index and number of comparisons made.
    """
    t0 = time.perf_counter()
    comparisons = 0
    found_index = -1

    for i, item in enumerate(data):
        comparisons += 1
        if item == target:
            found_index = i
            break

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "algorithm":    "Classical Linear Search",
        "n":            len(data),
        "found_index":  found_index,
        "comparisons":  comparisons,
        "found":        found_index != -1,
        "elapsed_ms":   elapsed_ms,
        "complexity":   "O(N)",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Factoring
# ──────────────────────────────────────────────────────────────────────────────

def classical_trial_division(n: int) -> Dict:
    """
    Trial division factoring — classical analogue of Shor's algorithm.
    Returns the smallest non-trivial factor and number of divisions tried.
    """
    t0 = time.perf_counter()
    divisions = 0

    if n < 2:
        return {"error": "n must be >= 2"}
    if n == 2:
        return {"factor": 1, "n": n, "divisions": 0, "elapsed_ms": 0.0,
                "complexity": "O(√N)", "algorithm": "Trial Division"}

    factor = None
    for i in range(2, int(math.isqrt(n)) + 1):
        divisions += 1
        if n % i == 0:
            factor = i
            break

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "algorithm":    "Classical Trial Division",
        "n":            n,
        "factor":       factor if factor else n,
        "is_prime":     factor is None,
        "divisions":    divisions,
        "elapsed_ms":   elapsed_ms,
        "complexity":   "O(√N)",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Optimization — Traveling Salesman (greedy nearest-neighbor)
# ──────────────────────────────────────────────────────────────────────────────

def classical_tsp_greedy(cities: List[Tuple[float, float]]) -> Dict:
    """
    Greedy nearest-neighbor TSP heuristic.
    Classical analogue of QAOA on graph optimization.
    """
    t0 = time.perf_counter()
    n = len(cities)
    if n == 0:
        return {"error": "Empty city list"}

    def dist(a, b):
        return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)

    visited = [False] * n
    route = [0]
    visited[0] = True
    total_dist = 0.0
    iterations = 0

    for _ in range(n - 1):
        current = route[-1]
        nearest = -1
        nearest_d = float("inf")
        for j in range(n):
            iterations += 1
            if not visited[j]:
                d = dist(cities[current], cities[j])
                if d < nearest_d:
                    nearest_d = d
                    nearest = j
        route.append(nearest)
        visited[nearest] = True
        total_dist += nearest_d

    # Return to start
    total_dist += dist(cities[route[-1]], cities[route[0]])
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "algorithm":    "Classical Greedy TSP",
        "n_cities":     n,
        "route":        route,
        "total_distance": round(total_dist, 4),
        "iterations":   iterations,
        "elapsed_ms":   elapsed_ms,
        "complexity":   "O(N²)",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Database — Classical unstructured database search
# ──────────────────────────────────────────────────────────────────────────────

def classical_database_search(db_size: int, target_index: int) -> Dict:
    """
    Simulate searching an unstructured database of `db_size` records.
    On average requires N/2 comparisons.
    """
    t0 = time.perf_counter()
    # Simulate O(N) scan
    comparisons = 0
    found = False

    for i in range(db_size):
        comparisons += 1
        if i == target_index:
            found = True
            break

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "algorithm":    "Classical DB Sequential Scan",
        "db_size":      db_size,
        "target_index": target_index,
        "comparisons":  comparisons,
        "found":        found,
        "elapsed_ms":   elapsed_ms,
        "complexity":   "O(N)",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Neural Network — classical forward pass timing
# ──────────────────────────────────────────────────────────────────────────────

def classical_nn_forward(input_size: int, hidden_sizes: List[int], output_size: int,
                          n_samples: int = 100) -> Dict:
    """
    Simulate a classical neural network forward pass timing using numpy.
    Used by Module 8 to compare against QNN execution time.
    """
    import numpy as np

    t0 = time.perf_counter()

    # Build random weight matrices
    layers = [input_size] + hidden_sizes + [output_size]
    weights = [np.random.randn(layers[i + 1], layers[i]) * 0.1
               for i in range(len(layers) - 1)]
    biases = [np.random.randn(layers[i + 1]) * 0.1
              for i in range(len(layers) - 1)]

    # Forward pass over n_samples
    x = np.random.randn(input_size, n_samples)
    total_ops = 0

    for W, b in zip(weights, biases):
        x = np.maximum(0, W @ x + b[:, None])   # ReLU activation
        total_ops += W.shape[0] * W.shape[1] * n_samples

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    total_params = sum(W.size + b.size for W, b in zip(weights, biases))

    return {
        "algorithm":    "Classical Dense Neural Network",
        "architecture": layers,
        "n_samples":    n_samples,
        "total_params": int(total_params),
        "total_ops":    int(total_ops),
        "elapsed_ms":   elapsed_ms,
        "complexity":   "O(Σ L_i × L_{i+1} × N)",
    }
