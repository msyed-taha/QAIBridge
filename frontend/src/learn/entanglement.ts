// Two linked qubits in the state "both 0 or both 1" (|Φ+⟩), and the
// no-talking game that Bell tests are built on (the CHSH game).

export type Bit = 0 | 1;
export type Card = 'blue' | 'red';
export const CARDS: Card[] = ['blue', 'red'];

export const randomBit = (random: () => number = Math.random): Bit => (random() < 0.5 ? 0 : 1);

/** Measures a fresh pair. A linked pair always gives two equal bits; separate qubits are two coin flips. */
export function measurePair(linked: boolean, random: () => number = Math.random): [Bit, Bit] {
  const a = randomBit(random);
  return [a, linked ? a : randomBit(random)];
}

// ── The no-talking game ───────────────────────────────────────────────────────
// Alice and Bob each get a card. They win if they say the same number, unless
// both got Red: then they must say different numbers.

export const mustDiffer = (alice: Card, bob: Card) => alice === 'red' && bob === 'red';

export const wins = (alice: Card, bob: Card, a: Bit, b: Bit) => (a !== b) === mustDiffer(alice, bob);

/** What a player says for each card. */
export type Plan = Record<Card, Bit>;

/** How many of the four card pairs a plan wins. No plan wins more than 3. */
export const planWins = (alice: Plan, bob: Plan) =>
  CARDS.reduce((n, ca) => n + CARDS.filter(cb => wins(ca, cb, alice[ca], bob[cb])).length, 0);

/** Each player's measuring-dial angle (degrees) for each card. */
export type Dials = Record<Card, number>;

/** With a linked pair, the chance that Alice and Bob get the same bit is cos² of the angle between their dials. */
export const sameChance = (aliceDeg: number, bobDeg: number) => Math.cos(((aliceDeg - bobDeg) * Math.PI) / 180) ** 2;

/** The chance of winning when Alice holds `ca` and Bob holds `cb`, using linked qubits. */
export function qubitWinChance(ca: Card, cb: Card, alice: Dials, bob: Dials) {
  const same = sameChance(alice[ca], bob[cb]);
  return mustDiffer(ca, cb) ? 1 - same : same;
}

/** The chance of winning a round with linked qubits, the cards being dealt at random. */
export const qubitScore = (alice: Dials, bob: Dials) =>
  CARDS.reduce((s, ca) => s + CARDS.reduce((t, cb) => t + qubitWinChance(ca, cb, alice, bob), 0), 0) / 4;
