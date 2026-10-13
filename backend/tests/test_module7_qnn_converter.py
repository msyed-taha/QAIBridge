"""
Neural Network Converter — test suite.

Run from backend/:  python -m pytest tests/test_module7_qnn_converter.py -v

  1. Reading the classical network (what converts, what doesn't, and why)
  2. The conversion rules and report
  3. The quantum network: checked against the QAIbridge simulator and the
     parameter-shift rule; the batched classical network against PyTorch's own
  4. The warm start
  5. The datasets
  6. The fair comparison
  7. API endpoints (signed in)
"""
from __future__ import annotations

import math
import random

import pytest
import torch
import torch.nn as nn
from fastapi.testclient import TestClient

from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import ROLE_USER, User
from app.modules.module1_kernel import QuantumCircuit, QuantumStateVector
from app.modules.module7_qnn import (
    DATASETS,
    ArchitectureError,
    compare,
    convert_architecture,
    dataset,
    parse_architecture,
    warm_start,
)
from app.modules.module7_qnn import trainer
from app.modules.module7_qnn.circuit import (
    classical_probability,
    classical_size,
    classical_start,
    quantum_probability,
    quantum_start,
)
from app.modules.module7_qnn.data import INPUT_SCALE, REAL


def dense(units: int, activation: str = "relu") -> dict:
    return {"type": "dense", "units": units, "activation": activation}


DROPOUT = {"type": "dropout"}


def parse(layers):
    return parse_architecture(layers, input_dim=2, output_dim=1)


# ── 1. Reading the classical network ─────────────────────────────────────────

class TestParser:
    def test_a_valid_network(self):
        p = parse([dense(4), DROPOUT, dense(3, "tanh")])
        assert [l.type for l in p.layers] == ["dense", "dropout", "dense"] and len(p.dense_layers) == 2
        assert len(p.warnings) == 1 and "Dropout" in p.warnings[0] and "skips" in p.warnings[0]

    @pytest.mark.parametrize("layers, words", [
        ([], "at least one layer"),
        ([dense(4)] * 5, "at most 4"),
        ([dense(9)], "1 to 8"),
        ([dense(0)], "1 to 8"),
        ([dense(4, "softmax")], "one chance"),
        ([dense(4, "swish")], "isn't available"),
        ([{"type": "conv2d", "units": 4}], "can't be converted"),
        ([DROPOUT], "at least one Dense"),
    ])
    def test_what_cannot_convert_is_turned_away_with_a_reason(self, layers, words):
        with pytest.raises(ArchitectureError) as e:
            parse(layers)
        assert words in str(e.value) and "FYP" not in str(e.value) and "module" not in str(e.value).lower()

    def test_only_one_output(self):
        with pytest.raises(ArchitectureError):
            parse_architecture([dense(4)], input_dim=2, output_dim=3)


# ── 2. The conversion ────────────────────────────────────────────────────────

class TestConversion:
    def test_one_qubit_per_neuron_and_one_block_per_dense_layer(self):
        r = convert_architecture(parse([dense(3), DROPOUT, dense(6, "tanh"), dense(2)]))
        assert r.qnn.n_qubits == 6 and r.qnn.blocks == [3, 6, 2]
        assert r.qnn.trainable == 4 * (3 + 6 + 2)
        assert r.qnn.gates == {"RY": 11, "RZ": 11, "CNOT": 2 + 5 + 1}
        assert r.classical_layer_sizes == [2, 3, 6, 2, 1]

    def test_the_network_shape_changes_the_circuit(self):
        a = convert_architecture(parse([dense(2), dense(2)])).qnn
        b = convert_architecture(parse([dense(8), dense(8)])).qnn
        c = convert_architecture(parse([dense(2)])).qnn
        assert (a.n_qubits, b.n_qubits, len(c.blocks)) == (2, 8, 1) and a.trainable < b.trainable

    def test_the_parameter_count_matches_pytorch(self):
        layers = [dense(5), DROPOUT, dense(3)]
        torch_net = nn.Sequential(nn.Linear(2, 5), nn.ReLU(), nn.Dropout(), nn.Linear(5, 3), nn.ReLU(), nn.Linear(3, 1))
        assert classical_size(layers) == convert_architecture(parse(layers)).classical_params \
            == sum(p.numel() for p in torch_net.parameters())

    def test_the_report_says_what_maps_and_what_does_not(self):
        r = convert_architecture(parse([dense(4), DROPOUT, dense(1)]))
        assert [row["quantum_params"] for row in r.rows] == [16, None, 4, 0]
        assert r.rows[1]["quantum"].startswith("Nothing")
        assert "CNOT" not in r.rows[2]["quantum"]                       # one qubit: nothing to pass on
        text = " ".join(r.notes)
        assert "re-uploading" in text and "built-in activation" in text and "not exactly what it computes" in text


