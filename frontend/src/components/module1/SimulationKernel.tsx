import { useState, useCallback } from 'react';
import { Play, RotateCcw, Cpu, AlertTriangle, CheckCircle } from 'lucide-react';
import type { GateOperation, SimulationResult, MemoryCheckResponse } from '../../types';
import { kernelApi } from '../../api/kernel';
import { StateVectorChart } from './StateVectorChart';
import { SimulationProgress } from './SimulationProgress';
import { QubitSlider } from './QubitSlider';

const PRESET_CIRCUITS = [
  // ── Small (≤ 20 q, ≤ 16 MB) ──────────────────────────────────────────────
  { label: 'Bell State',    value: 'bell',   qubits: 2,  tier: 'safe' },
  { label: 'GHZ State',     value: 'ghz',    qubits: 3,  tier: 'safe' },
  { label: 'Grover 2q',     value: 'grover', qubits: 2,  tier: 'safe' },
  { label: 'QFT 4q',        value: 'qft',    qubits: 4,  tier: 'safe' },
  { label: 'Ansatz 5q',     value: 'ansatz', qubits: 5,  tier: 'safe' },
  { label: 'GHZ 10q',       value: 'ghz',    qubits: 10, tier: 'safe' },
  { label: 'QFT 16q',       value: 'qft',    qubits: 16, tier: 'safe' },
  { label: 'Ansatz 18q',    value: 'ansatz', qubits: 18, tier: 'safe' },
  // ── Medium (21–25 q, 32 MB – 512 MB) ─────────────────────────────────────
  { label: 'GHZ 22q',       value: 'ghz',    qubits: 22, tier: 'caution' },
  { label: 'QFT 22q',       value: 'qft',    qubits: 22, tier: 'caution' },
  { label: 'Ansatz 24q',    value: 'ansatz', qubits: 24, tier: 'caution' },
  { label: 'GHZ 25q',       value: 'ghz',    qubits: 25, tier: 'caution' },
  // ── Heavy (26–28 q, 1 GB – 4.3 GB) ───────────────────────────────────────
  { label: 'GHZ 26q',       value: 'ghz',    qubits: 26, tier: 'heavy' },
  { label: 'QFT 26q',       value: 'qft',    qubits: 26, tier: 'heavy' },
  { label: 'GHZ 28q',       value: 'ghz',    qubits: 28, tier: 'heavy' },
  { label: 'QFT 28q ⚡',    value: 'qft',    qubits: 28, tier: 'heavy' },
] as const;

type Preset = 'bell' | 'ghz' | 'grover' | 'qft' | 'ansatz';

