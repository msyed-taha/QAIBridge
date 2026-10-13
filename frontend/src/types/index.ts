// ── Module 1 – Simulation Kernel Types ──────────────────────────────────────

export interface GateOperation {
  gate: string;
  qubits: number[];
  params?: number[];
}

export interface AmplitudeEntry {
  state: string;
  index: number;
  real: number;
  imag: number;
  probability: number;
  magnitude: number;
  phase_deg: number;
}

export interface SimulationResult {
  n_qubits: number;
  gate_count: number;
  elapsed_ms: number;
  amplitudes: AmplitudeEntry[];
  probabilities: Record<string, number>;
  counts: Record<string, number>;
  is_entangled: boolean;
  summary: {
    n_qubits: number;
    dim: number;
    gate_count: number;
    norm: number;
    is_entangled: boolean;
    max_prob_state: string;
    max_prob: number;
  };
  operations: GateOperation[];
  depth?: number;
  truncated?: boolean;
  bloch?: { qubit: number; x: number; y: number; z: number; purity: number; length: number }[];
  memory_report: {
    n_qubits: number;
    required_gb: number;
    available_gb: number;
    is_safe: boolean;
    warning: string | null;
  };
  /** OpenQASM runs: each qubit's name (q[0], q[1], …), the example the circuit still is, and its check. */
  labels?: string[];
  example?: string | null;
  /** OpenQASM runs: the chance each qubit reads 1, in qubit order. */
  qubit_ones?: number[];
  check?: TheoryCheck | null;
}

/** 'outcomes': an example with a known answer. 'norm': every chance still adds up to 100%. */
export type TheoryCheck =
  | { kind: 'outcomes'; expected: Record<string, number>; measured: Record<string, number>;
      max_error: number; passed: boolean }
  | { kind: 'norm'; total: number; max_error: number; passed: boolean };

export interface QasmProblem { message: string; line: number | null }

/** One gate of a step-by-step replay; step 0 is the start (no gate). */
export interface CircuitStep {
  gate: string | null;
  qubits: number[];
  params: number[];
  line: number | null;
  /** Every outcome's chance after this gate, in outcome order (|00…0⟩ first). */
  probs: number[];
  /** No chance moved, but hidden phases did: they decide what cancels out later. */
  phase_only: boolean;
}

export interface CircuitSteps { n_qubits: number; labels: string[]; steps: CircuitStep[] }

export type QasmInspect =
  | { ok: true; n_qubits: number; gate_count: number; depth: number; required_bytes: number;
      labels: string[]; example: string | null }
  | { ok: false; error: QasmProblem };

// ── Admin actor ──────────────────────────────────────────────────────────────

export type Role = 'user' | 'admin';

export interface AdminUser {
  id:            number;
  username:      string;
  email:         string;
  role:          Role;
  is_active:     boolean;
  is_owner:      boolean;
  created_at:    string | null;
  last_login_at: string | null;
  deleted_at:    string | null;
}

export interface AdminStats {
  total_users:           number;
  active_users:          number;
  inactive_users:        number;
  admins:                number;
  new_last_7_days:       number;
  logged_in_last_7_days: number;
  recent_signups:        AdminUser[];
  unread_messages:       number;
}

export interface ContactMessage {
  id:         number;
  name:       string;
  email:      string;
  subject:    string | null;
  message:    string;
  user_id:    number | null;
  is_read:    boolean;
  created_at: string | null;
}

// ── Shared ───────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  status: 'ok' | 'error';
  result?: T;
  report?: T;
  detail?: string;
}
