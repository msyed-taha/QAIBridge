import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, CheckCircle, Cpu, Database, FileText, Hash, Loader2, Search, Shuffle, Upload, XCircle, Zap,
} from 'lucide-react';
import { HowToUse } from '../components/shared/HowToUse';
import { usePageDetails } from '../components/ai/pageDetails';
import { solveApi, type Approach, type ProblemType, type SolveResult } from '../api/solve';
import { getApiErrorMessage } from '../api/client';

// ── The four problems ────────────────────────────────────────────────────────

const MAX_QUANTUM_ITEMS = 65_536;     // 16 qubits
const MAX_SHOR_N = 127;               // 21 qubits
const MAX_CITIES = 12;
const MAX_QUANTUM_CITIES = 5;         // (5 − 1)² = 16 qubits
const MAX_NUMBER = 1e12;

const PROBLEMS: Record<ProblemType, {
  icon: React.ElementType; color: string; label: string; tagline: string;
  classicalAlgo: string; quantumAlgo: string; classicalComplexity: string; quantumComplexity: string;
}> = {
  search: {
    icon: Search, color: 'from-teal-500 to-cyan-400', label: 'Search', tagline: 'Find an item in a list with no order',
    classicalAlgo: 'Linear search', quantumAlgo: "Grover's algorithm", classicalComplexity: 'O(N)', quantumComplexity: 'O(√N)',
  },
  factoring: {
    icon: Hash, color: 'from-purple-500 to-pink-400', label: 'Factoring', tagline: 'Split a number into its prime factors',
    classicalAlgo: 'Trial division', quantumAlgo: "Shor's algorithm", classicalComplexity: 'O(√N)', quantumComplexity: 'O((log N)³)',
  },
  optimization: {
    icon: Shuffle, color: 'from-orange-500 to-yellow-400', label: 'Route', tagline: 'The shortest round trip through your cities',
    classicalAlgo: 'Exhaustive search (greedy above 9 cities)', quantumAlgo: 'QAOA', classicalComplexity: 'O(N!)', quantumComplexity: 'variational',
  },
  database: {
    icon: Database, color: 'from-blue-500 to-indigo-400', label: 'Database', tagline: 'Find the records that match a query',
    classicalAlgo: 'Sequential scan', quantumAlgo: 'Amplitude amplification', classicalComplexity: 'O(N)', quantumComplexity: 'O(√(N/M))',
  },
};

const isProblem = (v: string | null): v is ProblemType => v != null && Object.prototype.hasOwnProperty.call(PROBLEMS, v);

const DEFAULTS = {
  dataset: 'Alice\nBob\nCharlie\nDavid\nEve\nFrank\nGrace\nHenry',
  target: 'Grace',
  number: '91',
  cities: 'Islamabad\nLahore\nKarachi\nPeshawar\nQuetta',
  records: 'John Smith - Age 28 - Engineer\nSarah Khan - Age 34 - Doctor\nAli Raza - Age 22 - Student\nMaria Ahmed - Age 45 - Manager\nUsman Malik - Age 31 - Engineer',
  query: 'Engineer',
};

const lines = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);
const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const field = 'w-full bg-quantum-900 border border-quantum-600 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-quantum-neon/60';
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

// ── Page ─────────────────────────────────────────────────────────────────────

type Side = { result: SolveResult | null; error: string | null; loading: boolean };
const IDLE: Side = { result: null, error: null, loading: false };