export function SimulationKernel() {
  const [nQubits, setNQubits]       = useState(4);
  const [presetTier, setPresetTier] = useState<'safe' | 'caution' | 'heavy'>('safe');
  const [memInfo, setMemInfo]       = useState<MemoryCheckResponse | null>(null);
  const [result, setResult]         = useState<SimulationResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<Preset>('bell');

  const handleSliderChange = useCallback(async (n: number) => {
    setNQubits(n);
    try {
      const mem = await kernelApi.memoryCheck(n);
      setMemInfo(mem);
    } catch { /* ignore */ }
  }, []);

  const runPreset = async (preset: Preset, qubits: number) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(10);
    setProgressStep('Initializing state vector...');

    try {
      setProgress(40); setProgressStep('Applying gate operations...');
      const res = await kernelApi.preset(preset, qubits);
      setProgress(80); setProgressStep('Measuring state...');
      setResult(res);
      setProgress(100); setProgressStep('Complete');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRun = () => {
    // Find the matching preset in the current tier first, fall back globally
    const selected =
      PRESET_CIRCUITS.find(p => p.value === activePreset && p.tier === presetTier) ??
      PRESET_CIRCUITS.find(p => p.value === activePreset)!;
    runPreset(selected.value, selected.qubits);
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setProgress(0);
    setProgressStep('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-quantum-700 rounded-lg">
          <Cpu className="w-6 h-6 text-quantum-neon" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Custom Simulation Kernel</h2>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Qubit Slider + Memory Panel */}
        <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Qubit Configuration</h3>
          <QubitSlider value={nQubits} onChange={handleSliderChange} />

          {memInfo && (
            <div className={`mt-4 rounded-lg p-3 border text-sm ${
              memInfo.is_safe
                ? 'border-green-700 bg-green-900/20 text-green-300'
                : 'border-red-700 bg-red-900/20 text-red-300'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {memInfo.is_safe
                  ? <CheckCircle className="w-4 h-4" />
                  : <AlertTriangle className="w-4 h-4" />}
                <span className="font-medium">
                  {memInfo.is_safe ? 'Memory OK' : 'Insufficient RAM'}
                </span>
              </div>
              <p className="text-xs opacity-80">
                State vector: 2<sup>{nQubits}</sup> = {memInfo.state_vector_size.toLocaleString()} amplitudes
              </p>
              <p className="text-xs opacity-80">
                Required: <strong>{memInfo.required_gb.toFixed(4)} GB</strong>
                {' '}/ Available: {memInfo.available_gb.toFixed(2)} GB
              </p>
              {memInfo.warning && (
                <p className="text-xs mt-1 opacity-70">{memInfo.warning}</p>
              )}
            </div>
          )}
        </div>

        {/* Preset Circuits */}
        <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Circuit Presets</h3>

          {/* Tier tabs */}
          <div className="flex gap-1 mb-3">
            {(['safe', 'caution', 'heavy'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => setPresetTier(tier)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  presetTier === tier
                    ? tier === 'safe'    ? 'bg-teal-900/60 text-quantum-neon border border-teal-700'
                    : tier === 'caution' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-700'
                    :                     'bg-orange-900/40 text-orange-400 border border-orange-700'
                    : 'bg-quantum-700 text-gray-500 border border-quantum-600 hover:text-gray-300'
                }`}
              >
                {tier === 'safe'    ? '✓ Safe  ≤20q'
                : tier === 'caution' ? '⚡ Med  21–25q'
                :                     '⚠ Heavy 26–28q'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4 max-h-44 overflow-y-auto pr-0.5">
            {PRESET_CIRCUITS.filter(p => p.tier === presetTier).map((p, i) => (
              <button
                key={`${p.value}-${p.qubits}-${i}`}
                onClick={() => setActivePreset(p.value as Preset)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  activePreset === p.value
                    ? 'bg-quantum-500 text-white border border-quantum-neon'
                    : 'bg-quantum-700 text-gray-300 border border-quantum-600 hover:border-quantum-400'
                }`}
              >
                <span className="block text-xs">{p.label}</span>
                <span className={`text-[10px] font-mono ${
                  p.tier === 'heavy' ? 'text-orange-400' : p.tier === 'caution' ? 'text-yellow-400' : 'text-quantum-neon/70'
                }`}>{p.qubits}q</span>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRun}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-quantum-neon text-black font-semibold rounded-lg hover:bg-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Simulating…' : 'Run Simulation'}
            </button>
            <button
              onClick={handleReset}
              className="p-2.5 bg-quantum-700 text-gray-300 rounded-lg hover:bg-quantum-600 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {loading && (
        <SimulationProgress percent={progress} step={progressStep} />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Qubits',      value: result.n_qubits },
              { label: 'Gates',       value: result.gate_count },
              { label: 'Time (ms)',   value: result.elapsed_ms.toFixed(2) },
              { label: 'Entangled',   value: result.is_entangled ? 'Yes ✓' : 'No' },
            ].map(card => (
              <div key={card.label} className="bg-quantum-800 rounded-xl p-4 border border-quantum-600 text-center">
                <p className="text-2xl font-bold text-quantum-neon">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* State Vector Chart */}
          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-sm font-medium text-gray-300 mb-4">
              Probability Distribution  ·  State Vector Amplitudes
            </h3>
            <StateVectorChart amplitudes={result.amplitudes} />
          </div>

          {/* Measurement Counts */}
          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-sm font-medium text-gray-300 mb-3">
              Measurement Counts (1 024 shots)
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 16)
                .map(([state, count]) => (
                  <div
                    key={state}
                    className="bg-quantum-700 border border-quantum-500 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-quantum-neon">{state}</span>
                    <span className="text-gray-400 ml-2">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
