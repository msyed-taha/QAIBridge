import apiClient from './client';
import type {
  GateOperation, SimulationResult,
  MemoryCheckResponse, ApiResponse,
} from '../types';

export type KernelPreset = 'bell' | 'ghz' | 'grover' | 'qft' | 'qft_pattern' | 'ansatz';

const BASE = '/api/kernel';

export const kernelApi = {
  /** Run a custom circuit */
  simulate: async (
    n_qubits: number,
    operations: GateOperation[],
    shots = 1024,
    name = 'Custom Circuit',
  ): Promise<SimulationResult> => {
    const { data } = await apiClient.post<ApiResponse<SimulationResult>>(`${BASE}/simulate`, {
      n_qubits, operations, shots, name,
    });
    if (!data.result) throw new Error('No result returned');
    return data.result;
  },

  /** Run a preset circuit (the result carries a `check` against the textbook answer) */
  preset: async (
    preset: KernelPreset,
    n_qubits = 2,
    shots = 1024,
    layers = 2,
  ): Promise<SimulationResult> => {
    const { data } = await apiClient.post<{ status: string; result: SimulationResult }>(
      `${BASE}/preset`,
      { preset, n_qubits, shots, layers },
    );
    return data.result;
  },

  /** Check RAM for n_qubits */
  memoryCheck: async (n_qubits: number): Promise<MemoryCheckResponse> => {
    const { data } = await apiClient.get<MemoryCheckResponse>(`${BASE}/memory`, {
      params: { n_qubits },
    });
    return data;
  },

  /** Opens the live simulation socket (token passed as a query parameter). */
  socket: (): WebSocket => {
    const token = localStorage.getItem('qai_token') ?? '';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const id = Math.random().toString(36).slice(2);
    return new WebSocket(`${proto}://${window.location.host}${BASE}/ws/${id}?token=${encodeURIComponent(token)}`);
  },

  /** Supported gate names */
  gates: async (): Promise<{ single_qubit: string[]; two_qubit: string[] }> => {
    const { data } = await apiClient.get(`${BASE}/gates`);
    return data;
  },
};
