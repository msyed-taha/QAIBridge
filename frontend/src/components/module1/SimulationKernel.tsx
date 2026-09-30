import { useCallback, useEffect, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import { Play, RotateCcw, Cpu, AlertTriangle, CheckCircle, Radio } from 'lucide-react';
import type { MemoryCheckResponse, RamTableRow, SimulationResult } from '../../types';
import { kernelApi } from '../../api/kernel';
import { getApiErrorMessage } from '../../api/client';
import { StateVectorChart } from './StateVectorChart';
import { SimulationProgress } from './SimulationProgress';
import { QubitSlider } from './QubitSlider';
import { BlochSphere } from '../module3/BlochSphere';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

const PRESET_CIRCUITS = [
  // ── Small (≤ 20 q, ≤ 16 MB) ──────────────────────────────────────────────
  { label: 'Bell State',    value: 'bell',   qubits: 2,  tier: 'safe' },
  { label: 'GHZ State',     value: 'ghz',    qubits: 3,  tier: 'safe' },
  { label: 'Grover 2q',     value: 'grover', qubits: 2,  tier: 'safe' },
  { label: 'Grover 8q',     value: 'grover', qubits: 8,  tier: 'safe' },
  { label: 'QFT 4q',        value: 'qft',    qubits: 4,  tier: 'safe' },
  { label: 'Ansatz 5q',     value: 'ansatz', qubits: 5,  tier: 'safe' },
  { label: 'GHZ 10q',       value: 'ghz',    qubits: 10, tier: 'safe' },
  { label: 'Grover 12q',    value: 'grover', qubits: 12, tier: 'safe' },
  { label: 'QFT 16q',       value: 'qft',    qubits: 16, tier: 'safe' },
  { label: 'Ansatz 18q',    value: 'ansatz', qubits: 18, tier: 'safe' },
  { label: 'QFT 20q',       value: 'qft',    qubits: 20, tier: 'safe' },
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
type PresetItem = (typeof PRESET_CIRCUITS)[number];

function MemoryWallChart({ table, availableGb }: { table: RamTableRow[]; availableGb: number | null }) {
  if (!table.length) return null;
  const x = table.map(r => r.n_qubits);
  const data: any[] = [
    { type: 'scatter', mode: 'lines+markers', name: 'State vector (GB)', x, y: table.map(r => r.required_gb),
      line: { color: COLORS.neon, width: 2 }, marker: { size: 4 } },
  ];
  if (availableGb) {
    data.push({ type: 'scatter', mode: 'lines', name: `Free RAM now (${availableGb.toFixed(1)} GB)`,
      x: [x[0], x[x.length - 1]], y: [availableGb, availableGb], line: { color: COLORS.classical, dash: 'dash', width: 2 } });
  }
  return (
    <Plot
      data={data}
      layout={darkLayout({
        xaxis: { title: { text: 'Qubits' }, dtick: 2 },
        yaxis: { title: { text: 'GB (log scale)' }, type: 'log' },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 240 }}
    />
  );
}

export function SimulationKernel() {
  const [nQubits, setNQubits]       = useState(4);
  const [presetTier, setPresetTier] = useState<'safe' | 'caution' | 'heavy'>('safe');
  const [memInfo, setMemInfo]       = useState<MemoryCheckResponse | null>(null);
  const [ramTable, setRamTable]     = useState<RamTableRow[]>([]);
  const [result, setResult]         = useState<SimulationResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [progress, setProgress]     = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [transport, setTransport]   = useState<'websocket' | 'rest' | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [active, setActive]         = useState<PresetItem>(PRESET_CIRCUITS[0]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    kernelApi.ramTable().then(setRamTable).catch(() => undefined);
    kernelApi.memoryCheck(4).then(setMemInfo).catch(() => undefined);
    return () => wsRef.current?.close();
  }, []);

  const handleSliderChange = useCallback(async (n: number) => {
    setNQubits(n);
    try {
      setMemInfo(await kernelApi.memoryCheck(n));
    } catch { /* ignore */ }
  }, []);

  const runOverRest = async (preset: Preset, qubits: number) => {
    setTransport('rest');
    setProgress(40); setProgressStep('Applying gate operations…'); setProgressDetail('');
    const res = await kernelApi.preset(preset, qubits);
    setProgress(100); setProgressStep('Complete');
    setResult(res);
  };

  // Live progress: the kernel streams "gate i / total" events over a WebSocket (FR1.4).
  const runOverSocket = (preset: Preset, qubits: number) => new Promise<void>((resolve, reject) => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/kernel/ws/${Math.random().toString(36).slice(2)}`);
    wsRef.current = ws;
    let opened = false;
    const timer = window.setTimeout(() => { if (!opened) { ws.close(); reject(new Error('socket-timeout')); } }, 2500);
    ws.onopen = () => {
      opened = true;
      window.clearTimeout(timer);
      setTransport('websocket');
      ws.send(JSON.stringify({ action: 'preset', payload: { preset, n_qubits: qubits, shots: 1024 } }));
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.type === 'progress') {
        setProgress(msg.percent);
        setProgressStep(msg.step);
        setProgressDetail(msg.detail ?? '');
      } else if (msg.type === 'result') {
        setResult(msg.result);
        setProgress(100);
        setProgressStep('Complete');
        ws.close();
        resolve();
      } else if (msg.type === 'error') {
        ws.close();
        reject(new Error(msg.detail));
      }
    };
    ws.onerror = () => { if (!opened) { window.clearTimeout(timer); reject(new Error('socket-failed')); } };
  });

  const runPreset = async (item: PresetItem) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(2);
    setProgressStep('Connecting to the kernel…');
    setProgressDetail('');
    try {
      await runOverSocket(item.value, item.qubits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'socket-timeout' || msg === 'socket-failed') {
        try { await runOverRest(item.value, item.qubits); }
        catch (err) { setError(getApiErrorMessage(err, 'Simulation failed')); }
      } else {
        setError(msg || 'Simulation failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setProgress(0);
    setProgressStep('');
    setProgressDetail('');
  };

  return (
    <div className="space-y-6 px-4 py-10">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
          Module 1 — Custom Simulation Kernel
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">QAIBridge's Own State-Vector Simulator</h1>
        <p className="text-gray-400 text-sm max-w-2xl mx-auto">
          Written from scratch in NumPy — no Qiskit inside. Gates are applied in place on the 2ⁿ-amplitude state vector
          with bounded working memory, so this laptop reaches the mid-20s of qubits before the "memory wall".
        </p>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
          <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-quantum-neon" />Qubit configuration & RAM check</h3>
          <QubitSlider value={nQubits} onChange={handleSliderChange} />

          {memInfo && (
            <div className={`mt-4 rounded-lg p-3 border text-sm ${
              memInfo.is_safe ? 'border-green-700 bg-green-900/20 text-green-300' : 'border-red-700 bg-red-900/20 text-red-300'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {memInfo.is_safe ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span className="font-medium">{memInfo.is_safe ? 'Memory OK' : 'Blocked by the memory guard'}</span>
              </div>
              <p className="text-xs opacity-80">
                State vector: 2<sup>{nQubits}</sup> = {memInfo.state_vector_size.toLocaleString()} amplitudes × 16 bytes
              </p>
              <p className="text-xs opacity-80">
                Required: <strong>{memInfo.required_gb.toFixed(4)} GB</strong>{' '}/ Available: {memInfo.available_gb.toFixed(2)} GB
              </p>
              {memInfo.warning && <p className="text-xs mt-1 opacity-70">{memInfo.warning}</p>}
            </div>
          )}
        </div>

        <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Circuit presets</h3>
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
                {tier === 'safe' ? '✓ Safe  ≤20q' : tier === 'caution' ? '⚡ Med  21–25q' : '⚠ Heavy 26–28q'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-44 overflow-y-auto pr-0.5">
            {PRESET_CIRCUITS.filter(p => p.tier === presetTier).map(p => (
              <button
                key={`${p.value}-${p.qubits}`}
                onClick={() => setActive(p)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  active.label === p.label
                    ? 'bg-quantum-500 text-white border border-quantum-neon'
                    : 'bg-quantum-700 text-gray-300 border border-quantum-600 hover:border-quantum-400'
                }`}
              >
                <span className="block text-xs">{p.label}</span>
                <span className={`text-[10px] font-mono ${
                  p.tier === 'heavy' ? 'text-orange-400' : p.tier === 'caution' ? 'text-yellow-400' : 'text-quantum-neon/70'
                }`}>{p.qubits}q · {(2 ** p.qubits * 16 / 1e6).toFixed(p.qubits < 16 ? 3 : 0)} MB</span>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => runPreset(active)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-quantum-neon text-black font-semibold rounded-lg hover:bg-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Simulating…' : `Run ${active.label}`}
            </button>
            <button onClick={handleReset} className="p-2.5 bg-quantum-700 text-gray-300 rounded-lg hover:bg-quantum-600 transition-all" title="Reset">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <SimulationProgress percent={progress} step={progressDetail ? `${progressStep} — ${progressDetail}` : progressStep} />
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Qubits',     value: result.n_qubits },
              { label: 'Gates',      value: result.gate_count },
              { label: 'Depth',      value: result.depth ?? '—' },
              { label: 'Time (ms)',  value: result.elapsed_ms.toFixed(2) },
              { label: 'Entangled',  value: result.is_entangled ? 'Yes ✓' : 'No' },
            ].map(card => (
              <div key={card.label} className="bg-quantum-800 rounded-xl p-4 border border-quantum-600 text-center">
                <p className="text-2xl font-bold text-quantum-neon">{card.value}</p>
                <p className="text-xs text-gray-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>
          {transport && (
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <Radio className="w-3 h-3" />
              {transport === 'websocket' ? 'Progress streamed live over a WebSocket from the kernel.' : 'Ran over REST (WebSocket unavailable).'}
              {' '}State norm = {result.summary.norm} · most likely {result.summary.max_prob_state} ({(result.summary.max_prob * 100).toFixed(2)}%)
            </p>
          )}

          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-sm font-medium text-gray-300 mb-4">Probability distribution · most probable basis states</h3>
            <StateVectorChart amplitudes={result.amplitudes} />
          </div>

          {result.bloch && result.bloch.length > 0 && result.n_qubits <= 8 && (
            <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Bloch spheres (reduced state of each qubit)</h3>
              <div className="flex flex-wrap gap-2 justify-around">
                {result.bloch.map(b => (
                  <BlochSphere key={b.qubit} qubit={b.qubit} x={b.x} y={b.y} z={b.z} entangled={b.purity < 1 - 1e-6} size={116} />
                ))}
              </div>
            </div>
          )}

          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Measurement counts (1 024 shots)</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.counts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 16)
                .map(([state, count]) => (
                  <div key={state} className="bg-quantum-700 border border-quantum-500 rounded-lg px-3 py-1.5 text-xs">
                    <span className="font-mono text-quantum-neon">{state}</span>
                    <span className="text-gray-400 ml-2">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
        <h3 className="text-sm font-medium text-gray-300 mb-1">The memory wall — why simulation stops in the 20s of qubits</h3>
        <p className="text-xs text-gray-500 mb-2">Every qubit doubles the state vector. The dashed line is the RAM free on this machine right now; the kernel refuses runs that would cross 85 % of it.</p>
        <MemoryWallChart table={ramTable} availableGb={memInfo?.available_gb ?? null} />
      </div>
    </div>
  );
}
