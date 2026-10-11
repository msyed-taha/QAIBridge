import apiClient from './client';
import type { AIStatus } from './ai';

export interface AlgoRec {
  rank: number;
  algorithm_id: string;
  algorithm_name: string;
  confidence: number;
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

export interface Advice {
  off_topic?: false;
  approach: 'Quantum' | 'Classical';
  approach_reason: string;
  top_algorithm_id: string;
  top_algorithm_name: string;
  top_confidence: number;
  recommendations: AlgoRec[];
  detected_features: DetectedFeatures;
  /** Who read the problem: the AI, or the built-in keyword reader. The model chooses either way. */
  engine: 'ai' | 'built-in';
  /** The AI's one-line reading of the problem. */
  summary?: string;
  /** The AI's plain-words explanation of the model's choice (null if it couldn't write one). */
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

const TIMEOUT = 90_000;

export const advisorApi = {
  advise: async (problem_text: string, mode: AdvisorMode): Promise<Advice | OffTopic> =>
    (await apiClient.post('/api/module4/advise', { problem_text, mode }, { timeout: TIMEOUT })).data,
  adviseFile: async (file: File, mode: AdvisorMode): Promise<Advice | OffTopic> => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    return (await apiClient.post('/api/module4/advise-file', form, { timeout: TIMEOUT })).data;
  },
};
