import apiClient from './client';
import type { AIStatus } from './ai';

/** A gate where the Builder draws it: its step (`col`), target wire and control wires. */
export interface BuiltGate { gate: string; col: number; target: number; controls: number[]; angle?: number }

/** An outcome, written with q0 first, and its chance (0 to 1). */
export interface Chance { outcome: string; chance: number }

/** The AI's circuit, and whether the simulator's real chances match the ones it expected. */
export interface BuiltCircuit {
  off_topic: false;
  layout: { n: number; gates: BuiltGate[] };
  explanation: string;
  /** `matches` is null when the AI didn't say what to expect. */
  check: { matches: boolean | null; expected: Chance[]; got: Chance[] };
  ai_status: AIStatus;
}

export type DescribeReply =
  | BuiltCircuit
  | { off_topic: true; message: string; ai_status: AIStatus }
  /** The AI couldn't give a usable circuit; the message says why. */
  | { off_topic?: undefined; unavailable: string; ai_status: AIStatus };

export const builderApi = {
  /** Describe a circuit in words (or a change to the one on the canvas): the AI writes it, the simulator checks it. */
  describe: async (text: string, current_qasm: string): Promise<DescribeReply> =>
    (await apiClient.post('/api/module3/describe', { text, current_qasm }, { timeout: 90_000 })).data,
};
