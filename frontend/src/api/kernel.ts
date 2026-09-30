import apiClient from './client';
import type {
  GateOperation, SimulationResult,
  MemoryCheckResponse, RamTableRow, ApiResponse,
} from '../types';

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

  /** Run a preset circuit */
  preset: async (
    preset: 'bell' | 'ghz' | 'grover' | 'qft' | 'ansatz',
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

  /** Full RAM table (1–MAX_QUBITS qubits) */
  ramTable: async (): Promise<RamTableRow[]> => {
    const { data } = await apiClient.get<{ table: RamTableRow[] }>(`${BASE}/ram-table`);
    return data.table;
  },

  /** Supported gate names */
  gates: async (): Promise<{ single_qubit: string[]; two_qubit: string[] }> => {
    const { data } = await apiClient.get(`${BASE}/gates`);
    return data;
  },
};
