import type { SimulationResult } from '../../types';
import { formatChance, ket } from './format';

const MAX_ROWS = 16;
const SHOWN_FROM = 1e-4;          // rows below 0.01 % are noise next to the peaks

/**
 * The most likely outcomes as a table: each outcome's exact chance (a bar and a
 * number) next to how often it actually came up when measured.
 */
export function OutcomeTable({ result, shots }: { result: SimulationResult; shots: number }) {
  const n = result.n_qubits;
  const all = Object.entries(result.probabilities).sort(([, a], [, b]) => b - a);
  const rows = all.filter(([, p]) => p >= SHOWN_FROM).slice(0, MAX_ROWS);
  const top = rows[0]?.[1] ?? 1;
  const possible = (2 ** n).toLocaleString();

  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">The most likely outcomes, their chance, and how often each was measured</caption>
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-quantum-600">
              <th scope="col" className="py-2 pr-3 font-medium">Outcome</th>
              <th scope="col" className="py-2 pr-3 font-medium sm:w-full">Chance</th>
              <th scope="col" className="py-2 font-medium text-right whitespace-nowrap">
                Seen <span className="sr-only">in {shots.toLocaleString()} measurements</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([state, p]) => (
              <tr key={state} className="border-b border-quantum-700/60 last:border-0">
                <th scope="row" className="py-2 pr-3 font-mono font-normal text-quantum-neon text-left text-xs sm:text-sm break-all sm:break-normal sm:whitespace-nowrap">
                  {ket(state)}
                </th>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block flex-1 h-2 rounded-full bg-quantum-700 overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-quantum-neon" style={{ width: `${Math.max(1, (p / top) * 100)}%` }} />
                    </div>
                    <span className="text-white tabular-nums whitespace-nowrap">{formatChance(p)}</span>
                  </div>
                </td>
                <td className="py-2 text-right text-gray-300 tabular-nums">{(result.counts[state] ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 leading-relaxed">
        {rows.length < all.length || result.truncated
          ? <>The {rows.length} most likely of {possible} possible outcomes. </>
          : <>Every outcome with a chance, out of {possible} possible. </>}
        "Seen" counts how often each came up in {shots.toLocaleString()} measurements.
        Read each outcome left to right as q0, q1, q2…
      </p>
    </div>
  );
}
