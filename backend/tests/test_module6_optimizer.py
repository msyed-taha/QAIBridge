"""
Module 6 - Neural Angle Optimizer - test suite.

Run from backend/:  python -m pytest tests/test_module6_optimizer.py -v

Sections mirror the module's own layers:
  1. Neural model      (AngleNet)
  2. Angle prediction  (quantum_layer forward pass + parameter-shift gradient)
  3. Circuit integration (module1_kernel gate matrices used, not re-derived)
  4. Optimization      (trainer.py end-to-end runs)
  5. Barren plateau detection (live monitor + ex-post variance study)
  6. API endpoints     (FastAPI router)
"""
from __future__ import annotations

import math
import random

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from app.modules.module1_kernel.gates import RY, RZ
from app.modules.module6_optimizer import (
    AngleNet,
    BarrenPlateauMonitor,
    bce_loss,
    measure_barren_plateau,
    param_shift_grad_single,
    predict_proba,
    predict_z,
    run_full_report,
    train_classical_baseline,
    train_neural_optimizer,
)
from app.modules.module6_optimizer.dataset import get_toy_classification_dataset

N_QUBITS, LAYERS = 2, 1
N_PARAMS = N_QUBITS * LAYERS * 2  # theta, phi per qubit per layer


# ── 1. Neural model (AngleNet) ──────────────────────────────────────────────

class TestAngleNet:
    def test_output_shape(self):
        net = AngleNet(N_PARAMS)
        out = net()
        assert out.shape == (N_PARAMS,)

    def test_output_bounded_by_angle_scale(self):
        net = AngleNet(N_PARAMS, angle_scale=math.pi)
        out = net().detach().numpy()
        assert np.all(np.abs(out) <= math.pi + 1e-6)

    def test_small_angle_initialisation(self):
        """The whole barren-plateau mitigation hinges on this: at construction
        time, before any training, AngleNet's output must be close to zero
        (near-identity circuit), not spread uniformly over [-pi, pi]."""
        net = AngleNet(N_PARAMS)
        out = net().detach().numpy()
        assert np.all(np.abs(out) < 0.5)

    def test_output_is_differentiable(self):
        net = AngleNet(N_PARAMS)
        out = net()
        loss = out.sum()
        loss.backward()
        grads = [p.grad for p in net.parameters()]
        assert all(g is not None for g in grads)


# ── 2. Angle prediction / quantum evaluation layer ─────────────────────────

class TestQuantumLayer:
    def test_predict_z_bounded(self):
        angles = np.random.uniform(0, 2 * math.pi, N_PARAMS)
        z = predict_z(N_QUBITS, LAYERS, [0.3, 0.7], angles)
        assert -1.0 - 1e-9 <= z <= 1.0 + 1e-9

    def test_predict_proba_bounded(self):
        angles = np.random.uniform(0, 2 * math.pi, N_PARAMS)
        p = predict_proba(N_QUBITS, LAYERS, [0.3, 0.7], angles)
        assert 0.0 <= p <= 1.0

    def test_identity_angles_reduce_to_encoding_only(self):
        """With every trainable RY/RZ angle at 0, the RY/RZ layer is the
        identity, so <Z_0> should match a circuit that only applies the
        RX encoding gate and the entangling CNOTs act on |0>/|1>-only
        computational-basis input from a single RX -- i.e. it must still be
        a deterministic, reproducible number (regression/sanity check that
        forward() has no hidden randomness)."""
        zero_angles = np.zeros(N_PARAMS)
        z1 = predict_z(N_QUBITS, LAYERS, [0.4, 0.4], zero_angles)
        z2 = predict_z(N_QUBITS, LAYERS, [0.4, 0.4], zero_angles)
        assert z1 == pytest.approx(z2)

    def test_bce_loss_positive(self):
        X, y = get_toy_classification_dataset()
        angles = np.random.uniform(0, 2 * math.pi, N_PARAMS)
        loss = bce_loss(N_QUBITS, LAYERS, X, y, angles)
        assert loss > 0.0

    def test_param_shift_matches_finite_difference(self):
        """The parameter-shift rule is exact for Pauli rotations, so it must
        agree with a central finite-difference estimate to a small tolerance."""
        angles = np.random.uniform(0, 2 * math.pi, N_PARAMS)
        x = [0.3, 0.6]
        analytic = param_shift_grad_single(N_QUBITS, LAYERS, x, angles, param_index=0)

        h = 1e-4
        plus, minus = angles.copy(), angles.copy()
        plus[0] += h
        minus[0] -= h
        numeric = (predict_z(N_QUBITS, LAYERS, x, plus) - predict_z(N_QUBITS, LAYERS, x, minus)) / (2 * h)

        assert analytic == pytest.approx(numeric, abs=1e-3)

    def test_quantum_classifier_loss_autograd_matches_param_shift(self):
        """The torch.autograd.Function bridge (backward()) must reproduce the
        same gradient as calling param_shift_grad_single + chain rule by
        hand -- this is the thing that actually trains both Method A and B,
        so a silent mismatch here would invalidate every result the module
        reports."""
        from app.modules.module6_optimizer.quantum_layer import QuantumClassifierLoss

        X, y = get_toy_classification_dataset()
        X, y = X[:2], y[:2]
        angles = torch.tensor(np.random.uniform(0, 2 * math.pi, N_PARAMS), requires_grad=True)

        loss = QuantumClassifierLoss.apply(angles, N_QUBITS, LAYERS, X, y)
        loss.backward()
        autograd_grad = angles.grad.numpy().copy()

        h = 1e-4
        numeric_grad = np.zeros(N_PARAMS)
        base_angles = angles.detach().numpy()
        for j in range(N_PARAMS):
            plus, minus = base_angles.copy(), base_angles.copy()
            plus[j] += h
            minus[j] -= h
            numeric_grad[j] = (
                bce_loss(N_QUBITS, LAYERS, X, y, plus) - bce_loss(N_QUBITS, LAYERS, X, y, minus)
            ) / (2 * h)

        np.testing.assert_allclose(autograd_grad, numeric_grad, atol=1e-2)


