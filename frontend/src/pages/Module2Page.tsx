import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Database, Dice5, Hash, Loader2, Play, Search, Shuffle, X } from 'lucide-react';
import { TutorialWalkthrough } from '../components/module2/TutorialWalkthrough';
import { HowToUse } from '../components/shared/HowToUse';
import { CodeBlock } from '../components/shared/CodeBlock';
import {
  GroverViews, NotesPanel, ShorViews, SideBySide, TspViews, VerdictBanner,
} from '../components/module2/SfodResultViews';
import { sfodApi, type AlgoKey, type ComparisonResult, type Module2Presets } from '../api/sfod';
import { getApiErrorMessage } from '../api/client';

// ── Algorithm metadata ────────────────────────────────────────────────────────

const ALGOS: {
  key: AlgoKey;
  icon: React.ElementType;
  color: string;
  label: string;
  tagline: string;
  classical: string;
  quantum: string;
  speedup: string;
}[] = [
  { key: 'search', icon: Search, color: 'from-teal-500 to-cyan-400', label: 'Search',
    tagline: 'Find one item in unsorted data', classical: 'Linear search · O(N)', quantum: "Grover's · O(√N)", speedup: 'Quadratic' },
  { key: 'factoring', icon: Hash, color: 'from-purple-500 to-pink-400', label: 'Factoring',
    tagline: 'Split N into prime factors', classical: 'Trial division · O(√N)', quantum: "Shor's · O((log N)³)", speedup: 'Exponential' },
  { key: 'optimization', icon: Shuffle, color: 'from-orange-500 to-yellow-400', label: 'Optimization',
    tagline: 'Shortest route through real cities', classical: 'Exhaustive · O(N!)', quantum: 'QAOA · variational', speedup: 'Heuristic' },
  { key: 'database', icon: Database, color: 'from-blue-500 to-indigo-400', label: 'Database',
    tagline: 'Query records with no index', classical: 'Sequential scan · O(N)', quantum: 'Amplitude amp. · O(√(N/M))', speedup: 'Quadratic' },
];

