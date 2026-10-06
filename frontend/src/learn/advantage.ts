// How much work a normal and a quantum computer need, and Grover's search.

/** Average looks a normal search needs to find one item among n in no order. */
export const normalSearchLooks = (n: number) => (n + 1) / 2;

/** Grover's best number of rounds for n items: the whole number nearest (π/4)·√n − ½. */
export const groverRounds = (n: number) => Math.round((Math.PI / 4) * Math.sqrt(n) - 0.5);

/** The chance of finding the marked item after `rounds` Grover rounds on n items: sin²((2k+1)·asin(1/√n)). */
export const groverChance = (n: number, rounds: number) =>
  Math.sin((2 * rounds + 1) * Math.asin(1 / Math.sqrt(n))) ** 2;

/**
 * Every item's amount after `rounds` Grover rounds, with one marked item.
 * Each round flips the marked item's sign, then mirrors every amount around the average.
 */
export function groverAmounts(n: number, marked: number, rounds: number): number[] {
  let amounts = Array<number>(n).fill(1 / Math.sqrt(n));
  for (let r = 0; r < rounds; r++) {
    amounts = amounts.map((a, i) => (i === marked ? -a : a));
    const mean = amounts.reduce((s, a) => s + a, 0) / n;
    amounts = amounts.map(a => 2 * mean - a);
  }
  return amounts;
}

/**
 * Rough steps to split a number of `digits` digits into its primes with the best
 * known normal method (the number field sieve): e^(1.923 · (ln N)^⅓ · (ln ln N)^⅔).
 */
export function normalCrackSteps(digits: number) {
  const lnN = digits * Math.LN10;
  return Math.exp(1.923 * Math.cbrt(lnN) * Math.log(lnN) ** (2 / 3));
}

/** Rough steps for Shor's algorithm: about (number of bits)³. */
export const quantumCrackSteps = (digits: number) => (digits * Math.log2(10)) ** 3;
