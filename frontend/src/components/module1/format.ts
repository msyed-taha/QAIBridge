// Plain-language numbers for the Quantum Simulator page.

/** Memory for n qubits: 2^n amplitudes × 16 bytes (one complex128 each). */
export const stateBytes = (n: number) => 2 ** n * 16;

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 256 B, 16 KB, 4 GB, 4.3 GB (1 KB = 1,024 bytes). */
export function formatBytes(bytes: number): string {
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) { v /= 1024; u++; }
  const shown = v >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
  return `${shown} ${UNITS[u]}`;
}

/** Largest qubit count whose state vector fits in `bytes`. */
export const qubitsThatFit = (bytes: number) => Math.floor(Math.log2(bytes / 16));

/** 50%, 94.53%, 99.9988% (never rounds a near-certain chance up to 100%), 0.0244%, < 0.01%. */
export function formatChance(p: number): string {
  if (p >= 1 - 1e-12) return '100%';
  if (p <= 0) return '0%';
  const pct = p * 100;
  if (pct < 0.01) return '< 0.01%';
  if (pct < 10) return `${Number(pct.toPrecision(3))}%`;
  let digits = 2;
  while (digits < 8 && Number(pct.toFixed(digits)) >= 100) digits++;
  return `${Number(pct.toFixed(digits))}%`;
}

/** "|0101>" from the kernel → "|0101⟩". */
export const ket = (state: string) => state.replace(/>$/, '⟩');

/** 0.17 ms, 840 ms, 18.3 s, 1 min 35 s. */
export function formatDuration(ms: number): string {
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
