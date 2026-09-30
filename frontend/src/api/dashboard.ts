import apiClient from './client';

export type SuiteKey = 'search' | 'factoring' | 'optimization' | 'kernel' | 'ai';

export interface SuiteInfo { key: SuiteKey; title: string; module: string }

export interface SuitesResponse {
  suites: SuiteInfo[];
  defaults: Record<string, number>;
  limits: Record<string, { min: number; max: number }>;
}

export interface HistoryRun {
  id: number;
  kind: 'benchmark' | 'sfod' | 'solve' | 'transform';
  title: string;
  summary: Record<string, any>;
  duration_ms: number | null;
  created_at: string | null;
  payload?: { suites: Record<string, { title: string; points: any[]; summary: Record<string, any> }> } | null;
}

export interface Overview {
  total_runs: number;
  by_kind: Record<string, number>;
  kpi: Record<string, number>;
  last_run_at: string | null;
}

export type BenchmarkEvent =
  | { type: 'start'; suites: SuiteKey[]; options: Record<string, number> }
  | { type: 'suite_start'; suite: SuiteKey; title: string }
  | { type: 'point'; suite: SuiteKey; index: number; data: any }
  | { type: 'suite_done'; suite: SuiteKey; summary: Record<string, any> }
  | { type: 'suite_error'; suite: SuiteKey; detail: string }
  | { type: 'done'; run_id: number | null; headline: Record<string, any>; duration_ms: number }
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
