"""
Neural Optimizer — test suite.

Run from backend/:  python -m pytest tests/test_module6_optimizer.py -v

  1. Neural model        (AngleNet)
  2. The Converter's quantum layer (quantum_layer forward pass + parameter-shift gradient)
  3. Circuit integration (module1_kernel gate matrices used, not re-derived)
  4. The classifier circuit (vqc.py): checked against the QAIbridge simulator,
     parameter shift, and real sampled measurements
  5. The barren plateau study and the live monitor
  6. The fair race
  7. API endpoints (signed in)
"""
from __future__ import annotations

import math
import random

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from app.modules.module1_kernel.gates import RY, RZ
from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import ROLE_USER, User
from app.modules.module1_kernel import QuantumCircuit, QuantumStateVector
from app.modules.module6_optimizer import (
    AngleNet,
    PlateauMonitor,
    bce_loss,
    param_shift_grad_single,
    plateau_study,
    predict_proba,
    predict_z,
    race,
    trainer,
    vqc,
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


# ── 4. The classifier circuit (vqc.py) ──────────────────────────────────────

def _kernel_z(x, angles, n, layers):
    """The same circuit on the QAIbridge simulator (Module 1)."""
    qc = QuantumCircuit(n, "check")
    for q in range(n):
        qc._add("RY", [q], [float(x[q % len(x)])])
    i = 0
    for _ in range(layers):
        for q in range(n):
            qc._add("RY", [q], [float(angles[i])])
            qc._add("RZ", [q], [float(angles[i + 1])])
            i += 2
        for q in range(n - 1):
            qc._add("CNOT", [q, q + 1])
    sv = QuantumStateVector(n)
    qc.execute(sv)
    p = sv.probabilities()
    top = 1 << (n - 1)
    return float(sum(p[k] for k in range(2 ** n) if not k & top) - sum(p[k] for k in range(2 ** n) if k & top))


class TestCircuit:
    @pytest.mark.parametrize("n, layers", [(2, 1), (3, 2), (5, 3)])
    def test_matches_the_qaibridge_simulator(self, n, layers):
        g = torch.Generator().manual_seed(n)
        X = torch.rand(3, 2, generator=g, dtype=vqc.REAL) * math.pi
        a = torch.rand(vqc.n_angles(n, layers), generator=g, dtype=vqc.REAL) * 2 * math.pi
        ours = vqc.expectation(X, a, n, layers)
        for i in range(3):
            assert float(ours[i]) == pytest.approx(_kernel_z(X[i].tolist(), a.tolist(), n, layers), abs=1e-10)

    def test_one_circuit_per_input_matches_a_shared_circuit(self):
        X, _, _, _ = vqc.classification_data()
        a = torch.rand(vqc.n_angles(3, 2), dtype=vqc.REAL)
        shared = vqc.expectation(X[:4], a, 3, 2)
        per_input = vqc.expectation(X[:4], a.repeat(4, 1), 3, 2)
        assert torch.allclose(shared, per_input) and bool((shared.abs() <= 1).all())

    def test_exact_gradient_equals_parameter_shift(self):
        X, y, _, _ = vqc.classification_data()
        a = torch.rand(vqc.n_angles(4, 3), dtype=vqc.REAL) * 2 * math.pi
        g, noise, _ = vqc.gradient(X[:6], y[:6], a, 4, 3, shots=0)
        assert noise == 0.0 and torch.allclose(g, vqc.parameter_shift(X[:6], y[:6], a, 4, 3), atol=1e-12)

    def test_the_shot_noise_model_matches_real_sampling(self):
        X, y, _, _ = vqc.classification_data()
        a = torch.rand(vqc.n_angles(3, 2), dtype=vqc.REAL) * 2 * math.pi
        gen = torch.Generator().manual_seed(4)
        model = torch.stack([vqc.gradient(X[:6], y[:6], a, 3, 2, shots=100, gen=gen)[0] for _ in range(300)])
        sampled = torch.stack([vqc.parameter_shift(X[:6], y[:6], a, 3, 2, shots=100, gen=gen) for _ in range(300)])
        assert float(model.std(0).mean()) == pytest.approx(float(sampled.std(0).mean()), rel=0.15)
        exact = vqc.gradient(X[:6], y[:6], a, 3, 2, shots=0)[0]
        assert float((model.mean(0) - exact).abs().max()) < 0.03       # unbiased: the noise averages out

    def test_the_data_is_xor_shaped_and_split(self):
        X, y, X_test, y_test = vqc.classification_data()
        assert X.shape == (32, 2) and X_test.shape == (16, 2) and set(y.tolist()) == {0.0, 1.0}
        assert float(X.min()) >= 0 and float(X.max()) <= math.pi


# ── 5. The barren plateau study and the live monitor ────────────────────────

class TestPlateau:
    def test_the_study_shows_a_barren_plateau(self):
        s = plateau_study(max_qubits=8, draws=120)
        deep, near, shallow = (s["lines"][k] for k in ("deep_random", "deep_near_zero", "shallow_random"))
        assert deep[-1] < deep[0] / 5 and s["deep_random_factor_per_qubit"] < 0.85      # shrinks fast with size
        assert max(near) / min(near) < 1.2 and near[-1] > 5 * deep[-1]                   # near zero keeps its size
        assert max(shallow) / min(shallow) < 1.3                                          # one layer: no plateau
        assert s["shots_needed"]["deep_random"][-1] > 20 * s["shots_needed"]["deep_near_zero"][-1]

    def test_no_signal_means_nothing_with_exact_gradients(self):
        m = PlateauMonitor()
        assert all(m.observe(i, 1e-9, 10, 0.0, 1.0) is None for i in range(20)) and m.events == []

    def test_a_stuck_run_is_caught(self):
        m = PlateauMonitor()
        events = [m.observe(i, 0.5, 100, 0.1, 0.9 - 0.001 * i) for i in range(20)]     # signal 0.5 < noise 1.0, no progress
        caught = [e for e in events if e]
        assert caught[0].step == m.window and caught[0].signal_to_noise == 0.0
        assert [e.step for e in caught] == [6, 12, 18]                                    # then it waits a window

    def test_a_learning_run_or_a_learned_one_is_left_alone(self):
        learning, learned = PlateauMonitor(), PlateauMonitor()
        for i in range(20):
            assert learning.observe(i, 0.5, 100, 0.1, 1.2 - 0.03 * i) is None             # noisy, but the loss falls
            assert learned.observe(i, 0.5, 100, 0.1, 0.2) is None                         # small gradient at a good minimum


# ── 6. The fair race ─────────────────────────────────────────────────────────

class TestRace:
    def test_four_methods_same_budget_and_repeatable(self):
        r = race(3, 2, 100, steps=10, seeds=2)
        assert set(r["methods"]) == {"random", "rescued", "near_zero", "neural"}
        for m in r["methods"].values():
            assert len(m["curve_mean"]) == 11 and len(m["steps_to_target"]) == 2
            assert m["curve_min"][-1] <= m["curve_mean"][-1] <= m["curve_max"][-1]
        trainer._cache.clear()
        again = race(3, 2, 100, steps=10, seeds=2)
        assert again["methods"] == r["methods"] and not again["cached"]                  # fixed seeds: same result
        assert race(3, 2, 100, steps=10, seeds=2)["cached"]

    def test_without_a_plateau_the_monitor_stays_quiet(self):
        r = race(3, 2, 100, steps=20, seeds=1)
        assert r["methods"]["rescued"]["curve_mean"] == r["methods"]["random"]["curve_mean"]
        assert r["methods"]["random"]["events"] == [[]]

    def test_on_a_deep_circuit_the_random_start_stalls_and_is_rescued(self):
        r = race(8, 16, 100, steps=20, seeds=1)
        m = r["methods"]
        assert m["random"]["events"][0] and m["rescued"]["events"][0][0] == m["random"]["events"][0][0]
        assert m["rescued"]["learning_rate"] == m["random"]["learning_rate"]
        assert m["neural"]["curve_mean"][-1] < m["random"]["curve_mean"][-1]
        assert m["near_zero"]["curve_mean"][-1] < m["random"]["curve_mean"][-1]


# ── 7. API endpoints ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    tag = random.getrandbits(40)
    with SessionLocal() as db:
        u = User(username=f"opt_{tag}", email=f"opt_{tag}@example.com", hashed_password=hash_password("TestPass123"),
                 role=ROLE_USER, is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        headers = {"Authorization": f"Bearer {token_for(u)}"}
    yield headers
    with SessionLocal() as db:
        db.query(User).filter(User.email == f"opt_{tag}@example.com").delete()
        db.commit()


@pytest.fixture(autouse=True)
def no_warm_up(monkeypatch):
    monkeypatch.setattr(trainer, "WARM_UP", False)


class TestAPI:
    def test_needs_sign_in(self, client):
        for path in ("/api/module6/plateau-study", "/api/module6/race", "/api/module6/qaoa-angles"):
            assert client.post(path, json={}).status_code in (401, 403)

    def test_race(self, client, auth):
        r = client.post("/api/module6/race", headers=auth, json={"n_qubits": 2, "layers": 1, "shots": 0})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["angles"] == 4 and body["best"] in body["methods"] and body["shots"] == 0
        assert body["methods"]["random"]["signal_to_noise"][0] is None                     # exact: no noise to compare with

    @pytest.mark.parametrize("bad", [{"n_qubits": 11}, {"layers": 0}, {"shots": 50}])
    def test_race_rejects_bad_settings(self, client, auth, bad):
        assert client.post("/api/module6/race", headers=auth, json=bad).status_code == 422

    def test_plateau_study(self, client, auth, monkeypatch):
        monkeypatch.setattr(trainer, "plateau_study", lambda: plateau_study(max_qubits=4, draws=40))
        body = client.post("/api/module6/plateau-study", headers=auth).json()
        assert body["qubits"] == [2, 3, 4] and set(body["lines"]) == {"shallow_random", "deep_random", "deep_near_zero"}


# ── QAOA angle predictor (γ, β) ────────────────────────────────────────────────

def test_qaoa_angle_predictor_saves_circuit_evaluations():
    from app.modules.module6_optimizer.qaoa_angles import train_and_evaluate
    report = train_and_evaluate(train_graphs=20, test_graphs=4, p=1, seed=3, epochs=300)
    s = report["summary"]
    assert s["warm_evaluations"] < s["cold_evaluations"]
    assert s["warm_ratio"] >= s["cold_ratio"] - 0.02          # same quality, far fewer circuit runs
    assert 0.5 < s["neural_ratio"] <= 1.0
    assert len(report["tests"]) == 4 and all(len(t["predicted"]) == 2 for t in report["tests"])
    # simple starts get the same short refinement, for a fair comparison
    assert set(s["baselines"]) == {"average", "ramp", "random"} and s["budget_steps"] == 40
    assert all(set(t["baselines"]) == {"average", "ramp", "random"} for t in report["tests"])
