import apiClient from './client';
import type { GateOperation, SimulationResult, ApiResponse, QasmInspect, CircuitSteps } from '../types';

export type ExampleId = 'ghz' | 'qft_pattern' | 'layered' | 'random';

const BASE = '/api/kernel';

export const kernelApi = {
  /** Run a custom circuit given as a list of gates */
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

  /** An example circuit as OpenQASM text */
  example: async (id: ExampleId, n_qubits: number): Promise<string> => {
    const { data } = await apiClient.get<{ qasm: string }>(`${BASE}/examples/${id}`, { params: { n_qubits } });
    return data.qasm;
  },

  /** Read OpenQASM text without running it: its size, or the first problem and its line */
  inspect: async (source: string): Promise<QasmInspect> => {
    const { data } = await apiClient.post<QasmInspect>(`${BASE}/qasm/inspect`, { source });
    return data;
  },

  /** Replay a small circuit one gate at a time (up to 8 qubits and 200 gates) */
  steps: async (source: string): Promise<CircuitSteps> => {
    const { data } = await apiClient.post<CircuitSteps>(`${BASE}/qasm/steps`, { source });
    return data;
  },

  /** The circuit as a runnable Qiskit file (prints counts in QAIbridge's outcome order) */
  exportQiskit: async (source: string, shots: number): Promise<string> => {
    const { data } = await apiClient.post<{ code: string }>(`${BASE}/qasm/export`, { source, shots });
    return data.code;
  },

  /** Run OpenQASM text without live progress (used when the WebSocket can't connect) */
  runQasm: async (source: string, shots = 1024): Promise<SimulationResult> => {
    const { data } = await apiClient.post<{ result: SimulationResult }>(`${BASE}/qasm`, { source, shots });
    return data.result;
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
