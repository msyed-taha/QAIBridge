import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, BarChart3, Brain, CheckCircle2, Cpu, Database, Download, Eye, Gauge, Hash, History, Loader2,
  MemoryStick, Play, Search, Shuffle, SlidersHorizontal, Trash2, XCircle, Zap,
} from 'lucide-react';
import { HowToUse } from '../components/shared/HowToUse';
import { AiChart, FactoringChart, KernelChart, OptimizationChart, SearchChart } from '../components/module8/BenchmarkCharts';
import {
  dashboardApi, type BenchmarkEvent, type HistoryRun, type Overview, type SuiteKey, type SuitesResponse,
} from '../api/dashboard';
import { getApiErrorMessage } from '../api/client';

const SUITE_META: Record<SuiteKey, { icon: React.ElementType; color: string; short: string; module: string }> = {
  search:       { icon: Search,      color: '#00ffcc', short: 'Grover vs linear search', module: 'Module 2' },
  factoring:    { icon: Hash,        color: '#cc44ff', short: 'Shor vs trial division', module: 'Module 2' },
  optimization: { icon: Shuffle,     color: '#f97316', short: 'QAOA vs exhaustive (Max-Cut)', module: 'Modules 2 + 5' },
  kernel:       { icon: MemoryStick, color: '#fbbf24', short: 'Memory wall (kernel scaling)', module: 'Module 1' },
  ai:           { icon: Brain,       color: '#60a5fa', short: 'Quantum vs classical AI', module: 'Modules 6 + 7' },
};
const ORDER: SuiteKey[] = ['search', 'factoring', 'optimization', 'kernel', 'ai'];
const KIND_BADGE: Record<string, string> = {
  benchmark: 'bg-quantum-neon/10 text-quantum-neon border-quantum-neon/30',
  sfod: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  solve: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  transform: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
};
const OPTION_LABELS: Record<string, string> = {
  search_max_qubits: 'Grover: max qubits', factoring_max_n: 'Shor: largest N', maxcut_max_nodes: 'Max-Cut: max nodes',
  kernel_max_qubits: 'Kernel: max qubits', qaoa_layers: 'QAOA layers p', ai_iterations: 'AI: training iterations',
};

type Status = 'idle' | 'running' | 'done' | 'error';

