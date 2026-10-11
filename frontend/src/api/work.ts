import apiClient from './client';

/** A saved circuit as listed on My work (no text, to keep the list light). */
export interface CircuitSummary {
  id: number;
  name: string;
  project_id: number | null;
  /** Empty while the saved text has a mistake in it. */
  n_qubits: number | null;
  gate_count: number | null;
  /** Builder circuits keep their drawing; the rest open in the Simulator. */
  opens_in: 'builder' | 'simulator';
  created_at: string;
  updated_at: string;
}

/** The Circuit Builder's drawing: how many qubits, and where each gate sits. */
export interface BuilderLayout { n: number; gates: unknown[] }

export interface SavedCircuit extends CircuitSummary {
  qasm: string;
  layout: BuilderLayout | null;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  circuit_count: number;
  created_at: string;
  updated_at: string;
}

export interface NewCircuit { name: string; qasm: string; layout?: BuilderLayout | null; project_id?: number | null }

const BASE = '/api/work';

export const workApi = {
  circuits: async (params: { project?: number | 'none'; limit?: number } = {}): Promise<CircuitSummary[]> =>
    (await apiClient.get(`${BASE}/circuits`, { params })).data,
  circuit: async (id: number): Promise<SavedCircuit> => (await apiClient.get(`${BASE}/circuits/${id}`)).data,
  save: async (body: NewCircuit): Promise<SavedCircuit> => (await apiClient.post(`${BASE}/circuits`, body)).data,
  /** Change name, text, layout or project. Send project_id: null to take it out of its project. */
  update: async (id: number, patch: Partial<NewCircuit>): Promise<SavedCircuit> =>
    (await apiClient.patch(`${BASE}/circuits/${id}`, patch)).data,
  copy: async (id: number): Promise<SavedCircuit> => (await apiClient.post(`${BASE}/circuits/${id}/copy`)).data,
  remove: async (id: number): Promise<void> => { await apiClient.delete(`${BASE}/circuits/${id}`); },

  projects: async (): Promise<Project[]> => (await apiClient.get(`${BASE}/projects`)).data,
  createProject: async (name: string, description = ''): Promise<Project> =>
    (await apiClient.post(`${BASE}/projects`, { name, description })).data,
  updateProject: async (id: number, patch: { name?: string; description?: string }): Promise<Project> =>
    (await apiClient.patch(`${BASE}/projects/${id}`, patch)).data,
  removeProject: async (id: number): Promise<void> => { await apiClient.delete(`${BASE}/projects/${id}`); },

  /** Stars (1–3) per Circuit Builder challenge level. */
  challenges: async (): Promise<Record<string, number>> => (await apiClient.get(`${BASE}/challenges`)).data.levels,
  saveChallenges: async (levels: Record<string, number>): Promise<Record<string, number>> =>
    (await apiClient.post(`${BASE}/challenges`, { levels })).data.levels,
};

/** Where a saved circuit opens: its tool, with ?c=<id> so a reload reopens it. */
export const circuitLink = (c: Pick<CircuitSummary, 'id' | 'opens_in'>) =>
  `${c.opens_in === 'builder' ? '/circuit' : '/simulator'}?c=${c.id}`;

/** "just now", "5 minutes ago", "yesterday" … */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of [['day', 86_400], ['hour', 3_600], ['minute', 60]] as const) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }
  return 'just now';
}
