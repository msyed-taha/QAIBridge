import apiClient from './client';
import type { AIStatus } from './ai';

/** A method, with how well it fits (the model's confidence, for the quantum ranking). */
export interface AlgoCard {
  rank: number;
  algorithm_id: string;
  algorithm_name: string;
  confidence: number | null;
  color: string;
  complexity: string;
  speedup: string;
  reason: string;
  use_cases: string[];
}

export interface DetectedFeatures {
  category_label: string;
  data_size: number;
  unstructured_data: boolean;
  has_graph_structure: boolean;
  is_security_related: boolean;
  continuous_vars: boolean;
  periodic_structure: boolean;
}

/** The quantum algorithm that fits the problem, and what it could offer on a future, error-corrected computer. */
export interface QuantumOutlook {
  algorithm_id: string;
  name: string;
  complexity: string;
  color: string;
  speedup: string;
  proven: boolean;
  qubits_needed: number | null;
  verdict: 'Quantum' | 'Classical';
  reason: string;
  /** How well the model thinks this algorithm fits the problem type. */
  confidence: number;
}

export interface Advice {
  off_topic?: false;
  /** The best approach today, and why (what stops quantum). */
  approach: 'Quantum' | 'Classical';
  approach_reason: string;
  top_algorithm_id: string;
  top_algorithm_name: string;
  today: { approach: 'Quantum' | 'Classical'; reason: string; algorithm: AlgoCard };
  classical_options: AlgoCard[];
  quantum: QuantumOutlook;
  /** The limits of today's hardware for this problem, in plain words. */
  limits: string[];
  try_here: { label: string; path: string } | null;
  solve_here: string | null;
  model_confidence: number;
  /** The model's ranking of the quantum algorithms. */
  recommendations: AlgoCard[];
  detected_features: DetectedFeatures;
  /** Who read the problem: the AI, or the built-in keyword reader. The model chooses either way. */
  engine: 'ai' | 'built-in';
  /** The AI's one-line reading of the problem. */
  summary?: string;
  /** The AI's plain-words explanation (null if it couldn't write one). */
  explanation?: string | null;
  /** Why the built-in reader was used instead of the AI. */
  ai_note?: string;
  ai_status: AIStatus;
  source: 'text' | 'file';
  filename?: string;
  input_preview: string;
}

/** The text wasn't a computing problem: a polite line saying what the Advisor does. */
export interface OffTopic { off_topic: true; message: string; ai_status: AIStatus }

export type AdvisorMode = 'auto' | 'local';

/** How many hand-labelled test problems got a fitting algorithm. */
export interface ModelScore { right: number; total: number; pct: number }

/** The model, and how it does on real problems it never trained on ("held_out": never used to tune it either). */
export interface ModelInfo {
  trained_on: string;
  test: Record<'held_out' | 'labelled', { facts: ModelScore; built_in_reader: ModelScore }>;
}

const TIMEOUT = 90_000;

export const advisorApi = {
  modelInfo: async (): Promise<ModelInfo> => (await apiClient.get('/api/module4/model-info')).data,
  advise: async (problem_text: string, mode: AdvisorMode): Promise<Advice | OffTopic> =>
    (await apiClient.post('/api/module4/advise', { problem_text, mode }, { timeout: TIMEOUT })).data,
  adviseFile: async (file: File, mode: AdvisorMode): Promise<Advice | OffTopic> => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    return (await apiClient.post('/api/module4/advise-file', form, { timeout: TIMEOUT })).data;
  },
};
