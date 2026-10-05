// Patterns of several qubits, each set on its own to 0, 1 or an equal mix of
// both. Pattern '01' means qubit 1 gives 0 and qubit 2 gives 1.

export type Setting = '0' | 'mix' | '1';

/** Every pattern n qubits (or bits) can show: '00', '01', '10', '11' for n = 2. */
export const allPatterns = (n: number): string[] =>
  Array.from({ length: 2 ** n }, (_, i) => i.toString(2).padStart(n, '0'));

/** The patterns in the mix. Each one is equally likely when you look. */
export const patternsInMix = (settings: Setting[]): string[] =>
  allPatterns(settings.length).filter(p => [...p].every((d, i) => settings[i] === 'mix' || settings[i] === d));

/** The chance of each pattern in a mix of `count` patterns, as a short label: '25%', '12.5%'. */
export const shareLabel = (count: number) => `${Number((100 / count).toFixed(1))}%`;

/**
 * The settings that light up exactly `target`, or null when no settings can.
 * Each qubit is fixed if all the target patterns agree on its digit, and a mix if not.
 */
export function settingsFor(target: string[], n: number): Setting[] | null {
  const settings = Array.from({ length: n }, (_, i): Setting => {
    const digits = new Set(target.map(p => p[i]));
    return digits.size === 1 ? (digits.has('0') ? '0' : '1') : 'mix';
  });
  const lit = patternsInMix(settings);
  return lit.length === target.length && lit.every(p => target.includes(p)) ? settings : null;
}
