import type { BenchmarkReport } from '../../types';
import { Zap, Clock, TrendingUp, GitCompare } from 'lucide-react';

interface Props { report: BenchmarkReport }

export function MetricsPanel({ report }: Props) {
  const qMs   = (report.quantum_result as Record<string, unknown>)['elapsed_ms'] as number ?? 0;
  const cMs   = (report.classical_result as Record<string, unknown>)['elapsed_ms'] as number ?? 0;
  const sf    = report.speedup;
  const thSf  = report.theoretical.theoretical_speedup;

  const speedupColor = sf >= 2 ? 'text-quantum-neon' : sf >= 1 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MetricCard
        icon={<Clock className="w-5 h-5" />}
        label="Quantum Time"
        value={`${qMs.toFixed(3)} ms`}
        color="text-quantum-neon"
      />
      <MetricCard
        icon={<Clock className="w-5 h-5" />}
        label="Classical Time"
        value={`${cMs.toFixed(3)} ms`}
        color="text-red-400"
      />
      <MetricCard
        icon={<Zap className="w-5 h-5" />}
        label="Actual Speedup"
        value={`${sf.toFixed(3)}×`}
        color={speedupColor}
      />
      <MetricCard
        icon={<TrendingUp className="w-5 h-5" />}
        label="Theoretical Speedup"
        value={typeof thSf === 'number' ? `${thSf.toFixed(2)}×` : String(thSf)}
        color="text-quantum-purple"
      />

      {/* Complexity row */}
      <div className="col-span-2 bg-quantum-800 rounded-xl p-4 border border-quantum-600">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-400">Complexity Comparison</span>
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-gray-500">Classical</p>
            <p className="font-mono text-sm text-red-400">{report.theoretical.classical_complexity}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Quantum</p>
            <p className="font-mono text-sm text-quantum-neon">{report.theoretical.quantum_complexity}</p>
          </div>
        </div>
      </div>

      <div className="col-span-2 bg-quantum-800 rounded-xl p-4 border border-quantum-600">
        <p className="text-xs text-gray-400 mb-1">Speedup Type</p>
        <p className="text-sm text-quantum-purple font-medium">{report.theoretical.speedup_type}</p>
        <p className="text-xs text-gray-500 mt-1">
          @ N = {report.problem_size} · Algorithm: {report.algorithm}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-quantum-800 rounded-xl p-4 border border-quantum-600 flex items-start gap-3">
      <div className={`mt-0.5 ${color} opacity-70`}>{icon}</div>
      <div>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
