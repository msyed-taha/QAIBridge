import { Link2 } from 'lucide-react';
import type { SimulationResult } from '../../types';
import { formatChance } from './format';

/**
 * Each qubit on its own: the chance it reads 1. Unlike single outcomes, this stays
 * readable at 28 qubits. Up to 16 qubits it also says which qubits are linked
 * (entangled), from each qubit's own state.
 */
export function QubitsView({ result }: { result: SimulationResult }) {
  const n = result.n_qubits;
  const ones = result.qubit_ones ?? [];
  const labels = result.labels ?? Array.from({ length: n }, (_, i) => `q${i}`);
  const linked = result.bloch && result.bloch.length === n ? result.bloch.map(b => b.purity < 1 - 1e-6) : null;

  if (ones.length !== n) return <p className="text-sm text-gray-400">Not available for this run.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-300 leading-relaxed">
        Each qubit on its own: the chance it reads 1 when you measure it. This stays readable even when there are far
        too many outcomes to list.
      </p>
      <ul className="space-y-1.5" aria-label="Chance that each qubit reads 1">
        {ones.map((p, q) => (
          <li key={q} className="flex items-center gap-3 text-sm">
            <span className="font-mono text-gray-200 w-16 shrink-0 truncate" title={labels[q]}>{labels[q]}</span>
            <span className="flex-1 h-2 rounded-full bg-quantum-700 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-quantum-neon" style={{ width: `${p * 100}%` }} />
            </span>
            <span className="w-24 text-right tabular-nums text-white whitespace-nowrap">
              {formatChance(p)}<span className="sr-only"> chance of 1</span>
            </span>
            {linked && (
              <span className="w-16 shrink-0 text-xs">
                {linked[q] && (
                  <span className="inline-flex items-center gap-1 text-purple-300">
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" />linked
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 leading-relaxed">
        {linked
          ? <>Linked means the qubit is entangled with others: it has no state of its own, so what it reads depends on them. </>
          : <>Which qubits are linked (entangled) is shown for circuits up to 16 qubits. </>}
        A qubit at 50% isn't always linked: it can also be in an even mix on its own.
      </p>
    </div>
  );
}
