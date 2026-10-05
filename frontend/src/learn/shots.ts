// Measuring many fresh qubits that are all set up the same way. Each one gives
// 1 with chance `chanceOf1`, otherwise 0. Real quantum computers call each run a shot.

export interface Tally {
  zeros: number;
  ones: number;
}

export const EMPTY_TALLY: Tally = { zeros: 0, ones: 0 };

/** Measures `n` fresh qubits and adds the results to `tally`. */
export function measure(tally: Tally, n: number, chanceOf1: number, random: () => number = Math.random): Tally {
  let ones = 0;
  for (let i = 0; i < n; i++) if (random() < chanceOf1) ones++;
  return { zeros: tally.zeros + n - ones, ones: tally.ones + ones };
}

/** How often 0 and 1 came up, as whole percentages that always add up to 100 (or both 0 before any shots). */
export function tallyPercentages({ zeros, ones }: Tally): [number, number] {
  const total = zeros + ones;
  if (!total) return [0, 0];
  const p1 = Math.round((100 * ones) / total);
  return [100 - p1, p1];
}
