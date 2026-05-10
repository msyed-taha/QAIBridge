import { useState } from 'react';
import { BarChart2, Zap, Clock, TrendingUp } from 'lucide-react';
import type { BenchmarkReport, SFODAlgorithm, SuiteResult } from '../../types';
import { dashboardApi } from '../../api/dashboard';
import { BenchmarkChart } from './BenchmarkChart';
import { MetricsPanel } from './MetricsPanel';
import { ComparisonTable } from './ComparisonTable';

const ALGORITHMS: { label: string; value: SFODAlgorithm; defaultSize: number; description: string }[] = [
  { label: 'Search (Grover)',     value: 'search',       defaultSize: 64,   description: "Grover's algorithm vs Linear Search" },
  { label: 'Factoring (Shor)',    value: 'factoring',    defaultSize: 15,   description: "Shor's QFT vs Trial Division" },
  { label: 'Optimization (QAOA)', value: 'optimization', defaultSize: 5,    description: 'QAOA Ansatz vs Greedy TSP' },
  { label: 'Database',            value: 'database',     defaultSize: 128,  description: 'Amplitude Amplification vs Sequential Scan' },
];

export function PerformanceDashboard() {
  const [selectedAlg, setSelectedAlg]     = useState<SFODAlgorithm>('search');
  const [problemSize, setProblemSize]     = useState(64);
  const [report, setReport]               = useState<BenchmarkReport | null>(null);
  const [suiteResult, setSuiteResult]     = useState<SuiteResult | null>(null);
  const [loading, setLoading]             = useState(false);
  const [suiteLoading, setSuiteLoading]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const handleAlgChange = (alg: SFODAlgorithm) => {
    setSelectedAlg(alg);
    const found = ALGORITHMS.find(a => a.value === alg);
    if (found) setProblemSize(found.defaultSize);
    setReport(null);
    setError(null);
  };

  const runBenchmark = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await dashboardApi.benchmark(selectedAlg, problemSize);
      setReport(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Benchmark failed');
    } finally {
      setLoading(false);
    }
  };

  const runSuite = async () => {
    setSuiteLoading(true);
    setError(null);
    try {
      const s = await dashboardApi.suite();
      setSuiteResult(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Suite failed');
    } finally {
      setSuiteLoading(false);
    }
  };

  const selectedInfo = ALGORITHMS.find(a => a.value === selectedAlg)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-quantum-700 rounded-lg">
          <BarChart2 className="w-6 h-6 text-quantum-purple" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Interactive Performance Dashboard</h2>
          <p className="text-sm text-gray-400">
            Real-time Quantum vs Classical benchmarking · SFOD Suite · Plotly charts
          </p>
        </div>
      </div>

      {/* Algorithm Selector */}
      <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
        <h3 className="text-sm font-medium text-gray-300 mb-4">SFOD Algorithm Selection</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {ALGORITHMS.map(alg => (
            <button
              key={alg.value}
              onClick={() => handleAlgChange(alg.value)}
              className={`p-3 rounded-lg text-left transition-all border ${
                selectedAlg === alg.value
                  ? 'bg-quantum-600 border-quantum-purple text-white'
                  : 'bg-quantum-700 border-quantum-600 text-gray-300 hover:border-quantum-400'
              }`}
            >
              <p className="font-medium text-sm">{alg.label}</p>
              <p className="text-xs opacity-60 mt-0.5 leading-tight">{alg.description}</p>
            </button>
          ))}
        </div>

        {/* Problem Size Slider */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Problem Size (N)</span>
              <span className="text-quantum-purple font-semibold">{problemSize}</span>
            </div>
            <input
              type="range"
              min={2}
              max={selectedAlg === 'optimization' ? 10 : 512}
              value={problemSize}
              onChange={e => setProblemSize(Number(e.target.value))}
              className="w-full h-2 bg-quantum-600 rounded-full appearance-none cursor-pointer accent-purple-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={runBenchmark}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 bg-quantum-purple text-white font-semibold rounded-lg hover:bg-purple-500 disabled:opacity-50 transition-all text-sm"
            >
              <Zap className="w-4 h-4" />
              {loading ? 'Running…' : 'Benchmark'}
            </button>
            <button
              onClick={runSuite}
              disabled={suiteLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-quantum-600 text-gray-200 font-semibold rounded-lg hover:bg-quantum-500 disabled:opacity-50 transition-all text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              {suiteLoading ? 'Running…' : 'Run Full Suite'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Suite Overview */}
      {suiteResult && !suiteLoading && (
        <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
          <h3 className="text-sm font-medium text-gray-300 mb-4">SFOD Suite Overview — Speedup Factors</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(suiteResult).map(([key, val]) => val && (
              <div key={key} className="bg-quantum-700 rounded-lg p-4 text-center border border-quantum-500">
                <p className="text-3xl font-bold text-quantum-purple">
                  {typeof val.speedup === 'number' ? val.speedup.toFixed(2) : '—'}×
                </p>
                <p className="text-xs text-gray-400 mt-1 capitalize">{key}</p>
                <div className="flex items-center justify-center gap-1 mt-2 text-xs">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-gray-500">
                    Q: {val.quantum_ms?.toFixed(2)}ms · C: {val.classical_ms?.toFixed(2)}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Single Benchmark Results */}
      {report && !loading && (
        <div className="space-y-4">
          {/* Metrics Panel */}
          <MetricsPanel report={report} />

          {/* Scaling Chart */}
          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-sm font-medium text-gray-300 mb-4">
              Complexity Scaling — {report.algorithm}
            </h3>
            <BenchmarkChart chartData={report.chart_data} />
          </div>

          {/* Comparison Table */}
          <ComparisonTable report={report} />
        </div>
      )}
    </div>
  );
}
