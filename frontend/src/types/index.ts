// ── Module 1 – Simulation Kernel Types ──────────────────────────────────────

export interface GateOperation {
  gate: string;
  qubits: number[];
  params?: number[];
}

export interface AmplitudeEntry {
  state: string;
  index: number;
  real: number;
  imag: number;
  probability: number;
  magnitude: number;
  phase_deg: number;
}

export interface SimulationResult {
  n_qubits: number;
  gate_count: number;
  elapsed_ms: number;
  amplitudes: AmplitudeEntry[];
  probabilities: Record<string, number>;
  counts: Record<string, number>;
  is_entangled: boolean;
  summary: {
    n_qubits: number;
    dim: number;
    gate_count: number;
    norm: number;
    is_entangled: boolean;
    max_prob_state: string;
    max_prob: number;
  };
  operations: GateOperation[];
  memory_report: {
    n_qubits: number;
    required_gb: number;
    available_gb: number;
    is_safe: boolean;
    warning: string | null;
  };
}

export interface MemoryCheckResponse {
  n_qubits: number;
  state_vector_size: number;
  required_gb: number;
  available_gb: number;
  total_ram_gb: number;
  is_safe: boolean;
  warning: string | null;
}

export interface RamTableRow {
  n_qubits: number;
  state_vector_size: number;
  required_bytes: number;
  required_mb: number;
  required_gb: number;
}

// ── Module 8 – Dashboard Types ───────────────────────────────────────────────

export type SFODAlgorithm = 'search' | 'factoring' | 'optimization' | 'database';

export interface BenchmarkReport {
  algorithm: string;
  problem_size: number;
  quantum_result: Record<string, unknown>;
  classical_result: Record<string, unknown>;
  speedup: number;
  theoretical: {
    algorithm: string;
    n: number;
    classical_complexity: string;
    quantum_complexity: string;
    speedup_type: string;
    theoretical_speedup: number | string;
    classical_ops: number;
    quantum_ops: number;
  };
  accuracy: Record<string, unknown>;
  chart_data: {
    labels: string[];
    classical_times: number[];
    quantum_times: number[];
    speedups: number[];
  };
  meta: Record<string, unknown>;
}

export interface SuiteResult {
  search?: SuiteSummary;
  factoring?: SuiteSummary;
  optimization?: SuiteSummary;
  database?: SuiteSummary;
}

export interface SuiteSummary {
  speedup: number;
  quantum_ms: number;
  classical_ms: number;
  algorithm: string;
  theoretical_speedup: number | string;
}

// ── Shared ───────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  status: 'ok' | 'error';
  result?: T;
  report?: T;
  detail?: string;
}

export type ProgressEvent = {
  type: 'progress';
  step: string;
  percent: number;
  detail?: string;
};

export type WsEvent =
  | ProgressEvent
  | { type: 'result'; result: SimulationResult }
  | { type: 'result'; report: BenchmarkReport }
  | { type: 'suite_result'; suite: SuiteResult }
  | { type: 'pong' }
  | { type: 'error'; detail: string };
