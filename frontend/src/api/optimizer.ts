import apiClient from './client';

const BASE = '/api/module6';
const LONG = 180_000;

/** How big a circuit's gradients are as it grows (root-mean-square over many starts). */
export interface PlateauStudy {
  qubits: number[];
  draws: number;
  lines: { shallow_random: number[]; deep_random: number[]; deep_near_zero: number[] };
  /** Shots per measured value needed to tell each gradient from measurement noise. */
  shots_needed: { shallow_random: number[]; deep_random: number[]; deep_near_zero: number[] };
  deep_random_factor_per_qubit: number;
  seconds: number;
  cached: boolean;
}

export type RaceMethod = 'random' | 'rescued' | 'near_zero' | 'neural';
export type Shots = 0 | 100 | 1000;

export interface MethodResult {
  label: string;
  /** The better of the learning rates tried for this circuit. */
  learning_rate: number;
  learning_rates_tried: number[];
  curve_mean: number[];
  curve_min: number[];
  curve_max: number[];
  final_loss: { mean: number; min: number; max: number };
  test_accuracy: number;
  train_accuracy: number;
  /** The step at which each seed's loss first fell below the target (null: never). */
  steps_to_target: (number | null)[];
  reached_target: number;
  /** Steps where the plateau monitor flagged this method, per seed. */
  events: number[][];
  /** The first seed's gradient signal ÷ measurement noise, per step (null with exact gradients). */
  signal_to_noise: (number | null)[];
}

export interface RaceResult {
  n_qubits: number;
  layers: number;
  shots: Shots;
  steps: number;
  seeds: number;
  angles: number;
  batch: number;
  target_loss: number;
  data: { train: number; test: number; pattern: string };
  methods: Record<RaceMethod, MethodResult>;
  best: RaceMethod;
  seconds: number;
  cached: boolean;
}

export interface QaoaAngleTest {
  nodes: number;
  edges: number;
  cold_evaluations: number;
  cold_ratio: number;
  neural_ratio: number;
  warm_evaluations: number;
  warm_ratio: number;
  baselines: { average: number; ramp: number; random: number };
  predicted: number[];
  optimal: number[];
}

export interface QaoaAngleReport {
  p: number;
  train_graphs: number;
  test_graphs: number;
  loss_curve: number[];
  final_loss: number;
  dataset_ms: number;
  training_ms: number;
  mean_train_evaluations: number;
  tests: QaoaAngleTest[];
  summary: {
    cold_evaluations: number;
    cold_ratio: number;
    neural_ratio: number;
    warm_evaluations: number;
    warm_ratio: number;
    evaluations_saved_pct: number;
    /** The same short refinement from simple starts: what the network's start is worth. */
    baselines: { average: number; ramp: number; random: number };
    budget_steps: number;
  };
  total_ms: number;
  cached: boolean;
}

export const optimizerApi = {
  /** Gradient size vs number of qubits; also starts preparing the race presets on the server. */
  plateauStudy: async (): Promise<PlateauStudy> =>
    (await apiClient.post<PlateauStudy>(`${BASE}/plateau-study`, {}, { timeout: LONG })).data,
  /** Train one quantum classifier four ways, fairly, over several seeds. */
  race: async (n_qubits: number, layers: number, shots: Shots): Promise<RaceResult> =>
    (await apiClient.post<RaceResult>(`${BASE}/race`, { n_qubits, layers, shots }, { timeout: LONG })).data,
  /** Train the neural QAOA (γ, β) predictor and compare cold vs warm starts on unseen graphs */
  qaoaAngles: async (train_graphs: number, test_graphs: number, layers: number): Promise<QaoaAngleReport> => {
    const { data } = await apiClient.post<QaoaAngleReport>(`${BASE}/qaoa-angles`, { train_graphs, test_graphs, layers }, { timeout: LONG });
    return data;
  },
};
