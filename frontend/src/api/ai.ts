import apiClient from './client';

/** Can the AI answer for me right now, and how many requests I have left today. */
export interface AIStatus {
  available: boolean;
  /** Why it can't: not set up on the server, switched off by an admin, or today's limit reached. */
  reason: 'no_key' | 'off' | 'limit' | null;
  message: string | null;
  model: string;
  used_today: number;
  daily_limit: number;
  remaining_today: number;
}

export interface AIUsageTotals {
  answered: number;
  /** Answered from a saved copy: nothing sent, nothing paid. */
  saved: number;
  failed: number;
  /** Turned away by a limit, or because the input was gibberish. */
  refused: number;
  tokens: number;
  cost_usd: number;
}

/** The admin's view: usage today and this month, and the settings. */
export interface AIReport {
  configured: boolean;
  enabled: boolean;
  model: string;
  prices_known: boolean;
  user_daily_limit: number;
  app_daily_limit: number;
  today: AIUsageTotals;
  month: AIUsageTotals;
  features: { feature: string; requests: number; cost_usd: number }[];
}

export interface AISettings { enabled?: boolean; user_daily_limit?: number; app_daily_limit?: number }

/** Something Ask QAIbridge offers to do. The server has checked it: real pages, circuits the Simulator reads. */
export type AskAction =
  | { type: 'open'; label: string; to: string }
  | { type: 'ask_advisor'; label: string; problem: string }
  | { type: 'run_circuit'; label: string; qasm: string; summary: string };

export interface AskTurn { role: 'user' | 'assistant'; text: string }

export interface AskRequest {
  message: string;
  history: AskTurn[];
  page: string;
  page_title: string;
  /** What the page shows right now. */
  details: string;
}

/** `reply` is null when the AI couldn't answer; `unavailable` then says why. */
export interface AskReply { reply: string | null; actions: AskAction[]; unavailable?: string; ai_status: AIStatus }

export const aiApi = {
  status: async (): Promise<AIStatus> => (await apiClient.get('/api/ai/status')).data,
  report: async (): Promise<AIReport> => (await apiClient.get('/api/admin/ai')).data,
  update: async (changes: AISettings): Promise<AIReport> => (await apiClient.patch('/api/admin/ai', changes)).data,
  ask: async (body: AskRequest): Promise<AskReply> => (await apiClient.post('/api/ai/ask', body, { timeout: 60_000 })).data,
};

/** Feature names as people read them. */
export const AI_FEATURE_NAMES: Record<string, string> = {
  code_to_quantum: 'Code to Quantum',
  advisor: 'AI Advisor',
  assistant: 'Ask QAIbridge',
  describe_circuit: 'Describe a circuit',
};
