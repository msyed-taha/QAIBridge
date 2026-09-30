"""
Module 6 - Neural Angle Optimizer
qaoa_angles.py - A neural network that predicts QAOA angles (γ, β)  (OBJ-3, FE-2)

Tuning QAOA's 2p angles with a classical optimiser costs hundreds of circuit
evaluations per problem. Optimal angles, however, "concentrate": graphs with
similar structure have similar optimal (γ, β) (Brandão et al. 2018; Zhou et
al. 2020). So we can LEARN them:

  1. generate random Max-Cut graphs and find their optimal angles with the
     standard optimiser (p=1 grid search → COBYLA → INTERP layer growth);
  2. train a small PyTorch MLP: graph features → (γ₁…γ_p, β₁…β_p);
  3. on NEW graphs, compare
        cold start   – the full optimiser from scratch,
        neural only  – predicted angles, zero optimiser steps,
        neural warm  – predicted angles + a short COBYLA refinement.

The report shows how many circuit evaluations the network saves and the
approximation ratio each strategy reaches.
"""

from __future__ import annotations

import math
import time
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
from torch import nn

from ..module2_sfod.qaoa import QAOAEvaluator, run_qaoa
from ..module5_transformer.bridge import maxcut_bridge

N_FEATURES = 6
_cache: Dict[Tuple[int, int, int, int], Dict[str, Any]] = {}


def random_graph(n: int, rng: np.random.Generator) -> List[Tuple[int, int, float]]:
    p = rng.uniform(0.3, 0.8)
    edges = {(i, j) for i in range(n) for j in range(i + 1, n) if rng.random() < p}
    for i in range(n):                       # make sure every node is connected
        if not any(i in e for e in edges):
            j = (i + 1) % n
            edges.add((min(i, j), max(i, j)))
    return [(i, j, 1.0) for i, j in sorted(edges)]


def graph_features(n: int, edges: List[Tuple[int, int, float]]) -> np.ndarray:
    deg = np.zeros(n)
    adj = np.zeros((n, n))
    for i, j, _ in edges:
        deg[i] += 1
        deg[j] += 1
        adj[i, j] = adj[j, i] = 1
    m = len(edges)
    pairs = n * (n - 1) / 2
    tri = np.trace(adj @ adj @ adj) / 6
    possible_tri = sum(d * (d - 1) / 2 for d in deg) or 1
    return np.array([
        n / 10.0, m / pairs, deg.mean() / (n - 1), deg.std() / (n - 1), deg.max() / (n - 1), tri / possible_tri,
    ], dtype=np.float32)


class AnglePredictor(nn.Module):
    """graph features → angles; γ ∈ (0, π), β ∈ (0, π/2) through scaled sigmoids."""

    def __init__(self, p: int):
        super().__init__()
        self.p = p
        self.net = nn.Sequential(nn.Linear(N_FEATURES, 32), nn.Tanh(), nn.Linear(32, 32), nn.Tanh(), nn.Linear(32, 2 * p))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = torch.sigmoid(self.net(x))
        scale = torch.tensor([math.pi] * self.p + [math.pi / 2] * self.p)
        return z * scale


def _optimal_angles(n: int, edges, p: int, seed: int) -> Dict[str, Any]:
    b = maxcut_bridge(n, edges)
    r = run_qaoa(b, p=p, objective="expectation", shots=0, seed=seed)
    max_cut = b.solve_exactly()["cut_value"]
    return {"angles": r["gammas"] + r["betas"], "evaluations": r["circuit_evaluations"],
            "approx_ratio": -r["expected_energy"] / max_cut, "bridge": b, "max_cut": max_cut}


def _ratio_at(bridge, max_cut: float, angles: List[float], p: int) -> float:
    ev = QAOAEvaluator(bridge.ising)
    probs = ev.state(angles[:p], angles[p:]).probabilities()
    return -ev.expectation(probs) / max_cut


def train_and_evaluate(train_graphs: int = 40, test_graphs: int = 10, p: int = 2, seed: int = 11,
                       epochs: int = 600) -> Dict[str, Any]:
    key = (train_graphs, test_graphs, p, seed)
    if key in _cache:
        return {**_cache[key], "cached": True}
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    t_start = time.perf_counter()

    # 1. training set: optimal angles found by the classical optimiser
    X, Y, train_evals = [], [], []
    for k in range(train_graphs):
        n = int(rng.integers(4, 10))
        edges = random_graph(n, rng)
        opt = _optimal_angles(n, edges, p, seed + k)
        X.append(graph_features(n, edges))
        Y.append(opt["angles"])
        train_evals.append(opt["evaluations"])
    X_t = torch.tensor(np.array(X))
    Y_t = torch.tensor(np.array(Y), dtype=torch.float32)
    data_ms = (time.perf_counter() - t_start) * 1000

    # 2. train the network
    model = AnglePredictor(p)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    losses: List[float] = []
    t0 = time.perf_counter()
    for epoch in range(epochs):
        opt.zero_grad()
        loss = torch.mean((model(X_t) - Y_t) ** 2)
        loss.backward()
        opt.step()
        if epoch % 10 == 0 or epoch == epochs - 1:
            losses.append(round(float(loss.item()), 6))
    train_ms = (time.perf_counter() - t0) * 1000

    # 3. unseen graphs: cold start vs neural-only vs neural warm start
    rows = []
    model.eval()
    for k in range(test_graphs):
        n = int(rng.integers(5, 10))
        edges = random_graph(n, rng)
        cold = _optimal_angles(n, edges, p, 10_000 + k)
        with torch.no_grad():
            pred = model(torch.tensor(graph_features(n, edges)).unsqueeze(0))[0].tolist()
        neural_only = _ratio_at(cold["bridge"], cold["max_cut"], pred, p)
        warm = run_qaoa(cold["bridge"], p=p, objective="expectation", shots=0, seed=k,
                        init={"gammas": pred[:p], "betas": pred[p:]}, maxiter=40)
        rows.append({
            "nodes": n, "edges": len(edges),
            "cold_evaluations": cold["evaluations"], "cold_ratio": round(cold["approx_ratio"], 4),
            "neural_ratio": round(neural_only, 4),
            "warm_evaluations": warm["circuit_evaluations"],
            "warm_ratio": round(-warm["expected_energy"] / cold["max_cut"], 4),
            "predicted": [round(a, 4) for a in pred], "optimal": [round(a, 4) for a in cold["angles"]],
        })

    mean = lambda key: round(float(np.mean([r[key] for r in rows])), 4)  # noqa: E731
    report = {
        "p": p, "train_graphs": train_graphs, "test_graphs": test_graphs,
        "loss_curve": losses, "final_loss": losses[-1],
        "dataset_ms": round(data_ms, 1), "training_ms": round(train_ms, 1),
        "mean_train_evaluations": round(float(np.mean(train_evals)), 1),
        "tests": rows,
        "summary": {
            "cold_evaluations": mean("cold_evaluations"), "cold_ratio": mean("cold_ratio"),
            "neural_ratio": mean("neural_ratio"),
            "warm_evaluations": mean("warm_evaluations"), "warm_ratio": mean("warm_ratio"),
            "evaluations_saved_pct": round(100 * (1 - mean("warm_evaluations") / mean("cold_evaluations")), 1),
        },
        "total_ms": round((time.perf_counter() - t_start) * 1000, 1),
        "cached": False,
    }
    _cache[key] = report
    return report