export function SolvePage() {
  const [params, setParams] = useSearchParams();
  // An unknown ?type= (old or mistyped link) falls back to Search.
  const rawType = params.get('type');
  const [problem, setProblem] = useState<ProblemType>(isProblem(rawType) ? rawType : 'search');
  const ids = { dataset: useId(), target: useId(), number: useId(), cities: useId(), records: useId(), query: useId(), data: useId() };

  const [dataset, setDataset] = useState(DEFAULTS.dataset);
  const [target, setTarget] = useState(DEFAULTS.target);
  const [number, setNumber] = useState(DEFAULTS.number);
  const [cities, setCities] = useState(DEFAULTS.cities);
  const [records, setRecords] = useState(DEFAULTS.records);
  const [query, setQuery] = useState(DEFAULTS.query);

  const [classical, setClassical] = useState<Side>(IDLE);
  const [quantum, setQuantum] = useState<Side>(IDLE);
  const busy = classical.loading || quantum.loading;

  // Follow the address when it changes while on this page (e.g. a link from the AI Advisor).
  useEffect(() => {
    if (isProblem(rawType)) setProblem(rawType);
  }, [rawType]);

  const choose = (p: ProblemType) => {
    setProblem(p);
    setClassical(IDLE);
    setQuantum(IDLE);
    setParams({ type: p }, { replace: true });   // replace: changing the tab must not add a Back step
  };

  const meta = PROBLEMS[problem];
  const n = Number(number);
  const hint = problem === 'search'
    ? (!lines(dataset).length ? 'Enter at least one item' : !target.trim() ? 'Enter the item to find' : null)
    : problem === 'factoring'
      ? (!Number.isInteger(n) || n < 2 ? 'Enter a whole number of 2 or more' : n > MAX_NUMBER ? 'Use a number up to 10¹²' : null)
      : problem === 'optimization'
        ? (lines(cities).length < 3 ? 'Enter at least 3 cities' : lines(cities).length > MAX_CITIES ? `Use at most ${MAX_CITIES} cities` : null)
        : (!lines(records).length ? 'Enter at least one record' : !query.trim() ? 'Enter a query' : null);

  const body = (approach: Approach) => ({
    problem_type: problem, approach,
    ...(problem === 'search' && { dataset: lines(dataset), target: target.trim() }),
    ...(problem === 'factoring' && { number: n }),
    ...(problem === 'optimization' && { cities: lines(cities) }),
    ...(problem === 'database' && { records: lines(records), query: query.trim() }),
  });

  const run = async (approach: Approach) => {
    const set = approach === 'classical' ? setClassical : setQuantum;
    set({ result: null, error: null, loading: true });
    try {
      set({ result: await solveApi.solve(body(approach)), error: null, loading: false });
    } catch (e) {
      set({ result: null, error: getApiErrorMessage(e, 'The run failed. Try again.'), loading: false });
    }
  };

  const describeRun = (side: Side, name: string) =>
    side.result ? `${name}: ${side.result.error ?? `${answerSummary(side.result)}, ${side.result.steps} ${side.result.steps_label}. ${side.result.explanation}`}` : '';
  usePageDetails('problem-solver', [
    `Problem Solver, ${meta.label}: ${meta.classicalAlgo} vs ${meta.quantumAlgo}.`,
    problem === 'search' ? `Looking for "${target}" in ${lines(dataset).length} items.`
      : problem === 'factoring' ? `Factoring ${number}.`
      : problem === 'optimization' ? `Cities: ${lines(cities).join(', ')}.`
      : `Query "${query}" over ${lines(records).length} records.`,
    describeRun(classical, 'Classical'), describeRun(quantum, 'Quantum'),
  ].filter(Boolean).join('\n'));

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">
      <div className="mb-6 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon" aria-hidden="true" />
          Problem Solver
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Solve your own problem</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Type your data or upload a file, then solve it with a classical method, with a quantum algorithm on QAIbridge's simulator,
          or with both side by side.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Choose the kind of problem: a search, a number to factor, a route through cities, or a database query.</>,
          <>Type your data, one item per line, or upload a file (text, CSV, JSON, PDF or Word): its lines fill the box, so you can check and edit them.</>,
          <>Press <strong>Run classically</strong>, <strong>Run with quantum</strong>, or <strong>Run both and compare</strong>.</>,
        ]}
        outcome={<>Each side's answer, how many steps it took on your data, and, when both have run, a comparison that includes what happens at a much larger size.</>}
      />

      {/* 1 · Problem */}
      <section aria-labelledby={`${ids.data}-1`} className="mb-8">
        <h2 id={`${ids.data}-1`} className="text-white font-bold text-base mb-3"><span className="text-gray-400 font-normal">1 ·</span> Choose a problem</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.entries(PROBLEMS) as [ProblemType, typeof meta][]).map(([key, m]) => {
            const PIcon = m.icon;
            const active = problem === key;
            return (
              <button key={key} type="button" onClick={() => choose(key)} aria-pressed={active}
                className={`flex flex-col items-start gap-2 p-4 rounded-2xl border transition-colors text-left ${focusRing} ${
                  active ? 'border-quantum-neon/60 bg-quantum-800' : 'border-quantum-700 bg-quantum-900 hover:border-quantum-600'}`}>
                <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                  <PIcon className="w-4 h-4 text-white" aria-hidden="true" />
                </span>
                <span className={`font-semibold text-sm ${active ? 'text-white' : 'text-gray-300'}`}>{m.label}</span>
                <span className="text-xs text-gray-400 leading-snug">{m.tagline}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2 · Data */}
      <section aria-labelledby={ids.data} className="mb-8">
        <h2 id={ids.data} className="text-white font-bold text-base mb-3"><span className="text-gray-400 font-normal">2 ·</span> Your data</h2>
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 sm:p-6">
          {problem === 'search' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor={ids.dataset} className="block text-sm text-gray-200 font-medium mb-2">List to search, one item per line</label>
                <FileLoader onText={setDataset} />
                <AutoTextarea id={ids.dataset} value={dataset} onChange={setDataset} />
                <p className="text-xs text-gray-400 mt-1.5">{plural(lines(dataset).length, 'item')}. The quantum side takes up to {MAX_QUANTUM_ITEMS.toLocaleString()}.</p>
              </div>
              <div>
                <label htmlFor={ids.target} className="block text-sm text-gray-200 font-medium mb-2">Item to find</label>
                <input id={ids.target} value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. Grace" className={field} />
                <p className="text-xs text-gray-400 mt-1.5">Matched in full, ignoring capitals.</p>
                <HowItWorks rows={[
                  ['Classical', 'looks at the items one by one', 'O(N)'],
                  ['Quantum', "Grover's algorithm boosts the chance of measuring the item, then checks it", 'O(√N)'],
                ]} />
              </div>
            </div>
          )}

          {problem === 'factoring' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor={ids.number} className="block text-sm text-gray-200 font-medium mb-2">Number to factor</label>
                <FileLoader onText={text => setNumber(/\d+/.exec(text)?.[0] ?? '')} what="the first whole number in it fills the box" />
                <input id={ids.number} type="number" min={2} max={MAX_NUMBER} value={number} onChange={e => setNumber(e.target.value)}
                  placeholder="e.g. 91" className={`${field} font-mono text-lg`} />
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                  The quantum side runs Shor's algorithm for odd numbers up to {MAX_SHOR_N} (up to 21 simulated qubits), e.g. 15, 21, 35, 77, 91.
                  The classical side takes any number up to 10<sup>12</sup>.
                </p>
              </div>
              <div>
                <HowItWorks rows={[
                  ['Classical', 'trial division tries 2, then every odd number up to √N', 'O(√N)'],
                  ['Quantum', "Shor's circuit finds the period of aˣ mod N; a gcd turns it into factors", 'O((log N)³)'],
                ]} />
                <p className="text-xs text-gray-300 mt-3 leading-relaxed">
                  <span className="text-white font-semibold">When does quantum win?</span> Not at this size: trial division factors small
                  numbers instantly. Shor's advantage grows with the number of digits: an RSA-2048 key needs about 10<sup>35</sup> classical
                  operations, but about 3 × 10<sup>10</sup> quantum gates on a future error-corrected computer.
                </p>
              </div>
            </div>
          )}

          {problem === 'optimization' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor={ids.cities} className="block text-sm text-gray-200 font-medium mb-2">Cities, one per line (the first is the start)</label>
                <FileLoader onText={setCities} />
                <AutoTextarea id={ids.cities} value={cities} onChange={setCities} />
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                  {plural(lines(cities).length, 'city', 'cities')}. Use a known city name (Lahore, Karachi, London…) or give the place
                  as <span className="font-mono">Name, latitude, longitude</span>. Distances are real great-circle kilometres.
                  Classical: 3 to {MAX_CITIES} cities. Quantum: up to {MAX_QUANTUM_CITIES} cities ({(MAX_QUANTUM_CITIES - 1) ** 2} qubits).
                </p>
              </div>
              <HowItWorks title="The travelling salesman problem: the shortest round trip that visits every city once" rows={[
                ['Classical', 'checks every possible route up to 9 cities, and uses the nearest-city rule above that', 'O(N!)'],
                ['Quantum', 'QAOA: the route becomes an Ising Hamiltonian whose lowest energy is the shortest route', 'variational'],
              ]} />
            </div>
          )}

          {problem === 'database' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor={ids.records} className="block text-sm text-gray-200 font-medium mb-2">Records, one per line</label>
                <FileLoader onText={setRecords} />
                <AutoTextarea id={ids.records} value={records} onChange={setRecords} />
                <p className="text-xs text-gray-400 mt-1.5">{plural(lines(records).length, 'record')}. The quantum side takes up to {MAX_QUANTUM_ITEMS.toLocaleString()}.</p>
              </div>
              <div>
                <label htmlFor={ids.query} className="block text-sm text-gray-200 font-medium mb-2">Query</label>
                <input id={ids.query} value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Engineer" className={field} />
                <p className="text-xs text-gray-400 mt-1.5">A keyword, <span className="font-mono">field = text</span> or <span className="font-mono">age &gt; 30</span>.</p>
                <HowItWorks title="No index: the records have no order to exploit" rows={[
                  ['Classical', 'a sequential scan reads the records in turn', 'O(N)'],
                  ['Quantum', 'amplitude amplification boosts the chance of measuring a match, then checks it', 'O(√(N/M))'],
                ]} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3 · Solve */}
      <section aria-labelledby={`${ids.data}-3`} className="mb-10">
        <h2 id={`${ids.data}-3`} className="text-white font-bold text-base mb-3"><span className="text-gray-400 font-normal">3 ·</span> Solve it</h2>
        {hint && <p className="text-sm text-amber-200 mb-3">{hint}.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RunButton side="classical" onClick={() => run('classical')} disabled={busy || !!hint} loading={classical.loading}
            title="Run classically" algo={meta.classicalAlgo} complexity={meta.classicalComplexity} />
          <button type="button" onClick={() => { run('classical'); run('quantum'); }} disabled={busy || !!hint}
            className={`flex flex-col items-center justify-center gap-2 p-5 border border-quantum-neon/40 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center hover:border-quantum-neon/70 ${focusRing}`}
            style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(0,255,204,0.08))' }}>
            <span className="flex items-center gap-2" aria-hidden="true">
              <Cpu className="w-4 h-4 text-red-400" /><span className="text-gray-400 text-xs">vs</span><Zap className="w-4 h-4 text-quantum-neon" />
            </span>
            <span className="text-white font-bold text-sm">Run both and compare</span>
            <span className="text-gray-400 text-xs">The two side by side, on the same data</span>
          </button>
          <RunButton side="quantum" onClick={() => run('quantum')} disabled={busy || !!hint} loading={quantum.loading}
            title="Run with quantum" algo={meta.quantumAlgo} complexity={meta.quantumComplexity} />
        </div>
      </section>

      {/* Results */}
      {(classical !== IDLE || quantum !== IDLE) && (
        <section aria-label="Results" aria-live="polite">
          <h2 className="text-white font-bold text-base mb-3">Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classical !== IDLE && <ResultPanel approach="classical" side={classical} algo={meta.classicalAlgo} complexity={meta.classicalComplexity} />}
            {quantum !== IDLE && <ResultPanel approach="quantum" side={quantum} algo={meta.quantumAlgo} complexity={meta.quantumComplexity} />}
          </div>
          {classical.result && quantum.result && classical.result.problem_type === quantum.result.problem_type && (
            <Comparison classical={classical.result} quantum={quantum.result} />
          )}
        </section>
      )}
    </div>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────

