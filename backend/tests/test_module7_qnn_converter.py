"""
Module 7 - QNN Converter - test suite.

Run from backend/:  python -m pytest tests/test_module7_qnn_converter.py -v

Sections:
  1. Architecture parsing (Parser)
  2. Mapping (Mapping Engine / converter.py)
  3. Qubit calculation
  4. Parameter mapping (classical weights -> quantum angles)
  5. Circuit generation / simulation (real kernel)
  6. API endpoints
  7. Edge cases
"""
from __future__ import annotations

import math

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from app.modules.module6_optimizer.dataset import FEATURE_DIM, get_toy_classification_dataset
from app.modules.module7_qnn import (
    ArchitectureError,
    convert_architecture,
    map_classical_weights_to_angles,
    parse_architecture,
    run_qnn_forward,
    train_classical_mlp,
    train_qnn_warm_started,
)
from app.modules.module7_qnn.classical_nn import build_mlp


# ── 1. Architecture parsing ─────────────────────────────────────────────────

class TestArchitectureParsing:
    def test_valid_dense_only_architecture(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dense", "units": 3, "activation": "tanh"}],
            input_dim=2, output_dim=1,
        )
        assert parsed.input_dim == 2
        assert len(parsed.dense_layers) == 2
        assert parsed.warnings == []

    def test_dropout_layer_recorded_but_skipped_from_dense_layers(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dropout"}],
            input_dim=2, output_dim=1,
        )
        assert len(parsed.layers) == 2
        assert len(parsed.dense_layers) == 1
        assert any("Dropout" in w for w in parsed.warnings)

    def test_empty_architecture_rejected(self):
        with pytest.raises(ArchitectureError):
            parse_architecture([], input_dim=2, output_dim=1)

    def test_too_many_layers_rejected(self):
        layers = [{"type": "dense", "units": 4, "activation": "relu"}] * 5
        with pytest.raises(ArchitectureError):
            parse_architecture(layers, input_dim=2, output_dim=1)

    def test_unsupported_layer_type_rejected_with_explanation(self):
        with pytest.raises(ArchitectureError, match="unsupported layer type"):
            parse_architecture([{"type": "conv2d", "units": 4}], input_dim=2, output_dim=1)

    def test_unsupported_activation_rejected(self):
        with pytest.raises(ArchitectureError, match="unsupported activation"):
            parse_architecture([{"type": "dense", "units": 4, "activation": "gelu"}], input_dim=2, output_dim=1)

    def test_softmax_rejected_with_specific_explanation(self):
        """Softmax must fail loudly with a reason, not silently become sigmoid."""
        with pytest.raises(ArchitectureError, match="[Ss]oftmax"):
            parse_architecture([{"type": "dense", "units": 4, "activation": "softmax"}], input_dim=2, output_dim=1)

    def test_invalid_units_rejected(self):
        with pytest.raises(ArchitectureError):
            parse_architecture([{"type": "dense", "units": 0, "activation": "relu"}], input_dim=2, output_dim=1)
        with pytest.raises(ArchitectureError):
            parse_architecture([{"type": "dense", "units": 999, "activation": "relu"}], input_dim=2, output_dim=1)

    def test_multi_class_output_rejected(self):
        with pytest.raises(ArchitectureError):
            parse_architecture([{"type": "dense", "units": 4, "activation": "relu"}], input_dim=2, output_dim=3)

    def test_dropout_only_rejected(self):
        with pytest.raises(ArchitectureError, match="Dense layer is required"):
            parse_architecture([{"type": "dropout"}], input_dim=2, output_dim=1)


# ── 2. Mapping (Mapping Engine) ─────────────────────────────────────────────

