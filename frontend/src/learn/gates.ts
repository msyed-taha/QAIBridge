// One qubit and the gates X, H and Z. These gates only ever give real
// amplitudes, so the qubit's arrow always lies on a flat dial: up is 0,
// down is 1, right is the + mix and left is the − mix.

export type GateName = 'X' | 'H' | 'Z';

/** The amounts of 0 and of 1 in the qubit (real numbers; their squares are the odds). */
export type Amps = [number, number];

/** Where the arrow points on the dial. */
export type Spot = '0' | '1' | '+' | '-';

export const START: Amps = [1, 0];

const S = Math.SQRT1_2;
export const GATES: Record<GateName, (a: Amps) => Amps> = {
  X: ([a, b]) => [b, a],                       // flip: swaps 0 and 1
  H: ([a, b]) => [S * (a + b), S * (a - b)],   // mixer: 0 ↔ + mix, 1 ↔ − mix
  Z: ([a, b]) => [a, -b],                      // hidden flip: + mix ↔ − mix
};

/** Runs the gates in order, starting from 0 (or from `start`). */
export const run = (gates: GateName[], start: Amps = START): Amps =>
  gates.reduce((s, g) => GATES[g](s), start);

/** The arrow on the dial: x is right (+), z is up (0). */
export const dialVector = ([a, b]: Amps) => ({ x: 2 * a * b, z: a * a - b * b });

/** The arrow's angle in degrees, clockwise from straight up. */
export const dialAngle = (s: Amps) => {
  const { x, z } = dialVector(s);
  return (Math.atan2(x, z) * 180) / Math.PI;
};

export const chanceOf1 = ([, b]: Amps) => b * b;

export function spotOf(s: Amps): Spot {
  const { x, z } = dialVector(s);
  if (z > 0.5) return '0';
  if (z < -0.5) return '1';
  return x > 0 ? '+' : '-';
}

/** The gates that undo `gates`: each of X, H and Z undoes itself, so it is the same list backwards. */
export const undoGates = (gates: GateName[]): GateName[] => [...gates].reverse();