function AutoTextarea({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 140), 420)}px`;
  }, [value]);
  return (
    <textarea ref={ref} id={id} value={value} onChange={e => onChange(e.target.value)} spellCheck={false}
      className={`${field} font-mono resize-y min-h-[140px]`} />
  );
}

/** Upload a file: its lines (read on the server) fill the box, where they can be checked and edited. */
function FileLoader({ onText, what = 'its lines fill the box below' }: { onText: (text: string) => void; what?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ loading: boolean; note: string | null; error: string | null }>({ loading: false, note: null, error: null });
  const [dragging, setDragging] = useState(false);

  const load = async (file: File) => {
    setState({ loading: true, note: null, error: null });
    try {
      const got = await solveApi.readFile(file);
      onText(got.text);
      setState({ loading: false, note: `Loaded ${plural(got.line_count, 'line')} from ${got.filename}.`, error: null });
    } catch (e) {
      setState({ loading: false, note: null, error: getApiErrorMessage(e, "This file couldn't be read.") });
    }
  };

  return (
    <div className="mb-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
        className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition-colors ${
          dragging ? 'border-quantum-neon/60 bg-teal-950/20' : 'border-quantum-600 bg-quantum-900/50'}`}
      >
        <button type="button" onClick={() => input.current?.click()} disabled={state.loading}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-quantum-600 text-sm text-gray-200 hover:text-white disabled:opacity-50 ${focusRing}`}>
          {state.loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />}
          {state.loading ? 'Reading…' : 'Upload a file'}
        </button>
        <span className="text-xs text-gray-400">or drop one here: text, CSV, JSON, PDF or Word, up to 5 MB. {what[0].toUpperCase() + what.slice(1)}.</span>
        <input ref={input} type="file" className="hidden" tabIndex={-1} aria-hidden="true"
          accept=".txt,.csv,.tsv,.md,.log,.json,.xml,.yaml,.yml,.pdf,.docx"
          onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      </div>
      <div aria-live="polite">
        {state.note && <p className="flex items-center gap-1.5 text-xs text-teal-300 mt-1.5"><FileText className="w-3.5 h-3.5" aria-hidden="true" />{state.note}</p>}
        {state.error && <p role="alert" className="flex items-center gap-1.5 text-xs text-red-300 mt-1.5"><AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />{state.error}</p>}
      </div>
    </div>
  );
}

function HowItWorks({ title, rows }: { title?: string; rows: [string, string, string][] }) {
  return (
    <div className="mt-4 p-4 bg-quantum-900/60 rounded-xl border border-quantum-700">
      <p className="text-sm text-white font-semibold mb-2">{title ?? 'How each side solves it'}</p>
      <ul className="space-y-1.5">
        {rows.map(([who, how, cost]) => (
          <li key={who} className="text-xs text-gray-300 leading-relaxed">
            <span className={who === 'Classical' ? 'text-red-300 font-semibold' : 'text-quantum-neon font-semibold'}>{who}:</span> {how}{' '}
            <span className="font-mono text-gray-400">{cost}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunButton({ side, onClick, disabled, loading, title, algo, complexity }: {
  side: Approach; onClick: () => void; disabled: boolean; loading: boolean; title: string; algo: string; complexity: string;
}) {
  const isQ = side === 'quantum';
  const Icon = isQ ? Zap : Cpu;
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`group flex flex-col gap-3 p-5 border rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left ${focusRing} ${
        isQ ? 'bg-teal-950/20 border-teal-800/50 hover:border-teal-600/70' : 'bg-red-950/20 border-red-900/50 hover:border-red-700/70'}`}>
      <span className="flex items-center justify-between">
        <span className={`w-9 h-9 rounded-xl border flex items-center justify-center ${isQ ? 'bg-teal-900/50 border-teal-800' : 'bg-red-900/50 border-red-800'}`}>
          {loading ? <Loader2 className={`w-4 h-4 animate-spin ${isQ ? 'text-quantum-neon' : 'text-red-400'}`} aria-hidden="true" />
            : <Icon className={`w-4 h-4 ${isQ ? 'text-quantum-neon' : 'text-red-400'}`} aria-hidden="true" />}
        </span>
        <span className={`font-mono text-sm font-bold ${isQ ? 'text-quantum-neon' : 'text-red-300'}`}>{complexity}</span>
      </span>
      <span>
        <span className="block text-white font-semibold text-sm">{title}</span>
        <span className="block text-gray-400 text-xs mt-0.5">{algo}</span>
      </span>
      <span className={`flex items-center gap-1 text-xs font-medium mt-auto ${isQ ? 'text-quantum-neon' : 'text-red-300'}`}>
        {loading ? 'Running…' : 'Run now'} <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </span>
    </button>
  );
}

// ── One side's result ────────────────────────────────────────────────────────

function ResultPanel({ approach, side, algo, complexity }: { approach: Approach; side: Side; algo: string; complexity: string }) {
  const isQ = approach === 'quantum';
  const r = side.result;
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${isQ ? 'bg-teal-950/20 border-teal-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`flex items-center gap-2 text-sm font-bold ${isQ ? 'text-quantum-neon' : 'text-red-300'}`}>
          {isQ ? <Zap className="w-4 h-4" aria-hidden="true" /> : <Cpu className="w-4 h-4" aria-hidden="true" />}
          {isQ ? 'Quantum' : 'Classical'}
          <span className="text-gray-400 font-normal">· {r?.algorithm ?? algo}</span>
        </h3>
        <span className={`font-mono text-xs font-semibold ${isQ ? 'text-quantum-neon' : 'text-red-300'}`}>{r?.complexity ?? complexity}</span>
      </div>

      {side.loading && (
        <p className="flex items-center gap-3 py-6 justify-center text-gray-300 text-sm">
          <Loader2 className={`w-5 h-5 animate-spin ${isQ ? 'text-quantum-neon' : 'text-red-400'}`} aria-hidden="true" /> Running {algo}…
        </p>
      )}
      {!side.loading && side.error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-300"><XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />{side.error}</p>
      )}
      {!side.loading && r && (r.error ? (
        <p className="flex items-start gap-2 text-sm text-amber-200 leading-relaxed"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />{r.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-xl border p-3 text-center ${isQ ? 'bg-teal-950/30 border-teal-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
              <p className={`text-xl font-extrabold font-mono ${isQ ? 'text-quantum-neon' : 'text-red-300'}`}>{r.steps.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{r.steps_label}</p>
            </div>
            <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-3 text-center">
              <p className="text-xl font-extrabold font-mono text-white">{r.input_size.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{r.problem_type === 'factoring' ? 'the number N' : `input size N (${unitOf(r)})`}</p>
            </div>
          </div>
          <div className="bg-quantum-800/60 border border-quantum-700 rounded-xl p-4">
            <h4 className="text-xs text-gray-400 uppercase tracking-wide mb-2">Answer</h4>
            <ResultDisplay result={r} />
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{r.explanation}</p>
        </>
      ))}
    </div>
  );
}

const unitOf = (r: SolveResult) =>
  r.problem_type === 'search' ? 'items' : r.problem_type === 'optimization' ? 'cities' : 'records';

function Extra({ label, value }: { label: string; value: React.ReactNode }) {
  return <span className="text-xs text-gray-400">{label}: <span className="text-gray-200 font-mono">{value}</span></span>;
}

function ResultDisplay({ result }: { result: SolveResult }) {
  const isQ = result.approach === 'quantum';
  switch (result.problem_type) {
    case 'search': {
      const r = result.result;
      const hist = r.histogram ?? [];
      const maxC = Math.max(1, ...hist.map(h => h.count));
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-white font-semibold text-sm">
            {r.found ? <CheckCircle className="w-4 h-4 text-quantum-neon flex-shrink-0" aria-hidden="true" /> : <XCircle className="w-4 h-4 text-amber-300 flex-shrink-0" aria-hidden="true" />}
            {r.found ? <>Found "{r.value}" at position {(r.index ?? 0) + 1}</> : <>"{r.target}" isn't in the list</>}
          </p>
          {isQ && (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <Extra label={r.runs?.p_if_there != null ? "chance per run, had it been there" : "chance per run"} value={pct(r.runs?.p_if_there ?? r.success_probability)} />
                <Extra label="Grover rounds" value={r.grover_iterations} />
                {r.runs && <Extra label="runs" value={r.runs.runs} />}
                <Extra label="qubits" value={r.qubits} />
                <Extra label="gates" value={(r.gates ?? 0).toLocaleString()} />
              </div>
              {hist.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-gray-400 mb-1">Most frequent of {(r.shots ?? 0).toLocaleString()} measurements</p>
                  <ul className="space-y-1">
                    {hist.slice(0, 5).map(h => (
                      <li key={h.label} className="flex items-center gap-2">
                        <span className={`text-xs w-24 truncate ${h.marked ? 'text-quantum-neon' : 'text-gray-300'}`} title={h.label}>{h.label}</span>
                        <span className="flex-1 h-2 bg-quantum-900 rounded-full overflow-hidden" aria-hidden="true">
                          <span className="block h-full rounded-full" style={{ width: `${(h.count / maxC) * 100}%`, background: h.marked ? '#00ffcc' : '#6b6bb0' }} />
                        </span>
                        <span className="text-xs font-mono text-gray-300 w-12 text-right">{h.count}{h.marked ? ' ✓' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      );
    }
    case 'factoring': {
      const r = result.result;
      return (
        <div className="space-y-2">
          <p className="text-white font-mono text-base font-bold">
            {r.is_prime ? <>{r.number} is prime</> : <>{r.number} = <span className="text-quantum-neon">{r.factored_form}</span></>}
          </p>
          {isQ && r.from_period && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Extra label="base a" value={r.a} />
              <Extra label="measured period r" value={r.period} />
              <Extra label="qubits" value={r.qubits} />
              <Extra label="gates" value={(r.gates ?? 0).toLocaleString()} />
            </div>
          )}
          {isQ && !r.from_period && (
            <p className="text-xs text-gray-300">Found by Shor's quick classical checks, before any circuit was needed.</p>
          )}
        </div>
      );
    }
    case 'optimization': {
      const r = result.result;
      if (!r.tour.length) return <p className="text-sm text-amber-200">No measured bit-string was a valid route.</p>;
      return (
        <div className="space-y-2">
          <ol className="flex flex-wrap items-center gap-1" aria-label="Route">
            {r.tour.map((city, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="bg-quantum-700 border border-quantum-600 text-white text-xs px-2 py-0.5 rounded-lg">{city}</span>
                {i < r.tour.length - 1 && <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <p className="text-white text-sm font-semibold">
            Distance: <span className="text-quantum-neon font-mono">{r.total_distance != null ? `${r.total_distance.toLocaleString()} km` : '—'}</span>
          </p>
          <p className="text-xs text-gray-300">
            {isQ ? (r.is_optimal ? 'The shortest route (it matches exhaustive search).' : 'Not the shortest route.')
              : r.is_optimal ? 'The shortest route: every route was checked.' : 'A good route, not guaranteed shortest (nearest-city rule).'}
          </p>
          {isQ && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Extra label="qubits" value={r.qubits} />
              <Extra label="QAOA layers" value={r.qaoa_layers} />
              <Extra label="chance of the shortest" value={pct(r.p_optimal, 2)} />
              <Extra label="chance of a valid route" value={pct(r.p_feasible)} />
            </div>
          )}
        </div>
      );
    }
    case 'database': {
      const r = result.result;
      const shown = r.matches;
      return (
        <div className="space-y-2">
          <p className="text-white font-semibold text-sm">
            {isQ
              ? (r.first_index != null ? <>A match: record {r.first_index + 1}</> : <>No record matches</>)
              : (r.matches_found ? <><span className="text-quantum-neon font-mono">{r.matches_found}</span> {r.query_meaning}</> : <>No {r.query_meaning}</>)}
          </p>
          {isQ && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Extra label={r.runs?.p_if_there != null ? "chance per run, had it been there" : "chance per run"} value={pct(r.runs?.p_if_there ?? r.success_probability)} />
              {r.runs && <Extra label="runs" value={r.runs.runs} />}
              <Extra label="qubits" value={r.qubits} />
              {!!r.true_matches && <Extra label="matches seen in all runs" value={`${r.matches_found} of ${r.true_matches}`} />}
            </div>
          )}
          {shown.length > 0 && (
            <ul className="space-y-1 max-h-36 overflow-y-auto">
              {shown.map(m => (
                <li key={m.index} className="flex items-start gap-2 bg-quantum-700/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-400 font-mono text-xs flex-shrink-0 mt-0.5">{m.index + 1}</span>
                  <span className="text-gray-200 text-xs flex-1">{m.value}</span>
                  {m.count != null && <span className="text-quantum-neon font-mono text-xs">{m.count}×</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
  }
}

// ── Both sides compared ──────────────────────────────────────────────────────

function answerSummary(r: SolveResult): string {
  if (r.error) return 'No result';
  switch (r.problem_type) {
    case 'search':
      return r.result.found ? `Found "${r.result.value}" at position ${(r.result.index ?? 0) + 1}` : 'Not in the list';
    case 'factoring':
      return r.result.is_prime ? `${r.result.number} is prime` : `${r.result.number} = ${r.result.factored_form}`;
    case 'optimization':
      return r.result.total_distance != null ? `${Math.round(r.result.total_distance).toLocaleString()} km route` : 'No valid route';
    case 'database':
      return r.approach === 'quantum'
        ? (r.result.first_index != null ? `A match (record ${r.result.first_index + 1})` : 'No match')
        : `${plural(r.result.matches_found, 'matching record')}`;
  }
}

function sci(x: number) {
  const [m, e] = x.toExponential(1).split('e');
  return <>{m} × 10<sup>{Number(e)}</sup></>;
}

const gnfsOps = (bits: number) => {
  const lnN = bits * Math.log(2);
  return Math.exp(Math.cbrt(64 / 9) * Math.cbrt(lnN) * Math.pow(Math.log(lnN), 2 / 3));
};

/** The same task at a size no laptop could simulate: theory, not a run. */
const AT_SCALE: Partial<Record<ProblemType, { label: string; classical: React.ReactNode; quantum: React.ReactNode }>> = {
  search: { label: 'a billion items', classical: '500,000,000 comparisons on average', quantum: `${(Math.floor(Math.PI / 4 * Math.sqrt(1e9)) + 1).toLocaleString()} oracle queries` },
  factoring: { label: 'an RSA-2048 key', classical: <>{sci(gnfsOps(2048))} operations (number field sieve)</>, quantum: <>{sci(4 * 2048 ** 3)} gates on 4,099 error-corrected qubits</> },
  database: { label: 'a million records, one match', classical: '500,000 reads on average', quantum: `${(Math.floor(Math.PI / 4 * 1000) + 1).toLocaleString()} oracle queries` },
};

function Comparison({ classical, quantum }: { classical: SolveResult; quantum: SolveResult }) {
  let heroTitle = '';
  let heroBig = '';
  let heroText: React.ReactNode = null;
  let bars: { label: string; value: number; display: string; color: string }[] = [];
  let chance = '—';
  let resources = '—';

  if (quantum.error) {
    heroTitle = 'Only the classical side could run';
    heroBig = 'Classical only';
    heroText = quantum.error;
  } else if (quantum.problem_type === 'search' || quantum.problem_type === 'database') {
    const r = quantum.result;
    const absent = quantum.problem_type === 'search' ? !r.runs?.found && !(classical.problem_type === 'search' && classical.result.found)
      : quantum.result.true_matches === 0;
    chance = `${pct(r.success_probability)} per run`;
    resources = `${r.qubits} qubits`;
    const unit = quantum.problem_type === 'search' ? 'comparisons' : 'record reads';
    if (absent) {
      heroTitle = 'Is it there?';
      heroBig = 'No match';
      heroText = <>To be sure, classical needed {plural(classical.steps, unit.slice(0, -1), unit)}: one per {quantum.problem_type === 'search' ? 'item' : 'record'}.
        Quantum used {plural(quantum.steps, 'oracle query', 'oracle queries')} and is at least {pct(r.runs?.confidence, 0)} sure: had there been a match,
        it would have come up with {pct(r.runs?.p_if_there)} chance per run.</>;
      chance = `${pct(r.runs?.p_if_there)} per run, had there been a match`;
    } else {
      const ratio = classical.steps / Math.max(1, quantum.steps);
      heroTitle = quantum.problem_type === 'search' ? 'Steps to find it, on your data' : 'Steps to the first match, on your data';
      heroBig = ratio > 1 ? `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}× fewer` : 'Classical needed fewer';
      heroText = <>Quantum: <span className="text-quantum-neon font-mono font-bold">{quantum.steps.toLocaleString()}</span> oracle queries ({r.runs?.runs} × ({r.runs?.rounds} rounds + 1 check)) ·
        Classical: <span className="text-red-300 font-mono font-bold">{classical.steps.toLocaleString()}</span> {classical.steps_label}.
        {ratio <= 1 ? ' On a list this small classical wins; the gap opens as the list grows.' : ''}</>;
      bars = [
        { label: 'Classical', value: classical.steps, display: classical.steps.toLocaleString(), color: '#f87171' },
        { label: 'Quantum', value: quantum.steps, display: quantum.steps.toLocaleString(), color: '#00ffcc' },
      ];
    }
  } else if (quantum.problem_type === 'factoring') {
    const r = quantum.result;
    chance = r.from_period ? 'Probabilistic: it retries with another a if unlucky' : '—';
    resources = r.qubits ? `${r.qubits} qubits · ${(r.gates ?? 0).toLocaleString()} gates` : '—';
    if (r.from_period) {
      heroTitle = 'Answer check';
      heroBig = 'Both found the factors';
      heroText = <>Shor's algorithm measured the period r = <span className="text-quantum-neon font-mono">{r.period}</span> of {r.a}<sup>x</sup> mod {r.number} on
        a {r.qubits}-qubit circuit ({(r.gates ?? 0).toLocaleString()} gates). At this size trial division is faster: the advantage appears only for very
        large numbers (see the last row).</>;
    } else {
      heroTitle = 'Answer check';
      heroBig = 'No quantum step needed';
      heroText = quantum.explanation;
    }
  } else {
    const r = quantum.result;
    chance = `${pct(r.p_optimal, 2)} shortest · ${pct(r.p_feasible)} valid`;
    resources = `${r.qubits} qubits · ${(r.gates ?? 0).toLocaleString()} gates`;
    heroTitle = 'How much QAOA boosted the shortest route';
    heroBig = r.amplification ? `${r.amplification.toFixed(1)}× more likely` : '—';
    heroText = <>than a random bit-string: <span className="text-quantum-neon font-mono">{pct(r.p_optimal, 2)}</span> against{' '}
      <span className="text-red-300 font-mono">{pct(r.random_p_optimal, 3)}</span>. The best measured route {r.is_optimal ? 'is' : 'is not'} the shortest one.</>;
    bars = [
      { label: 'Random guess', value: r.random_p_optimal ?? 0, display: pct(r.random_p_optimal, 3), color: '#f87171' },
      { label: 'QAOA', value: r.p_optimal ?? 0, display: pct(r.p_optimal, 2), color: '#00ffcc' },
    ];
  }

  const scale = AT_SCALE[quantum.problem_type];
  const rows: { metric: string; note: string; classical: React.ReactNode; quantum: React.ReactNode }[] = [
    { metric: 'Answer', note: 'Checked on both sides', classical: answerSummary(classical), quantum: answerSummary(quantum) },
    { metric: 'Steps on your data', note: 'An oracle query and a comparison both ask the data one question',
      classical: `${classical.steps.toLocaleString()} ${classical.steps_label}`, quantum: quantum.error ? '—' : `${quantum.steps.toLocaleString()} ${quantum.steps_label}` },
    { metric: 'Time measured', note: 'A CPU imitating a quantum computer is much slower than real quantum hardware would be',
      classical: `${classical.elapsed_ms.toFixed(3)} ms on the CPU`, quantum: quantum.error ? '—' : `${quantum.elapsed_ms.toFixed(1)} ms simulating the circuit` },
    { metric: 'Chance of success', note: 'Quantum answers are probabilistic, so each one is checked', classical: 'Certain', quantum: chance },
    { metric: 'Resources', note: "Qubits simulated on QAIbridge's own simulator", classical: 'Ordinary memory', quantum: resources },
    { metric: 'How it grows', note: 'Steps as the input size N grows', classical: classical.complexity, quantum: quantum.complexity },
  ];
  if (scale) rows.push({ metric: `At scale: ${scale.label}`, note: 'Worked out from the formulas, not run', classical: scale.classical, quantum: scale.quantum });

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-2xl border border-quantum-600/50 p-6 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(0,255,204,0.06), rgba(204,68,255,0.06))' }}>
        <h3 className="text-xs text-gray-400 uppercase tracking-widest mb-2">{heroTitle}</h3>
        <p className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>{heroBig}</p>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">{heroText}</p>
        {bars.length > 0 && (
          <div className="mt-4 max-w-lg mx-auto space-y-1.5" aria-hidden="true">
            {bars.map(b => {
              const max = Math.max(...bars.map(x => x.value), 1e-12);
              return (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="text-xs w-24 text-right flex-shrink-0 text-gray-300">{b.label}</span>
                  <span className="flex-1 h-4 bg-quantum-800 rounded-full overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (b.value / max) * 100)}%`, background: b.color }} />
                  </span>
                  <span className="text-xs font-mono w-24 flex-shrink-0 text-left text-gray-200">{b.display}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-quantum-700">
          <h3 className="text-white font-bold text-sm">Side by side</h3>
          <p className="text-gray-400 text-xs mt-0.5">Measured on your data: both sides really ran</p>
        </div>
        {/* On a phone: one block per measure, the two sides under it */}
        <dl className="sm:hidden divide-y divide-quantum-700/50">
          {rows.map(row => (
            <div key={row.metric} className="px-4 py-3">
              <dt className="text-gray-200 text-xs font-medium">{row.metric}</dt>
              <dd className="text-gray-400 text-xs mt-0.5 leading-relaxed">{row.note}</dd>
              <dd className="text-xs font-mono text-red-200 mt-1.5 break-words"><span className="font-sans text-red-300 font-semibold">Classical: </span>{row.classical}</dd>
              <dd className="text-xs font-mono text-teal-200 mt-1 break-words"><span className="font-sans text-quantum-neon font-semibold">Quantum: </span>{row.quantum}</dd>
            </div>
          ))}
        </dl>
        <div className="hidden sm:block">
          <table className="w-full text-left">
            <thead className="bg-quantum-900/50">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider w-2/5">Measure</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-red-300 uppercase tracking-wider">Classical</th>
                <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-quantum-neon uppercase tracking-wider">Quantum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.metric} className={`border-t border-quantum-700/50 align-top ${i % 2 ? 'bg-quantum-900/20' : ''}`}>
                  <th scope="row" className="px-5 py-3 font-normal">
                    <span className="block text-gray-200 text-xs font-medium">{row.metric}</span>
                    <span className="block text-gray-400 text-xs mt-0.5 leading-relaxed">{row.note}</span>
                  </th>
                  <td className="px-4 py-3 text-xs font-mono text-red-200 break-words">{row.classical}</td>
                  <td className="px-4 py-3 text-xs font-mono text-teal-200 break-words">{row.quantum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
