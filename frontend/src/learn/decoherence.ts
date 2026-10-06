// A simple model of decoherence: every gate takes the same short time, and in
// that time the qubit keeps a fraction e^(−1/T) of its coherence, where T is
// its coherence time counted in gates. Noisier surroundings mean a smaller T.

export type Surroundings = 'cold' | 'some' | 'noisy';

/** The coherence time, in gates, in each kind of surroundings. */
export const COHERENCE_GATES: Record<Surroundings, number> = { cold: 100, some: 10, noisy: 3 };

/** How much coherence is left after `gates` gates, from 1 (all of it) to 0 (none). */
export const coherenceLeft = (gates: number, surroundings: Surroundings) =>
  Math.exp(-gates / COHERENCE_GATES[surroundings]);

/**
 * The chance that "H, then H" (Lesson 5) still gives its right answer, 0, when
 * only `coherence` is left between the two gates. With all of it the answer is
 * always right; with none it is a coin toss.
 */
export const hThenHRight = (coherence: number) => (1 + coherence) / 2;
