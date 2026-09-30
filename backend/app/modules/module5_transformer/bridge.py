"""
Module 5 – Classical → Quantum Logic Transformer
bridge.py  –  The "Mathematical Bridge" (OBJ-2)

Turns classical constraint problems into the two structures quantum
optimisers understand:

    QUBO   minimise  E(x) = Σ_i Q_ii x_i + Σ_{i<j} Q_ij x_i x_j + c,   x ∈ {0,1}^n
    Ising  H = Σ_i h_i Z_i + Σ_{i<j} J_ij Z_i Z_j + c',                   z_i = ±1

with the substitution x_i = (1 − z_i)/2  (qubit |0⟩ ↔ x=0 ↔ z=+1).

Every basis state |x⟩ of the register is then an eigenstate of H with
eigenvalue E(x), so the lowest-energy measurement IS the best classical
answer — this is what QAOA (Module 2) searches for.

Problem encoders (each returns a Bridge with a decoder back to the domain):
    Max-Cut · Travelling Salesman · 0/1 Knapsack · Number Partitioning

Boolean logic (FE-3) is handled in boolean_logic.py — a Boolean function f
becomes the diagonal operator Σ_x f(x)|x⟩⟨x| whose Pauli-Z expansion is
computed exactly with a Walsh–Hadamard transform.

Qubit / bit ordering matches the kernel: variable 0 ↔ qubit 0 ↔ most
significant bit of the basis-state index.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import reduce
from itertools import combinations
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

MAX_BRIDGE_VARIABLES = 20   # exhaustive energy tables are 2^n long


def _bit_matrix(n: int) -> np.ndarray:
    """(2^n, n) array of the bits of every basis index, qubit 0 = MSB."""
    idx = np.arange(2 ** n, dtype=np.int64)[:, None]
    shifts = np.arange(n - 1, -1, -1, dtype=np.int64)[None, :]
    return ((idx >> shifts) & 1).astype(np.int8)


# ──────────────────────────────────────────────────────────────────────────────
# QUBO and Ising models
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Ising:
    n: int
    h: np.ndarray                       # (n,)
    J: Dict[Tuple[int, int], float]     # i < j
    offset: float = 0.0
    var_names: List[str] = field(default_factory=list)

    def energies(self) -> np.ndarray:
        """Eigenvalue of H for every basis state (length 2^n, big-endian)."""
        if self.n > MAX_BRIDGE_VARIABLES:
            raise ValueError(f"At most {MAX_BRIDGE_VARIABLES} variables can be tabulated.")
        dim = 2 ** self.n
        idx = np.arange(dim, dtype=np.int64)
        z = [1 - 2 * ((idx >> (self.n - 1 - i)) & 1) for i in range(self.n)]
        e = np.full(dim, float(self.offset))
        for i in range(self.n):
            if self.h[i]:
                e += self.h[i] * z[i]
        for (i, j), w in self.J.items():
            if w:
                e += w * z[i] * z[j]
        return e

    def pauli_terms(self, tol: float = 1e-12) -> List[Dict[str, Any]]:
        terms: List[Dict[str, Any]] = []
        if abs(self.offset) > tol:
            terms.append({"coeff": round(float(self.offset), 10), "paulis": "I", "qubits": []})
        for i in range(self.n):
            if abs(self.h[i]) > tol:
                terms.append({"coeff": round(float(self.h[i]), 10), "paulis": f"Z{i}", "qubits": [i]})
        for (i, j), w in sorted(self.J.items()):
            if abs(w) > tol:
                terms.append({"coeff": round(float(w), 10), "paulis": f"Z{i} Z{j}", "qubits": [i, j]})
        return terms

    def hamiltonian_string(self, max_terms: int = 40) -> str:
        terms = self.pauli_terms()
        if not terms:
            return "H = 0"
        out = ""
        for k, t in enumerate(terms[:max_terms]):
            c = t["coeff"]
            body = f"{abs(c):.4g}" if t["paulis"] == "I" else f"{abs(c):.4g}·{t['paulis'].replace(' ', '·')}"
            if k == 0:
                out = ("−" if c < 0 else "") + body
            else:
                out += (" − " if c < 0 else " + ") + body
        if len(terms) > max_terms:
            out += f" + … ({len(terms) - max_terms} more terms)"
        return "H = " + out

    def to_dict(self) -> Dict[str, Any]:
        return {
            "n": self.n,
            "h": [round(float(v), 10) for v in self.h],
            "J": [{"i": i, "j": j, "value": round(float(w), 10)} for (i, j), w in sorted(self.J.items()) if w],
            "offset": round(float(self.offset), 10),
            "terms": self.pauli_terms()[:200],
            "hamiltonian": self.hamiltonian_string(),
        }


@dataclass
class QUBO:
    n: int
    Q: np.ndarray                 # (n, n) upper-triangular; diagonal = linear terms
    offset: float = 0.0
    var_names: List[str] = field(default_factory=list)

    @classmethod
    def empty(cls, n: int, var_names: Optional[List[str]] = None) -> "QUBO":
        return cls(n, np.zeros((n, n)), 0.0, var_names or [f"x{i}" for i in range(n)])

    def add_linear(self, i: int, w: float) -> None:
        self.Q[i, i] += w

    def add_quadratic(self, i: int, j: int, w: float) -> None:
        if i == j:
            self.Q[i, i] += w          # x_i² = x_i
        else:
            a, b = min(i, j), max(i, j)
            self.Q[a, b] += w

    def add_squared_constraint(self, coeffs: Dict[int, float], target: float, weight: float) -> None:
        """weight · (Σ_i coeffs_i x_i − target)²  expanded into the QUBO."""
        items = list(coeffs.items())
        self.offset += weight * target * target
        for i, a in items:
            self.add_linear(i, weight * (a * a - 2 * target * a))
        for (i, a), (j, b) in combinations(items, 2):
            self.add_quadratic(i, j, weight * 2 * a * b)

    def energy(self, x: Sequence[int]) -> float:
        x = np.asarray(x, dtype=float)
        return float(x @ np.triu(self.Q) @ x + self.offset)

    def energies(self) -> np.ndarray:
        if self.n > MAX_BRIDGE_VARIABLES:
            raise ValueError(f"At most {MAX_BRIDGE_VARIABLES} variables can be tabulated.")
        X = _bit_matrix(self.n).astype(float)
        Qu = np.triu(self.Q)
        return np.einsum("ki,ij,kj->k", X, Qu, X) + self.offset

    def to_ising(self) -> Ising:
        """x_i = (1 − z_i)/2  ⇒  h, J, offset."""
        n = self.n
        Qu = np.triu(self.Q)
        h = np.zeros(n)
        J: Dict[Tuple[int, int], float] = {}
        offset = self.offset
        for i in range(n):
            q = Qu[i, i]
            offset += q / 2
            h[i] -= q / 2
        for i in range(n):
            for j in range(i + 1, n):
                q = Qu[i, j]
                if q == 0:
                    continue
                offset += q / 4
                h[i] -= q / 4
                h[j] -= q / 4
                J[(i, j)] = J.get((i, j), 0.0) + q / 4
        return Ising(n, h, J, offset, list(self.var_names))

    def brute_force(self) -> Tuple[np.ndarray, float, int]:
        """Exact minimiser by enumeration: (bits, energy, evaluations)."""
        e = self.energies()
        k = int(np.argmin(e))
        return _bit_matrix(self.n)[k], float(e[k]), len(e)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "n": self.n,
            "matrix": [[round(float(v), 8) for v in row] for row in np.triu(self.Q)],
            "offset": round(float(self.offset), 8),
            "variables": self.var_names,
            "nonzero_terms": int(np.count_nonzero(np.triu(self.Q))),
        }


@dataclass
class Bridge:
    """A classical problem expressed as a QUBO/Ising model plus a decoder."""
    kind: str
    title: str
    qubo: QUBO
    decode: Callable[[Sequence[int]], Dict[str, Any]]
    description: List[str] = field(default_factory=list)
    domain: Dict[str, Any] = field(default_factory=dict)

    @property
    def ising(self) -> Ising:
        return self.qubo.to_ising()

    def solve_exactly(self) -> Dict[str, Any]:
        bits, energy, evals = self.qubo.brute_force()
        out = self.decode(bits)
        out.update({"bits": "".join(map(str, bits)), "energy": round(energy, 8), "evaluations": evals})
        return out

    def summary(self) -> Dict[str, Any]:
        ising = self.ising
        return {
            "kind": self.kind,
            "title": self.title,
            "variables": self.qubo.n,
            "qubits": self.qubo.n,
            "steps": self.description,
            "qubo": self.qubo.to_dict(),
            "ising": ising.to_dict(),
            "domain": self.domain,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Problem encoders
# ──────────────────────────────────────────────────────────────────────────────

def maxcut_bridge(n_nodes: int, edges: Sequence[Tuple[int, int, float]]) -> Bridge:
    """
    Max-Cut: split the nodes in two groups so the total weight of edges
    crossing the split is maximal. cut(x) = Σ w_ij (x_i + x_j − 2 x_i x_j);
    we minimise −cut(x).
    """
    if not 2 <= n_nodes <= MAX_BRIDGE_VARIABLES:
        raise ValueError(f"Max-Cut supports 2–{MAX_BRIDGE_VARIABLES} nodes.")
    q = QUBO.empty(n_nodes, [f"node{i}" for i in range(n_nodes)])
    clean = []
    for i, j, w in edges:
        i, j, w = int(i), int(j), float(w)
        if i == j or not (0 <= i < n_nodes and 0 <= j < n_nodes):
            raise ValueError(f"Invalid edge ({i}, {j}).")
        clean.append((i, j, w))
        q.add_linear(i, -w)
        q.add_linear(j, -w)
        q.add_quadratic(i, j, 2 * w)

    def decode(bits: Sequence[int]) -> Dict[str, Any]:
        side_a = [i for i in range(n_nodes) if bits[i] == 0]
        side_b = [i for i in range(n_nodes) if bits[i] == 1]
        cut = sum(w for i, j, w in clean if bits[i] != bits[j])
        return {"partition": [side_a, side_b], "cut_value": round(cut, 6), "feasible": True, "objective": round(cut, 6)}

    return Bridge(
        "maxcut", f"Max-Cut on {n_nodes} nodes / {len(clean)} edges", q, decode,
        [
            f"One binary variable per node: x_i = 1 puts node i in group B ({n_nodes} qubits).",
            "Cut weight: Σ w_ij (x_i + x_j − 2·x_i·x_j) — each crossing edge counts once.",
            "Minimise the negative cut, then substitute x_i = (1 − Z_i)/2 to get Ising terms J_ij·Z_i·Z_j.",
        ],
        {"nodes": n_nodes, "edges": [{"i": i, "j": j, "w": w} for i, j, w in clean]},
    )


def tsp_bridge(dist: Sequence[Sequence[float]], names: Optional[List[str]] = None,
               penalty: Optional[float] = None) -> Bridge:
    """
    Travelling Salesman with city 0 fixed as the start: variables
    x_{i,p} = 1 if city i (1…n−1) is visited at step p (1…n−1), giving
    (n−1)² qubits. Penalties force every city and every step to be used
    exactly once; the objective is the closed tour length.
    """
    d = np.asarray(dist, dtype=float)
    n = d.shape[0]
    if d.shape != (n, n) or n < 3:
        raise ValueError("TSP needs a square distance matrix for at least 3 cities.")
    m = n - 1
    if m * m > MAX_BRIDGE_VARIABLES:
        raise ValueError(f"TSP on {n} cities needs {m * m} qubits (max {MAX_BRIDGE_VARIABLES}).")
    names = names or [f"City {i}" for i in range(n)]
    scale = float(d.max()) or 1.0
    dn = d / scale                              # normalised distances (penalty is relative)
    A = penalty if penalty is not None else 2.0 * float(dn.max()) + 0.5

    def v(i: int, p: int) -> int:               # city i ∈ 1..m, step p ∈ 1..m
        return (i - 1) * m + (p - 1)

    q = QUBO.empty(m * m, [f"x[{names[i]}@{p}]" for i in range(1, n) for p in range(1, n)])
    for i in range(1, n):                       # distance from / back to the depot
        q.add_linear(v(i, 1), dn[0, i])
        q.add_linear(v(i, m), dn[i, 0])
    for p in range(1, m):                       # consecutive steps
        for i in range(1, n):
            for j in range(1, n):
                if i != j:
                    q.add_quadratic(v(i, p), v(j, p + 1), dn[i, j])
    for i in range(1, n):                       # each city exactly once
        q.add_squared_constraint({v(i, p): 1.0 for p in range(1, n)}, 1.0, A)
    for p in range(1, n):                       # each step exactly one city
        q.add_squared_constraint({v(i, p): 1.0 for i in range(1, n)}, 1.0, A)

    def decode(bits: Sequence[int]) -> Dict[str, Any]:
        grid = [[int(bits[v(i, p)]) for p in range(1, n)] for i in range(1, n)]
        feasible = all(sum(row) == 1 for row in grid) and all(sum(col) == 1 for col in zip(*grid))
        if not feasible:
            return {"feasible": False, "tour": None, "length": None, "objective": None}
        order = [0] + [1 + next(i for i in range(m) if grid[i][p]) for p in range(m)]
        length = sum(d[order[k], order[(k + 1) % n]] for k in range(n))
        return {
            "feasible": True,
            "tour": order + [0],
            "tour_names": [names[c] for c in order + [0]],
            "length": round(float(length), 4),
            "objective": round(float(length), 4),
        }

    return Bridge(
        "tsp", f"TSP through {n} cities", q, decode,
        [
            f"Fix {names[0]} as the start; one variable x(i,p) per (city, step) pair → ({n}−1)² = {m * m} qubits.",
            "Objective: Σ d_ij · x(i,p) · x(j,p+1) plus the legs from and back to the start city.",
            f"Constraints become quadratic penalties A·(1 − Σ x)² with A = {A:.3g} (distances normalised to ≤ 1).",
            "Substituting x = (1 − Z)/2 yields the Ising Hamiltonian that QAOA minimises.",
        ],
        {"cities": names, "distance_matrix": d.round(4).tolist(), "penalty": A, "distance_scale": scale},
    )


def knapsack_bridge(values: Sequence[float], weights: Sequence[int], capacity: int,
                    names: Optional[List[str]] = None) -> Bridge:
    """
    0/1 knapsack: maximise Σ v_i x_i subject to Σ w_i x_i ≤ C. The inequality
    becomes an equality with binary slack bits s_k:  Σ w_i x_i + Σ 2^k s_k = C.
    Weights are divided by their GCD first to keep the slack register small.
    """
    values = [float(v) for v in values]
    weights = [int(w) for w in weights]
    if not values or len(values) != len(weights):
        raise ValueError("values and weights must be non-empty lists of the same length.")
    if capacity <= 0 or any(w <= 0 for w in weights):
        raise ValueError("Capacity and weights must be positive integers.")
    names = names or [f"item{i}" for i in range(len(values))]
    g = reduce(math.gcd, weights + [int(capacity)])
    w_s = [w // g for w in weights]
    cap_s = int(capacity) // g
    n_items = len(values)
    n_slack = max(1, int(math.floor(math.log2(cap_s))) + 1)
    n = n_items + n_slack
    if n > MAX_BRIDGE_VARIABLES:
        raise ValueError(f"Knapsack needs {n} qubits (max {MAX_BRIDGE_VARIABLES}); use fewer items or smaller weights.")
    vmax = max(values) or 1.0
    vn = [v / vmax for v in values]
    A = 1.0 + max(vn)                           # one unit of overweight costs more than any item is worth

    q = QUBO.empty(n, names + [f"slack{k}" for k in range(n_slack)])
    for i, val in enumerate(vn):
        q.add_linear(i, -val)
    coeffs = {i: float(w_s[i]) for i in range(n_items)}
    coeffs.update({n_items + k: float(2 ** k) for k in range(n_slack)})
    q.add_squared_constraint(coeffs, float(cap_s), A)

    def decode(bits: Sequence[int]) -> Dict[str, Any]:
        chosen = [i for i in range(n_items) if bits[i]]
        weight = sum(weights[i] for i in chosen)
        value = sum(values[i] for i in chosen)
        return {
            "feasible": weight <= capacity,
            "selected": [names[i] for i in chosen],
            "total_weight": weight,
            "total_value": round(value, 6),
            "objective": round(value, 6),
        }

    return Bridge(
        "knapsack", f"Knapsack with {n_items} items (capacity {capacity})", q, decode,
        [
            f"One variable per item ({n_items}) plus {n_slack} slack bits that absorb unused capacity → {n} qubits.",
            f"Weights were divided by their GCD ({g}) so the slack register stays small.",
            "Objective: −Σ value_i·x_i (values normalised); constraint: A·(Σ w_i·x_i + Σ 2^k·s_k − C)².",
            "Substituting x = (1 − Z)/2 gives the Ising Hamiltonian.",
        ],
        {"items": names, "values": values, "weights": weights, "capacity": capacity,
         "gcd": g, "slack_bits": n_slack, "penalty": A},
    )


def portfolio_bridge(names: Sequence[str], returns: Sequence[float], k: int,
                     cov: Optional[Sequence[Sequence[float]]] = None,
                     volatility: Optional[Sequence[float]] = None,
                     risk_aversion: float = 0.5) -> Bridge:
    """
    Portfolio selection (financial data): hold exactly k of n assets with equal
    weights, maximising  return − q·risk  where
        return = Σ μ_i x_i / k,   risk = xᵀ Σ x / k²,
    i.e. minimise  −μᵀx/k + q·xᵀΣx/k²  +  A·(Σ x_i − k)².
    Σ is the covariance matrix, or diag(σ²) when only volatilities are known.
    """
    names = [str(x) for x in names]
    n = len(names)
    mu = np.asarray(returns, dtype=float)
    if cov is not None:
        S = np.asarray(cov, dtype=float)
    elif volatility is not None:
        S = np.diag(np.asarray(volatility, dtype=float) ** 2)
    else:
        raise ValueError("Give either a covariance matrix or the assets' volatilities.")
    if mu.shape != (n,) or S.shape != (n, n):
        raise ValueError("names, returns and covariance/volatility must describe the same assets.")
    if not 2 <= n <= MAX_BRIDGE_VARIABLES:
        raise ValueError(f"Portfolio selection supports 2–{MAX_BRIDGE_VARIABLES} assets.")
    k = int(k)
    if not 1 <= k < n:
        raise ValueError("k (assets to hold) must be between 1 and n−1.")
    q = float(risk_aversion)
    lin = -mu / k
    quad = q * S / (k * k)
    scale = max(np.abs(lin).max(), np.abs(quad).max()) or 1.0
    lin_n, quad_n = lin / scale, quad / scale
    A = 2.0 * (np.abs(lin_n).max() + np.abs(quad_n).sum(axis=1).max()) + 0.5

    qubo = QUBO.empty(n, names)
    for i in range(n):
        qubo.add_linear(i, lin_n[i] + quad_n[i, i])
        for j in range(i + 1, n):
            qubo.add_quadratic(i, j, quad_n[i, j] + quad_n[j, i])
    qubo.add_squared_constraint({i: 1.0 for i in range(n)}, float(k), A)

    def decode(bits: Sequence[int]) -> Dict[str, Any]:
        x = np.asarray(bits[:n], dtype=float)
        chosen = [names[i] for i in range(n) if x[i]]
        feasible = int(x.sum()) == k
        ret = float(mu @ x) / k
        risk = float(x @ S @ x) / (k * k)
        return {
            "feasible": feasible, "selected": chosen,
            "expected_return": round(ret, 6), "volatility": round(float(np.sqrt(max(risk, 0.0))), 6),
            "score": round(ret - q * risk, 6), "objective": round(ret - q * risk, 6),
        }

    return Bridge(
        "portfolio", f"Portfolio: best {k} of {n} assets", qubo, decode,
        [
            f"One binary variable per asset: x_i = 1 means 'hold asset i' ({n} qubits).",
            f"Objective: maximise expected return − {q:g} × risk, with equal weights 1/{k} "
            "(risk = xᵀΣx/k² from the covariance matrix).",
            f"The budget 'hold exactly {k} assets' becomes the penalty A·(Σx − {k})² with A = {A:.3g}.",
            "Substituting x = (1 − Z)/2 gives the Ising Hamiltonian that QAOA minimises.",
        ],
        {"assets": names, "returns": mu.tolist(), "covariance": S.round(6).tolist(), "k": k,
         "risk_aversion": q, "penalty": A},
    )


def number_partition_bridge(numbers: Sequence[float]) -> Bridge:
    """Split numbers into two sets with equal sums: minimise (Σ s_i a_i)², s_i = 1 − 2x_i."""
    nums = [float(a) for a in numbers]
    n = len(nums)
    if not 2 <= n <= MAX_BRIDGE_VARIABLES:
        raise ValueError(f"Number partitioning supports 2–{MAX_BRIDGE_VARIABLES} numbers.")
    q = QUBO.empty(n, [f"n{i}" for i in range(n)])
    # (Σ a_i − 2 Σ a_i x_i)²
    q.add_squared_constraint({i: -2.0 * a for i, a in enumerate(nums)}, -sum(nums), 1.0)

    def decode(bits: Sequence[int]) -> Dict[str, Any]:
        a = [nums[i] for i in range(n) if bits[i] == 0]
        b = [nums[i] for i in range(n) if bits[i] == 1]
        diff = abs(sum(a) - sum(b))
        return {"sets": [a, b], "difference": round(diff, 6), "feasible": True, "objective": round(diff, 6)}

    return Bridge(
        "partition", f"Number partitioning of {n} numbers", q, decode,
        [
            "Spin s_i = +1 / −1 puts number i in set A / B, with s_i = 1 − 2·x_i.",
            "Minimise (Σ s_i·a_i)² — zero means both sets have the same sum.",
        ],
        {"numbers": nums},
    )


# ──────────────────────────────────────────────────────────────────────────────
# Geography helpers for real-world TSP data
# ──────────────────────────────────────────────────────────────────────────────

KNOWN_CITIES: Dict[str, Tuple[float, float]] = {
    "islamabad": (33.6844, 73.0479), "rawalpindi": (33.5651, 73.0169), "lahore": (31.5204, 74.3587),
    "karachi": (24.8607, 67.0011), "peshawar": (34.0151, 71.5249), "quetta": (30.1798, 66.9750),
    "multan": (30.1575, 71.5249), "faisalabad": (31.4504, 73.1350), "hyderabad": (25.3960, 68.3578),
    "sialkot": (32.4945, 74.5229), "gujranwala": (32.1877, 74.1945), "abbottabad": (34.1688, 73.2215),
    "murree": (33.9070, 73.3943), "gilgit": (35.9208, 74.3144), "skardu": (35.2971, 75.6333),
    "bahawalpur": (29.3956, 71.6836), "sukkur": (27.7052, 68.8574), "gwadar": (25.1216, 62.3254),
    "muzaffarabad": (34.3700, 73.4711), "sargodha": (32.0836, 72.6711), "mardan": (34.2010, 72.0400),
    "london": (51.5074, -0.1278), "paris": (48.8566, 2.3522), "new york": (40.7128, -74.0060),
    "tokyo": (35.6762, 139.6503), "dubai": (25.2048, 55.2708), "beijing": (39.9042, 116.4074),
    "delhi": (28.7041, 77.1025), "istanbul": (41.0082, 28.9784), "riyadh": (24.7136, 46.6753),
    "berlin": (52.5200, 13.4050), "madrid": (40.4168, -3.7038), "rome": (41.9028, 12.4964),
    "sydney": (-33.8688, 151.2093), "toronto": (43.6532, -79.3832), "cairo": (30.0444, 31.2357),
}


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def parse_city_line(line: str) -> Tuple[str, Optional[Tuple[float, float]]]:
    """'Lahore' or 'Lahore, 31.52, 74.35' or 'Depot 12.5 40' → (name, (lat, lon) | None)."""
    import re
    nums = re.findall(r"-?\d+(?:\.\d+)?", line)
    if len(nums) >= 2:
        name = re.sub(r"[,;\t]*\s*-?\d+(?:\.\d+)?", "", line).strip(" ,;\t") or line.strip()
        return name, (float(nums[-2]), float(nums[-1]))
    name = line.strip(" ,;\t")
    return name, KNOWN_CITIES.get(name.lower())


def distance_matrix_from_cities(lines: Sequence[str]) -> Dict[str, Any]:
    """
    Build a real distance matrix from city names and/or coordinates.
    Known city names use their real latitude/longitude (great-circle km);
    unknown names without coordinates get deterministic stand-in positions.
    """
    names, coords, sources = [], [], []
    for line in lines:
        name, xy = parse_city_line(line)
        names.append(name)
        if xy is None:
            seed = sum(ord(c) for c in name.lower())
            local = np.random.default_rng(seed)
            xy = (float(local.uniform(24, 36)), float(local.uniform(62, 76)))
            sources.append("estimated")
        else:
            sources.append("given" if any(ch.isdigit() for ch in line) else "known")
        coords.append(xy)
    n = len(names)
    d = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d[i, j] = d[j, i] = haversine_km(coords[i], coords[j])
    return {"names": names, "coords": coords, "sources": sources, "dist": d}
