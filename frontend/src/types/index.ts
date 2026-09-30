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
}

export interface MemoryCheckResponse {
  n_qubits: number;
  state_vector_size: number;
  required_gb: number;
  available_gb: number;
  total_ram_gb: number;
  is_safe: boolean;
  warning: string | null;
}

export interface RamTableRow {
  n_qubits: number;
  state_vector_size: number;
  required_bytes: number;
  required_mb: number;
  required_gb: number;
}

// ── Module 6 – Neural Angle Optimizer Types ──────────────────────────────────

export interface BarrenPlateauData {
  qubits: number[];
  random_init_variance: number[];
  small_angle_init_variance: number[];
}

export interface PlateauEvent {
  iteration: number;
  grad_norm: number;
  grad_window_variance: number;
  mitigation: string;
}

export interface LiveMonitorSummary {
  plateau_detected: boolean;
  num_events: number;
  events: PlateauEvent[];
}

export interface OptimizationReport {
  n_qubits: number;
  layers: number;
  iterations: number;
  classical_loss_curve: number[];
  neural_loss_curve: number[];
  classical_accuracy: number;
  neural_accuracy: number;
  classical_iters_to_converge: number;
  neural_iters_to_converge: number;
  speedup_iterations: number;
  barren_plateau: BarrenPlateauData;
  classical_grad_norm_curve: number[];
  neural_grad_norm_curve: number[];
  live_barren_plateau_monitor: {
    classical: LiveMonitorSummary;
    neural: LiveMonitorSummary;
  };
}

// ── Module 7 – QNN Converter Types ───────────────────────────────────────────

export type LayerType = 'dense' | 'dropout';

export interface LayerSpec {
  type: LayerType;
  units?: number;
  activation?: 'relu' | 'tanh' | 'sigmoid';
}

export interface ParsedArchitecture {
  input_dim: number;
  output_dim: number;
  layers: { type: LayerType; units: number | null; activation: string | null }[];
  dense_layer_count: number;
  warnings: string[];
}

export interface QNNSpec {
  n_qubits: number;
  n_layers: number;
  trainable_angles: number;
  circuit_depth: number;
  encoding: string;
  gate_sequence: string[];
}

export interface ComparisonRow {
  metric: string;
  classical: string | number;
  quantum: string | number;
}

export interface ConversionReport {
  classical_layer_sizes: number[];
  classical_neurons: number;
  classical_params: number;
  classical_depth: number;
  qnn: QNNSpec;
  mapping_steps: string[];
  comparison_rows: ComparisonRow[];
  approximation_notes: string[];
}

export interface TrainCompareReport {
  conversion: ConversionReport;
  classical_loss_curve: number[];
  quantum_loss_curve: number[];
  quantum_warm_loss_curve: number[];
  classical_accuracy: number;
  quantum_accuracy: number;
  quantum_warm_accuracy: number;
}

export interface SimulateResult {
  predictions: number[];
  labels: number[];
  accuracy: number;
  angles_used: number[];
}

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
