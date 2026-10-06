// One qubit, pictured as an arrow on the Bloch sphere: `theta` is the tilt
// from the top (|0⟩, theta 0) to the bottom (|1⟩, theta π), and `phi` is the
// turn around the middle. Both in radians.

export type Vec3 = [number, number, number];

export interface QubitState {
  theta: number;
  phi: number;
}

export const ZERO: QubitState = { theta: 0, phi: 0 };
export const ONE: QubitState = { theta: Math.PI, phi: 0 };

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

/** A state from degrees, the units shown on screen. */
export const fromDegrees = (tiltDeg: number, turnDeg: number): QubitState => ({ theta: rad(tiltDeg), phi: rad(turnDeg) });

/** The odds of reading 0 and 1, as whole percentages that always add up to 100.
 *  The chance of 1 is sin²(θ/2). */
export function percentages(s: QubitState): [number, number] {
  const one = Math.round(Math.sin(s.theta / 2) ** 2 * 100);
  return [100 - one, one];
}

/** Where the arrow's tip is: x and y around the middle, z up. */
export function blochVector(s: QubitState): Vec3 {
  return [Math.sin(s.theta) * Math.cos(s.phi), Math.sin(s.theta) * Math.sin(s.phi), Math.cos(s.theta)];
}

/** The state whose arrow points along `v` (any length). The turn is kept in 0…2π. */
export function fromVector(v: Vec3): QubitState {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const theta = Math.acos(Math.min(1, Math.max(-1, v[2] / len)));
  const phi = Math.atan2(v[1], v[0]);
  return { theta, phi: phi < 0 ? phi + 2 * Math.PI : phi };
}
