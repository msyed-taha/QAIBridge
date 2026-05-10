import { Info } from 'lucide-react';
import type { BenchmarkReport } from '../../types';
import React from 'react';

interface Props { report: BenchmarkReport }

export function ComparisonTable({ report }: Props) {
  const q = report.quantum_result as Record<string, unknown>;
  const c = report.classical_result as Record<string, unknown>;

  const n = report.problem_size;
  const qOps  = report.theoretical.quantum_ops;
  const cOps  = report.theoretical.classical_ops;
  const thSpeedup = report.theoretical.theoretical_speedup;

  const rows = [
    {
      key: 'Algorithm',
      quantum: q['algorithm'] ?? '—',
      classical: c['algorithm'] ?? '—',
      note: null,
    },
    {
      key: 'Simulation / Run Time',
      quantum: `${q['elapsed_ms'] ?? '—'} ms`,
      classical: `${c['elapsed_ms'] ?? '—'} ms`,
      note: '⚠ Quantum time = classical CPU simulating quantum math (NOT a real QPU). Real quantum hardware would be faster.',
    },
    {
      key: 'Theoretical Operations at N=' + n,
      quantum: typeof qOps === 'number' ? `~${qOps.toLocaleString()} ops` : '—',
      classical: typeof cOps === 'number' ? `~${cOps.toLocaleString()} ops` : '—',
      note: 'This is the actual number of steps each approach needs — the fair comparison.',
    },
    {
      key: 'Time Complexity',
      quantum:   q['complexity']  ?? report.theoretical.quantum_complexity,
      classical: c['complexity']  ?? report.theoretical.classical_complexity,
      note: null,
    },
    {
      key: 'Theoretical Speedup',
      quantum: typeof thSpeedup === 'number' ? `${thSpeedup.toFixed(2)}× faster at N=${n}` : String(thSpeedup),
      classical: 'baseline (1×)',
      note: 'How many fewer operations quantum needs vs classical at this problem size.',
    },
    {
      key: 'Circuit Depth / Comparisons',
      quantum:   String(q['circuit_depth'] ?? '—'),
      classical: String(c['comparisons'] ?? c['iterations'] ?? c['divisions'] ?? '—'),
      note: null,
    },
  ];

  return (
    <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600 space-y-4">
      <h3 className="text-sm font-medium text-gray-300">Side-by-Side Comparison</h3>

      {/* Key explanation banner */}
      <div className="flex items-start gap-2 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 text-xs text-yellow-300">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">Why is Quantum simulation slower?</span>
          <span className="text-yellow-400/80"> — We are running quantum logic on a classical CPU. Simulating
          a quantum state vector is mathematically expensive. A real Quantum Processing Unit (QPU) would
          execute these operations in physical gate time (~nanoseconds). The correct comparison
          is <strong>Theoretical Operations</strong>, not simulation milliseconds.</span>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-quantum-600">
            <th className="text-left text-gray-500 pb-2 font-normal w-1/4">Metric</th>
            <th className="text-left text-quantum-neon pb-2 font-medium w-1/3">Quantum</th>
            <th className="text-left text-red-400 pb-2 font-medium w-1/3">Classical</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <React.Fragment key={row.key}>
              <tr className="border-b border-quantum-700/30">
                <td className="py-2 text-gray-400 align-top">{row.key}</td>
                <td className={`py-2 font-mono align-top ${
                  row.key.includes('Theoretical Speedup') ? 'text-quantum-neon font-bold' : 'text-quantum-neon/90'
                }`}>
                  {String(row.quantum)}
                </td>
                <td className={`py-2 font-mono align-top ${
                  row.key.includes('Simulation') ? 'text-green-400' : 'text-red-400/90'
                }`}>
                  {String(row.classical)}
                  {row.key.includes('Simulation') && (
                    <span className="text-green-600 text-xs ml-1">(faster — expected)</span>
                  )}
                </td>
              </tr>
              {row.note && (
                <tr className="border-b border-quantum-700/20">
                  <td colSpan={3} className="pb-2 text-xs text-gray-500 italic pl-0">
                    ↳ {row.note}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* Quantum advantage summary */}
      <div className="bg-quantum-700/50 rounded-lg p-3 text-center border border-quantum-500/30">
        <p className="text-xs text-gray-400 mb-1">Quantum Advantage at Scale</p>
        <p className="text-sm text-white">
          At <span className="text-quantum-neon font-mono">N = 1,000,000</span> records:
          Classical needs <span className="text-red-400 font-mono">1,000,000</span> operations ·
          Quantum needs only <span className="text-quantum-neon font-mono">1,000</span> operations
          = <span className="text-quantum-purple font-bold">1000× speedup</span>
        </p>
      </div>
    </div>
  );
}