# ── 3. The quantum network ───────────────────────────────────────────────────

def _kernel_chance(x, params, units, k=0):
    """The same circuit on the QAIbridge simulator (Module 1): the chance q0 reads 1."""
    n = max(units)
    qc = QuantumCircuit(n, "check")
    xs = [v * INPUT_SCALE for v in x]
    for block, u in zip(params, units):
        for j in range(u):
            angle = float(block["w"][k, j, 0] * xs[0] + block["w"][k, j, 1] * xs[1] + block["b"][k, j])
            qc._add("RY", [j], [angle])
            qc._add("RZ", [j], [float(block["phi"][k, j])])
        for c in range(u - 1, 0, -1):
            qc._add("CNOT", [c, c - 1])
    sv = QuantumStateVector(n)
    qc.execute(sv)
    p = sv.probabilities()
    return float(sum(p[i] for i in range(2 ** n) if i & (1 << (n - 1))))


class TestQuantumNetwork:
    @pytest.mark.parametrize("units", [[1], [2, 2], [3, 2], [2, 4, 1], [5]])
    def test_matches_the_qaibridge_simulator(self, units):
        params = quantum_start(units, 2, torch.Generator().manual_seed(len(units)))
        X = torch.tensor([[0.3, -0.7], [-0.9, 0.1], [0.5, 0.5]], dtype=REAL)
        ours = quantum_probability(params, units, X)
        for k in range(2):
            for i in range(3):
                assert float(ours[k, i]) == pytest.approx(_kernel_chance(X[i].tolist(), params, units, k), abs=1e-10)

    def test_a_one_layer_network_reads_both_inputs(self):
        """The old conversion ignored the second input when there was one layer, so it could never learn XOR."""
        units = [4]
        params = quantum_start(units, 1, torch.Generator().manual_seed(0))
        X = torch.tensor([[0.5, v] for v in (-0.8, 0.0, 0.8)], dtype=REAL)
        p = quantum_probability(params, units, X)[0]
        assert float(p.max() - p.min()) > 0.01

    def test_exact_gradient_equals_parameter_shift(self):
        units = [3, 2]
        params = quantum_start(units, 1, torch.Generator().manual_seed(5))
        x = torch.tensor([[0.4, -0.6]], dtype=REAL)
        for block in params:
            for t in block.values():
                t.requires_grad_(True)
        quantum_probability(params, units, x).sum().backward()
        for block in params:
            for key in ("b", "phi"):                                 # each is an RY or RZ angle on its own
                for j in range(block[key].shape[1]):
                    shifted = []
                    for s in (math.pi / 2, -math.pi / 2):
                        moved = [{k: t.detach().clone() for k, t in b.items()} for b in params]
                        target = moved[[id(b) for b in params].index(id(block))]
                        target[key][0, j] += s
                        shifted.append(float(quantum_probability(moved, units, x)[0, 0]))
                    assert float(block[key].grad[0, j]) == pytest.approx((shifted[0] - shifted[1]) / 2, abs=1e-12)

    def test_networks_in_a_batch_are_independent(self):
        units = [2, 3]
        params = quantum_start(units, 3, torch.Generator().manual_seed(1))
        X, _, _, _ = dataset("moons")
        together = quantum_probability(params, units, X[:10])
        alone = quantum_probability([{k: t[1:2] for k, t in b.items()} for b in params], units, X[:10])
        assert torch.allclose(together[1:2], alone, atol=1e-12)

    def test_the_classical_network_matches_pytorch(self):
        layers = [dense(4, "tanh"), DROPOUT, dense(3, "sigmoid")]
        params = classical_start(layers, 1, torch.Generator().manual_seed(2))
        net = nn.Sequential(nn.Linear(2, 4), nn.Tanh(), nn.Dropout(0.2), nn.Linear(4, 3), nn.Sigmoid(), nn.Linear(3, 1),
                            nn.Sigmoid()).double().eval()
        with torch.no_grad():
            for lin, p in zip([m for m in net if isinstance(m, nn.Linear)], params):
                lin.weight.copy_(p["W"][0]); lin.bias.copy_(p["b"][0])
        X, _, _, _ = dataset("xor")
        ours = classical_probability(params, layers, X[:20])[0]
        assert torch.allclose(ours, net(X[:20] * INPUT_SCALE)[:, 0], atol=1e-12)