function Kpi({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-[11px] text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-white font-mono">{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ suite, status, count, children, note }: {
  suite: SuiteKey; status: Status; count: number; children: React.ReactNode; note?: string;
}) {
  const m = SUITE_META[suite];
  const Icon = m.icon;
  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: m.color }} />
        <h3 className="text-white font-bold text-sm">{m.short}</h3>
        <span className="text-[10px] text-gray-500">{m.module}</span>
        <span className="ml-auto text-[11px] text-gray-400 flex items-center gap-1">
          {status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-quantum-neon" />}
          {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
          {status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
          {count > 0 ? `${count} point${count > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      {children}
      {note && <p className="text-gray-500 text-xs mt-2 leading-relaxed">{note}</p>}
    </div>
  );
}

export function DashboardPage() {
  const [meta, setMeta] = useState<SuitesResponse | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selected, setSelected] = useState<SuiteKey[]>(ORDER);
  const [options, setOptions] = useState<Record<string, number>>({});
  const [showOptions, setShowOptions] = useState(false);

  const [data, setData] = useState<Record<SuiteKey, any[]>>({ search: [], factoring: [], optimization: [], kernel: [], ai: [] });
  const [summaries, setSummaries] = useState<Partial<Record<SuiteKey, Record<string, any>>>>({});
  const [status, setStatus] = useState<Record<SuiteKey, Status>>({ search: 'idle', factoring: 'idle', optimization: 'idle', kernel: 'idle', ai: 'idle' });
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([dashboardApi.overview(), dashboardApi.history(25)]);
      setOverview(o);
      setRuns(h);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the dashboard'));
    }
  }, []);

  useEffect(() => {
    dashboardApi.suites().then(m => { setMeta(m); setOptions(m.defaults); }).catch(() => undefined);
    refresh();
    return () => {
      socketRef.current?.close();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [refresh]);

  const pushLog = (line: string) => setLog(prev => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 60));

  const startBenchmark = () => {
    if (running || !selected.length) return;
    setError(null);
    setViewing(null);
    setData({ search: [], factoring: [], optimization: [], kernel: [], ai: [] });
    setSummaries({});
    setStatus({ search: 'idle', factoring: 'idle', optimization: 'idle', kernel: 'idle', ai: 'idle' });
    setLog([]);
    setRunning(true);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);

    const ws = dashboardApi.socket();
    socketRef.current = ws;
    ws.onopen = () => {
      pushLog('Connected — streaming results from the backend');
      ws.send(JSON.stringify({ action: 'run', suites: selected, options }));
    };
    ws.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as BenchmarkEvent;
      switch (ev.type) {
        case 'suite_start':
          setStatus(s => ({ ...s, [ev.suite]: 'running' }));
          pushLog(`▶ ${ev.title}`);
          break;
        case 'point':
          setData(d => ({ ...d, [ev.suite]: [...d[ev.suite], ev.data] }));
          break;
        case 'suite_done':
          setStatus(s => ({ ...s, [ev.suite]: 'done' }));
          setSummaries(s => ({ ...s, [ev.suite]: ev.summary }));
          pushLog(`✓ ${SUITE_META[ev.suite].short} (${(Number(ev.summary.duration_ms) / 1000).toFixed(1)} s)`);
          break;
        case 'suite_error':
          setStatus(s => ({ ...s, [ev.suite]: 'error' }));
          pushLog(`✗ ${SUITE_META[ev.suite].short}: ${ev.detail}`);
          break;
        case 'done':
          pushLog(`Finished in ${(ev.duration_ms / 1000).toFixed(1)} s — saved to history as run #${ev.run_id}`);
          finish();
          refresh();
          break;
        case 'error':
          setError(ev.detail);
          finish();
          break;
      }
    };
    ws.onerror = () => { setError('Live connection failed — is the backend running?'); finish(); };
    ws.onclose = () => finish();
  };

  const finish = () => {
    setRunning(false);
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    const ws = socketRef.current;
    socketRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  };

  const viewRun = async (run: HistoryRun) => {
    try {
      const full = await dashboardApi.run(run.id);
      const suites = full.payload?.suites;
      if (!suites) return;
      const next: Record<SuiteKey, any[]> = { search: [], factoring: [], optimization: [], kernel: [], ai: [] };
      const st: Record<SuiteKey, Status> = { search: 'idle', factoring: 'idle', optimization: 'idle', kernel: 'idle', ai: 'idle' };
      const sm: Partial<Record<SuiteKey, Record<string, any>>> = {};
      (Object.keys(suites) as SuiteKey[]).forEach(k => {
        next[k] = suites[k].points;
        st[k] = 'done';
        sm[k] = suites[k].summary;
      });
      setData(next);
      setStatus(st);
      setSummaries(sm);
      setViewing(`${run.title} · ${run.created_at ? new Date(run.created_at).toLocaleString() : ''}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not open the run'));
    }
  };

  const deleteRun = async (id: number) => {
    await dashboardApi.remove(id).catch(() => undefined);
    refresh();
  };

  const k = overview?.kpi ?? {};
  const aiPoints = data.ai;
  const qnn = aiPoints.find(p => p.experiment === 'qnn_vs_mlp');

  return (
    <div className="min-h-screen px-4 py-10 max-w-7xl mx-auto">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
          Module 8 — Interactive Performance Dashboard
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum vs Classical — Live Benchmarks</h1>
        <p className="text-gray-400 text-sm max-w-2xl mx-auto">
          Every point is a real run: classical code on the CPU and quantum circuits on QAIBridge's simulator, streamed
          live from the backend. Runs are saved to your history and can be exported as CSV.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Choose the suites to run (all five by default) — optionally adjust sizes under <strong>Options</strong>.</>,
          <>Click <strong>Run live benchmark</strong>. Charts fill in point by point as results arrive over a WebSocket.</>,
          <>Read the charts: queries (search), qubits and success (factoring), probability of the optimum (QAOA), the memory wall, and quantum vs classical learning curves.</>,
          <>Every run is stored in <strong>History</strong> together with your Module 2, Solve and Transformer runs — reopen it or download the CSV.</>,
        ]}
        outcome={<>Five live Plotly charts, headline KPIs and a history table with CSV export.</>}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi icon={History} label="Runs saved" value={String(overview?.total_runs ?? 0)} color="#00ffcc"
          sub={overview ? Object.entries(overview.by_kind).map(([kk, v]) => `${v} ${kk}`).join(' · ') || 'none yet' : ''} />
        <Kpi icon={Search} label="Best Grover query speed-up" value={k.grover_speedup ? `${Number(k.grover_speedup).toFixed(1)}×` : '—'} color="#00ffcc" sub="vs average linear search" />
        <Kpi icon={Hash} label="Shor success rate" value={k.shor_success_rate != null ? `${Math.round(k.shor_success_rate * 100)}%` : '—'} color="#cc44ff" sub="numbers factored" />
        <Kpi icon={Shuffle} label="QAOA approximation" value={k.qaoa_approx_ratio != null ? Number(k.qaoa_approx_ratio).toFixed(2) : '—'} color="#f97316" sub="expected cut / max cut" />
        <Kpi icon={Cpu} label="Largest register" value={k.kernel_max_qubits ? `${k.kernel_max_qubits} q` : '—'} color="#fbbf24" sub="simulated on this machine" />
        <Kpi icon={Gauge} label="Quantum answers correct" value={k.quantum_correct_rate != null ? `${Math.round(k.quantum_correct_rate * 100)}%` : '—'} color="#60a5fa" sub="SFOD / Solve / Transformer runs" />
      </div>

      {/* Controls */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-quantum-neon" />
          <h3 className="text-white font-bold text-sm">Benchmark suites</h3>
          <button onClick={() => setShowOptions(o => !o)} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-quantum-600 rounded-lg px-2.5 py-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Options
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {ORDER.map(key => {
            const m = SUITE_META[key];
            const Icon = m.icon;
            const on = selected.includes(key);
            return (
              <button key={key} disabled={running}
                onClick={() => setSelected(sel => on ? sel.filter(s => s !== key) : [...sel, key])}
                className={`text-left p-3 rounded-xl border transition-all ${on ? 'border-quantum-neon/40 bg-quantum-neon/5' : 'border-quantum-700 bg-quantum-900 opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: m.color }} />
                  <span className="text-xs text-white font-semibold">{m.short}</span>
                </div>
                <span className="text-[10px] text-gray-500">{m.module}</span>
              </button>
            );
          })}
        </div>
        {showOptions && meta && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {Object.entries(meta.limits).map(([key, lim]) => (
              <div key={key}>
                <label className="block text-[11px] text-gray-400 mb-1">{OPTION_LABELS[key] ?? key}: <span className="text-white font-mono">{options[key]}</span></label>
                <input type="range" min={lim.min} max={lim.max} value={options[key] ?? lim.min} disabled={running}
                  onChange={e => setOptions(o => ({ ...o, [key]: Number(e.target.value) }))} className="w-full accent-teal-400" />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <button onClick={startBenchmark} disabled={running || !selected.length}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }}>
            {running ? <><Loader2 className="w-4 h-4 animate-spin" />Running live… {elapsed.toFixed(1)} s</> : <><Play className="w-4 h-4" />Run live benchmark</>}
          </button>
          {log.length > 0 && (
            <div className="sm:w-96 bg-quantum-900 border border-quantum-700 rounded-xl p-2 h-24 overflow-y-auto font-mono text-[10px] text-gray-400">
              {log.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
        </div>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>}
      {viewing && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2 text-xs text-blue-200 mb-4">
          <Eye className="w-4 h-4" /> Showing saved run: {viewing}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <ChartCard suite="search" status={status.search} count={data.search.length}
          note={summaries.search ? `At ${Number(summaries.search.max_items).toLocaleString()} items Grover needs ${summaries.search.best_query_speedup}× fewer queries than an average linear search, with ≥ ${(summaries.search.min_success_probability * 100).toFixed(1)}% success probability.` : 'Queries needed to find one item — measured, not theoretical.'}>
          <SearchChart points={data.search} />
        </ChartCard>
        <ChartCard suite="factoring" status={status.factoring} count={data.factoring.length}
          note={summaries.factoring ? `${Math.round(summaries.factoring.success_rate * 100)}% of the numbers were factored from a quantum-measured period, using up to ${summaries.factoring.max_qubits} simulated qubits.` : 'Every N runs the full order-finding circuit (counting register + modular multiplication + inverse QFT).'}>
          <FactoringChart points={data.factoring} />
        </ChartCard>
        <ChartCard suite="optimization" status={status.optimization} count={data.optimization.length}
          note={summaries.optimization ? `Mean approximation ratio ${summaries.optimization.mean_approx_ratio}; QAOA's best sample was the exact optimum on ${summaries.optimization.optimal_found} of ${summaries.optimization.points} graphs.` : 'Random Max-Cut graphs, QAOA p layers vs exhaustive search over 2^n cuts.'}>
          <OptimizationChart points={data.optimization} />
        </ChartCard>
        <ChartCard suite="kernel" status={status.kernel} count={data.kernel.filter(p => !p.skipped).length}
          note="The Memory Wall: every extra qubit doubles the state vector (16 bytes × 2ⁿ) and the cost of each gate — why local simulation stops in the mid-20s of qubits.">
          <KernelChart points={data.kernel} />
        </ChartCard>
        <ChartCard suite="ai" status={status.ai} count={data.ai.length}
          note={qnn ? `QNN accuracy ${Math.round(qnn.quantum_accuracy * 100)}% with ${qnn.quantum_params} trainable angles vs classical MLP ${Math.round(qnn.classical_accuracy * 100)}% with ${qnn.classical_params} weights (toy dataset, Modules 6–7).` : 'Loss curves of a classical MLP vs the converted QNN, and raw-angle SGD vs the Neural Angle Optimizer.'}>
          <AiChart points={data.ai} />
        </ChartCard>
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-quantum-neon" />
            <h3 className="text-white font-bold text-sm">How to read the benchmarks</h3>
          </div>
          <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
            <li>• <span className="text-gray-200">Queries, not seconds, are the fair speed metric.</span> A CPU simulating a quantum computer is slow; the advantage shows in how many times the algorithm must ask the problem a question.</li>
            <li>• <span className="text-gray-200">Success probability</span> comes straight from the state vector — quantum algorithms are probabilistic by design.</li>
            <li>• <span className="text-gray-200">QAOA is a heuristic:</span> its value is concentrating probability on good answers; it is compared against the exact optimum here.</li>
            <li>• <span className="text-gray-200">The memory wall</span> is why real quantum hardware matters: at 50 qubits the state vector would need 18 petabytes.</li>
          </ul>
        </div>
      </div>

      {/* History */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-quantum-700">
          <Database className="w-4 h-4 text-quantum-neon" />
          <h3 className="text-white font-bold text-sm">History</h3>
          <span className="text-xs text-gray-500">benchmarks + your Module 2, Solve and Transformer runs</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-gray-500 text-sm px-5 py-6">No runs yet — run a benchmark, or use Quantum vs Classical, the Problem Solver or Code to Quantum while signed in.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-quantum-900/50 text-gray-500 text-left">
                <tr>
                  <th className="px-5 py-2">When</th><th className="px-3">Type</th><th className="px-3">Run</th>
                  <th className="px-3">Headline</th><th className="px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-t border-quantum-700/50">
                    <td className="px-5 py-2.5 text-gray-400 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td className="px-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] ${KIND_BADGE[r.kind] ?? ''}`}>{r.kind}</span></td>
                    <td className="px-3 text-gray-200">{r.title}</td>
                    <td className="px-3 text-gray-400 font-mono">
                      {r.kind === 'benchmark'
                        ? [r.summary.grover_speedup && `Grover ${Number(r.summary.grover_speedup).toFixed(1)}×`,
                           r.summary.shor_success_rate != null && `Shor ${Math.round(r.summary.shor_success_rate * 100)}%`,
                           r.summary.qaoa_approx_ratio != null && `QAOA ${Number(r.summary.qaoa_approx_ratio).toFixed(2)}`,
                           r.summary.kernel_max_qubits && `${r.summary.kernel_max_qubits} q`].filter(Boolean).join(' · ')
                        : <>{r.summary.quantum_correct ? '✓ correct' : '✗'}{r.summary.qubits ? ` · ${r.summary.qubits} qubits` : ''}{r.summary.quantum_steps != null ? ` · ${r.summary.quantum_steps} ${r.summary.quantum_label ?? 'steps'}` : ''}</>}
                    </td>
                    <td className="px-3 text-right whitespace-nowrap">
                      {r.kind === 'benchmark' && (
                        <button onClick={() => viewRun(r)} className="text-gray-400 hover:text-white p-1" title="Show in the charts"><Eye className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => dashboardApi.downloadCsv(r.id)} className="text-gray-400 hover:text-white p-1" title="Download CSV"><Download className="w-4 h-4" /></button>
                      <button onClick={() => deleteRun(r.id)} className="text-gray-400 hover:text-red-400 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-600 mt-4 flex items-center justify-center gap-1">
        <Zap className="w-3 h-3" /> Results stream over a FastAPI WebSocket from the benchmark engine to this page (FE-3).
      </p>
    </div>
  );
}
