import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Activity, BarChart3, Brain, CheckCircle2, Cpu, Database, Download, Eye, Gauge, Hash, History, Loader2,
  MemoryStick, Play, Search, Shuffle, SlidersHorizontal, Trash2, XCircle, Zap,
} from 'lucide-react';
import { HowToUse } from '../components/shared/HowToUse';
import { AiChart, FactoringChart, KernelChart, OptimizationChart, SearchChart } from '../components/module8/BenchmarkCharts';
import {
  dashboardApi, type BenchmarkEvent, type HistoryRun, type Overview, type SuiteKey, type SuitePoints, type SuitesResponse,
  type SuiteSummary,
} from '../api/dashboard';
import { getApiErrorMessage } from '../api/client';

const SUITE_META: Record<SuiteKey, { icon: React.ElementType; color: string; short: string; from: string }> = {
  search:       { icon: Search,      color: '#00ffcc', short: 'Grover vs linear search', from: 'Quantum vs Classical' },
  factoring:    { icon: Hash,        color: '#cc44ff', short: 'Shor vs trial division', from: 'Quantum vs Classical' },
  optimization: { icon: Shuffle,     color: '#f97316', short: 'QAOA vs exhaustive (Max-Cut)', from: 'Quantum vs Classical + Code to Quantum' },
  kernel:       { icon: MemoryStick, color: '#fbbf24', short: 'Memory wall (simulator scaling)', from: 'Quantum Simulator' },
  ai:           { icon: Brain,       color: '#60a5fa', short: 'Quantum vs classical AI', from: 'Neural Optimizer + Neural Network Converter' },
};
const ORDER: SuiteKey[] = ['search', 'factoring', 'optimization', 'kernel', 'ai'];
const KINDS: Record<string, { label: string; badge: string }> = {
  benchmark: { label: 'Benchmark', badge: 'bg-quantum-neon/10 text-quantum-neon border-quantum-neon/30' },
  sfod: { label: 'Quantum vs Classical', badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  solve: { label: 'Problem Solver', badge: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  transform: { label: 'Code to Quantum', badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30' },
};
const OPTION_LABELS: Record<string, string> = {
  search_max_qubits: 'Grover: most qubits', factoring_max_n: 'Shor: largest N', maxcut_max_nodes: 'Max-Cut: most nodes',
  kernel_max_qubits: 'Simulator: most qubits', qaoa_layers: 'QAOA layers p', ai_iterations: 'AI: training steps',
};
const EMPTY_POINTS = (): SuitePoints => ({ search: [], factoring: [], optimization: [], kernel: [], ai: [] });
const IDLE: Record<SuiteKey, Status> = { search: 'idle', factoring: 'idle', optimization: 'idle', kernel: 'idle', ai: 'idle' };

type Status = 'idle' | 'running' | 'done' | 'error';
type Summaries = { [K in SuiteKey]?: SuiteSummary<K> };

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

function withPoint<K extends SuiteKey>(d: SuitePoints, suite: K, point: SuitePoints[K][number]): SuitePoints {
  return { ...d, [suite]: [...d[suite], point] };
}

function Kpi({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}40` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} aria-hidden="true" />
        </div>
        <span className="text-xs text-gray-300">{label}</span>
      </div>
      <p className="text-2xl font-extrabold text-white font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Every value behind a chart, as a table. */
function Numbers<T>({ rows, columns }: { rows: T[]; columns: [string, (row: T) => ReactNode][] }) {
  if (!rows.length) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-quantum-neon hover:text-white">See the numbers</summary>
      <div className="overflow-x-auto mt-2">
        <table className="text-xs font-mono text-gray-300 min-w-full">
          <thead className="text-gray-400 text-left font-sans">
            <tr>{columns.map(([label]) => <th key={label} className="pr-4 py-1 font-medium whitespace-nowrap">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-quantum-700/50">
                {columns.map(([label, cell]) => <td key={label} className="pr-4 py-1 whitespace-nowrap">{cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ChartCard({ suite, status, count, children, note, numbers }: {
  suite: SuiteKey; status: Status; count: number; children: ReactNode; note?: string; numbers?: ReactNode;
}) {
  const m = SUITE_META[suite];
  const Icon = m.icon;
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
        <Icon className="w-4 h-4" style={{ color: m.color }} aria-hidden="true" />
        <h3 id={id} className="text-white font-bold text-sm">{m.short}</h3>
        <span className="text-xs text-gray-400">{m.from}</span>
        <span className="ml-auto text-xs text-gray-300 flex items-center gap-1">
          {status === 'running' && <><Loader2 className="w-3.5 h-3.5 animate-spin text-quantum-neon" aria-hidden="true" /><span className="sr-only">Running</span></>}
          {status === 'done' && <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" /><span className="sr-only">Done</span></>}
          {status === 'error' && <><XCircle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" /><span className="sr-only">Failed</span></>}
          {count > 0 ? `${count} point${count > 1 ? 's' : ''}` : ''}
        </span>
      </div>
      {children}
      {note && <p className="text-gray-300 text-xs mt-2 leading-relaxed">{note}</p>}
      {numbers}
    </section>
  );
}

export function DashboardPage() {
  const [meta, setMeta] = useState<SuitesResponse | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selected, setSelected] = useState<SuiteKey[]>(ORDER);
  const [options, setOptions] = useState<Record<string, number>>({});
  const [showOptions, setShowOptions] = useState(false);

  const [data, setData] = useState<SuitePoints>(EMPTY_POINTS);
  const [summaries, setSummaries] = useState<Summaries>({});
  const [status, setStatus] = useState<Record<SuiteKey, Status>>(IDLE);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const ids = { options: useId() };

  const refresh = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([dashboardApi.overview(), dashboardApi.history(25)]);
      setOverview(o);
      setRuns(h);
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't load the dashboard. Please reload the page."));
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
    setData(EMPTY_POINTS());
    setSummaries({});
    setStatus(IDLE);
    setLog([]);
    setRunning(true);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);

    const ws = dashboardApi.socket();
    socketRef.current = ws;
    ws.onopen = () => {
      pushLog('Connected: results appear as each one finishes');
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
          setData(d => withPoint(d, ev.suite, ev.data));
          break;
        case 'suite_done':
          setStatus(s => ({ ...s, [ev.suite]: 'done' }));
          setSummaries(s => ({ ...s, [ev.suite]: ev.summary }));
          pushLog(`✓ ${SUITE_META[ev.suite].short} (${((ev.summary.duration_ms ?? 0) / 1000).toFixed(1)} s)`);
          break;
        case 'suite_error':
          setStatus(s => ({ ...s, [ev.suite]: 'error' }));
          pushLog(`✗ ${SUITE_META[ev.suite].short}: ${ev.detail}`);
          break;
        case 'done':
          pushLog(`Finished in ${(ev.duration_ms / 1000).toFixed(1)} s and saved to your history`);
          finish();
          refresh();
          break;
        case 'error':
          setError(ev.detail);
          finish();
          break;
      }
    };
    ws.onerror = () => { setError("The live connection to QAIbridge failed. Please try again."); finish(); };
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
      setData({
        search: suites.search?.points ?? [], factoring: suites.factoring?.points ?? [], optimization: suites.optimization?.points ?? [],
        kernel: suites.kernel?.points ?? [], ai: suites.ai?.points ?? [],
      });
      setStatus(Object.fromEntries(ORDER.map(k => [k, suites[k] ? 'done' : 'idle'])) as Record<SuiteKey, Status>);
      setSummaries({
        search: suites.search?.summary, factoring: suites.factoring?.summary, optimization: suites.optimization?.summary,
        kernel: suites.kernel?.summary, ai: suites.ai?.summary,
      });
      setViewing(`${run.title} · ${run.created_at ? new Date(run.created_at).toLocaleString() : ''}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't open that run. Please try again."));
    }
  };

  const deleteRun = async (id: number) => {
    await dashboardApi.remove(id).catch(() => undefined);
    refresh();
  };

  const k = overview?.kpi ?? {};
  const qnn = data.ai.find(p => p.experiment === 'qnn_vs_mlp');
  const race = data.ai.find(p => p.experiment === 'angle_optimizer');
  const { search: sSearch, factoring: sFactoring, optimization: sOpt, kernel: sKernel } = summaries;
  const aiNote = [
    qnn && `On unseen XOR test points the quantum network scored ${pct(qnn.quantum_accuracy)} with ${qnn.quantum_params} trainable numbers,`
      + ` against ${pct(qnn.classical_accuracy)} for the classical network it was converted from, with ${qnn.classical_params}.`,
    race && `In the Neural Optimizer's race on a deep circuit (${race.qubits} qubits), the random start reached ${pct(race.classical_accuracy)}`
      + ` test accuracy and the Neural Angle Optimizer ${pct(race.quantum_accuracy)}.`,
    (qnn || race) && 'One seed each: the tool pages run three.',
  ].filter(Boolean).join(' ');

  return (
    <div className="min-h-screen px-4 py-10 max-w-7xl mx-auto">
      <div className="mb-6 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon" aria-hidden="true" />
          Performance Dashboard
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum vs classical, measured live</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Every point is a real run: classical code on this computer's processor and quantum circuits on QAIbridge's simulator,
          shown as each one finishes. Runs are saved to your history and can be downloaded as CSV.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Choose the benchmarks to run (all five by default), and change their sizes under <strong>Options</strong>.</>,
          <>Press <strong>Run live benchmark</strong>. The charts fill in point by point as each result arrives.</>,
          <>Read the charts: queries for search, qubits for factoring, the chance of the best cut for QAOA, the memory wall, and quantum against classical learning. Point at a mark, or open <strong>See the numbers</strong>, for every value.</>,
          <>Every run is saved in <strong>History</strong> with your Quantum vs Classical, Problem Solver and Code to Quantum runs. Open it again or download it as CSV.</>,
        ]}
        outcome={<>Five live charts with their numbers, headline figures, and a history you can reopen and export.</>}
      />

      {/* Headline figures */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi icon={History} label="Runs saved" value={String(overview?.total_runs ?? 0)} color="#00ffcc"
          sub={overview ? Object.entries(overview.by_kind).map(([kind, v]) => `${v} ${KINDS[kind]?.label ?? kind}`).join(' · ') || 'none yet' : ''} />
        <Kpi icon={Search} label="Best Grover query speed-up" value={k.grover_speedup ? `${Number(k.grover_speedup).toFixed(1)}×` : '—'} color="#00ffcc" sub="against an average linear search" />
        <Kpi icon={Hash} label="Shor success rate" value={k.shor_success_rate != null ? pct(k.shor_success_rate) : '—'} color="#cc44ff" sub="numbers factored" />
        <Kpi icon={Shuffle} label="QAOA approximation" value={k.qaoa_approx_ratio != null ? Number(k.qaoa_approx_ratio).toFixed(2) : '—'} color="#f97316" sub="expected cut ÷ best cut" />
        <Kpi icon={Cpu} label="Largest register" value={k.kernel_max_qubits ? `${k.kernel_max_qubits} qubits` : '—'} color="#fbbf24" sub="simulated on this machine" />
        <Kpi icon={Gauge} label="Quantum answers correct" value={k.quantum_correct_rate != null ? pct(k.quantum_correct_rate) : '—'} color="#60a5fa" sub="in your saved tool runs" />
      </div>

      {/* Controls */}
      <section aria-label="Run a benchmark" className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-quantum-neon" aria-hidden="true" />
          <h2 className="text-white font-bold text-sm">Benchmarks</h2>
          <button type="button" onClick={() => setShowOptions(o => !o)} aria-expanded={showOptions} aria-controls={ids.options}
            className="ml-auto flex items-center gap-1 text-xs text-gray-300 hover:text-white border border-quantum-600 rounded-lg px-2.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Options
          </button>
        </div>
        <div role="group" aria-label="Benchmarks to run" className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {ORDER.map(key => {
            const m = SUITE_META[key];
            const Icon = m.icon;
            const on = selected.includes(key);
            return (
              <button key={key} type="button" disabled={running} aria-pressed={on}
                onClick={() => setSelected(sel => on ? sel.filter(s => s !== key) : [...sel, key])}
                className={`text-left p-3 rounded-xl border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${on ? 'border-quantum-neon/40 bg-quantum-neon/5' : 'border-quantum-700 bg-quantum-900 opacity-70'}`}>
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: m.color }} aria-hidden="true" />
                  <span className="text-xs text-white font-semibold">{m.short}</span>
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{m.from}</span>
              </button>
            );
          })}
        </div>
        {showOptions && meta && (
          <div id={ids.options} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {Object.entries(meta.limits).map(([key, lim]) => (
              <div key={key}>
                <label htmlFor={`option-${key}`} className="block text-xs text-gray-300 mb-1">{OPTION_LABELS[key] ?? key}: <span className="text-white font-mono">{options[key]}</span></label>
                <input id={`option-${key}`} type="range" min={lim.min} max={lim.max} value={options[key] ?? lim.min} disabled={running}
                  onChange={e => setOptions(o => ({ ...o, [key]: Number(e.target.value) }))} className="w-full accent-teal-400" />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <button type="button" onClick={startBenchmark} disabled={running || !selected.length}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }}>
            {running ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Running live… {elapsed.toFixed(1)} s</> : <><Play className="w-4 h-4" aria-hidden="true" />Run live benchmark</>}
          </button>
          {log.length > 0 && (
            <div role="log" aria-live="polite" aria-label="Benchmark progress"
              className="sm:w-96 bg-quantum-900 border border-quantum-700 rounded-xl p-2 h-24 overflow-y-auto font-mono text-xs text-gray-300">
              {log.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
        </div>
      </section>

      {error && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-5">{error}</p>}
      {viewing && (
        <p role="status" className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2 text-sm text-blue-100 mb-4">
          <Eye className="w-4 h-4" aria-hidden="true" /> Showing a saved run: {viewing}
        </p>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        <ChartCard suite="search" status={status.search} count={data.search.length}
          note={sSearch ? `At ${sSearch.max_items.toLocaleString()} items Grover needs ${sSearch.best_query_speedup.toFixed(1)}× fewer queries than an average linear search, and finds the item with at least ${pct(sSearch.min_success_probability, 1)} chance.` : 'Queries needed to find one item, measured on each run.'}
          numbers={<Numbers rows={data.search} columns={[
            ['Items', p => p.items.toLocaleString()], ['Qubits', p => p.qubits], ['Linear search', p => p.classical_comparisons],
            ['Expected (N/2)', p => p.classical_expected], ['Grover queries', p => p.grover_queries],
            ['Success chance', p => pct(p.success_probability, 1)], ['Fewer queries', p => `${p.query_speedup.toFixed(1)}×`],
          ]} />}>
          <SearchChart points={data.search} />
        </ChartCard>
        <ChartCard suite="factoring" status={status.factoring} count={data.factoring.length}
          note={sFactoring ? `${pct(sFactoring.success_rate)} of the numbers were factored from a period measured on the quantum circuit, using up to ${sFactoring.max_qubits} simulated qubits.` : 'Every N runs the full order-finding circuit (counting register, modular multiplication and inverse QFT).'}
          numbers={<Numbers rows={data.factoring} columns={[
            ['N', p => p.N], ['Factors', p => (p.success ? p.factors : 'not found')], ['Qubits', p => p.qubits ?? '—'],
            ['Period', p => p.period ?? '—'], ['Attempts', p => p.attempts], ['Simulation (ms)', p => p.quantum_sim_ms?.toFixed(1) ?? '—'],
            ['Trial divisions', p => p.classical_divisions],
          ]} />}>
          <FactoringChart points={data.factoring} />
        </ChartCard>
        <ChartCard suite="optimization" status={status.optimization} count={data.optimization.length}
          note={sOpt ? `Mean approximation ratio ${sOpt.mean_approx_ratio}: QAOA's expected cut, divided by the best cut. Its best sample was the best cut on ${sOpt.optimal_found} of ${sOpt.points} graphs.` : 'Random Max-Cut graphs: QAOA with p layers against checking all 2ⁿ cuts.'}
          numbers={<Numbers rows={data.optimization} columns={[
            ['Nodes', p => p.nodes], ['Edges', p => p.edges], ['Best cut', p => p.max_cut], ['QAOA expected cut', p => p.expected_cut],
            ['Approx. ratio', p => p.approx_ratio], ['Chance of best cut', p => p.p_optimal.toFixed(4)],
            ['Random guess', p => p.random_p_optimal.toFixed(4)], ['Best sample is best', p => (p.best_is_optimal ? 'yes' : 'no')],
          ]} />}>
          <OptimizationChart points={data.optimization} />
        </ChartCard>
        <ChartCard suite="kernel" status={status.kernel} count={data.kernel.filter(p => !p.skipped).length}
          note={`The memory wall: every extra qubit doubles the state vector (16 bytes × 2ⁿ) and the work for each gate, which is why simulating on one machine runs out in the high 20s of qubits.${sKernel ? ` This machine went up to ${sKernel.max_qubits} qubits here (${sKernel.max_memory_mb.toFixed(1)} MB of state vector).` : ''}`}
          numbers={<Numbers rows={data.kernel.filter(p => !p.skipped)} columns={[
            ['Qubits', p => p.qubits], ['Amplitudes', p => p.amplitudes?.toLocaleString() ?? '—'], ['Memory (MB)', p => p.memory_mb?.toFixed(3) ?? '—'],
            ['GHZ (ms)', p => p.ghz_ms?.toFixed(1) ?? '—'], ['QFT (ms)', p => p.qft_ms?.toFixed(1) ?? '—'],
          ]} />}>
          <KernelChart points={data.kernel} />
        </ChartCard>
        <ChartCard suite="ai" status={status.ai} count={data.ai.length}
          note={aiNote || 'Training loss of a classical network and the quantum network it becomes, and of a random start and the Neural Angle Optimizer.'}
          numbers={<Numbers rows={data.ai} columns={[
            ['Experiment', p => p.label], ['Classical side', p => pct(p.classical_accuracy)], ['Quantum side', p => pct(p.quantum_accuracy)],
            ['Qubits', p => p.qubits], ['Time (s)', p => (p.total_ms / 1000).toFixed(1)],
          ]} />}>
          <AiChart points={data.ai} />
        </ChartCard>
        <section aria-labelledby="how-to-read" className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-quantum-neon" aria-hidden="true" />
            <h3 id="how-to-read" className="text-white font-bold text-sm">How to read the benchmarks</h3>
          </div>
          <ul className="space-y-2 text-sm text-gray-300 leading-relaxed">
            <li><span className="text-white">Queries, not seconds, are the fair speed measure.</span> A computer simulating a quantum one is slow; the advantage shows in how many times an algorithm must ask the problem a question.</li>
            <li><span className="text-white">Success chances</span> come straight from the state vector: quantum algorithms are probabilistic by design.</li>
            <li><span className="text-white">QAOA is a heuristic:</span> its value is putting most of the chance on good answers, so it is compared against the exact best cut here.</li>
            <li><span className="text-white">The memory wall</span> is why real quantum hardware matters: at 50 qubits the state vector alone would need 18 petabytes.</li>
          </ul>
        </section>
      </div>

      {/* History */}
      <section aria-labelledby="history" className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-quantum-700">
          <Database className="w-4 h-4 text-quantum-neon" aria-hidden="true" />
          <h2 id="history" className="text-white font-bold text-sm">History</h2>
          <span className="text-xs text-gray-400">benchmarks and your Quantum vs Classical, Problem Solver and Code to Quantum runs</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-gray-300 text-sm px-5 py-6">No runs yet. Run a benchmark, or use Quantum vs Classical, the Problem Solver or Code to Quantum while signed in.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-xs">
              <caption className="sr-only">Saved runs</caption>
              <thead className="bg-quantum-900/50 text-gray-400 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">When</th><th className="px-3 font-medium">From</th><th className="px-3 font-medium">Run</th>
                  <th className="px-3 font-medium">Headline</th><th className="px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-t border-quantum-700/50">
                    <td className="px-5 py-2.5 text-gray-300 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    <td className="px-3"><span className={`px-2 py-0.5 rounded-full border text-xs whitespace-nowrap ${KINDS[r.kind]?.badge ?? ''}`}>{KINDS[r.kind]?.label ?? r.kind}</span></td>
                    <td className="px-3 text-gray-200">{r.title}</td>
                    <td className="px-3 text-gray-300 font-mono">
                      {r.kind === 'benchmark'
                        ? [r.summary.grover_speedup && `Grover ${Number(r.summary.grover_speedup).toFixed(1)}×`,
                           r.summary.shor_success_rate != null && `Shor ${pct(r.summary.shor_success_rate)}`,
                           r.summary.qaoa_approx_ratio != null && `QAOA ${Number(r.summary.qaoa_approx_ratio).toFixed(2)}`,
                           r.summary.kernel_max_qubits && `${r.summary.kernel_max_qubits} qubits`,
                           r.summary.qnn_accuracy != null && `quantum network ${pct(r.summary.qnn_accuracy)}`].filter(Boolean).join(' · ')
                        : <>{r.summary.quantum_correct ? '✓ correct' : '✗ not correct'}{r.summary.qubits ? ` · ${r.summary.qubits} qubits` : ''}{r.summary.quantum_steps != null ? ` · ${r.summary.quantum_steps} ${r.summary.quantum_label ?? 'steps'}` : ''}</>}
                    </td>
                    <td className="px-3 text-right whitespace-nowrap">
                      {r.kind === 'benchmark' && (
                        <button type="button" onClick={() => viewRun(r)} className="text-gray-300 hover:text-white p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                          title="Show in the charts" aria-label={`Show ${r.title} in the charts`}><Eye className="w-4 h-4" aria-hidden="true" /></button>
                      )}
                      <button type="button" onClick={() => dashboardApi.downloadCsv(r.id)} className="text-gray-300 hover:text-white p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        title="Download CSV" aria-label={`Download ${r.title} as CSV`}><Download className="w-4 h-4" aria-hidden="true" /></button>
                      <button type="button" onClick={() => deleteRun(r.id)} className="text-gray-300 hover:text-red-300 p-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        title="Delete" aria-label={`Delete ${r.title}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
        <Zap className="w-3.5 h-3.5" aria-hidden="true" /> Results stream live from the benchmark engine as each point finishes.
      </p>
    </div>
  );
}
