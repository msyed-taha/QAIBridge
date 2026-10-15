import apiClient from './client';
import type { AIStatus } from './ai';
import type { CurvePoint, DecodedAnswer, QaoaRun } from './sfod';

export type ProblemType =
  | 'search' | 'database' | 'factoring' | 'tsp' | 'knapsack' | 'maxcut' | 'partition' | 'portfolio' | 'boolean' | 'unsupported';

/** Whether the AI can read code for me right now (the built-in reader is used when it can't). */
export type EngineStatus = AIStatus;

export interface ProblemSpec {
  problem_type: ProblemType;
  parameters: Record<string, unknown>;
  confidence: number;
  evidence: string[];
  explanation: string;
  quantum_algorithm: string;
  engine: 'llm' | 'local';
  incomplete?: boolean;
  /** Read by the AI: which model, and whether it came from a saved copy. */
  llm?: { model: string; saved: boolean; latency_ms: number };
  /** Why the built-in reader was used instead of the AI. */
  ai_note?: string;
}

export interface Stage { title: string; detail: string }

export interface TransformResult {
  problem_type: ProblemType;
  algorithm: string;
  supported: boolean;
  reason?: string;
  stages: Stage[];
  /** The run's full numbers; their shape depends on the problem type. */
  details?: Record<string, unknown>;
  verification?: { match: boolean; detail: string };
  qiskit?: string | null;
  total_ms?: number;
}

/** Knapsack, max-cut, partitioning, portfolios and distance-matrix routes: the Bridge, the exact answer and QAOA's. */
export interface QaoaProblemDetails {
  bridge: { title: string; steps: string[]; qubo: { n: number; matrix: number[][]; variables: string[] }; ising: { hamiltonian: string } };
  exact: DecodedAnswer & { bits: string; energy: number; evaluations: number; time_ms: number; method: string };
  qaoa: QaoaRun;
}

/** A Boolean formula: its truth table, oracle, Hamiltonian and a Grover search for satisfying inputs. */
export interface LogicDetails {
  normalized: string;
  variables: string[];
  n_variables: number;
  truth_table: { index: number; bits: string; value: number }[];
  truth_table_truncated: boolean;
  n_solutions: number;
  satisfiable: boolean;
  tautology: boolean;
  solutions: { index: number; bits: string }[];
  oracle: { diagonal_preview: number[] };
  anf: string;
  reversible_circuit: { qubits: number; gates: number; ops: Record<string, number> };
  verification: { verified: boolean; method: string };
  hamiltonian: { hamiltonian: string; n_terms: number; max_locality: number };
  grover: {
    iterations: number; success_probability: number; curve: CurvePoint[]; qubits: number; gates: number; shots: number;
    measured: { index: number; bits: string; count: number; satisfies: boolean }[];
  };
}

export interface Example { id: string; label: string; family: string; code: string; language: string }

export interface ClassicalRun { output: string; error: string; success: boolean; time_ms: number; blocked?: boolean }

export const transformerApi = {
  status: async (): Promise<EngineStatus> => (await apiClient.get('/api/module5/status')).data.engine,
  examples: async (): Promise<Example[]> => (await apiClient.get('/api/module5/examples')).data.examples,
  analyze: async (code: string, mode: string): Promise<{ spec: ProblemSpec; engine: EngineStatus }> =>
    (await apiClient.post('/api/module5/analyze', { code, mode }, { timeout: 90_000 })).data,
  execute: async (spec: ProblemSpec, layers: number, shots: number): Promise<TransformResult> =>
    (await apiClient.post('/api/module5/execute', { spec, layers, shots }, { timeout: 180_000 })).data,
  runClassical: async (code: string): Promise<ClassicalRun> =>
    (await apiClient.post('/api/module5/run-classical', { code, language: 'python' }, { timeout: 30_000 })).data,
};
