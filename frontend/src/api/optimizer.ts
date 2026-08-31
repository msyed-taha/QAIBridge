import apiClient from './client';
import type { OptimizationReport } from '../types';

const BASE = '/api/module6';

export const optimizerApi = {
  /** Train the classical baseline and the Neural Angle Optimizer, return the full comparison report */
  train: async (n_qubits: number, layers: number, iterations: number): Promise<OptimizationReport> => {
    const { data } = await apiClient.post<OptimizationReport>(`${BASE}/train`, { n_qubits, layers, iterations });
    return data;
  },
};
