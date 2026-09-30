import apiClient from './client';

export type AlgoKey = 'search' | 'factoring' | 'optimization' | 'database';

export interface SideResult {
  algorithm: string;
  complexity: string;
  steps: number;
  steps_label: string;
  correct: boolean;
  time_ms: number;
  answer: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CurvePoint { iteration: number; success_probability: number; theory: number }
export interface HistogramBar { index: number; count: number; marked: boolean }

export interface GroverQuantum extends SideResult {
  n_qubits: number;
  n_items: number;
  n_marked: number;
  iterations: number;
  success_probability: number;
  theoretical_success: number;
  uniform_probability: number;
  curve: CurvePoint[];
  histogram: HistogramBar[];
  shots: number;
  measured_success_rate: number;
  simulation_ms: number;
  memory_mb: number;
  circuit: { qubits: number; gates: number; depth: number; ops: Record<string, number>; oracle_gate_estimate: number };
  retrieved?: { index: number; record: string; count: number }[];
}

export interface ShorAttempt {
  a: number;
  true_period?: number;
  found_period?: number | null;
  factors?: number[] | null;
  success: boolean;
  counting_qubits?: number;
  work_qubits?: number;
  qubits?: number;
  gates?: number;
  depth?: number;
  simulation_ms?: number;
  lucky_gcd?: number;
}

export interface ShorDetail extends ShorAttempt {
  peaks: { y: number; probability: number }[];
  expected_peaks: number[];
  measurements: { y: number; count: number }[];
  post_processing: { measured: number; phase: number; fraction: string; candidate_r: number; period: number | null; note: string; count: number }[];
  ops: Record<string, number>;
}

export interface ShorQuantum extends SideResult {
  status: 'factored' | 'failed' | 'trivial' | 'prime' | 'prime_power';
  message: string;
  a: number | null;
  period: number | null;
  attempts: ShorAttempt[];
  detail: ShorDetail | null;
  shots: number;
}

export interface QaoaSolution {
  bits: string;
  count?: number;
  probability: number;
  energy: number;
  optimal: boolean;
  feasible?: boolean;
  tour?: number[] | null;
  tour_names?: string[] | null;
  length?: number | null;
}

export interface QaoaQuantum extends SideResult {
  qubits: number;
  layers: number;
  gammas: number[];
  betas: number[];
  p_optimal: number;
  random_p_optimal: number;
  amplification: number | null;
  p_feasible: number | null;
  random_p_feasible: number | null;
  best_sampled: QaoaSolution;
  solutions: QaoaSolution[];
  trace: { evaluation: number; value: number; best: number; layers: number }[];
  circuit_evaluations: number;
  circuit: { qubits: number; gates: number; depth: number; ops: Record<string, number> };
  bridge: {
    title: string;
    steps: string[];
    qubo: { n: number; nonzero_terms: number; variables: string[] };
    ising: { hamiltonian: string; terms: { coeff: number; paulis: string }[] };
  };
}

export interface ComparisonResult<Q extends SideResult = SideResult> {
  algorithm: AlgoKey;
  title: string;
  input: Record<string, any>;
  classical: SideResult & Record<string, any>;
  quantum: Q;
  comparison: Record<string, any> & { notes: string[] };
  qiskit: string | null;
}

export interface Module2Presets {
  search: { max_qubits: number; default_qubits: number };
  factoring: { max_N: number; examples: number[] };
  optimization: { max_cities: number; default: string[]; known_cities: string[] };
  database: { default_records: number; sample: string[]; queries: string[] };
}

export const sfodApi = {
  run: async (body: Record<string, unknown>): Promise<ComparisonResult<any>> => {
    const { data } = await apiClient.post('/api/module2/run', body, { timeout: 180_000 });
    return data;
  },
  presets: async (): Promise<Module2Presets> => {
    const { data } = await apiClient.get('/api/module2/presets');
    return data;
  },
};
