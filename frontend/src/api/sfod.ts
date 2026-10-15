import apiClient from './client';

export type AlgoKey = 'search' | 'factoring' | 'optimization' | 'database';

/** What both sides of every comparison report. */
export interface SideResult {
  algorithm: string;
  complexity: string;
  steps: number;
  steps_label: string;
  correct: boolean;
  time_ms: number;
}

// ── Grover's search and amplitude amplification ─────────────────────────────

export interface CurvePoint { iteration: number; success_probability: number; theory: number }
export interface HistogramBar { index: number; count: number; marked: boolean }

/**
 * What finding a match really cost: each run is `rounds` Grover rounds, a measurement and one oracle
 * query to check the measured item. With nothing to find, the search stops once a match would have
 * come up with `confidence`, given its chance `p_if_there` per run.
 */
export interface GroverRuns {
  runs: number;
  found: boolean;
  rounds: number;
  queries_per_run: number;
  queries: number;
  confidence?: number;
  p_if_there?: number;
}

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
  runs: GroverRuns;
}

export interface SearchResult {
  algorithm: 'search';
  title: string;
  input: { n_items: number; search_space: number; qubits: number; target: string; marked: number[]; n_marked: number };
  classical: SideResult & { found_index: number | null; answer: { index: number | null; value: string | null } };
  quantum: GroverQuantum & { answer: { index: number | null; value: string | null } };
  comparison: {
    classical_steps: number; quantum_steps: number; classical_expected: number; classical_worst: number;
    scaling: { n_items: number; classical_expected: number; quantum: number }[];
    notes: string[];
  };
  qiskit: string | null;
}

export interface DatabaseResult {
  algorithm: 'database';
  title: string;
  input: {
    n_records: number; search_space: number; qubits: number; query: string; query_meaning: string;
    n_matches: number; sample_records: string[];
  };
  classical: SideResult & {
    matches: number[];
    matching_records: { index: number; record: string }[];
    answer: { matches: number; first: string | null; index: number | null };
  };
  quantum: GroverQuantum & {
    retrieved: { index: number; record: string; count: number }[];
    answer: { first: string | null; index: number | null; matches_seen: number };
    /** Listing every match by repeating the same circuit: null when some never came up. */
    collect_all: { runs: number; queries: number } | null;
  };
  comparison: { classical_steps: number; quantum_steps: number; classical_expected: number; full_scan_reads: number; notes: string[] };
  qiskit: string | null;
}

// ── Shor's algorithm ────────────────────────────────────────────────────────

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
  /** True when the factors came from a period the circuit measured (not a classical pre-check or a lucky gcd). */
  from_period: boolean;
  answer: { factors: number[] | null };
  attempts: ShorAttempt[];
  detail: ShorDetail | null;
  shots: number;
}

export interface CryptoRow { bits: number; logical_qubits: number; quantum_gates: number; classical_gnfs_ops: number }

export interface FactoringResult {
  algorithm: 'factoring';
  title: string;
  input: { N: number; bits: number; qubits_needed: { work: number; counting: number; total: number } };
  classical: SideResult & { factors: number[]; answer: { factors: number[] } };
  quantum: ShorQuantum;
  comparison: { classical_steps: number; quantum_steps: number; crypto_table: CryptoRow[]; notes: string[] };
  qiskit: string | null;
}

// ── QAOA on a route ─────────────────────────────────────────────────────────

/** An answer of a problem solved through the Bridge, in plain terms; which fields are set depends on the problem. */
export interface DecodedAnswer {
  feasible?: boolean;
  selected?: string[]; total_value?: number; total_weight?: number;     // knapsack, portfolio
  partition?: number[][]; cut_value?: number;                            // max-cut
  sets?: number[][]; difference?: number;                                // number partitioning
  tour?: number[] | null; tour_names?: string[] | null; length?: number | null;   // route
  expected_return?: number; volatility?: number;                         // portfolio
}

export interface QaoaSolution extends DecodedAnswer {
  bits: string;
  count?: number;
  probability?: number;
  energy: number;
  optimal: boolean;
}

/** One QAOA run: the tuned angles, what the measurements gave, and the optimiser's trace. */
export interface QaoaRun {
  qubits: number;
  layers: number;
  gammas: number[];
  betas: number[];
  p_optimal: number;
  random_p_optimal: number;
  amplification: number | null;
  p_feasible: number | null;
  random_p_feasible: number | null;
  shots: number;
  best_sampled: QaoaSolution;
  solutions: QaoaSolution[];
  trace: { evaluation: number; value: number; best: number; layers: number }[];
  circuit_evaluations: number;
  circuit: { qubits: number; gates: number; depth: number; ops: Record<string, number> };
}

export interface QaoaQuantum extends SideResult, QaoaRun {
  bridge: {
    title: string;
    steps: string[];
    qubo: { n: number; nonzero_terms: number; variables: string[] };
    ising: { hamiltonian: string; terms: { coeff: number; paulis: string }[] };
  };
}

export interface Tour { algorithm: string; tour: number[]; length: number; tour_names: string[] }

export interface OptimizationResult {
  algorithm: 'optimization';
  title: string;
  input: {
    cities: string[]; coords: [number, number][]; sources: ('known' | 'given')[];
    distance_km: number[][]; qubits: number; layers: number;
  };
  classical: SideResult & Tour & {
    tours_evaluated: number;
    greedy: Tour & { comparisons: number; time_ms: number };
    answer: { tour: string[]; length_km: number };
  };
  quantum: QaoaQuantum & { answer: { tour: string[] | null; length_km: number | null } };
  comparison: {
    classical_steps: number; quantum_steps: number; greedy_length: number; optimal_length: number;
    quantum_length: number | null; greedy_gap_pct: number; notes: string[];
  };
  qiskit: string | null;
}

export type ComparisonResult = SearchResult | DatabaseResult | FactoringResult | OptimizationResult;

export interface Module2Presets {
  search: { max_qubits: number; default_qubits: number };
  factoring: { max_N: number; examples: number[] };
  optimization: { max_cities: number; default: string[]; known_cities: string[] };
  database: { default_records: number; sample: string[]; queries: string[] };
}

export const sfodApi = {
  run: async (body: Record<string, unknown>): Promise<ComparisonResult> => {
    const { data } = await apiClient.post('/api/module2/run', body, { timeout: 180_000 });
    return data;
  },
  presets: async (): Promise<Module2Presets> => {
    const { data } = await apiClient.get('/api/module2/presets');
    return data;
  },
};