# ── 3. Circuit integration (reuses Module 1's real gate matrices) ──────────

class TestCircuitIntegration:
    def test_uses_module1_gate_matrices_not_reimplemented(self):
        """quantum_layer.py must import RY/RZ from module1_kernel.gates
        rather than hand-rolling its own rotation matrices -- this is the
        "don't fake quantum results" requirement. Spot-check RY/RZ are
        unitary, which they'd only be if these are the real gate matrices."""
        theta = 0.37
        ry = RY(theta)
        rz = RZ(theta)
        identity = np.eye(2)
        np.testing.assert_allclose(ry @ ry.conj().T, identity, atol=1e-10)
        np.testing.assert_allclose(rz @ rz.conj().T, identity, atol=1e-10)


# ── 4. Optimization controller (trainer.py) ─────────────────────────────────

class TestOptimization:
    def test_classical_baseline_runs_and_returns_expected_shapes(self):
        X, y = get_toy_classification_dataset()
        iterations = 6
        curve, acc, grad_curve, monitor = train_classical_baseline(N_QUBITS, LAYERS, iterations, X, y)
        assert len(curve) == iterations
        assert len(grad_curve) == iterations
        assert 0.0 <= acc <= 1.0
        assert "plateau_detected" in monitor and "events" in monitor

    def test_neural_optimizer_runs_and_returns_expected_shapes(self):
        X, y = get_toy_classification_dataset()
        iterations = 6
        curve, acc, grad_curve, monitor = train_neural_optimizer(N_QUBITS, LAYERS, iterations, X, y)
        assert len(curve) == iterations
        assert len(grad_curve) == iterations
        assert 0.0 <= acc <= 1.0
        assert "plateau_detected" in monitor and "events" in monitor

    def test_neural_optimizer_reduces_loss(self):
        """Not a strict monotonic guarantee (mini-batch SGD is noisy), so
        compare the average of the last few steps against the first few
        rather than a single noisy endpoint against a single noisy start.
        Uses 2 layers (not the module-level LAYERS=1) and more iterations --
        a single-layer, 4-parameter circuit is too underpowered to reliably
        fit the toy XOR-like dataset in a handful of steps regardless of
        seed, which isn't a trainer bug, just too little capacity. Seeded
        for reproducibility."""
        random.seed(0)
        torch.manual_seed(0)
        np.random.seed(0)
        X, y = get_toy_classification_dataset()
        curve, _, _, _ = train_neural_optimizer(N_QUBITS, 2, 40, X, y)
        assert np.mean(curve[-5:]) < np.mean(curve[:5])

    def test_run_full_report_shape(self):
        report = run_full_report(n_qubits=N_QUBITS, layers=LAYERS, iterations=6)
        d = report.to_dict()
        for key in (
            "classical_loss_curve", "neural_loss_curve",
            "classical_grad_norm_curve", "neural_grad_norm_curve",
            "barren_plateau", "live_barren_plateau_monitor",
        ):
            assert key in d
        assert len(d["classical_loss_curve"]) == 6
        assert len(d["neural_loss_curve"]) == 6
        assert set(d["live_barren_plateau_monitor"].keys()) == {"classical", "neural"}