# ── 4. The warm start ────────────────────────────────────────────────────────

class TestWarmStart:
    def test_each_qubit_follows_its_neuron_over_half_a_turn(self):
        layers, units = [dense(4), dense(3)], [4, 3]
        classical = classical_start(layers, 2, torch.Generator().manual_seed(3))
        X, _, _, _ = dataset("circles")
        q = warm_start(classical, units, X)
        z = torch.einsum("mud,bd->mbu", classical[0]["W"], X * INPUT_SCALE) + classical[0]["b"][:, None, :]
        angle = torch.einsum("mud,bd->mbu", q[0]["w"], X * INPUT_SCALE) + q[0]["b"][:, None, :]
        assert torch.allclose(angle.min(1).values, torch.zeros(2, 4, dtype=REAL), atol=1e-12)
        assert torch.allclose(angle.max(1).values, torch.full((2, 4), math.pi, dtype=REAL), atol=1e-12)
        for m in range(2):
            for j in range(4):                                       # the angle rises in step with the neuron's input
                pair = torch.stack([z[m, :, j], angle[m, :, j]])
                assert float(torch.corrcoef(pair)[0, 1]) == pytest.approx(1.0, abs=1e-9)
        assert float(q[0]["phi"].abs().max()) == 0
        assert all(float(t.abs().max()) == 0 for t in q[1].values())     # later blocks start doing nothing


# ── 5. The datasets ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", list(DATASETS))
def test_datasets_are_split_scaled_and_repeatable(name):
    X, y, Xt, yt = dataset(name)
    assert X.shape == (140, 2) and Xt.shape == (60, 2)
    assert float(torch.cat([X, Xt]).abs().max()) == pytest.approx(1.0)
    assert set(y.tolist()) == {0.0, 1.0} and set(yt.tolist()) == {0.0, 1.0}
    dataset.cache_clear()
    assert torch.equal(dataset(name)[0], X)


# ── 6. The fair comparison ───────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def no_warm_up(monkeypatch):
    monkeypatch.setattr(trainer, "WARM_UP", False)


class TestCompare:
    def test_same_budget_three_seeds_and_repeatable(self):
        layers = [dense(2), DROPOUT, dense(2)]
        r = compare(layers, "groups", steps=20)
        assert set(r["methods"]) == {"classical", "quantum", "warm"} and r["seeds"] == 3
        assert (r["train_points"], r["test_points"]) == (140, 60) and len(r["grid"]) == trainer.GRID
        for key, m in r["methods"].items():
            assert len(m["curve_mean"]) == 21
            assert all(lo <= mid <= hi for lo, mid, hi in zip(m["curve_min"], m["curve_mean"], m["curve_max"]))
            assert m["learning_rate"] in m["learning_rates_tried"] == list(trainer.LEARNING_RATES[key])
            assert len(m["test_accuracy"]["runs"]) == 3 and 0 <= m["test_accuracy"]["mean"] <= 1
            assert len(m["map"]) == trainer.GRID and all(0 <= v <= 1 for row in m["map"] for v in row)
        assert r["methods"]["quantum"]["params"] == r["methods"]["warm"]["params"] == 16
        assert r["methods"]["classical"]["params"] == 2 * 3 + 2 * 3 + 3
        trainer._cache.clear()
        again = compare(layers, "groups", steps=20)
        assert again["methods"] == r["methods"] and not again["cached"]      # fixed seeds: the same numbers
        assert compare(layers, "groups", steps=20)["cached"]

    def test_all_three_learn_xor(self):
        r = compare(trainer.DEFAULT_LAYERS, "xor", steps=100)
        for m in r["methods"].values():
            assert m["test_accuracy"]["mean"] >= 0.85 and m["final_loss"]["mean"] < m["start_loss"]["mean"]

    def test_a_one_layer_network_learns_too(self):
        r = compare([dense(4)], "xor", steps=100)
        assert r["methods"]["quantum"]["test_accuracy"]["mean"] >= 0.8


