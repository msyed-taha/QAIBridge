import apiClient from './client';

export type SuiteKey = 'search' | 'factoring' | 'optimization' | 'kernel' | 'ai';

export interface SuiteInfo { key: SuiteKey; title: string; module: string }

export interface SuitesResponse {
  suites: SuiteInfo[];
  defaults: Record<string, number>;
  limits: Record<string, { min: number; max: number }>;
}

// ── One point of each benchmark ──────────────────────────────────────────────

export interface SearchPoint {
  qubits: number; items: number;
  classical_comparisons: number; classical_expected: number; classical_ms: number;
  grover_queries: number; success_probability: number; measured_success_rate: number;
  quantum_sim_ms: number; gates: number; depth: number; query_speedup: number;
}

export interface FactoringPoint {
  N: number; bits: number; qubits: number | null; gates: number | null; depth: number | null;
  quantum_sim_ms: number | null; success: boolean; attempts: number;
  a: number | null; period: number | null; factors: string;
  classical_divisions: number; classical_ms: number;
}

export interface OptimizationPoint {
  nodes: number; edges: number; qubits: number; max_cut: number;
  expected_cut: number; approx_ratio: number; best_sampled_cut: number; best_is_optimal: boolean;
  p_optimal: number; random_p_optimal: number; amplification: number;
  circuit_evaluations: number; quantum_ms: number; brute_force_evaluations: number; classical_ms: number; gates: number;
}

/** A size the machine had no room for comes back as skipped, with the reason. */
export interface KernelPoint {
  qubits: number; skipped?: boolean; reason?: string;
  amplitudes?: number; memory_mb?: number; ghz_gates?: number; ghz_ms?: number; qft_gates?: number; qft_ms?: number;
}

export interface AiPoint {
  experiment: 'qnn_vs_mlp' | 'angle_optimizer';
  label: string;
  classical_accuracy: number;
  quantum_accuracy: number;
  classical_curve: number[];
  quantum_curve: number[];
  total_ms: number;
  qubits: number;
  classical_params?: number;
  quantum_params?: number;
  classical_iters_to_converge?: number;
  neural_iters_to_converge?: number;
  plateau_events?: number;
}

export interface SuitePoints {
  search: SearchPoint[];
  factoring: FactoringPoint[];
  optimization: OptimizationPoint[];
  kernel: KernelPoint[];
  ai: AiPoint[];
}

/** What each benchmark found overall (every summary also has its point count and time, or an error). */
export interface SuiteSummaries {
  search: { max_items: number; best_query_speedup: number; min_success_probability: number };
  factoring: { success_rate: number; max_qubits: number };
  optimization: { mean_approx_ratio: number; optimal_found: number };
  kernel: { max_qubits: number; max_memory_mb: number };
  ai: { qnn_accuracy: number; mlp_accuracy: number; qnn_params: number; mlp_params: number; neural_optimizer_accuracy: number };
}
export type SuiteSummary<K extends SuiteKey> = SuiteSummaries[K] & { points: number; duration_ms?: number; error?: string };

/** The headline numbers kept with a saved run: a benchmark's, or a tool run's (Quantum vs Classical, Problem Solver, Code to Quantum). */
export interface RunSummary {
  grover_speedup?: number; grover_items?: number; shor_success_rate?: number; qaoa_approx_ratio?: number;
  kernel_max_qubits?: number; qnn_accuracy?: number; mlp_accuracy?: number;
  algorithm?: string; problem_type?: string; engine?: string; supported?: boolean;
  quantum_correct?: boolean; classical_correct?: boolean; qubits?: number | null;
  quantum_steps?: number | null; quantum_label?: string | null; classical_steps?: number | null; classical_label?: string | null;
  success_probability?: number | null; quantum_ms?: number | null;
}

export type SavedSuites = { [K in SuiteKey]?: { title: string; points: SuitePoints[K]; summary: SuiteSummary<K> } };

export interface HistoryRun {
  id: number;
  kind: 'benchmark' | 'sfod' | 'solve' | 'transform';
  title: string;
  summary: RunSummary;
  duration_ms: number | null;
  created_at: string | null;
  payload?: { suites: SavedSuites } | null;
}

export interface Overview {
  total_runs: number;
  by_kind: Record<string, number>;
  kpi: Record<string, number>;
  last_run_at: string | null;
}

type PointEvent = { [K in SuiteKey]: { type: 'point'; suite: K; index: number; data: SuitePoints[K][number] } }[SuiteKey];
type SuiteDoneEvent = { [K in SuiteKey]: { type: 'suite_done'; suite: K; summary: SuiteSummary<K> } }[SuiteKey];

export type BenchmarkEvent =
  | { type: 'start'; suites: SuiteKey[]; options: Record<string, number> }
  | { type: 'suite_start'; suite: SuiteKey; title: string }
  | PointEvent
  | SuiteDoneEvent
  | { type: 'suite_error'; suite: SuiteKey; detail: string }
  | { type: 'done'; run_id: number | null; headline: RunSummary; duration_ms: number }
  | { type: 'error'; detail: string };

export const dashboardApi = {
  suites: async (): Promise<SuitesResponse> => (await apiClient.get('/api/dashboard/suites')).data,
  overview: async (): Promise<Overview> => (await apiClient.get('/api/dashboard/overview')).data,
  history: async (limit = 25): Promise<HistoryRun[]> =>
    (await apiClient.get('/api/dashboard/history', { params: { limit } })).data.runs,
  run: async (id: number): Promise<HistoryRun> => (await apiClient.get(`/api/dashboard/history/${id}`)).data,
  remove: async (id: number): Promise<void> => { await apiClient.delete(`/api/dashboard/history/${id}`); },
  downloadCsv: async (id: number): Promise<void> => {
    const res = await apiClient.get(`/api/dashboard/history/${id}/csv`, { responseType: 'blob' });
    const disposition: string = res.headers['content-disposition'] ?? '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `qaibridge-run-${id}.csv`;
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  /** Opens the live benchmark socket (token passed as a query parameter). */
  socket: (): WebSocket => {
    const token = localStorage.getItem('qai_token') ?? '';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return new WebSocket(`${proto}://${window.location.host}/api/dashboard/ws/benchmark?token=${encodeURIComponent(token)}`);
  },
};
