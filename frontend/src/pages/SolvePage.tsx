import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search, Hash, Shuffle, Database,
  ArrowRight, Play, Loader2, CheckCircle,
  XCircle, ChevronRight, Cpu, Zap,
  Upload, FileText, X as XIcon, AlertCircle,
} from 'lucide-react';

// ── Auto-resize textarea hook ─────────────────────────────────────────────────

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [value]);
  return ref;
}

// ── Types ────────────────────────────────────────────────────────────────────

type ProblemType = 'search' | 'factoring' | 'optimization' | 'database';

interface SolveResult {
  problem_type:      string;
  approach:          string;
  algorithm:         string;
  result:            Record<string, unknown>;
  steps:             number;
  elapsed_ms:        number;
  complexity:        string;
  theoretical_steps: number;
  input_size:        number;
  explanation:       string;
  success:           boolean;
  error?:            string;
}

// ── Problem meta ─────────────────────────────────────────────────────────────

const PROBLEMS: Record<ProblemType, {
  icon:       React.ElementType;
  color:      string;
  label:      string;
  tagline:    string;
  classicalAlgo: string;
  quantumAlgo:   string;
  classicalComplexity: string;
  quantumComplexity:   string;
}> = {
  search: {
    icon: Search,
    color: 'from-teal-500 to-cyan-400',
    label: 'Search',
    tagline: 'Find a target element in an unsorted dataset',
    classicalAlgo: 'Linear Search',
    quantumAlgo:   "Grover's Algorithm",
    classicalComplexity: 'O(N)',
    quantumComplexity:   'O(√N)',
  },
  factoring: {
    icon: Hash,
    color: 'from-purple-500 to-pink-400',
    label: 'Factoring',
    tagline: 'Decompose a number into its prime factors',
    classicalAlgo: 'Trial Division',
    quantumAlgo:   "Shor's Algorithm (QFT)",
    classicalComplexity: 'O(√N)',
    quantumComplexity:   'O((log N)³)',
  },
  optimization: {
    icon: Shuffle,
    color: 'from-orange-500 to-yellow-400',
    label: 'Optimization',
    tagline: 'Find the shortest route through a set of cities',
    classicalAlgo: 'Greedy Nearest Neighbour',
    quantumAlgo:   'QAOA',
    classicalComplexity: 'O(N²)',
    quantumComplexity:   'O(p·N)',
  },
  database: {
    icon: Database,
    color: 'from-blue-500 to-indigo-400',
    label: 'Database',
    tagline: 'Query matching records in an unstructured database',
    classicalAlgo: 'Sequential Scan',
    quantumAlgo:   'Amplitude Amplification',
    classicalComplexity: 'O(N)',
    quantumComplexity:   'O(√N)',
  },
};

// ── Per-problem comparison metadata ──────────────────────────────────────────

const COMPARISON_META: Record<ProblemType, {
  spaceClassical:  string;
  spaceQuantum:    string;
  typeClassical:   string;
  typeQuantum:     string;
  qualityClassical: string;
  qualityQuantum:   string;
  scaleN:          number;
  scaleLabel:      string;
  scaleClassical:  (n: number) => number;
  scaleQuantum:    (n: number) => number;
  advantage:       string;
}> = {
  search: {
    spaceClassical:   'O(1) — just a pointer',
    spaceQuantum:     'O(log N) qubits',
    typeClassical:    'Deterministic',
    typeQuantum:      'Probabilistic',
    qualityClassical: 'Exact — always finds correct answer',
    qualityQuantum:   'High probability — succeeds with P > 99%',
    scaleN:           1_000_000,
    scaleLabel:       '1,000,000 items',
    scaleClassical:   n => n,
    scaleQuantum:     n => Math.ceil(Math.PI / 4 * Math.sqrt(n)),
    advantage:        'Quadratic — Quantum needs √N steps instead of N',
  },
  factoring: {
    spaceClassical:   'O(log N) — store factors',
    spaceQuantum:     'O(log N) qubits',
    typeClassical:    'Deterministic',
    typeQuantum:      'Probabilistic (QFT)',
    qualityClassical: 'Exact — always correct',
    qualityQuantum:   'Exact — correct with high probability',
    scaleN:           1_000_000,
    scaleLabel:       'N = 1,000,000',
    scaleClassical:   n => Math.ceil(Math.sqrt(n)),
    scaleQuantum:     n => Math.ceil(Math.log2(n + 1) ** 3),
    advantage:        'Exponential — Quantum breaks RSA-scale numbers classically impossible',
  },
  optimization: {
    spaceClassical:   'O(N) — visited array',
    spaceQuantum:     'O(N) qubits',
    typeClassical:    'Greedy Heuristic',
    typeQuantum:      'Variational Quantum',
    qualityClassical: 'Suboptimal — locks into local minima',
    qualityQuantum:   'Near-optimal — explores full solution space',
    scaleN:           20,
    scaleLabel:       '20 cities',
    scaleClassical:   n => n * n,
    scaleQuantum:     n => 3 * n,
    advantage:        'Polynomial — QAOA scales O(p·N) vs O(N²) greedy',
  },
  database: {
    spaceClassical:   'O(1) — no extra memory',
    spaceQuantum:     'O(log N) qubits',
    typeClassical:    'Deterministic',
    typeQuantum:      'Probabilistic',
    qualityClassical: 'Exact — reads every row',
    qualityQuantum:   'High probability — √N quantum queries',
    scaleN:           1_000_000,
    scaleLabel:       '1,000,000 records',
    scaleClassical:   n => n,
    scaleQuantum:     n => Math.ceil(Math.sqrt(n)),
    advantage:        'Quadratic — Quantum queries √N rows vs N rows',
  },
};

