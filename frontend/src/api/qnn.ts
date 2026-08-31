import apiClient from './client';
import type { ConversionReport, LayerSpec, ParsedArchitecture, SimulateResult, TrainCompareReport } from '../types';

const BASE = '/api/module7';

export const qnnApi = {
  /** Parser stage only: validate a described architecture without mapping it to quantum yet */
  analyze: async (layers: LayerSpec[]): Promise<ParsedArchitecture> => {
    const { data } = await apiClient.post<ParsedArchitecture>(`${BASE}/analyze`, { layers });
    return data;
  },

  /** Map a classical architecture (layer list) to a QNN spec + structural comparison */
  convert: async (layers: LayerSpec[]): Promise<ConversionReport> => {
    const { data } = await apiClient.post<ConversionReport>(`${BASE}/convert`, { layers });
    return data;
  },

  /** Forward-only pass of a QNN spec through the real simulation kernel — no training */
  simulate: async (n_qubits: number, layers: number, angles?: number[]): Promise<SimulateResult> => {
    const { data } = await apiClient.post<SimulateResult>(`${BASE}/simulate`, { n_qubits, layers, angles });
    return data;
  },

  /** Train the classical MLP and the mapped QNN (from-scratch + classical-weight warm-started) */
  trainCompare: async (layers: LayerSpec[], iterations: number): Promise<TrainCompareReport> => {
    const { data } = await apiClient.post<TrainCompareReport>(`${BASE}/train-compare`, { layers, iterations });
    return data;
  },
};
