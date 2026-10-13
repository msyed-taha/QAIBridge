import apiClient from './client';

const BASE = '/api/module7';

export type Activation = 'relu' | 'tanh' | 'sigmoid';
export type LayerSpec =
  | { type: 'dense'; units: number; activation: Activation }
  | { type: 'dropout' };
export type DatasetName = 'xor' | 'circles' | 'moons' | 'groups';
export type ConverterMethod = 'classical' | 'quantum' | 'warm';

/** Points in [−1, 1]² and their classes (0 or 1). */
export interface Points { x: [number, number][]; y: (0 | 1)[] }
export interface Dataset { label: string; about: string; train: Points; test: Points }
export type Datasets = Record<DatasetName, Dataset>;

export interface ParsedArchitecture {
  input_dim: number;
  output_dim: number;
  layers: { type: 'dense' | 'dropout'; units: number | null; activation: string | null }[];
  dense_layer_count: number;
  warnings: string[];
}

export interface MappingRow {
  classical: string;
  classical_params: number;
  quantum: string;
  /** null: the layer has nothing to become in the circuit. */
  quantum_params: number | null;
}

/** The quantum network a classical one becomes. */
export interface Conversion {
  classical_layer_sizes: number[];
  classical_params: number;
  qnn: {
    n_qubits: number;
    /** Qubits used by each block (one block per Dense layer). */
    blocks: number[];
    trainable: number;
    depth: number;
    gates: { RY: number; RZ: number; CNOT: number };
  };
  rows: MappingRow[];
  notes: string[];
}

/** While a network is being edited it may not convert yet: then ok is false and error says why, in plain words. */
export type ConvertReply = (Conversion & { ok: true; parsed: ParsedArchitecture }) | { ok: false; error: string };

export interface Spread { mean: number; min: number; max: number }

export interface ConverterResult {
  label: string;
  params: number;
  /** The better of the learning rates tried, chosen by training loss. */
  learning_rate: number;
  learning_rates_tried: number[];
  /** Training loss before each step and after the last, over the seeds. */
  curve_mean: number[];
  curve_min: number[];
  curve_max: number[];
  start_loss: Spread;
  final_loss: Spread;
  train_accuracy: Spread;
  test_accuracy: Spread & { runs: number[] };
  /** Chance of class 1 over the grid (rows: second feature, columns: first), from the run in the middle. */
  map: number[][];
  map_run: number;
}

export interface CompareResult {
  dataset: DatasetName;
  steps: number;
  seeds: number;
  train_points: number;
  test_points: number;
  layers: LayerSpec[];
  conversion: Conversion;
  methods: Record<ConverterMethod, ConverterResult>;
  /** Where the map's rows and columns sit, from −1.1 to 1.1. */
  grid: number[];
  seconds: number;
  cached: boolean;
}

export interface SimulateResult { chances: number[]; labels: number[]; accuracy: number }

export const qnnApi = {
  /** The four datasets; opening them also starts preparing the default network on each. */
  datasets: async (): Promise<Datasets> => (await apiClient.get(`${BASE}/datasets`)).data,

  /** Read and check a described network, without converting it. */
  analyze: async (layers: LayerSpec[]): Promise<ParsedArchitecture> =>
    (await apiClient.post(`${BASE}/analyze`, { layers })).data,

  /** The quantum network it becomes, layer by layer. */
  convert: async (layers: LayerSpec[]): Promise<ConvertReply> =>
    (await apiClient.post(`${BASE}/convert`, { layers })).data,

  /** The converted circuit from a fresh start, run once on the test points, untrained. */
  simulate: async (layers: LayerSpec[], dataset: DatasetName): Promise<SimulateResult> =>
    (await apiClient.post(`${BASE}/simulate`, { layers, dataset })).data,

  /** Train the classical network, the converted one, and the converted one warm-started, over 3 seeds. */
  trainCompare: async (layers: LayerSpec[], dataset: DatasetName, steps: number): Promise<CompareResult> =>
    (await apiClient.post(`${BASE}/train-compare`, { layers, dataset, steps }, { timeout: 180_000 })).data,
};