# ── 7. API endpoints ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


@pytest.fixture(scope="module")
def auth():
    tag = random.getrandbits(40)
    with SessionLocal() as db:
        u = User(username=f"conv_{tag}", email=f"conv_{tag}@example.com", hashed_password=hash_password("TestPass123"),
                 role=ROLE_USER, is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        headers = {"Authorization": f"Bearer {token_for(u)}"}
    yield headers
    with SessionLocal() as db:
        db.query(User).filter(User.email == f"conv_{tag}@example.com").delete()
        db.commit()


class TestAPI:
    def test_needs_sign_in(self, client):
        assert client.get("/api/module7/datasets").status_code in (401, 403)
        for path in ("/api/module7/analyze", "/api/module7/convert", "/api/module7/simulate", "/api/module7/train-compare"):
            assert client.post(path, json={}).status_code in (401, 403)

    def test_datasets(self, client, auth):
        body = client.get("/api/module7/datasets", headers=auth).json()
        assert set(body) == set(DATASETS)
        assert len(body["xor"]["train"]["x"]) == 140 and len(body["xor"]["test"]["y"]) == 60 and body["xor"]["about"]

    def test_analyze_and_convert(self, client, auth):
        layers = [dense(3), DROPOUT, dense(5, "tanh")]
        parsed = client.post("/api/module7/analyze", headers=auth, json={"layers": layers}).json()
        assert parsed["dense_layer_count"] == 2 and len(parsed["warnings"]) == 1
        body = client.post("/api/module7/convert", headers=auth, json={"layers": layers}).json()
        assert body["ok"] and body["qnn"]["n_qubits"] == 5 and body["qnn"]["blocks"] == [3, 5] and body["parsed"]["warnings"]

    @pytest.mark.parametrize("layers, words", [([dense(9)], "1 to 8"), ([dense(4, "softmax")], "one chance"), ([DROPOUT], "Dense")])
    def test_a_network_that_cannot_convert_gets_a_plain_reason(self, client, auth, layers, words):
        r = client.post("/api/module7/convert", headers=auth, json={"layers": layers})      # asked after every edit
        assert r.status_code == 200 and r.json()["ok"] is False and words in r.json()["error"]
        r = client.post("/api/module7/train-compare", headers=auth, json={"layers": layers, "steps": 20})
        assert r.status_code == 400 and words in r.json()["detail"]

    @pytest.mark.parametrize("bad", [{"steps": 10}, {"steps": 500}, {"dataset": "spirals"}, {"layers": []}])
    def test_train_compare_rejects_bad_settings(self, client, auth, bad):
        assert client.post("/api/module7/train-compare", headers=auth, json=bad).status_code == 422

    def test_train_compare_and_simulate(self, client, auth):
        r = client.post("/api/module7/train-compare", headers=auth, json={"layers": [dense(2)], "dataset": "moons", "steps": 20})
        assert r.status_code == 200, r.text
        assert r.json()["conversion"]["qnn"]["n_qubits"] == 2 and r.json()["dataset"] == "moons"
        s = client.post("/api/module7/simulate", headers=auth, json={"layers": [dense(2)], "dataset": "moons"}).json()
        assert len(s["chances"]) == 60 and 0 <= s["accuracy"] <= 1