const FALLBACK_PRESETS: Module2Presets = {
  search: { max_qubits: 16, default_qubits: 6 },
  factoring: { max_N: 127, examples: [15, 21, 33, 35, 51, 55, 77, 85, 91, 119] },
  optimization: { max_cities: 5, default: ['Islamabad', 'Lahore', 'Karachi', 'Peshawar'],
    known_cities: ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Sialkot', 'Gilgit', 'Gwadar'] },
  database: { default_records: 256, sample: [], queries: ['Research', 'age > 60', 'city = Lahore', 'Data Science', 'age < 25'] },
};

const PK_CITIES = ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Sialkot',
  'Hyderabad', 'Gilgit', 'Skardu', 'Gwadar', 'Abbottabad', 'Bahawalpur', 'Sukkur', 'Muzaffarabad'];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-400 font-medium mb-2">{children}</label>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Module2Page() {
  const [selected, setSelected] = useState<AlgoKey>('search');
  const [presets, setPresets] = useState<Module2Presets>(FALLBACK_PRESETS);

  // Search
  const [nQubits, setNQubits] = useState(6);
  const [targetIndex, setTargetIndex] = useState(42);
  // Factoring
  const [N, setN] = useState(91);
  const [baseA, setBaseA] = useState('');
  // Optimization
  const [cities, setCities] = useState<string[]>(['Islamabad', 'Lahore', 'Karachi', 'Peshawar']);
  const [customCity, setCustomCity] = useState('');
  const [layers, setLayers] = useState(2);
  // Database
  const [nRecords, setNRecords] = useState(256);
  const [query, setQuery] = useState('Research');

  const [shots, setShots] = useState(1024);
  const [result, setResult] = useState<ComparisonResult<any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    sfodApi.presets().then(setPresets).catch(() => { /* fallback presets are fine */ });
  }, []);

  const meta = ALGOS.find(a => a.key === selected)!;
  const searchSpace = 2 ** nQubits;

  useEffect(() => {
    if (targetIndex >= searchSpace) setTargetIndex(searchSpace - 1);
  }, [searchSpace, targetIndex]);

  const tutorialSize = useMemo(() => {
    if (selected === 'search') return Math.max(4, Math.min(10000, searchSpace));
    if (selected === 'factoring') return Math.max(4, N);
    if (selected === 'optimization') return Math.max(4, cities.length);
    return Math.max(4, Math.min(10000, nRecords));
  }, [selected, searchSpace, N, cities.length, nRecords]);

  const handleAlgoChange = (key: AlgoKey) => {
    setSelected(key);
    setResult(null);
    setError(null);
  };

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const body: Record<string, unknown> = { algorithm: selected, shots };
    if (selected === 'search') Object.assign(body, { n_qubits: nQubits, target_index: targetIndex });
    if (selected === 'factoring') Object.assign(body, { N, ...(baseA.trim() ? { a: Number(baseA) } : {}) });
    if (selected === 'optimization') Object.assign(body, { cities, layers, shots: Math.max(shots, 2048) });
    if (selected === 'database') Object.assign(body, { n_records: nRecords, query });
    try {
      setResult(await sfodApi.run(body));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Execution failed'));
    } finally {
      setLoading(false);
    }
  };

  const toggleCity = (c: string) => {
    setCities(prev => prev.includes(c)
      ? prev.filter(x => x !== c)
      : prev.length >= presets.optimization.max_cities ? prev : [...prev, c]);
  };

  const addCustomCity = () => {
    const v = customCity.trim();
    if (!v || cities.length >= presets.optimization.max_cities) return;
    setCities(prev => [...prev, v]);
    setCustomCity('');
  };

  const runDisabled = loading || (selected === 'optimization' && cities.length < 3);
  const runHint = selected === 'optimization' && cities.length < 3 ? 'Pick at least 3 cities' : null;

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Module 2 — SFOD Model Comparison Suite
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Classical vs Quantum — Real Runs</h1>
        <p className="text-gray-400 text-sm max-w-2xl mx-auto">
          Every run executes the classical algorithm on the CPU <em>and</em> the quantum algorithm as a real circuit on
          QAIBridge's own state-vector simulator (Module 1), then checks both answers.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Pick a task: <strong>Search</strong> (Grover), <strong>Factoring</strong> (Shor), <strong>Optimization</strong> (QAOA) or <strong>Database</strong> (amplitude amplification).</>,
          <>Set the input — qubits and target, the number N, the cities, or the database query.</>,
          <>Click <strong>Run Classical vs Quantum</strong>. Both sides really execute; answers are checked for correctness.</>,
          <>Compare <strong>steps</strong> (comparisons vs oracle queries), success probability and the charts. Export the circuit as Qiskit code to verify it on IBM tools.</>,
        ]}
        outcome={<>Side-by-side answers with ✓/✗ checks, the quantum algorithm's probability curves or peaks, circuit size (qubits, gates, depth), and a scaling view that shows where the quantum advantage appears.</>}
      />

      {/* ── Algorithm selector ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {ALGOS.map(a => {
          const Icon = a.icon;
          const active = a.key === selected;
          return (
            <button
              key={a.key}
              onClick={() => handleAlgoChange(a.key)}
              className={`relative flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-all hover:scale-[1.02] text-center ${
                active ? 'border-quantum-neon/50 bg-quantum-neon/5' : 'border-quantum-700 bg-quantum-800 hover:border-quantum-600'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-400'}`}>{a.label}</span>
              <span className="text-[10px] text-gray-500 leading-tight">{a.tagline}</span>
              <span className="text-[10px] text-gray-600 font-mono">{a.quantum}</span>
            </button>
          );
        })}
      </div>

      {/* ── Configuration ──────────────────────────────────────────────── */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h3 className="text-white font-bold text-sm">Configuration</h3>
          <span className="text-[11px] font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">{meta.classical}</span>
          <span className="text-[11px] text-gray-600">vs</span>
          <span className="text-[11px] font-mono text-quantum-neon bg-quantum-neon/10 border border-quantum-neon/20 rounded-full px-2 py-0.5">{meta.quantum}</span>
          <span className="text-[11px] text-purple-300">{meta.speedup} speed-up</span>
        </div>

        {selected === 'search' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Qubits (search space N = 2ⁿ)</Label>
              <input type="range" min={2} max={presets.search.max_qubits} value={nQubits}
                onChange={e => setNQubits(Number(e.target.value))} className="w-full accent-teal-400" />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>2</span>
                <span className="text-white font-semibold">{nQubits} qubits → {searchSpace.toLocaleString()} items</span>
                <span>{presets.search.max_qubits}</span>
              </div>
            </div>
            <div>
              <Label>Target item (index 0 – {searchSpace - 1})</Label>
              <div className="flex gap-2">
                <input type="number" min={0} max={searchSpace - 1} value={targetIndex}
                  onChange={e => setTargetIndex(Math.max(0, Math.min(searchSpace - 1, Number(e.target.value))))}
                  className="flex-1 bg-quantum-900 border border-quantum-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-quantum-neon/50" />
                <button onClick={() => setTargetIndex(Math.floor(Math.random() * searchSpace))}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-quantum-600 text-gray-300 text-xs hover:text-white">
                  <Dice5 className="w-4 h-4" /> Random
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">The oracle "recognises" this item; the linear search has to find it one comparison at a time.</p>
            </div>
          </div>
        )}

        {selected === 'factoring' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Number to factor N (odd composite ≤ {presets.factoring.max_N} for exact simulation)</Label>
              <input type="number" min={3} max={100000} value={N} onChange={e => setN(Number(e.target.value))}
                className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-3 py-2 text-lg text-white font-mono focus:outline-none focus:border-quantum-neon/50" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {presets.factoring.examples.map(x => (
                  <button key={x} onClick={() => setN(x)}
                    className={`text-xs font-mono px-2 py-1 rounded-lg border ${N === x ? 'border-quantum-neon text-quantum-neon' : 'border-quantum-600 text-gray-400 hover:text-white'}`}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Base a (optional — random coprime if empty)</Label>
              <input value={baseA} onChange={e => setBaseA(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 7"
                className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-quantum-neon/50" />
              <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                N needs {3 * Math.max(2, Math.floor(Math.log2(Math.max(N, 2))) + 1)} qubits (2n counting + n work).
                The quantum circuit finds the period r of aˣ mod N; continued fractions and gcd turn r into factors.
              </p>
            </div>
          </div>
        )}

        {selected === 'optimization' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <Label>Cities ({cities.length}/{presets.optimization.max_cities}) — real coordinates, distances in km</Label>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {cities.map((c, i) => (
                  <span key={c + i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-quantum-neon/10 border border-quantum-neon/40 text-quantum-neon">
                    {i === 0 && <span className="text-[9px] text-gray-400">start ·</span>}{c}
                    <button onClick={() => setCities(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PK_CITIES.filter(c => !cities.includes(c)).map(c => (
                  <button key={c} onClick={() => toggleCity(c)} disabled={cities.length >= presets.optimization.max_cities}
                    className="text-xs px-2 py-1 rounded-lg border border-quantum-600 text-gray-400 hover:text-white disabled:opacity-30">
                    + {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input value={customCity} onChange={e => setCustomCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomCity()}
                  placeholder="Custom stop: Name, latitude, longitude  (e.g. Warehouse, 33.7, 73.1)"
                  className="flex-1 bg-quantum-900 border border-quantum-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-quantum-neon/50" />
                <button onClick={addCustomCity} className="px-3 rounded-xl border border-quantum-600 text-gray-300 text-xs hover:text-white">Add</button>
              </div>
            </div>
            <div>
              <Label>QAOA depth p = {layers}</Label>
              <input type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} className="w-full accent-orange-400" />
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                {cities.length} cities → ({cities.length} − 1)² = {Math.max(0, (cities.length - 1) ** 2)} qubits.
                Deeper circuits concentrate more probability on the best route but take longer to optimise.
              </p>
            </div>
          </div>
        )}

        {selected === 'database' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Records in the table</Label>
              <input type="range" min={4} max={12} value={Math.round(Math.log2(nRecords))}
                onChange={e => setNRecords(2 ** Number(e.target.value))} className="w-full accent-blue-400" />
              <p className="text-center text-white font-semibold text-sm mt-1">{nRecords.toLocaleString()} employee records</p>
              {presets.database.sample.length > 0 && (
                <div className="mt-3 space-y-0.5">
                  {presets.database.sample.slice(0, 4).map(r => (
                    <p key={r} className="text-[10px] font-mono text-gray-500 truncate">{r}</p>
                  ))}
                  <p className="text-[10px] text-gray-600">…</p>
                </div>
              )}
            </div>
            <div>
              <Label>Query</Label>
              <input value={query} onChange={e => setQuery(e.target.value)}
                className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-quantum-neon/50" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {presets.database.queries.map(qq => (
                  <button key={qq} onClick={() => setQuery(qq)}
                    className={`text-xs font-mono px-2 py-1 rounded-lg border ${query === qq ? 'border-quantum-neon text-quantum-neon' : 'border-quantum-600 text-gray-400 hover:text-white'}`}>
                    {qq}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">Keyword, <span className="font-mono">field = text</span> or <span className="font-mono">field &gt; number</span>.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            Shots
            <select value={shots} onChange={e => setShots(Number(e.target.value))}
              className="bg-quantum-900 border border-quantum-700 rounded-lg px-2 py-1.5 text-white">
              {[256, 1024, 4096].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={runDisabled}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Running both algorithms…</>
              : <><Play className="w-4 h-4" />{runHint ?? 'Run Classical vs Quantum'}</>}
          </button>
          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white hover:bg-quantum-700 border border-quantum-600"
          >
            <BookOpen className="w-4 h-4" /> Learn Tutorial
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {result && (
        <>
          <VerdictBanner result={result} />
          <SideBySide result={result} />
          {(result.algorithm === 'search' || result.algorithm === 'database') && <GroverViews result={result} />}
          {result.algorithm === 'factoring' && <ShorViews result={result} />}
          {result.algorithm === 'optimization' && <TspViews result={result} />}
          <NotesPanel notes={result.comparison.notes} />
          {result.qiskit && (
            <CodeBlock code={result.qiskit} title="Export to Qiskit"
              subtitle="the same circuit as runnable IBM Qiskit code, to cross-check our simulator" />
          )}
        </>
      )}

      {/* ── Tutorial Modal ─────────────────────────────────────────────── */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-6xl my-8">
            <TutorialWalkthrough
              algorithm={selected}
              inputSize={tutorialSize}
              onClose={() => setShowTutorial(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
