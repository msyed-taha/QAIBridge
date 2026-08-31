import { useState } from 'react';
import { Search, Hash, Shuffle, Database, Play, Loader2, Zap, Cpu, ChevronRight, BookOpen } from 'lucide-react';
import { TutorialWalkthrough } from '../components/module2/TutorialWalkthrough';

// ── Types ─────────────────────────────────────────────────────────────────────

type AlgoKey = 'search' | 'factoring' | 'optimization' | 'database';

interface AlgoResult {
  algorithm:            string;
  input_size:           number;
  classical_algo:       string;
  classical_complexity: string;
  classical_steps:      number;
  classical_time_ms:    number;
  quantum_algo:         string;
  quantum_complexity:   string;
  quantum_steps:        number;
  quantum_time_ms:      number;
  speedup_factor:       number;
  qubits_required:      number;
  accuracy_pct:         number;
  step_reduction_pct:   number;
  explanation:          string;
}

// ── Algorithm metadata ────────────────────────────────────────────────────────

const ALGOS: {
  key: AlgoKey;
  icon: React.ElementType;
  color: string;
  glow: string;
  label: string;
  tagline: string;
  classicalComplexity: string;
  quantumComplexity: string;
  speedupType: string;
  defaultN: number;
  maxN: number;
  nLabel: string;
}[] = [
  {
    key: 'search',
    icon: Search,
    color: 'from-teal-500 to-cyan-400',
    glow: 'rgba(20,184,166,0.2)',
    label: 'Search',
    tagline: 'Find a target in an unsorted dataset',
    classicalComplexity: 'O(N)',
    quantumComplexity: 'O(√N)',
    speedupType: 'Quadratic',
    defaultN: 1000,
    maxN: 10000,
    nLabel: 'Dataset size (N)',
  },
  {
    key: 'factoring',
    icon: Hash,
    color: 'from-purple-500 to-pink-400',
    glow: 'rgba(168,85,247,0.2)',
    label: 'Factoring',
    tagline: 'Decompose a number into prime factors',
    classicalComplexity: 'O(√N)',
    quantumComplexity: 'O((log N)³)',
    speedupType: 'Exponential',
    defaultN: 1024,
    maxN: 10000,
    nLabel: 'Number to factor (N)',
  },
  {
    key: 'optimization',
    icon: Shuffle,
    color: 'from-orange-500 to-yellow-400',
    glow: 'rgba(249,115,22,0.2)',
    label: 'Optimization',
    tagline: 'Find the shortest route through cities',
    classicalComplexity: 'O(N²)',
    quantumComplexity: 'O(p·N)',
    speedupType: 'Polynomial',
    defaultN: 20,
    maxN: 200,
    nLabel: 'Number of cities (N)',
  },
  {
    key: 'database',
    icon: Database,
    color: 'from-blue-500 to-indigo-400',
    glow: 'rgba(59,130,246,0.2)',
    label: 'Database',
    tagline: 'Query matching records in unstructured data',
    classicalComplexity: 'O(N)',
    quantumComplexity: 'O(√N)',
    speedupType: 'Quadratic',
    defaultN: 1000,
    maxN: 10000,
    nLabel: 'Number of records (N)',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border ${accent
      ? 'bg-quantum-neon/5 border-quantum-neon/30'
      : 'bg-quantum-900 border-quantum-700'}`}>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent ? 'text-quantum-neon' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function ComplexityBar({ label, complexity, steps, color, isQuantum }: {
  label: string; complexity: string; steps: number; color: string; isQuantum: boolean;
}) {
  return (
    <div className={`flex-1 rounded-2xl p-5 border ${isQuantum
      ? 'bg-quantum-neon/5 border-quantum-neon/20'
      : 'bg-quantum-900 border-quantum-700'}`}>
      <div className="flex items-center gap-2 mb-3">
        {isQuantum
          ? <Zap className="w-4 h-4 text-quantum-neon" />
          : <Cpu className="w-4 h-4 text-gray-500" />}
        <span className={`text-xs font-semibold uppercase tracking-widest ${isQuantum ? 'text-quantum-neon' : 'text-gray-500'}`}>
          {isQuantum ? 'Quantum' : 'Classical'}
        </span>
      </div>
      <p className="text-white font-bold text-sm mb-1">{label}</p>
      <p className={`font-mono text-2xl font-bold mb-3 ${isQuantum ? 'text-quantum-neon' : 'text-gray-300'}`}>
        {complexity}
      </p>
      <p className="text-gray-500 text-xs">
        {steps.toLocaleString()} operations
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Module2Page() {
  const [selected, setSelected] = useState<AlgoKey>('search');
  const [inputN,   setInputN]   = useState<number>(1000);
  const [result,   setResult]   = useState<AlgoResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const meta = ALGOS.find(a => a.key === selected)!;

  const handleAlgoChange = (key: AlgoKey) => {
    const m = ALGOS.find(a => a.key === key)!;
    setSelected(key);
    setInputN(m.defaultN);
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/module2/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ algorithm: selected, input_size: inputN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Execution failed');
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Module 2 — SFOD Model Comparison Suite
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Classical vs Quantum Benchmarking</h1>
        <p className="text-gray-500 text-sm max-w-xl mx-auto">
          Select an SFOD algorithm, set the input scale, and execute to see how quantum algorithms
          outperform their classical counterparts in step count and theoretical complexity.
        </p>
      </div>

      {/* ── Algorithm selector ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {ALGOS.map(a => {
          const Icon    = a.icon;
          const active  = a.key === selected;
          return (
            <button
              key={a.key}
              onClick={() => handleAlgoChange(a.key)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all hover:scale-[1.02] text-center ${
                active
                  ? 'border-quantum-neon/50 bg-quantum-neon/5'
                  : 'border-quantum-700 bg-quantum-800 hover:border-quantum-600'
              }`}
            >
              {active && (
                <div className="absolute inset-0 rounded-2xl opacity-10 pointer-events-none"
                  style={{ background: a.glow }} />
              )}
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-400'}`}>{a.label}</span>
              <span className="text-[10px] text-gray-600 leading-tight">{a.tagline}</span>
              {active && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                style={{ background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Config + Complexity panels ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

        {/* Config card */}
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
          <h3 className="text-white font-bold text-sm mb-4">Configuration</h3>

          <label className="block text-xs text-gray-400 font-medium mb-2">{meta.nLabel}</label>
          <input
            type="range"
            min={4}
            max={meta.maxN}
            value={inputN}
            onChange={e => setInputN(Number(e.target.value))}
            className="w-full accent-teal-400 mb-2"
          />
          <div className="flex justify-between text-xs text-gray-600 mb-4">
            <span>4</span>
            <span className="text-white font-semibold text-sm">{inputN.toLocaleString()}</span>
            <span>{meta.maxN.toLocaleString()}</span>
          </div>

          {/* Complexity preview */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 flex items-center gap-1"><Cpu className="w-3 h-3" /> Classical</span>
              <span className="font-mono text-gray-300">{meta.classicalComplexity}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-quantum-neon flex items-center gap-1"><Zap className="w-3 h-3" /> Quantum</span>
              <span className="font-mono text-quantum-neon">{meta.quantumComplexity}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Speedup type</span>
              <span className="text-purple-400 font-semibold">{meta.speedupType}</span>
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Running…</>
              : <><Play className="w-4 h-4" />Execute Algorithm</>}
          </button>

          <button
            onClick={() => setShowTutorial(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:bg-quantum-700 border border-quantum-600"
          >
            <BookOpen className="w-4 h-4" />
            Learn Tutorial
          </button>
        </div>

        {/* Complexity panels */}
        <div className="lg:col-span-2 flex flex-col sm:flex-row gap-4">
          {result ? (
            <>
              <ComplexityBar
                label={result.classical_algo}
                complexity={result.classical_complexity}
                steps={result.classical_steps}
                color=""
                isQuantum={false}
              />
              <div className="flex items-center justify-center">
                <ChevronRight className="w-6 h-6 text-quantum-neon hidden sm:block" />
              </div>
              <ComplexityBar
                label={result.quantum_algo}
                complexity={result.quantum_complexity}
                steps={result.quantum_steps}
                color=""
                isQuantum={true}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-quantum-800 border border-quantum-700 border-dashed rounded-2xl p-8 text-center">
              <div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center mx-auto mb-3 opacity-60`}>
                  {(() => { const Icon = meta.icon; return <Icon className="w-6 h-6 text-white" />; })()}
                </div>
                <p className="text-gray-500 text-sm">Set your parameters and click</p>
                <p className="text-white font-semibold text-sm">Execute Algorithm</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">
          {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <MetricCard
              label="Speedup Factor"
              value={`${result.speedup_factor.toLocaleString()}×`}
              sub="Quantum vs Classical"
              accent
            />
            <MetricCard
              label="Qubits Required"
              value={`${result.qubits_required}`}
              sub="For full simulation"
            />
            <MetricCard
              label="Accuracy"
              value={`${result.accuracy_pct}%`}
              sub="Solution quality"
            />
            <MetricCard
              label="Step Reduction"
              value={`${result.step_reduction_pct}%`}
              sub="Fewer operations"
            />
          </div>

          {/* Step comparison bar */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
            <h3 className="text-white font-bold text-sm mb-4">Operation Count Comparison</h3>
            <div className="space-y-3">
              {/* Classical bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1"><Cpu className="w-3 h-3" />{result.classical_algo}</span>
                  <span className="text-gray-300 font-mono">{result.classical_steps.toLocaleString()} steps</span>
                </div>
                <div className="h-3 bg-quantum-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gray-500" style={{ width: '100%' }} />
                </div>
              </div>
              {/* Quantum bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-quantum-neon flex items-center gap-1"><Zap className="w-3 h-3" />{result.quantum_algo}</span>
                  <span className="text-quantum-neon font-mono">{result.quantum_steps.toLocaleString()} steps</span>
                </div>
                <div className="h-3 bg-quantum-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, (result.quantum_steps / result.classical_steps) * 100)}%`,
                      background: 'linear-gradient(90deg,#00ffcc,#cc44ff)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <h3 className="text-white font-bold text-sm mb-2">What this means</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{result.explanation}</p>
            <p className="text-gray-600 text-xs mt-3 leading-relaxed">
              Note: Quantum simulation times are measured on classical CPU — they reflect the cost of
              simulating quantum behaviour, not actual QPU execution times. The step counts represent
              theoretical operation counts for a true quantum processor.
            </p>
          </div>
        </>
      )}

      {/* ── Tutorial Modal ─────────────────────────────────────────────── */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-6xl my-8">
            <TutorialWalkthrough
              algorithm={selected}
              inputSize={inputN}
              onClose={() => setShowTutorial(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