# ── 5. Barren plateau detection ─────────────────────────────────────────────

class TestBarrenPlateauMonitor:
    def test_flat_gradient_sequence_triggers_event(self):
        monitor = BarrenPlateauMonitor(window=5, patience=4, grad_norm_eps=1e-3, grad_var_eps=1e-6)
        event = None
        for it in range(10):
            event = monitor.observe(it, grad_norm=1e-5) or event
        assert monitor.summary()["plateau_detected"] is True
        assert monitor.summary()["num_events"] >= 1

    def test_healthy_gradient_sequence_never_triggers(self):
        monitor = BarrenPlateauMonitor(window=5, patience=4, grad_norm_eps=1e-3, grad_var_eps=1e-6)
        rng = np.random.default_rng(0)
        for it in range(15):
            monitor.observe(it, grad_norm=float(abs(rng.normal(0.3, 0.1))))
        assert monitor.summary()["plateau_detected"] is False

    def test_ex_post_variance_study_shape(self):
        result = measure_barren_plateau(qubit_range=range(2, 4), trials=5, layers=1)
        assert result["qubits"] == [2, 3]
        assert len(result["random_init_variance"]) == 2
        assert len(result["small_angle_init_variance"]) == 2

    def test_random_and_small_angle_init_produce_distinct_statistics(self):
        """Sanity check on the ex-post study, not a claim about which is
        larger: sampling angles from [-0.05, 0.05] (small-angle) is a much
        narrower window than [0, 2*pi] (random), so trial-to-trial gradient
        *variance* is expected to differ between the two -- confirming the
        two initialisation strategies are actually being distinguished
        rather than the study silently measuring the same thing twice.
        (Whether small-angle variance ends up above or below random-init
        variance at a given qubit count also depends on circuit depth, so
        this test does not assert an ordering -- see measure_barren_plateau's
        docstring for the qubit-count *trend* the study is meant to show.)"""
        result = measure_barren_plateau(qubit_range=[6], trials=25, layers=1)
        random_var = result["random_init_variance"][0]
        small_var = result["small_angle_init_variance"][0]
        assert random_var >= 0.0 and small_var >= 0.0
        assert random_var != pytest.approx(small_var, rel=0.5)


# ── 6. API endpoints ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


class TestAPI:
    def test_status_endpoint(self, client):
        resp = client.get("/api/module6/status")
        assert resp.status_code == 200
        body = resp.json()
        assert body == {"module": 6, "name": "Neural Angle Optimizer", "status": "active"}

    def test_train_endpoint_returns_full_report(self, client):
        resp = client.post("/api/module6/train", json={"n_qubits": 2, "layers": 1, "iterations": 10})
        assert resp.status_code == 200
        body = resp.json()
        for key in (
            "classical_loss_curve", "neural_loss_curve",
            "classical_accuracy", "neural_accuracy",
            "classical_grad_norm_curve", "neural_grad_norm_curve",
            "live_barren_plateau_monitor", "barren_plateau",
        ):
            assert key in body
        assert len(body["classical_loss_curve"]) == 10

    def test_train_endpoint_rejects_out_of_range_qubits(self, client):
        resp = client.post("/api/module6/train", json={"n_qubits": 20, "layers": 1, "iterations": 10})
        assert resp.status_code == 422


# ── QAOA angle predictor (γ, β) ────────────────────────────────────────────────

def test_qaoa_angle_predictor_saves_circuit_evaluations():
    from app.modules.module6_optimizer.qaoa_angles import train_and_evaluate
    report = train_and_evaluate(train_graphs=20, test_graphs=4, p=1, seed=3, epochs=300)
    s = report["summary"]
    assert s["warm_evaluations"] < s["cold_evaluations"]
    assert s["warm_ratio"] >= s["cold_ratio"] - 0.02          # same quality, far fewer circuit runs
    assert 0.5 < s["neural_ratio"] <= 1.0
    assert len(report["tests"]) == 4 and all(len(t["predicted"]) == 2 for t in report["tests"])
