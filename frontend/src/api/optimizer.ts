import apiClient from './client';
import type { OptimizationReport } from '../types';

const BASE = '/api/module6';

export interface QaoaAngleTest {
  nodes: number;
  edges: number;
  cold_evaluations: number;
  cold_ratio: number;
  neural_ratio: number;
  warm_evaluations: number;
  warm_ratio: number;
  predicted: number[];
  optimal: number[];
}

export interface QaoaAngleReport {
  p: number;
  train_graphs: number;
  test_graphs: number;
  loss_curve: number[];
  final_loss: number;
  dataset_ms: number;
  training_ms: number;
  mean_train_evaluations: number;
  tests: QaoaAngleTest[];
  summary: {
    cold_evaluations: number;
    cold_ratio: number;
    neural_ratio: number;
    warm_evaluations: number;
    warm_ratio: number;
    evaluations_saved_pct: number;
  };
  total_ms: number;
  cached: boolean;
}

export const optimizerApi = {
  /** Train the classical baseline and the Neural Angle Optimizer, return the full comparison report */
  train: async (n_qubits: number, layers: number, iterations: number): Promise<OptimizationReport> => {
    const { data } = await apiClient.post<OptimizationReport>(`${BASE}/train`, { n_qubits, layers, iterations });
    return data;
  },
  /** Train the neural QAOA (γ, β) predictor and compare cold vs warm starts on unseen graphs */
  qaoaAngles: async (train_graphs: number, test_graphs: number, layers: number): Promise<QaoaAngleReport> => {
    const { data } = await apiClient.post<QaoaAngleReport>(`${BASE}/qaoa-angles`, { train_graphs, test_graphs, layers }, { timeout: 180_000 });
    return data;
  },
};
