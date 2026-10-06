// The Quantum Fourier Transform on 4 qubits, which hold the 16 numbers 0–15.
// It is applied to an equal mix of the "lit" steps of a repeating pattern,
// which is the state Shor's algorithm prepares before its QFT.

export const SIZE = 16;

/** The lit steps of a pattern that starts at `start` and repeats every `period` steps. */
export const litSteps = (period: number, start: number): number[] =>
  Array.from({ length: SIZE }, (_, x) => x).filter(x => x >= start && (x - start) % period === 0);

/**
 * The chance of measuring each number 0–15 after the QFT, for an equal mix of
 * the `lit` steps: |Σ e^(2πi·k·x/16)|² / (16 · lit count). The chances add up to 1.
 */
export function qftChances(lit: number[]): number[] {
  return Array.from({ length: SIZE }, (_, k) => {
    let re = 0;
    let im = 0;
    for (const x of lit) {
      const turn = (2 * Math.PI * k * x) / SIZE;
      re += Math.cos(turn);
      im += Math.sin(turn);
    }
    return (re * re + im * im) / (SIZE * lit.length);
  });
}

/** 1, a, a², a³, … each after dividing by n: the pattern whose rhythm Shor's algorithm finds. */
export function powerRemainders(a: number, n: number, count = SIZE): number[] {
  const out: number[] = [];
  let value = 1;
  for (let i = 0; i < count; i++) {
    out.push(value);
    value = (value * a) % n;
  }
  return out;
}

/** The greatest common divisor, the factor two numbers share. */
export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
