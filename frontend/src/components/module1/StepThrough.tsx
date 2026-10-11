import { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { CircuitSteps } from '../../types';
import { kernelApi } from '../../api/kernel';
import { getApiErrorMessage } from '../../api/client';
import { formatChance, ket } from './format';

export const MAX_STEP_QUBITS = 8;
export const MAX_STEPS = 200;
const ALL_ROWS_UP_TO = 16;          // up to 4 qubits every outcome gets a row; above that, the likeliest
const TOP_ROWS = 8;
const PLAY_MS = 900;
const MOVED = 5e-5;                 // a change smaller than 0.005% isn't worth a mention

// What each gate does, in plain words (kernel gate names).
const GATE_TEXT: Record<string, string> = {
  I: 'Does nothing.',
  H: 'Mixes the qubit: a sure 0 or 1 becomes a 50/50 mix, and a 50/50 mix goes back.',
  X: 'Flips the qubit: 0 becomes 1, and 1 becomes 0.',
  Y: 'Flips the qubit and turns its hidden phase.',
  Z: 'Flips the sign of the 1 part: a hidden change that only shows when outcomes mix.',
  S: 'Turns the hidden phase of the 1 part by 90°.',
  SDG: 'Turns the hidden phase of the 1 part back by 90°.',
  T: 'Turns the hidden phase of the 1 part by 45°.',
  TDG: 'Turns the hidden phase of the 1 part back by 45°.',
  SX: 'Half a flip: a sure 0 becomes a 50/50 mix.',
  SXDG: 'Undoes half a flip.',
  RX: 'Turns the qubit, moving chance between 0 and 1.',
  RY: 'Turns the qubit, moving chance between 0 and 1.',
  RZ: 'Turns the qubit’s hidden phase.',
  P: 'Turns the hidden phase of the 1 part.',
  U: 'A general turn of one qubit.',
  CNOT: 'Flips the second qubit when the first one is 1. This is how qubits get linked.',
  CY: 'Flips the second qubit (with a phase turn) when the first one is 1.',
  CZ: 'Flips the sign when both qubits are 1: a hidden change.',
  CH: 'Mixes the second qubit when the first one is 1.',
  SWAP: 'Swaps the two qubits.',
  ISWAP: 'Swaps the two qubits and turns the phase of the swapped part.',
  CRX: 'Turns the second qubit when the first one is 1.',
  CRY: 'Turns the second qubit when the first one is 1.',
  CRZ: 'Turns the second qubit’s hidden phase when the first one is 1.',
  CP: 'Turns the hidden phase when both qubits are 1.',
  CU: 'Turns the second qubit when the first one is 1.',
  RXX: 'Turns two qubits together.',
  RYY: 'Turns two qubits together.',
  RZZ: 'Turns the hidden phase by whether the two qubits agree.',
  CCX: 'Flips the third qubit when the first two are both 1.',
  CCZ: 'Flips the sign when all three qubits are 1.',
  CSWAP: 'Swaps the last two qubits when the first one is 1.',
  MCX: 'Flips the last qubit when all the others are 1.',
};

const shortName = (gate: string) => (gate === 'CNOT' ? 'cx' : gate.toLowerCase());
const degrees = (rad: number) => `${Number((rad * 180 / Math.PI).toFixed(1))}°`;

// Replays are small and fixed for a given circuit, so keep them while the page is open.
const cache = new Map<string, CircuitSteps>();

interface Props {
  /** The circuit text that was run. */
  source: string;
  nQubits: number;
  gateCount: number;
  /** Called with the line the current step came from (null when it can't be shown). */
  onLine: (line: number | null) => void;
  /** The editor no longer holds the circuit that was run, so lines can't be pointed at. */
  edited: boolean;
}

/**
 * Watch the circuit happen: every outcome's chance after each gate, with the gate's
 * line marked in the editor and what changed said in words.
 */
export function StepThrough({ source, nQubits, gateCount, onLine, edited }: Props) {
  const tooBig = nQubits > MAX_STEP_QUBITS || gateCount > MAX_STEPS;
  const [data, setData] = useState<CircuitSteps | null>(() => cache.get(source) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sliderId = useId();

  useEffect(() => {
    if (tooBig || cache.has(source)) return;
    let live = true;
    kernelApi.steps(source)
      .then(d => { cache.set(source, d); if (live) setData(d); })
      .catch(e => { if (live) setError(getApiErrorMessage(e, "Couldn't replay the circuit. Please try again.")); });
    return () => { live = false; };
  }, [source, tooBig]);

  const steps = data?.steps ?? [];
  const last = Math.max(0, steps.length - 1);
  const step = steps[index];

  useEffect(() => {
    onLine(!edited && step?.line ? step.line : null);
  }, [step, edited, onLine]);
  useEffect(() => () => onLine(null), [onLine]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) { setPlaying(false); return; }
    const t = window.setTimeout(() => setIndex(i => Math.min(last, i + 1)), PLAY_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, last]);

  if (tooBig) {
    return (
      <p className="text-sm text-gray-300">
        Step by step works for circuits up to {MAX_STEP_QUBITS} qubits and {MAX_STEPS} gates. This one has {nQubits} qubits
        and {gateCount.toLocaleString()} gates. Try a smaller size of the same circuit to watch it happen.
      </p>
    );
  }
  if (error) return <p role="alert" className="text-sm text-red-300">{error}</p>;
  if (!data || !step) return <p className="text-sm text-gray-400">Preparing the steps…</p>;

  const n = data.n_qubits;
  const labels = data.labels;
  const name = (i: number) => `|${i.toString(2).padStart(n, '0')}>`;
  const prev = steps[Math.max(0, index - 1)];

  // What changed, biggest first.
  const changes = index === 0 ? [] : step.probs
    .map((p, i) => ({ i, from: prev.probs[i], to: p }))
    .filter(c => Math.abs(c.to - c.from) > MOVED)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  const rows = 2 ** n <= ALL_ROWS_UP_TO
    ? step.probs.map((p, i) => ({ i, p }))
    : step.probs.map((p, i) => ({ i, p })).filter(r => r.p > 0).sort((a, b) => b.p - a.p).slice(0, TOP_ROWS);
  const withChance = step.probs.filter(p => p > 0).length;
  const changed = new Map(changes.map(c => [c.i, c.to > c.from ? 'up' : 'down']));
  const lineText = step.line ? source.split('\n')[step.line - 1]?.trim() : '';

  const go = (i: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(last, i))); };
  const btn = 'p-2 rounded-lg border border-quantum-600 text-gray-200 hover:border-quantum-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={sliderId} className="text-sm text-gray-200">
          {index === 0 ? 'Start' : `Gate ${index} of ${last}`}
        </label>
        <div className="flex gap-1.5">
          <button type="button" className={btn} onClick={() => go(0)} disabled={index === 0} aria-label="Back to the start">
            <ChevronFirst className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className={btn} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous gate">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { if (index >= last) setIndex(0); setPlaying(p => !p); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-quantum-neon text-black text-sm font-semibold hover:bg-teal-300 transition-colors">
            {playing ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            {playing ? 'Pause' : index >= last ? 'Play again' : 'Play'}
          </button>
          <button type="button" className={btn} onClick={() => go(index + 1)} disabled={index >= last} aria-label="Next gate">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" className={btn} onClick={() => go(last)} disabled={index >= last} aria-label="Jump to the end">
            <ChevronLast className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <input id={sliderId} type="range" min={0} max={last} value={index} onChange={e => go(Number(e.target.value))}
        aria-valuetext={index === 0 ? 'Start' : `Gate ${index} of ${last}`}
        className="w-full accent-[#00ffcc] cursor-pointer" />

      <div aria-live="polite" className="rounded-lg bg-quantum-900/60 border border-quantum-600 p-3 space-y-1.5 text-sm">
        {index === 0 ? (
          <p className="text-gray-200">Every qubit starts at 0, so the only possible outcome is {ket(name(0))}.</p>
        ) : (
          <>
            <p className="text-white font-medium break-words">
              <span className="font-mono">{shortName(step.gate!)}{step.params.length ? `(${step.params.map(degrees).join(', ')})` : ''}</span>
              {' on '}{step.qubits.map(q => labels[q]).join(', ')}
              {step.line && <span className="text-gray-400 font-normal"> · line {step.line}{edited ? '' : lineText ? `: ${lineText.slice(0, 60)}` : ''}</span>}
            </p>
            <p className="text-gray-300">{GATE_TEXT[step.gate!] ?? `A ${shortName(step.gate!)} gate.`}</p>
            <p className="text-gray-200">
              {changes.length ? (
                <>
                  <span className="text-gray-400">What changed: </span>
                  {changes.slice(0, 3).map((c, k) => (
                    <span key={c.i}>{k > 0 && ', '}{ket(name(c.i))} {formatChance(c.from)} → {formatChance(c.to)}</span>
                  ))}
                  {changes.length > 3 && <> and {changes.length - 3} more</>}.
                </>
              ) : step.phase_only ? (
                <>No chance changed. This gate turned the hidden phase of some outcomes, which decides what cancels
                  out when outcomes mix later.</>
              ) : (
                <>Nothing changed: this gate had no effect on the qubits as they were (for example, a control qubit that was 0).</>
              )}
            </p>
          </>
        )}
      </div>

      <div>
        <ul className="space-y-1.5" aria-label="Chance of each outcome at this step">
          {rows.map(({ i, p }) => {
            const move = changed.get(i);
            return (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className={`font-mono shrink-0 ${p > 0 ? 'text-quantum-neon' : 'text-gray-400'}`}
                  style={{ width: `${n * 0.62 + 1.6}em` }}>{ket(name(i))}</span>
                <span className="flex-1 h-2 rounded-full bg-quantum-700 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-quantum-neon motion-safe:transition-[width] motion-safe:duration-300"
                    style={{ width: `${p * 100}%` }} />
                </span>
                <span className={`w-20 text-right tabular-nums whitespace-nowrap ${move ? 'text-white font-semibold' : 'text-gray-300'}`}>
                  {formatChance(p)}
                </span>
                <span className="w-4 shrink-0">
                  {move === 'up' && <ArrowUp className="w-4 h-4 text-green-400" aria-label="went up" />}
                  {move === 'down' && <ArrowDown className="w-4 h-4 text-amber-400" aria-label="went down" />}
                </span>
              </li>
            );
          })}
        </ul>
        {2 ** n > ALL_ROWS_UP_TO && withChance > rows.length && (
          <p className="text-xs text-gray-400 mt-2">The {rows.length} likeliest at this step; {withChance - rows.length} more outcomes have a chance.</p>
        )}
      </div>
    </div>
  );
}
