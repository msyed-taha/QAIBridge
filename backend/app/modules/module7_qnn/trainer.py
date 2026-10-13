"""
Neural Network Converter — trains the classical network and the quantum network
it becomes, on equal terms.

    classical   the network as described
    quantum     the converted circuit, from a fresh start
    warm        the converted circuit, started from the trained classical
                network's first-layer weights (parameter_mapping.py)

All three learn the same 140 points with the same optimiser (Adam), the same
loss (binary cross-entropy) and the same number of steps, each step using all
140 points. The best step size differs between a classical network and a
circuit, so each tries two learning rates and keeps the one with the lower
training loss; the 60 test points are never used to choose. Each runs from 3
seeds, so the page shows the spread, not one lucky run. A warm start copies the
classical network of the same seed, trained at the classical network's chosen
learning rate.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Callable, Dict, List, Sequence

import torch

from ..kept_results import KeptResults
from .architecture import parse_architecture
from .circuit import Params, classical_probability, classical_start, quantum_probability, quantum_start
from .converter import convert_architecture
from .data import DATASETS, REAL, dataset
from .parameter_mapping import warm_start

METHODS = {"classical": "Classical network", "quantum": "Quantum network", "warm": "Quantum, warm-started"}
LEARNING_RATES = {"classical": (0.03, 0.1), "quantum": (0.05, 0.1), "warm": (0.05, 0.1)}
SEEDS = 3
DEFAULT_STEPS = 100
GRID, EXTENT = 41, 1.1              # the maps: 41 × 41 points over [−1.1, 1.1]²
DEFAULT_LAYERS = [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dense", "units": 4, "activation": "relu"}]

# The default network on every dataset is worked out in the background when the page opens.
WARM_UP = os.getenv("CONVERTER_WARM_UP", "1") == "1"
_cache = KeptResults(32)
_warming = threading.Lock()


def warm_up() -> None:
    if not WARM_UP or not _warming.acquire(blocking=False):
        return

    def work() -> None:
        for name in DATASETS:
            compare(DEFAULT_LAYERS, name)

    threading.Thread(target=work, name="converter-warm-up", daemon=True).start()


def _loss(p: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    """Binary cross-entropy of every network: [M]."""
    p = p.clamp(1e-7, 1 - 1e-7)
    return -(y * p.log() + (1 - y) * (1 - p).log()).mean(-1)


def _train(params: Params, lr: torch.Tensor, steps: int, loss_of: Callable[[Params, bool], torch.Tensor],
           noisy: bool) -> torch.Tensor:
    """
    Adam on every network at once, each with its own learning rate. Returns the
    training loss before each step and after the last one: [M, steps + 1].
    `noisy`: training differs from use (dropout), so the curve gets its own pass.
    """
    tensors = [t.requires_grad_(True) for block in params for t in block.values()]
    m = [torch.zeros_like(t) for t in tensors]
    v = [torch.zeros_like(t) for t in tensors]
    b1, b2, eps = 0.9, 0.999, 1e-8
    curve: List[torch.Tensor] = []
    for t in range(1, steps + 1):
        loss = loss_of(params, True)
        if noisy:
            with torch.no_grad():
                curve.append(loss_of(params, False))
        else:
            curve.append(loss.detach())
        grads = torch.autograd.grad(loss.sum(), tensors)        # networks are independent: each gets its own gradient
        with torch.no_grad():
            for p, g, mm, vv in zip(tensors, grads, m, v):
                mm.mul_(b1).add_(g, alpha=1 - b1)
                vv.mul_(b2).addcmul_(g, g, value=1 - b2)
                rate = lr.view(-1, *([1] * (p.dim() - 1)))
                p.sub_(rate * (mm / (1 - b1 ** t)) / ((vv / (1 - b2 ** t)).sqrt() + eps))
    with torch.no_grad():
        curve.append(loss_of(params, False))
    return torch.stack(curve, dim=1)


def _spread(t: torch.Tensor) -> Dict[str, float]:
    return {"mean": round(float(t.mean()), 4), "min": round(float(t.min()), 4), "max": round(float(t.max()), 4)}


def _accuracy(p: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    return ((p > 0.5).to(REAL) == y).to(REAL).mean(-1)


def _compare(layers: List[Dict], name: str, steps: int, seeds: int) -> Dict[str, Any]:
    t0 = time.perf_counter()
    parsed = parse_architecture(layers, input_dim=2, output_dim=1)
    report = convert_architecture(parsed)
    units = report.qnn.blocks
    X, y, Xt, yt = dataset(name)
    axis = torch.linspace(-EXTENT, EXTENT, GRID, dtype=REAL)
    grid = torch.stack(torch.meshgrid(axis, axis, indexing="xy"), dim=-1).reshape(-1, 2)   # row by row, x fastest
    dropout = torch.Generator().manual_seed(99)
    noisy = any(l["type"] == "dropout" for l in layers)

    def classical(p: Params, x: torch.Tensor, training: bool) -> torch.Tensor:
        return classical_probability(p, layers, x, dropout if training else None)

    def quantum(p: Params, x: torch.Tensor, training: bool) -> torch.Tensor:
        return quantum_probability(p, units, x)

    def run(method: str, start: Params, forward, size: int):
        rates = LEARNING_RATES[method]
        params = [{k: t.repeat(len(rates), *([1] * (t.dim() - 1))) for k, t in block.items()} for block in start]
        lr = torch.tensor([r for r in rates for _ in range(seeds)], dtype=REAL)
        curves = _train(params, lr, steps, lambda p, training: _loss(forward(p, X, training), y),
                        noisy and method == "classical")
        pick = int(curves[:, -1].view(len(rates), seeds).mean(1).argmin())
        chosen = slice(pick * seeds, (pick + 1) * seeds)
        trained = [{k: t[chosen].detach() for k, t in block.items()} for block in params]
        c = curves[chosen]
        with torch.no_grad():
            train_acc = _accuracy(forward(trained, X, False), y)
            test_acc = _accuracy(forward(trained, Xt, False), yt)
            typical = int(c[:, -1].argsort()[seeds // 2])                   # the run in the middle, by training loss
            chances = forward([{k: t[typical:typical + 1] for k, t in b.items()} for b in trained], grid, False)[0]
        summary = {
            "label": METHODS[method],
            "params": size,
            "learning_rate": rates[pick],
            "learning_rates_tried": list(rates),
            "curve_mean": [round(float(v), 4) for v in c.mean(0)],
            "curve_min": [round(float(v), 4) for v in c.min(0).values],
            "curve_max": [round(float(v), 4) for v in c.max(0).values],
            "start_loss": _spread(c[:, 0]),
            "final_loss": _spread(c[:, -1]),
            "train_accuracy": _spread(train_acc),
            "test_accuracy": {**_spread(test_acc), "runs": [round(float(a), 4) for a in test_acc]},
            "map": [[round(float(v), 3) for v in row] for row in chances.view(GRID, GRID)],
            "map_run": typical,
        }
        return summary, trained

    methods: Dict[str, Any] = {}
    methods["classical"], trained = run("classical", classical_start(layers, seeds, torch.Generator().manual_seed(1)),
                                        classical, report.classical_params)
    methods["quantum"], _ = run("quantum", quantum_start(units, seeds, torch.Generator().manual_seed(2)),
                                quantum, report.qnn.trainable)
    methods["warm"], _ = run("warm", warm_start(trained, units, X), quantum, report.qnn.trainable)

    return {
        "dataset": name,
        "steps": steps,
        "seeds": seeds,
        "train_points": len(y),
        "test_points": len(yt),
        "layers": layers,
        "conversion": report.to_dict(),
        "methods": methods,
        "grid": [round(float(v), 4) for v in axis],
        "seconds": round(time.perf_counter() - t0, 2),
    }


def compare(layers: Sequence[Dict], dataset_name: str = "xor", steps: int = DEFAULT_STEPS, seeds: int = SEEDS) -> Dict[str, Any]:
    """Train all three; the same settings give the same numbers, so results are kept. Raises ArchitectureError."""
    parsed = parse_architecture(list(layers), input_dim=2, output_dim=1)
    clean = [{"type": l.type, "units": l.units, "activation": l.activation} for l in parsed.layers]
    if dataset_name not in DATASETS:
        raise ValueError(f"Unknown dataset '{dataset_name}'.")
    key = ("compare", json.dumps(clean), dataset_name, steps, seeds)
    return _cache.get(key, lambda: _compare(clean, dataset_name, steps, seeds))


def untrained(layers: Sequence[Dict], dataset_name: str = "xor", seed: int = 0) -> Dict[str, Any]:
    """The converted circuit from a fresh start, run once on the test points with no training."""
    parsed = parse_architecture(list(layers), input_dim=2, output_dim=1)
    units = [l.units for l in parsed.dense_layers]
    _, _, Xt, yt = dataset(dataset_name)
    with torch.no_grad():
        p = quantum_probability(quantum_start(units, 1, torch.Generator().manual_seed(seed)), units, Xt)[0]
    return {"chances": [round(float(v), 4) for v in p], "labels": [int(v) for v in yt],
            "accuracy": round(float(_accuracy(p, yt)), 4)}