// ── Default example inputs ────────────────────────────────────────────────────

const DEFAULTS: Record<ProblemType, Record<string, string>> = {
  search: {
    dataset: 'Alice\nBob\nCharlie\nDavid\nEve\nFrank\nGrace\nHenry',
    target:  'Grace',
  },
  factoring:    { number: '999999999989' },
  optimization: { cities: 'Islamabad\nLahore\nKarachi\nPeshawar\nQuetta' },
  database: {
    records: 'John Smith - Age 28 - Engineer\nSarah Khan - Age 34 - Doctor\nAli Raza - Age 22 - Student\nMaria Ahmed - Age 45 - Manager\nUsman Malik - Age 31 - Engineer',
    query:   'Engineer',
  },
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SolvePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = (searchParams.get('type') ?? 'search') as ProblemType;

  const [problemType, setProblemType] = useState<ProblemType>(typeParam);

  // Input fields
  const [dataset,  setDataset]  = useState(DEFAULTS.search.dataset);
  const [target,   setTarget]   = useState(DEFAULTS.search.target);
  const [number,   setNumber]   = useState(DEFAULTS.factoring.number);
  const [cities,   setCities]   = useState(DEFAULTS.optimization.cities);
  const [records,  setRecords]  = useState(DEFAULTS.database.records);
  const [query,    setQuery]    = useState(DEFAULTS.database.query);

  // Auto-resize refs for textareas
  const datasetRef = useAutoResize(dataset);
  const citiesRef  = useAutoResize(cities);
  const recordsRef = useAutoResize(records);

  // File upload state — extracted text is stored separately, never injected into the textarea
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; lines: number } | null>(null);
  const [fileLoading,  setFileLoading]  = useState(false);
  const [fileError,    setFileError]    = useState<string | null>(null);
  // fileText holds the extracted content used at solve-time; textareas remain untouched
  const [fileText,     setFileText]     = useState<string>('');

  // Clear file state when problem type changes
  useEffect(() => {
    setUploadedFile(null);
    setFileError(null);
    setFileText('');
  }, [problemType]);

  const handleFileUpload = async (
    file: File,
    _dest: 'dataset' | 'cities' | 'records' | 'number',
  ) => {
    setFileLoading(true);
    setFileError(null);
    setUploadedFile(null);
    setFileText('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res  = await fetch('/api/dashboard/extract-file', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'File extraction failed');
      const text: string = data.text ?? '';
      // Store extracted text silently — do NOT touch any textarea or input
      setFileText(text);
      setUploadedFile({
        name:  data.filename ?? file.name,
        size:  file.size,
        lines: data.line_count ?? 0,
      });
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setFileLoading(false);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setFileError(null);
    setFileText('');
  };

  // Results — one per approach
  const [classicalResult, setClassicalResult] = useState<SolveResult | null>(null);
  const [quantumResult,   setQuantumResult]   = useState<SolveResult | null>(null);
  const [classicalLoading, setClassicalLoading] = useState(false);
  const [quantumLoading,   setQuantumLoading]   = useState(false);
  const [classicalError,   setClassicalError]   = useState<string | null>(null);
  const [quantumError,     setQuantumError]     = useState<string | null>(null);

  // Reset results when problem type changes
  useEffect(() => {
    setSearchParams({ type: problemType });
    setClassicalResult(null);
    setQuantumResult(null);
    setClassicalError(null);
    setQuantumError(null);
  }, [problemType]);

  const meta = PROBLEMS[problemType];
  const Icon = meta.icon;

  // ── Build request body ────────────────────────────────────────────────────

  // Helper: split lines from either the uploaded file text or the manual textarea value
  const resolveLines = (manualValue: string): string[] => {
    const src = fileText.trim() ? fileText : manualValue;
    return src.split('\n').map(s => s.trim()).filter(Boolean);
  };

  const buildBody = (approach: 'classical' | 'quantum') => {
    const body: Record<string, unknown> = { problem_type: problemType, approach };
    if (problemType === 'search') {
      body.dataset = resolveLines(dataset);
      body.target  = target.trim();
    } else if (problemType === 'factoring') {
      // For factoring: if file uploaded, pull first number from fileText
      if (fileText.trim()) {
        const match = fileText.match(/\d+/);
        body.number = match ? parseInt(match[0], 10) : parseInt(number, 10);
      } else {
        body.number = parseInt(number, 10);
      }
    } else if (problemType === 'optimization') {
      body.cities = resolveLines(cities);
    } else if (problemType === 'database') {
      body.records = resolveLines(records);
      body.query   = query.trim();
    }
    return body;
  };

  // ── Run one approach ───────────────────────────────────────────────────────

  const runApproach = async (approach: 'classical' | 'quantum') => {
    const setLoading = approach === 'classical' ? setClassicalLoading : setQuantumLoading;
    const setResult  = approach === 'classical' ? setClassicalResult  : setQuantumResult;
    const setError   = approach === 'classical' ? setClassicalError   : setQuantumError;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res  = await fetch('/api/dashboard/solve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildBody(approach)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Server error');
      setResult(data.result as SolveResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // ── Run both at once ───────────────────────────────────────────────────────

  const runBoth = () => {
    runApproach('classical');
    runApproach('quantum');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen py-10 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-8">
          <Link to="/" className="hover:text-gray-400 transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-400">Problem Solver</span>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white mb-2">Problem Solver</h1>
          <p className="text-gray-500 text-sm">
            Select a problem type, enter your own data, then run it through Classical or Quantum — or both at once to compare.
          </p>
        </div>

        {/* ── Step 1: Problem Type Tabs ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Step 1 — Choose Problem Type
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.entries(PROBLEMS) as [ProblemType, typeof meta][]).map(([key, m]) => {
              const PIcon = m.icon;
              const isActive = problemType === key;
              return (
                <button
                  key={key}
                  onClick={() => setProblemType(key)}
                  className={`relative flex flex-col items-start gap-2 p-4 rounded-2xl border transition-all text-left ${
                    isActive
                      ? 'border-quantum-neon/50 bg-quantum-800'
                      : 'border-quantum-700 bg-quantum-900 hover:border-quantum-600 hover:bg-quantum-800/50'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-quantum-neon" />
                  )}
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                    <PIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-400'}`}>
                      {m.label}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">{m.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Step 2: Input Form ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Step 2 — Enter Your Problem Data
          </p>
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">{meta.label} Problem</h2>
                <p className="text-gray-500 text-xs">{meta.tagline}</p>
              </div>
            </div>

            {/* Search inputs */}
            {problemType === 'search' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-2">
                    Dataset <span className="text-gray-600">— one item per line</span>
                  </label>
                  <FileUploadZone
                    dest="dataset"
                    accept=".txt,.csv,.pdf,.docx,.doc,.json,.md,.tsv,.log,.xml,.yaml,.yml,.rtf"
                    hint="Upload a TXT, CSV, PDF, Word, or JSON file"
                    loading={fileLoading}
                    uploadedFile={uploadedFile}
                    error={fileError}
                    onFile={handleFileUpload}
                    onClear={clearFile}
                  />
                  <InputDivider hasFile={!!uploadedFile} />
                  <textarea
                    ref={datasetRef}
                    value={dataset}
                    onChange={e => setDataset(e.target.value)}
                    placeholder={DEFAULTS.search.dataset}
                    disabled={!!uploadedFile}
                    className={`w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 resize-none font-mono overflow-hidden min-h-[120px] transition-opacity ${uploadedFile ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-gray-600 mt-1.5">Enter the list of items you want to search through.</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-2">Search Target</label>
                  <input
                    type="text"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="e.g. Grace"
                    className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50"
                  />
                  <p className="text-xs text-gray-600 mt-1.5">The item you are looking for in the dataset above.</p>
                  <div className="mt-4 p-3 bg-quantum-700/40 rounded-xl border border-quantum-700">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      <span className="text-gray-300 font-medium">How it works:</span><br />
                      Classical — scans every item one by one <span className="text-red-400 font-mono">O(N)</span><br />
                      Quantum — Grover's oracle amplifies the target <span className="text-quantum-neon font-mono">O(√N)</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Factoring input */}
            {problemType === 'factoring' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-2">
                    Number to Factor <span className="text-gray-600">— integer ≥ 2</span>
                  </label>
                  <FileUploadZone
                    dest="number"
                    accept=".txt,.csv,.pdf,.docx,.doc,.json,.md"
                    hint="Upload a file containing the number"
                    loading={fileLoading}
                    uploadedFile={uploadedFile}
                    error={fileError}
                    onFile={handleFileUpload}
                    onClear={clearFile}
                  />
                  <InputDivider hasFile={!!uploadedFile} />
                  <input
                    type="number"
                    value={number}
                    onChange={e => setNumber(e.target.value)}
                    placeholder="e.g. 84"
                    min={2}
                    disabled={!!uploadedFile}
                    className={`w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 font-mono text-lg transition-opacity ${uploadedFile ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-gray-600 mt-1.5">
                    Use a large number (10⁹ – 10¹²) to see quantum win clearly.
                    Small numbers have tiny factors that classical finds instantly.
                  </p>
                </div>
                <div className="p-4 bg-quantum-700/40 rounded-xl border border-quantum-700 self-start space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <span className="text-white font-semibold block mb-2">What will happen:</span>
                    The platform decomposes your number into prime factors using two different approaches and compares theoretical step counts.<br /><br />
                    <span className="text-red-400">Classical</span> — Trial Division tests divisors 2 → √N in the worst case<br />
                    <span className="text-quantum-neon">Quantum</span> — Shor's QFT needs only (log N)³ gate operations
                  </p>
                  <div className="border-t border-quantum-600 pt-3">
                    <p className="text-[11px] text-yellow-400/80 leading-relaxed">
                      <span className="font-semibold">💡 When does quantum win?</span><br />
                      Shor's advantage grows with the <em>bit length</em> of N.
                      For N ≈ 10¹², quantum needs ~60K steps vs ~1M classical — a 17× speedup.
                      At RSA-2048 scale it becomes a trillion-fold advantage.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Optimization input */}
            {problemType === 'optimization' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-2">
                    Cities to Visit <span className="text-gray-600">— one city per line, 3 to 12</span>
                  </label>
                  <FileUploadZone
                    dest="cities"
                    accept=".txt,.csv,.pdf,.docx,.doc,.json,.md,.tsv"
                    hint="Upload a TXT, CSV, or Word file with city names"
                    loading={fileLoading}
                    uploadedFile={uploadedFile}
                    error={fileError}
                    onFile={handleFileUpload}
                    onClear={clearFile}
                  />
                  <InputDivider hasFile={!!uploadedFile} />
                  <textarea
                    ref={citiesRef}
                    value={cities}
                    onChange={e => setCities(e.target.value)}
                    placeholder={DEFAULTS.optimization.cities}
                    disabled={!!uploadedFile}
                    className={`w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 resize-none font-mono overflow-hidden min-h-[120px] transition-opacity ${uploadedFile ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-xs text-gray-600 mt-1.5">Distances between cities are auto-generated. Max 12 cities.</p>
                </div>
                <div className="p-4 bg-quantum-700/40 rounded-xl border border-quantum-700 self-start">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <span className="text-white font-semibold block mb-2">Travelling Salesman Problem:</span>
                    Find the shortest route that visits all cities exactly once and returns to the start.<br /><br />
                    <span className="text-red-400">Classical</span> — Greedy picks closest unvisited city each step<br />
                    <span className="text-quantum-neon">Quantum</span> — QAOA explores the full solution space simultaneously
                  </p>
                </div>
              </div>
            )}

            {/* Database input */}
            {problemType === 'database' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-2">
                    Database Records <span className="text-gray-600">— one record per line</span>
                  </label>
                  <FileUploadZone
                    dest="records"
                    accept=".txt,.csv,.pdf,.docx,.doc,.json,.md,.tsv,.log,.xml,.yaml,.yml,.rtf"
                    hint="Upload a CSV, TXT, PDF, Word, or JSON file"
                    loading={fileLoading}
                    uploadedFile={uploadedFile}
                    error={fileError}
                    onFile={handleFileUpload}
                    onClear={clearFile}
                  />
                  <InputDivider hasFile={!!uploadedFile} />
                  <textarea
                    ref={recordsRef}
                    value={records}
                    onChange={e => setRecords(e.target.value)}
                    placeholder={DEFAULTS.database.records}
                    disabled={!!uploadedFile}
                    className={`w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 resize-none font-mono overflow-hidden min-h-[120px] transition-opacity ${uploadedFile ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-2">Search Query</label>
                    <input
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="e.g. Engineer"
                      className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50"
                    />
                    <p className="text-xs text-gray-600 mt-1.5">Finds all records containing this keyword.</p>
                  </div>
                  <div className="p-4 bg-quantum-700/40 rounded-xl border border-quantum-700">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      <span className="text-white font-semibold block mb-2">Unstructured Query:</span>
                      No index. Both approaches scan for matching records.<br /><br />
                      <span className="text-red-400">Classical</span> — Sequential scan, reads every row<br />
                      <span className="text-quantum-neon">Quantum</span> — Amplitude Amplification, √N queries
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 3: Choose Approach ── */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Step 3 — Choose How to Solve It
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Classical */}
            <button
              onClick={() => runApproach('classical')}
              disabled={classicalLoading || quantumLoading}
              className="group flex flex-col gap-3 p-5 bg-red-950/20 border border-red-900/40 rounded-2xl hover:border-red-700/60 hover:bg-red-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-red-900/50 border border-red-800 flex items-center justify-center">
                  {classicalLoading
                    ? <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                    : <Cpu className="w-4 h-4 text-red-400" />
                  }
                </div>
                <span className="text-red-400 font-mono text-sm font-bold">{meta.classicalComplexity}</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Run Classically</p>
                <p className="text-gray-500 text-xs mt-0.5">{meta.classicalAlgo}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-red-400 font-medium group-hover:gap-2 transition-all mt-auto">
                {classicalLoading ? 'Running…' : 'Run now'} <ArrowRight className="w-3 h-3" />
              </div>
            </button>

            {/* Both */}
            <button
              onClick={runBoth}
              disabled={classicalLoading || quantumLoading}
              className="group flex flex-col items-center justify-center gap-3 p-5 border rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(0,255,204,0.08))',
                borderColor: (classicalLoading || quantumLoading) ? '#374151' : 'rgba(0,255,204,0.3)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-900/40 border border-red-800 flex items-center justify-center">
                  <Cpu className="w-3.5 h-3.5 text-red-400" />
                </div>
                <span className="text-gray-500 text-xs font-mono">vs</span>
                <div className="w-8 h-8 rounded-lg bg-teal-900/40 border border-teal-800 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-quantum-neon" />
                </div>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Run Both & Compare</p>
                <p className="text-gray-500 text-xs mt-0.5">See Classical vs Quantum side by side</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium group-hover:gap-2 transition-all mt-auto"
                style={{ color: '#00ffcc' }}>
                {(classicalLoading || quantumLoading) ? 'Running…' : 'Compare now'} <ArrowRight className="w-3 h-3" />
              </div>
            </button>

            {/* Quantum */}
            <button
              onClick={() => runApproach('quantum')}
              disabled={classicalLoading || quantumLoading}
              className="group flex flex-col gap-3 p-5 bg-teal-950/20 border border-teal-900/40 rounded-2xl hover:border-teal-700/60 hover:bg-teal-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-teal-900/50 border border-teal-800 flex items-center justify-center">
                  {quantumLoading
                    ? <Loader2 className="w-4 h-4 text-quantum-neon animate-spin" />
                    : <Zap className="w-4 h-4 text-quantum-neon" />
                  }
                </div>
                <span className="text-quantum-neon font-mono text-sm font-bold">{meta.quantumComplexity}</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Run with Quantum</p>
                <p className="text-gray-500 text-xs mt-0.5">{meta.quantumAlgo}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-quantum-neon font-medium group-hover:gap-2 transition-all mt-auto">
                {quantumLoading ? 'Running…' : 'Run now'} <ArrowRight className="w-3 h-3" />
              </div>
            </button>

          </div>
        </div>

        {/* ── Results ── */}
        {(classicalResult || quantumResult || classicalError || quantumError || classicalLoading || quantumLoading) && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Results</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Classical result */}
              {(classicalResult || classicalError || classicalLoading) && (
                <ResultPanel
                  approach="classical"
                  loading={classicalLoading}
                  result={classicalResult}
                  error={classicalError}
                  algo={meta.classicalAlgo}
                  complexity={meta.classicalComplexity}
                />
              )}

              {/* Quantum result */}
              {(quantumResult || quantumError || quantumLoading) && (
                <ResultPanel
                  approach="quantum"
                  loading={quantumLoading}
                  result={quantumResult}
                  error={quantumError}
                  algo={meta.quantumAlgo}
                  complexity={meta.quantumComplexity}
                />
              )}

            </div>

            {/* Full comparison — only when both results exist */}
            {classicalResult && quantumResult && (
              <ComparisonSection
                classical={classicalResult}
                quantum={quantumResult}
                problemType={problemType}
              />
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────────────────────────────

function ResultPanel({
  approach, loading, result, error, algo, complexity,
}: {
  approach:   'classical' | 'quantum';
  loading:    boolean;
  result:     SolveResult | null;
  error:      string | null;
  algo:       string;
  complexity: string;
}) {
  const isQ = approach === 'quantum';

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${
      isQ ? 'bg-teal-950/20 border-teal-900/40' : 'bg-red-950/20 border-red-900/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isQ
            ? <Zap className="w-4 h-4 text-quantum-neon" />
            : <Cpu className="w-4 h-4 text-red-400" />
          }
          <span className={`text-sm font-bold ${isQ ? 'text-quantum-neon' : 'text-red-400'}`}>
            {isQ ? 'Quantum' : 'Classical'}
          </span>
        </div>
        <span className={`font-mono text-xs font-semibold ${isQ ? 'text-quantum-neon' : 'text-red-400'}`}>
          {complexity}
        </span>
      </div>
      <p className="text-gray-500 text-xs -mt-2">{algo}</p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-6 justify-center">
          <Loader2 className={`w-5 h-5 animate-spin ${isQ ? 'text-quantum-neon' : 'text-red-400'}`} />
          <span className="text-gray-400 text-sm">Running {algo}…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 text-red-400">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      {/* Result */}
      {!loading && result && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-xl border p-3 text-center ${isQ ? 'bg-teal-950/30 border-teal-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
              <p className={`text-xl font-extrabold font-mono ${isQ ? 'text-quantum-neon' : 'text-red-400'}`}>
                {result.steps.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">Steps Taken</p>
            </div>
            <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-3 text-center">
              <p className="text-xl font-extrabold font-mono text-white">
                {result.input_size.toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">Input Size (N)</p>
            </div>
          </div>

          {/* Answer */}
          <div className="bg-quantum-800/60 border border-quantum-700 rounded-xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Answer</p>
            <ResultDisplay result={result} />
          </div>

          {/* Explanation */}
          <p className="text-gray-500 text-xs leading-relaxed">{result.explanation}</p>
        </>
      )}
    </div>
  );
}

// ── Speedup Banner ────────────────────────────────────────────────────────────

function ComparisonSection({
  classical, quantum, problemType,
}: {
  classical: SolveResult;
  quantum:   SolveResult;
  problemType: ProblemType;
}) {
  const meta    = COMPARISON_META[problemType];
  const speedup = classical.theoretical_steps / Math.max(1, quantum.theoretical_steps);
  const scaleC  = meta.scaleClassical(meta.scaleN).toLocaleString();
  const scaleQ  = meta.scaleQuantum(meta.scaleN).toLocaleString();
  const scaleSpeedup = Math.round(meta.scaleClassical(meta.scaleN) / Math.max(1, meta.scaleQuantum(meta.scaleN)));

  const stepsWinner = quantum.steps < classical.steps ? 'quantum' : classical.steps < quantum.steps ? 'classical' : 'tie';
  const stepsRatio  = quantum.steps < classical.steps
    ? `Quantum used ${(classical.steps / Math.max(1, quantum.steps)).toFixed(1)}× fewer steps`
    : quantum.steps > classical.steps
    ? `Classical used ${(quantum.steps / Math.max(1, classical.steps)).toFixed(1)}× fewer steps at this N — quantum advantage grows with larger inputs`
    : 'Equal step counts at this input size';

  const rows = [
    {
      metric:    'Steps Taken (your input)',
      classical: classical.steps.toLocaleString(),
      quantum:   quantum.steps.toLocaleString(),
      winner:    stepsWinner,
      note:      stepsRatio,
    },
    {
      metric:    'Time Complexity',
      classical: classical.complexity,
      quantum:   quantum.complexity,
      winner:    'quantum',
      note:      meta.advantage,
    },
    {
      metric:    'Space Complexity',
      classical: meta.spaceClassical,
      quantum:   meta.spaceQuantum,
      winner:    'tie',
      note:      'Both are memory-efficient; quantum uses qubit registers instead of RAM',
    },
    {
      metric:    'Algorithm Type',
      classical: meta.typeClassical,
      quantum:   meta.typeQuantum,
      winner:    'tie',
      note:      'Quantum algorithms are probabilistic but tuned to succeed with > 99% probability',
    },
    {
      metric:    'Solution Quality',
      classical: meta.qualityClassical,
      quantum:   meta.qualityQuantum,
      winner:    'tie',
      note:      'Both return the correct answer; quantum achieves it in fewer operations',
    },
    {
      metric:    `Steps at Scale (${meta.scaleLabel})`,
      classical: scaleC,
      quantum:   scaleQ,
      winner:    'quantum',
      note:      `At large scale quantum needs ${scaleSpeedup.toLocaleString()}× fewer operations — this is where quantum advantage becomes undeniable`,
    },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4">

      {/* Speedup hero */}
      <div
        className="rounded-2xl border border-quantum-600/40 p-6 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(0,255,204,0.06), rgba(204,68,255,0.06))' }}
      >
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Quantum Speedup at Your Input Size</p>
        <p
          className="text-5xl font-extrabold text-transparent bg-clip-text mb-2"
          style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}
        >
          {speedup >= 100 ? speedup.toFixed(0) : speedup >= 10 ? speedup.toFixed(1) : speedup.toFixed(2)}×
        </p>
        <p className="text-gray-400 text-sm">
          Quantum needed{' '}
          <span className="text-quantum-neon font-mono font-bold">{quantum.theoretical_steps.toLocaleString()}</span> steps vs
          Classical's{' '}
          <span className="text-red-400 font-mono font-bold">{classical.theoretical_steps.toLocaleString()}</span> steps
          at N = {classical.input_size.toLocaleString()}
        </p>

        {/* Visual bar */}
        <div className="mt-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs text-red-400 w-20 text-right flex-shrink-0">Classical</span>
            <div className="flex-1 h-4 bg-quantum-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-red-600/70" style={{ width: '100%' }} />
            </div>
            <span className="text-xs text-red-400 font-mono w-16 flex-shrink-0">{classical.theoretical_steps.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-quantum-neon w-20 text-right flex-shrink-0">Quantum</span>
            <div className="flex-1 h-4 bg-quantum-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (quantum.theoretical_steps / classical.theoretical_steps) * 100)}%`,
                  background: 'linear-gradient(90deg, #00ffcc, #00ccaa)',
                }}
              />
            </div>
            <span className="text-xs text-quantum-neon font-mono w-16 flex-shrink-0">{quantum.theoretical_steps.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Detailed comparison table */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-quantum-700">
          <h3 className="text-white font-bold text-sm">Full Algorithm Comparison</h3>
          <p className="text-gray-500 text-xs mt-0.5">Side-by-side breakdown across all key metrics</p>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-0 border-b border-quantum-700 bg-quantum-900/50">
          <div className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Metric</div>
          <div className="px-4 py-2.5 text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3 h-3" /> Classical
          </div>
          <div className="px-4 py-2.5 text-xs font-semibold text-quantum-neon uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Quantum
          </div>
        </div>

        {/* Rows */}
        {rows.map((row, i) => (
          <div
            key={row.metric}
            className={`grid grid-cols-[2fr_1.5fr_1.5fr] gap-0 border-b border-quantum-700/50 last:border-0 ${
              i % 2 === 0 ? '' : 'bg-quantum-900/20'
            }`}
          >
            <div className="px-5 py-3.5">
              <p className="text-gray-300 text-xs font-medium">{row.metric}</p>
              <p className="text-gray-600 text-[10px] mt-0.5 leading-relaxed">{row.note}</p>
            </div>
            <div className={`px-4 py-3.5 flex items-start ${row.winner === 'classical' ? '' : ''}`}>
              <span className={`text-xs font-mono font-semibold ${
                row.winner === 'classical' ? 'text-red-300' : 'text-red-500/80'
              }`}>
                {row.classical}
              </span>
            </div>
            <div className="px-4 py-3.5 flex items-start gap-1.5">
              <span className={`text-xs font-mono font-semibold ${
                row.winner === 'quantum' ? 'text-quantum-neon' : 'text-quantum-neon/70'
              }`}>
                {row.quantum}
              </span>
              {row.winner === 'quantum' && (
                <span className="text-[9px] bg-teal-900/50 text-quantum-neon border border-teal-800 px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
                  ✓ faster
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Scale projection card */}
      <div className="bg-quantum-800/50 border border-quantum-700 rounded-2xl p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Why This Matters at Scale</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 text-center">
            <p className="text-xs text-red-400 mb-1">Classical at {meta.scaleLabel}</p>
            <p className="text-2xl font-extrabold text-red-400 font-mono">{scaleC}</p>
            <p className="text-xs text-gray-600 mt-1">operations needed</p>
          </div>
          <div className="bg-teal-950/20 border border-teal-900/30 rounded-xl p-4 text-center">
            <p className="text-xs text-quantum-neon mb-1">Quantum at {meta.scaleLabel}</p>
            <p className="text-2xl font-extrabold text-quantum-neon font-mono">{scaleQ}</p>
            <p className="text-xs text-gray-600 mt-1">operations needed</p>
          </div>
        </div>
        <p className="text-center text-gray-400 text-sm mt-4">
          At {meta.scaleLabel}, Quantum is{' '}
          <span
            className="font-extrabold text-transparent bg-clip-text"
            style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}
          >
            {scaleSpeedup.toLocaleString()}× faster
          </span>{' '}
          — this is where quantum computing changes everything.
        </p>
      </div>

    </div>
  );
}

// ── Input Divider ─────────────────────────────────────────────────────────────

function InputDivider({ hasFile }: { hasFile: boolean }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-quantum-700" />
      <span className={`text-[10px] uppercase tracking-wider ${hasFile ? 'text-teal-600' : 'text-gray-600'}`}>
        {hasFile ? '✓ file in use — manual input disabled' : 'or type manually'}
      </span>
      <div className="flex-1 h-px bg-quantum-700" />
    </div>
  );
}

// ── File Upload Zone ──────────────────────────────────────────────────────────

function FileUploadZone({
  dest, accept, hint, loading, uploadedFile, error, onFile, onClear,
}: {
  dest:         'dataset' | 'cities' | 'records' | 'number';
  accept:       string;
  hint:         string;
  loading:      boolean;
  uploadedFile: { name: string; size: number; lines: number } | null;
  error:        string | null;
  onFile:       (file: File, dest: 'dataset' | 'cities' | 'records' | 'number') => void;
  onClear:      () => void;
}) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file, dest);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file, dest);
    e.target.value = '';
  };

  const fmt = (bytes: number) =>
    bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  // Uploaded state
  if (uploadedFile) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-teal-950/30 border border-teal-800/60 rounded-xl">
        <div className="w-8 h-8 rounded-lg bg-teal-900/50 border border-teal-800 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-quantum-neon" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-medium truncate">{uploadedFile.name}</p>
          <p className="text-gray-500 text-[10px] mt-0.5">
            {fmt(uploadedFile.size)} · {uploadedFile.lines.toLocaleString()} lines extracted
          </p>
        </div>
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors flex-shrink-0"
          title="Remove file"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !loading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          dragging
            ? 'border-quantum-neon/60 bg-teal-950/20'
            : 'border-quantum-700 bg-quantum-900/50 hover:border-quantum-600 hover:bg-quantum-800/30'
        } ${loading ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 text-quantum-neon animate-spin" />
            <p className="text-gray-400 text-xs">Extracting text…</p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-xl bg-quantum-800 border border-quantum-700 flex items-center justify-center">
              <Upload className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs font-medium">
                Drop a file here or{' '}
                <span className="text-quantum-neon underline underline-offset-2">browse</span>
              </p>
              <p className="text-gray-600 text-[10px] mt-0.5">{hint}</p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
          disabled={loading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mt-2 text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Answer Display ────────────────────────────────────────────────────────────

function ResultDisplay({ result }: { result: SolveResult }) {
  const r = result.result;

  if (result.problem_type === 'search') {
    return (
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          {r.found
            ? <CheckCircle className="w-4 h-4 text-quantum-neon flex-shrink-0" />
            : <XCircle     className="w-4 h-4 text-red-400 flex-shrink-0" />
          }
          <span className="text-white font-semibold text-sm">
            {r.found ? `Found "${String(r.value)}"` : `"${String(r.target)}" not in dataset`}
          </span>
        </div>
        {Boolean(r.found) && (
          <p className="text-gray-500 text-xs pl-6">
            at index <span className="text-white font-mono">{String(r.index)}</span>
          </p>
        )}
      </div>
    );
  }

  if (result.problem_type === 'factoring') {
    return (
      <div className="space-y-2">
        <p className="text-white font-mono text-base font-bold">
          {String(r.number)} ={' '}
          <span className="text-quantum-neon">{String(r.factored_form)}</span>
        </p>
        {Boolean(r.is_prime) && <p className="text-xs text-yellow-400">⚠ This is a prime number</p>}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(r.factors as number[]).map((f, i) => (
            <span key={i} className="bg-quantum-700 text-quantum-neon font-mono text-xs px-2 py-1 rounded-lg border border-quantum-600">
              {f}
            </span>
          ))}
        </div>
        {Boolean(r.qubits_needed) && (
          <p className="text-xs text-gray-600">
            Qubits needed: <span className="text-gray-400 font-mono">{String(r.qubits_needed)}</span>
          </p>
        )}
      </div>
    );
  }

  if (result.problem_type === 'optimization') {
    const tour = r.tour as string[];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          {tour.map((city, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="bg-quantum-700 border border-quantum-600 text-white text-xs px-2 py-0.5 rounded-lg">
                {city}
              </span>
              {i < tour.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />}
            </div>
          ))}
        </div>
        <p className="text-white text-sm font-semibold">
          Distance: <span className="text-quantum-neon font-mono">{String(r.total_distance)} units</span>
        </p>
        {r.is_optimal !== undefined && (
          <p className="text-xs text-gray-600">
            {r.is_optimal ? '✓ Provably optimal' : '~ Near-optimal approximation'}
          </p>
        )}
      </div>
    );
  }

  if (result.problem_type === 'database') {
    const matches = r.matches as Array<{ index: number; value: string }>;
    return (
      <div className="space-y-2">
        <p className="text-white font-semibold text-sm">
          {matches.length > 0
            ? <><span className="text-quantum-neon font-mono">{matches.length}</span> match(es) for "<span className="text-quantum-neon">{String(r.query)}</span>"</>
            : <>No records matched "{String(r.query)}"</>
          }
        </p>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {matches.map((m, i) => (
            <div key={i} className="flex items-start gap-2 bg-quantum-700/40 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-600 font-mono text-[10px] flex-shrink-0 mt-0.5">#{m.index}</span>
              <span className="text-gray-300 text-xs">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <pre className="text-xs text-gray-400 overflow-auto">{JSON.stringify(r, null, 2)}</pre>;
}