class TestMappingEngine:
    def test_dense_layer_count_drives_variational_blocks(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"},
             {"type": "dropout"},
             {"type": "dense", "units": 3, "activation": "relu"}],
            input_dim=2, output_dim=1,
        )
        report = convert_architecture(parsed)
        assert report.qnn.n_layers == 2  # dropout contributes no block

    def test_trainable_angles_formula(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"}] * 2, input_dim=2, output_dim=1,
        )
        report = convert_architecture(parsed)
        assert report.qnn.trainable_angles == report.qnn.n_qubits * report.qnn.n_layers * 2

    def test_comparison_rows_include_required_metrics(self):
        parsed = parse_architecture([{"type": "dense", "units": 4, "activation": "relu"}], input_dim=2, output_dim=1)
        report = convert_architecture(parsed)
        metrics = {row["metric"] for row in report.comparison_rows}
        for required in ("Activation", "Gates", "Encoding", "Measurement", "Entanglement"):
            assert required in metrics

    def test_dropout_warning_propagates_to_approximation_notes(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dropout"}], input_dim=2, output_dim=1,
        )
        report = convert_architecture(parsed)
        assert any("Dropout" in note for note in report.approximation_notes)

    def test_classical_param_count_matches_actual_model(self):
        parsed = parse_architecture(
            [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dense", "units": 3, "activation": "tanh"}],
            input_dim=2, output_dim=1,
        )
        report = convert_architecture(parsed)
        model = build_mlp(parsed)
        actual_params = sum(p.numel() for p in model.parameters())
        assert report.classical_params == actual_params


# ── 3. Qubit calculation ─────────────────────────────────────────────────────

class TestQubitCalculation:
    def test_qubit_count_equals_input_dim_not_hidden_width(self):
        """Common misconception check: qubits map to input FEATURES (angle
        encoding), not to hidden-layer neuron counts -- a wide hidden layer
        must not inflate the qubit count."""
        parsed_narrow = parse_architecture([{"type": "dense", "units": 2, "activation": "relu"}], input_dim=2, output_dim=1)
        parsed_wide = parse_architecture([{"type": "dense", "units": 16, "activation": "relu"}], input_dim=2, output_dim=1)
        assert convert_architecture(parsed_narrow).qnn.n_qubits == 2
        assert convert_architecture(parsed_wide).qnn.n_qubits == 2

    def test_qubit_count_scales_with_input_dim(self):
        parsed = parse_architecture([{"type": "dense", "units": 4, "activation": "relu"}], input_dim=FEATURE_DIM, output_dim=1)
        assert convert_architecture(parsed).qnn.n_qubits == FEATURE_DIM


# ── 4. Parameter mapping (classical weights -> quantum angles) ─────────────

class TestParameterMapping:
    def test_output_shape_and_layer_reuse(self):
        model = torch.nn.Sequential(torch.nn.Linear(2, 4), torch.nn.ReLU(), torch.nn.Linear(4, 1), torch.nn.Sigmoid())
        angles = map_classical_weights_to_angles(model, n_qubits=2, n_layers=3)
        assert angles.shape == (2 * 3 * 2,)

    def test_angles_bounded_by_pi(self):
        """The whole point of the tanh-squash normalisation: however large the
        classical weights are, mapped angles must stay in the principal
        (-pi, pi) range rather than aliasing/wrapping."""
        model = torch.nn.Sequential(torch.nn.Linear(2, 4), torch.nn.ReLU(), torch.nn.Linear(4, 1), torch.nn.Sigmoid())
        with torch.no_grad():
            model[0].weight.fill_(1000.0)  # deliberately extreme weights
        angles = map_classical_weights_to_angles(model, n_qubits=2, n_layers=1)
        assert np.all(np.abs(angles) <= math.pi + 1e-9)

    def test_small_weights_map_to_small_angles(self):
        model = torch.nn.Sequential(torch.nn.Linear(2, 4), torch.nn.ReLU(), torch.nn.Linear(4, 1), torch.nn.Sigmoid())
        with torch.no_grad():
            model[0].weight.zero_()
        angles = map_classical_weights_to_angles(model, n_qubits=2, n_layers=1)
        assert np.all(np.abs(angles) < 0.1)

    def test_no_linear_layers_raises(self):
        model = torch.nn.Sequential(torch.nn.ReLU())
        with pytest.raises(ValueError):
            map_classical_weights_to_angles(model, n_qubits=2, n_layers=1)


# ── 5. Circuit generation / simulation (real kernel) ────────────────────────

class TestSimulation:
    def test_run_qnn_forward_uses_real_kernel_bounded_output(self):
        X, _ = get_toy_classification_dataset()
        predictions, angles = run_qnn_forward(n_qubits=2, layers=1, X=X)
        assert len(predictions) == len(X)
        assert all(0.0 <= p <= 1.0 for p in predictions)
        assert angles.shape == (2 * 1 * 2,)

    def test_run_qnn_forward_respects_provided_angles(self):
        X, _ = get_toy_classification_dataset()
        fixed = np.zeros(2 * 1 * 2)
        predictions, angles = run_qnn_forward(n_qubits=2, layers=1, X=X, angles=fixed)
        np.testing.assert_array_equal(angles, fixed)

    def test_warm_started_training_runs_end_to_end(self):
        """Full pipeline: classical model -> parameter mapping -> quantum
        fine-tuning, using the real parameter-shift-gradient kernel."""
        parsed = parse_architecture([{"type": "dense", "units": 4, "activation": "relu"}], input_dim=2, output_dim=1)
        report = convert_architecture(parsed)
        X, y = get_toy_classification_dataset()
        _, _, classical_model = train_classical_mlp(parsed, X, y, iterations=5)
        curve, acc = train_qnn_warm_started(report.qnn.n_qubits, report.qnn.n_layers, X, y, classical_model, iterations=5)
        assert len(curve) == 5
        assert 0.0 <= acc <= 1.0


# ── 6. API endpoints ─────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


class TestAPI:
    def test_status(self, client):
        resp = client.get("/api/module7/status")
        assert resp.status_code == 200
        assert resp.json()["module"] == 7

    def test_analyze(self, client):
        resp = client.post("/api/module7/analyze", json={
            "layers": [{"type": "dense", "units": 4, "activation": "relu"}, {"type": "dropout"}],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["dense_layer_count"] == 1
        assert len(body["warnings"]) == 1

    def test_convert(self, client):
        resp = client.post("/api/module7/convert", json={
            "layers": [{"type": "dense", "units": 4, "activation": "relu"}],
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "qnn" in body and "comparison_rows" in body

    def test_simulate(self, client):
        resp = client.post("/api/module7/simulate", json={"n_qubits": 2, "layers": 1})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["predictions"]) == len(body["labels"])

    def test_simulate_rejects_wrong_angle_count(self, client):
        resp = client.post("/api/module7/simulate", json={"n_qubits": 2, "layers": 1, "angles": [0.1, 0.2]})
        assert resp.status_code == 400

    def test_train_compare(self, client):
        resp = client.post("/api/module7/train-compare", json={
            "layers": [{"type": "dense", "units": 4, "activation": "relu"}],
            "iterations": 10,
        })
        assert resp.status_code == 200
        body = resp.json()
        for key in ("classical_loss_curve", "quantum_loss_curve", "quantum_warm_loss_curve",
                    "classical_accuracy", "quantum_accuracy", "quantum_warm_accuracy"):
            assert key in body
        assert len(body["classical_loss_curve"]) == 10


# ── 7. Edge cases ────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_convert_rejects_unsupported_layer(self, client):
        resp = client.post("/api/module7/convert", json={"layers": [{"type": "lstm", "units": 4}]})
        assert resp.status_code == 400
        assert "unsupported layer type" in resp.json()["detail"]

    def test_convert_rejects_softmax_with_explanation(self, client):
        resp = client.post("/api/module7/convert", json={
            "layers": [{"type": "dense", "units": 4, "activation": "softmax"}],
        })
        assert resp.status_code == 400
        assert "Softmax" in resp.json()["detail"]

    def test_convert_rejects_too_many_layers(self, client):
        """Caught by the Pydantic schema (max_length=4) before the parser even
        runs -- 422, not 400. See test_too_many_layers_rejected above for the
        equivalent check against the parser itself when called directly with
        more layers than the schema would even accept."""
        resp = client.post("/api/module7/convert", json={
            "layers": [{"type": "dense", "units": 4, "activation": "relu"}] * 5,
        })
        assert resp.status_code == 422

    def test_convert_rejects_invalid_units(self, client):
        """Caught by the Pydantic schema (ge=1) -- 422, not 400."""
        resp = client.post("/api/module7/convert", json={
            "layers": [{"type": "dense", "units": 0, "activation": "relu"}],
        })
        assert resp.status_code == 422
