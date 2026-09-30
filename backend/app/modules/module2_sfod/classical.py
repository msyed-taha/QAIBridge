"""
Module 2 – SFOD Model Comparison Suite
classical.py  –  Instrumented classical baselines.

Every baseline really runs and counts the operation the quantum algorithm is
compared on (item comparisons, record reads, divisions, tour evaluations),
alongside its measured wall-clock time.
"""

from __future__ import annotations

import itertools
import math
import random
import time
from typing import Any, Callable, Dict, List, Optional, Sequence


def _ms(t0: float) -> float:
    return round((time.perf_counter() - t0) * 1000.0, 4)


# ── Search / Database ─────────────────────────────────────────────────────────

def linear_search(items: Sequence[Any], is_target: Callable[[Any], bool]) -> Dict[str, Any]:
    """Scan until the first match. Comparisons = position of the match (or N)."""
    t0 = time.perf_counter()
    comparisons = 0
    found = None
    for i, item in enumerate(items):
        comparisons += 1
        if is_target(item):
            found = i
            break
    return {
        "algorithm": "Linear Search",
        "complexity": "O(N)",
        "found_index": found,
        "comparisons": comparisons,
        "expected_comparisons": (len(items) + 1) / 2,
        "worst_case": len(items),
        "time_ms": _ms(t0),
    }


def sequential_scan(records: Sequence[Any], matches: Callable[[Any], bool]) -> Dict[str, Any]:
    """Unindexed query: every record must be read once."""
    t0 = time.perf_counter()
    hits = [i for i, r in enumerate(records) if matches(r)]
    return {
        "algorithm": "Sequential Scan",
        "complexity": "O(N)",
        "matches": hits,
        "reads": len(records),
        "time_ms": _ms(t0),
    }


# ── Factoring ─────────────────────────────────────────────────────────────────

def trial_division(n: int) -> Dict[str, Any]:
    """Full prime factorisation by trial division; counts divisions performed."""
    t0 = time.perf_counter()
    factors: List[int] = []
    divisions = 0
    m = n
    d = 2
    while d * d <= m:
        divisions += 1
        while m % d == 0:
            factors.append(d)
            m //= d
        d += 1 if d == 2 else 2
    if m > 1:
        factors.append(m)
    return {
        "algorithm": "Trial Division",
        "complexity": "O(√N)",
        "factors": factors,
        "divisions": divisions,
        "worst_case_divisions": math.isqrt(n),
        "time_ms": _ms(t0),
    }


def is_probable_prime(n: int) -> bool:
    """Deterministic Miller–Rabin for n < 3.3·10^24."""
    if n < 2:
        return False
    small = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37)
    for p in small:
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in small:
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


def perfect_power(n: int) -> Optional[tuple]:
    """Return (base, exponent) if n = base^exponent with exponent ≥ 2."""
    for k in range(2, n.bit_length() + 1):
        b = round(n ** (1.0 / k))
        for c in (b - 1, b, b + 1):
            if c > 1 and c ** k == n:
                return c, k
    return None


def pollard_rho(n: int, seed: int = 1) -> Dict[str, Any]:
    """Pollard's rho (Brent variant) with full factorisation — the practical classical method for mid-size N."""
    t0 = time.perf_counter()
    rng = random.Random(seed)
    steps = 0

    def rho(m: int) -> int:
        nonlocal steps
        if m % 2 == 0:
            return 2
        while True:
            y, c, r, q, g = rng.randrange(1, m), rng.randrange(1, m), 1, 1, 1
            x = ys = y
            while g == 1:
                x = y
                for _ in range(r):
                    y = (y * y + c) % m
                    steps += 1
                k = 0
                while k < r and g == 1:
                    ys = y
                    for _ in range(min(64, r - k)):
                        y = (y * y + c) % m
                        q = q * abs(x - y) % m
                        steps += 1
                    g = math.gcd(q, m)
                    k += 64
                r *= 2
            if g == m:
                g = 1
                while g == 1:
                    ys = (ys * ys + c) % m
                    g = math.gcd(abs(x - ys), m)
                    steps += 1
            if g != m:
                return g

    def factor(m: int, out: List[int]) -> None:
        if m == 1:
            return
        if is_probable_prime(m):
            out.append(m)
            return
        d = rho(m)
        factor(d, out)
        factor(m // d, out)

    factors: List[int] = []
    factor(n, factors)
    return {
        "algorithm": "Pollard's rho",
        "complexity": "O(N^¼)",
        "factors": sorted(factors),
        "iterations": steps,
        "time_ms": _ms(t0),
    }


def gnfs_operations(n_bits: int) -> float:
    """Heuristic cost of the General Number Field Sieve, L_N[1/3, (64/9)^{1/3}]."""
    ln_n = n_bits * math.log(2)
    return math.exp((64 / 9) ** (1 / 3) * ln_n ** (1 / 3) * math.log(ln_n) ** (2 / 3))


# ── Optimisation ──────────────────────────────────────────────────────────────

def tour_length(tour: Sequence[int], dist) -> float:
    return float(sum(dist[tour[i]][tour[(i + 1) % len(tour)]] for i in range(len(tour))))


def tsp_brute_force(dist) -> Dict[str, Any]:
    """Exact TSP by enumerating every tour that starts at city 0."""
    t0 = time.perf_counter()
    n = len(dist)
    best, best_len, evaluated = None, float("inf"), 0
    for perm in itertools.permutations(range(1, n)):
        tour = (0,) + perm
        evaluated += 1
        length = tour_length(tour, dist)
        if length < best_len:
            best, best_len = tour, length
    return {
        "algorithm": "Exhaustive Search",
        "complexity": "O(N!)",
        "tour": list(best) + [0],
        "length": round(best_len, 4),
        "tours_evaluated": evaluated,
        "time_ms": _ms(t0),
    }


def tsp_nearest_neighbour(dist) -> Dict[str, Any]:
    """Greedy heuristic: always go to the closest unvisited city."""
    t0 = time.perf_counter()
    n = len(dist)
    tour, visited, comparisons = [0], {0}, 0
    while len(tour) < n:
        cur = tour[-1]
        best_j, best_d = None, float("inf")
        for j in range(n):
            if j not in visited:
                comparisons += 1
                if dist[cur][j] < best_d:
                    best_j, best_d = j, dist[cur][j]
        tour.append(best_j)
        visited.add(best_j)
    return {
        "algorithm": "Greedy Nearest-Neighbour",
        "complexity": "O(N²)",
        "tour": tour + [0],
        "length": round(tour_length(tour, dist), 4),
        "comparisons": comparisons,
        "time_ms": _ms(t0),
    }


def brute_force_qubo(energies) -> Dict[str, Any]:
    """Exact minimum of a tabulated energy landscape (2^n evaluations)."""
    t0 = time.perf_counter()
    import numpy as np
    k = int(np.argmin(energies))
    return {"index": k, "energy": float(energies[k]), "evaluations": int(len(energies)), "time_ms": _ms(t0)}
