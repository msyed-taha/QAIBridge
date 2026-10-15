import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Dice5, Hash, Loader2, Play, Search, Shuffle, X } from 'lucide-react';
import { HowToUse } from '../components/shared/HowToUse';
import { CodeBlock } from '../components/shared/CodeBlock';
import { usePageDetails } from '../components/ai/pageDetails';
import {
  GroverViews, NotesPanel, ShorViews, SideBySide, TspViews, VerdictBanner, answerText,
} from '../components/module2/SfodResultViews';
import { RunWalkthrough } from '../components/module2/RunWalkthrough';
import { sfodApi, type AlgoKey, type ComparisonResult, type Module2Presets } from '../api/sfod';
import { getApiErrorMessage } from '../api/client';

// ── The four problems ────────────────────────────────────────────────────────

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
    tagline: 'Find one item in a list with no order', classical: 'Linear search · O(N)', quantum: "Grover's · O(√N)",
    speedup: 'Quadratic speed-up' },
  { key: 'factoring', icon: Hash, color: 'from-purple-500 to-pink-400', label: 'Factoring',
    tagline: 'Split a number into its prime factors', classical: 'Trial division · O(√N)', quantum: "Shor's · O((log N)³)",
    speedup: 'Super-polynomial speed-up' },
  { key: 'optimization', icon: Shuffle, color: 'from-orange-500 to-yellow-400', label: 'Optimization',
    tagline: 'The shortest route through real cities', classical: 'Exhaustive search · O(N!)', quantum: 'QAOA · variational',
    speedup: 'No proven speed-up (a heuristic)' },
  { key: 'database', icon: Database, color: 'from-blue-500 to-indigo-400', label: 'Database',
    tagline: 'Find matching records with no index', classical: 'Sequential scan · O(N)', quantum: 'Amplitude amplification · O(√(N/M))',
    speedup: 'Quadratic speed-up' },
];

const FALLBACK_PRESETS: Module2Presets = {
  search: { max_qubits: 16, default_qubits: 6 },
  factoring: { max_N: 127, examples: [15, 21, 33, 35, 39, 51, 55, 77, 85, 91, 119] },
  optimization: { max_cities: 5, default: ['Islamabad', 'Lahore', 'Karachi', 'Peshawar'], known_cities: [] },
  database: { default_records: 256, sample: [], queries: ['Research', 'age > 60', 'city = Lahore', 'Data Science', 'age < 25'] },
};

const PK_CITIES = ['Islamabad', 'Lahore', 'Karachi', 'Peshawar', 'Quetta', 'Multan', 'Faisalabad', 'Sialkot',
  'Hyderabad', 'Gilgit', 'Skardu', 'Gwadar', 'Abbottabad', 'Bahawalpur', 'Sukkur', 'Muzaffarabad'];

const field = 'w-full bg-quantum-900 border border-quantum-600 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-quantum-neon/60';
const chip = (on: boolean) => `text-xs font-mono px-2.5 py-1 rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
  on ? 'border-quantum-neon text-quantum-neon bg-quantum-neon/10' : 'border-quantum-600 text-gray-300 hover:text-white'}`;

const isAlgo = (v: string | null): v is AlgoKey => ALGOS.some(a => a.key === v);

/** A few plain lines for Ask QAIbridge about what the page shows now. */
function describe(meta: (typeof ALGOS)[number], inputs: string, result: ComparisonResult | null) {
  const lines = [`Quantum vs Classical, ${meta.label}: ${meta.classical} against ${meta.quantum}. Input: ${inputs}.`];
  if (result) {
    lines.push(`Classical answer: ${answerText(result, 'classical')} (${result.classical.steps} ${result.classical.steps_label}).`);
    lines.push(`Quantum answer: ${answerText(result, 'quantum')} (${result.quantum.steps} ${result.quantum.steps_label}).`);
    lines.push(...result.comparison.notes);
  }
  return lines.join('\n');
}

