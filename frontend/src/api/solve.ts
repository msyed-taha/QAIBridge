import apiClient from './client';
import type { CurvePoint, GroverRuns } from './sfod';

export type ProblemType = 'search' | 'factoring' | 'optimization' | 'database';
export type Approach = 'classical' | 'quantum';

/** What every solve returns. When `error` is set the run could not be done and `result` is empty. */
interface SolveBase {
  approach: Approach;
  algorithm: string;
  steps: number;
  steps_label: string;
  elapsed_ms: number;
  complexity: string;
  input_size: number;
  explanation: string;
  success: boolean;
  error: string | null;
}

export interface SearchAnswer {
  found: boolean; index: number | null; value: string | null; target: string;
  // quantum only
  grover_iterations?: number; success_probability?: number; qubits?: number; gates?: number; depth?: number;
  shots?: number; measured_success_rate?: number; curve?: CurvePoint[]; runs?: GroverRuns;
  histogram?: { label: string; count: number; marked: boolean }[];
}

export interface FactoringAnswer {
  number: number; factors: number[]; factored_form: string; is_prime: boolean;
  // quantum only
  status?: 'factored' | 'failed' | 'trivial' | 'prime' | 'prime_power'; from_period?: boolean;
  a?: number | null; period?: number | null; qubits?: number | null; gates?: number | null; qubits_needed?: number;
}

export interface RouteAnswer {
  tour: string[]; total_distance: number | null; unit: 'km'; num_cities: number; is_optimal: boolean;
  // quantum only
  qaoa_layers?: number; qubits?: number; gates?: number; p_optimal?: number; random_p_optimal?: number;
  amplification?: number | null; p_feasible?: number | null;
}

export interface DatabaseAnswer {
  query: string; query_meaning: string; total_records: number; matches_found: number;
  matches: { index: number; value: string; count?: number }[];
  // quantum only
  true_matches?: number; first?: string | null; first_index?: number | null; runs?: GroverRuns;
  collect_all?: { runs: number; queries: number } | null; success_probability?: number; qubits?: number; shots?: number;
}

export type SolveResult =
  | (SolveBase & { problem_type: 'search'; result: SearchAnswer })
  | (SolveBase & { problem_type: 'factoring'; result: FactoringAnswer })
  | (SolveBase & { problem_type: 'optimization'; result: RouteAnswer })
  | (SolveBase & { problem_type: 'database'; result: DatabaseAnswer });

export interface ExtractedFile { filename: string; text: string; line_count: number }

export const solveApi = {
  solve: async (body: Record<string, unknown>): Promise<SolveResult> =>
    (await apiClient.post('/api/dashboard/solve', body, { timeout: 180_000 })).data.result,
  /** Reads a file as lines of text: one item, record or city per line. */
  readFile: async (file: File): Promise<ExtractedFile> => {
    const form = new FormData();
    form.append('file', file);
    return (await apiClient.post('/api/dashboard/extract-file', form, { timeout: 60_000 })).data;
  },
};
