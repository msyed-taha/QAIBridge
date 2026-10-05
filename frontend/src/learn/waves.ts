// Waves meeting at one spot. Their heights add up, and how bright the spot is
// goes with the square of the total, just like a qubit's odds go with the
// square of its amounts.

/** Two equal waves, the second shifted by `shiftDeg`: how strong they are together, from 0 (cancel) to 1 (in step). */
export const mixStrength = (shiftDeg: number) => (1 + Math.cos((shiftDeg * Math.PI) / 180)) / 2;

/**
 * How bright the spot is where waves of these `sizes` meet, from 0 (they cancel)
 * to 1 (all in step). A wave counts as upside down if the player `flipped` it
 * or if it `arrivesFlipped` at this spot, but not both.
 */
export function brightness(sizes: number[], flipped: boolean[], arrivesFlipped: boolean[] = []): number {
  const total = sizes.reduce((s, x) => s + x, 0);
  const sum = sizes.reduce((s, x, i) => s + (flipped[i] !== !!arrivesFlipped[i] ? -x : x), 0);
  return (sum / total) ** 2;
}

/** The height of a wave at x (0 to 1 across the picture), drawn with `cycles` crests. */
export const waveAt = (x: number, shiftDeg = 0, cycles = 2) =>
  Math.sin(x * cycles * 2 * Math.PI + (shiftDeg * Math.PI) / 180);