export function Module2Page() {
  // ?type=search|factoring|optimization|database opens that tab (used by the footer links)
  const [params, setParams] = useSearchParams();
  const typeParam = params.get('type');
  const [selected, setSelected] = useState<AlgoKey>(() => (isAlgo(typeParam) ? typeParam : 'search'));
  const [presets, setPresets] = useState<Module2Presets>(FALLBACK_PRESETS);
  const ids = { qubits: useId(), target: useId(), n: useId(), base: useId(), custom: useId(), layers: useId(),
                records: useId(), query: useId(), shots: useId(), cities: useId() };

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
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sfodApi.presets().then(setPresets).catch(() => { /* the built-in presets are the same */ });
  }, []);

  const meta = ALGOS.find(a => a.key === selected) ?? ALGOS[0];
  const searchSpace = 2 ** nQubits;
  const target = Math.min(targetIndex, searchSpace - 1);
  const maxCities = presets.optimization.max_cities;

  // Follow the address when it changes while on this page (e.g. another footer link).
  useEffect(() => {
    if (isAlgo(typeParam)) {
      setSelected(typeParam);
      setResult(null);
      setError(null);
    }
  }, [typeParam]);

  const inputs = selected === 'search' ? `${searchSpace.toLocaleString()} items (${nQubits} qubits), looking for item #${target}`
    : selected === 'factoring' ? `N = ${N}${baseA ? `, base a = ${baseA}` : ''}`
    : selected === 'optimization' ? `${cities.join(', ')}; ${layers} QAOA layer(s)`
    : `${nRecords.toLocaleString()} employee records, query "${query}"`;
  usePageDetails('quantum-vs-classical', describe(meta, inputs, result?.algorithm === selected ? result : null));

  const choose = (key: AlgoKey) => {
    setSelected(key);
    setResult(null);
    setError(null);
    setParams({ type: key }, { replace: true });   // keep the address in step with the tab
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    const body: Record<string, unknown> = { algorithm: selected, shots };
    if (selected === 'search') Object.assign(body, { n_qubits: nQubits, target_index: target });
    if (selected === 'factoring') Object.assign(body, { N, ...(baseA ? { a: Number(baseA) } : {}) });
    if (selected === 'optimization') Object.assign(body, { cities, layers, shots: Math.max(shots, 2048) });
    if (selected === 'database') Object.assign(body, { n_records: nRecords, query });
    try {
      setResult(await sfodApi.run(body));
    } catch (e) {
      setError(getApiErrorMessage(e, 'The run failed. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const addCity = (c: string) => {
    const v = c.trim();
    if (!v || cities.length >= maxCities || cities.some(x => x.toLowerCase() === v.toLowerCase())) return;
    setCities(prev => [...prev, v]);
  };

  const runHint = selected === 'optimization' && cities.length < 3 ? 'Pick at least 3 cities'
    : selected === 'factoring' && !(N >= 3) ? 'Enter a number of 3 or more'
    : selected === 'database' && !query.trim() ? 'Enter a query' : null;

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">
      <div className="mb-6 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-teal-400" aria-hidden="true" />
          Quantum vs Classical
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">The same problem, solved both ways</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Every run solves your input twice: with a classical method on the CPU, and with the quantum algorithm as a real circuit on
          QAIbridge's own simulator. Both answers are checked, and both costs are counted in the same unit.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Pick a problem: <strong>Search</strong> (Grover's), <strong>Factoring</strong> (Shor's), <strong>Optimization</strong> (QAOA) or <strong>Database</strong> (amplitude amplification).</>,
          <>Set the input: the list size and the item to find, the number to factor, the cities, or the database query.</>,
          <>Press <strong>Run both</strong>. The classical method and the quantum circuit both really run, and each answer is checked.</>,
          <>Read the result, then go through <strong>Step by step</strong> to see how the quantum run worked, with its own numbers. You can export the circuit as Qiskit code to check it on IBM's tools.</>,
        ]}
        outcome={<>Both answers with checks, the cost of each in the same unit, the quantum algorithm's charts, and how the gap changes as the problem grows.</>}
      />

      {/* ── Problem ── */}
      <div role="group" aria-label="Problem" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {ALGOS.map(a => {
          const Icon = a.icon;
          const active = a.key === selected;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => choose(a.key)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-colors text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                active ? 'border-quantum-neon/60 bg-quantum-neon/5' : 'border-quantum-700 bg-quantum-800 hover:border-quantum-600'
              }`}
            >
              <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" aria-hidden="true" />
              </span>
              <span className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{a.label}</span>
              <span className="text-xs text-gray-400 leading-snug">{a.tagline}</span>
            </button>
          );
        })}
      </div>

      {/* ── Input ── */}
      <section aria-label="Input" className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <h2 className="text-white font-bold text-sm mr-1">Input</h2>
          <span className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">{meta.classical}</span>
          <span className="text-xs text-gray-400">vs</span>
          <span className="text-xs font-mono text-quantum-neon bg-quantum-neon/10 border border-quantum-neon/20 rounded-full px-2 py-0.5">{meta.quantum}</span>
          <span className="text-xs text-purple-300">{meta.speedup}</span>
        </div>

        {selected === 'search' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor={ids.qubits} className="block text-xs text-gray-300 font-medium mb-2">List size: qubits n, for N = 2<sup>n</sup> items</label>
              <input id={ids.qubits} type="range" min={2} max={presets.search.max_qubits} value={nQubits}
                aria-valuetext={`${nQubits} qubits, ${searchSpace.toLocaleString()} items`}
                onChange={e => setNQubits(Number(e.target.value))} className="w-full accent-teal-400" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>2</span>
                <span className="text-white font-semibold">{nQubits} qubits → {searchSpace.toLocaleString()} items</span>
                <span>{presets.search.max_qubits}</span>
              </div>
            </div>
            <div>
              <label htmlFor={ids.target} className="block text-xs text-gray-300 font-medium mb-2">Item to find (0 to {(searchSpace - 1).toLocaleString()})</label>
              <div className="flex gap-2">
                <input id={ids.target} type="number" min={0} max={searchSpace - 1} value={target}
                  onChange={e => setTargetIndex(Math.max(0, Math.min(searchSpace - 1, Number(e.target.value) || 0)))}
                  className={field} />
                <button type="button" onClick={() => setTargetIndex(Math.floor(Math.random() * searchSpace))}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-quantum-600 text-gray-300 text-xs hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  <Dice5 className="w-4 h-4" aria-hidden="true" /> Random
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">The quantum oracle recognises this item; the linear search has to find it one comparison at a time.</p>
            </div>
          </div>
        )}

        {selected === 'factoring' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor={ids.n} className="block text-xs text-gray-300 font-medium mb-2">
                Number to factor, N (the quantum circuit runs for odd numbers up to {presets.factoring.max_N})
              </label>
              <input id={ids.n} type="number" min={3} max={1_000_000_000} value={Number.isFinite(N) ? N : ''}
                onChange={e => setN(Math.floor(Number(e.target.value)))}
                className={`${field} text-lg`} />
              <div role="group" aria-label="Examples" className="flex flex-wrap gap-1.5 mt-2">
                {presets.factoring.examples.map(x => (
                  <button key={x} type="button" onClick={() => setN(x)} aria-pressed={N === x} className={chip(N === x)}>{x}</button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor={ids.base} className="block text-xs text-gray-300 font-medium mb-2">Base a (optional: a random one is picked if empty)</label>
              <input id={ids.base} inputMode="numeric" value={baseA} onChange={e => setBaseA(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 7"
                className={field} />
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                {N >= 3 && <>N has {Math.floor(Math.log2(N)) + 1} bits, so the circuit needs {3 * (Math.floor(Math.log2(N)) + 1)} qubits (2n counting + n work). </>}
                The circuit finds the period r of a<sup>x</sup> mod N; continued fractions and a gcd turn r into the factors.
              </p>
            </div>
          </div>
        )}

        {selected === 'optimization' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <p id={ids.cities} className="text-xs text-gray-300 font-medium mb-2">
                Cities ({cities.length} of {maxCities}): real coordinates, distances in km. The first is the start.
              </p>
              <ul aria-labelledby={ids.cities} className="flex flex-wrap gap-1.5 mb-3">
                {cities.map((c, i) => (
                  <li key={c} className="inline-flex items-center gap-1 text-xs pl-2 pr-1 py-1 rounded-lg bg-quantum-neon/10 border border-quantum-neon/40 text-quantum-neon">
                    {i === 0 && <span className="text-gray-300">start ·</span>}{c}
                    <button type="button" onClick={() => setCities(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${c}`}
                      className="p-0.5 rounded hover:bg-quantum-neon/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div role="group" aria-label="Add a city" className="flex flex-wrap gap-1.5">
                {PK_CITIES.filter(c => !cities.includes(c)).map(c => (
                  <button key={c} type="button" onClick={() => addCity(c)} disabled={cities.length >= maxCities}
                    className="text-xs px-2 py-1 rounded-lg border border-quantum-600 text-gray-300 hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                    + {c}
                  </button>
                ))}
              </div>
              <label htmlFor={ids.custom} className="block text-xs text-gray-300 font-medium mt-4 mb-1.5">
                Or add your own stop: name, latitude, longitude
              </label>
              <div className="flex gap-2">
                <input id={ids.custom} value={customCity} onChange={e => setCustomCity(e.target.value)} placeholder="Warehouse, 33.7, 73.1"
                  onKeyDown={e => { if (e.key === 'Enter') { addCity(customCity); setCustomCity(''); } }}
                  className={`${field} font-sans text-xs`} />
                <button type="button" onClick={() => { addCity(customCity); setCustomCity(''); }} disabled={!customCity.trim() || cities.length >= maxCities}
                  className="px-3 rounded-xl border border-quantum-600 text-gray-300 text-xs hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  Add
                </button>
              </div>
            </div>
            <div>
              <label htmlFor={ids.layers} className="block text-xs text-gray-300 font-medium mb-2">QAOA layers, p = {layers}</label>
              <input id={ids.layers} type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} className="w-full accent-orange-400" />
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                {cities.length} cities → ({cities.length} − 1)<sup>2</sup> = {Math.max(0, (cities.length - 1) ** 2)} qubits.
                More layers can put more chance on the best route, but take longer to tune.
              </p>
            </div>
          </div>
        )}

        {selected === 'database' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor={ids.records} className="block text-xs text-gray-300 font-medium mb-2">Records in the table</label>
              <input id={ids.records} type="range" min={4} max={12} value={Math.round(Math.log2(nRecords))}
                aria-valuetext={`${nRecords.toLocaleString()} records`}
                onChange={e => setNRecords(2 ** Number(e.target.value))} className="w-full accent-blue-400" />
              <p className="text-center text-white font-semibold text-sm mt-1">{nRecords.toLocaleString()} employee records</p>
              {presets.database.sample.length > 0 && (
                <ul aria-label="The first records" className="mt-3 space-y-0.5">
                  {presets.database.sample.slice(0, 4).map(r => (
                    <li key={r} className="text-xs font-mono text-gray-400 truncate">{r}</li>
                  ))}
                  <li className="text-xs text-gray-400" aria-hidden="true">…</li>
                </ul>
              )}
            </div>
            <div>
              <label htmlFor={ids.query} className="block text-xs text-gray-300 font-medium mb-2">Query</label>
              <input id={ids.query} value={query} onChange={e => setQuery(e.target.value)} className={field} />
              <div role="group" aria-label="Example queries" className="flex flex-wrap gap-1.5 mt-2">
                {presets.database.queries.map(qq => (
                  <button key={qq} type="button" onClick={() => setQuery(qq)} aria-pressed={query === qq} className={chip(query === qq)}>{qq}</button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">A keyword, <span className="font-mono">field = text</span> or <span className="font-mono">field &gt; number</span>.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <div className="flex items-center gap-2">
            <label htmlFor={ids.shots} className="text-xs text-gray-300">Measurements (shots)</label>
            <select id={ids.shots} value={shots} onChange={e => setShots(Number(e.target.value))}
              className="bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1.5 text-sm text-white">
              {[256, 1024, 4096].map(s => <option key={s} value={s}>{s.toLocaleString()}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={loading || !!runHint}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Running both…</>
              : <><Play className="w-4 h-4" aria-hidden="true" />{runHint ?? 'Run both'}</>}
          </button>
        </div>
        {selected === 'optimization' && <p className="text-xs text-gray-400 mt-2">Routes always use at least 2,048 measurements.</p>}
      </section>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-5">{error}</p>
        )}
      </div>

      {result && result.algorithm === selected && (
        <>
          <VerdictBanner result={result} />
          <SideBySide result={result} />
          <RunWalkthrough result={result} />
          {(result.algorithm === 'search' || result.algorithm === 'database') && <GroverViews result={result} />}
          {result.algorithm === 'factoring' && <ShorViews result={result} />}
          {result.algorithm === 'optimization' && <TspViews result={result} />}
          <NotesPanel notes={result.comparison.notes} />
          {result.qiskit && (
            <CodeBlock code={result.qiskit} title="Export to Qiskit"
              subtitle="the same circuit as runnable IBM Qiskit code, to check our simulator against theirs" />
          )}
        </>
      )}
    </div>
  );
}
