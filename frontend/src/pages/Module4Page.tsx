import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowRight, Brain, CheckCircle, ChevronDown, Cpu, FileText, Info, MessageCircleQuestion,
  Play, Upload, X, Zap,
} from 'lucide-react';
import { advisorApi, type Advice, type AdvisorMode } from '../api/advisor';
import { aiApi, type AIStatus } from '../api/ai';
import { getApiErrorMessage } from '../api/client';
import { AIStatusLine, WrittenByAI } from '../components/ai/AIStatus';
import { usePageDetails } from '../components/ai/pageDetails';

// Recommended algorithm → the SFOD task that solves it on the user's own data (FE-3)
const SOLVE_TARGET: Record<string, { type: string; label: string }> = {
  grovers: { type: 'search', label: "Grover's search" },
  linear_search: { type: 'search', label: 'search' },
  binary_search: { type: 'search', label: 'search' },
  amplitude_amp: { type: 'database', label: 'amplitude amplification' },
  shors: { type: 'factoring', label: "Shor's algorithm" },
  trial_division: { type: 'factoring', label: 'factoring' },
  qaoa: { type: 'optimization', label: 'QAOA route optimisation' },
  dynamic_programming: { type: 'optimization', label: 'route optimisation' },
  hillclimbing: { type: 'optimization', label: 'route optimisation' },
};

const MODES: { id: AdvisorMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: "The AI reads your problem and the model chooses. If the AI can't answer, the built-in reader takes over." },
  { id: 'local', label: 'Built-in', hint: 'The built-in reader picks out keywords and numbers, without the AI. The model chooses as usual.' },
];

const EXAMPLES = [
  { label: 'Search problem', text: 'I need to find a specific record in an unsorted database of 10 million entries.' },
  { label: 'Crypto / factoring', text: 'I need to factorise a large RSA-2048 integer to test cryptographic strength.' },
  { label: 'Optimisation', text: 'Find the shortest route visiting 500 cities — the Travelling Salesman Problem with a graph of nodes and edges.' },
  { label: 'Quantum chemistry', text: 'Simulate the ground state energy of a hydrogen molecule for drug discovery involving continuous molecular orbitals.' },
  { label: 'In your own words', text: 'Our bakery has 12 ovens and 40 cake orders each morning. Which oven should bake which order so everything is ready as early as possible?' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', doc: '📝', csv: '📊',
  txt: '📃', md: '📃', json: '🗂️', tex: '📄',
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📎';
}

function formatBytes(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-quantum-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-12 text-right text-gray-400">{value.toFixed(1)}%</span>
    </div>
  );
}

function Fact({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <div className="bg-quantum-900 rounded-xl p-3">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className={on === undefined ? 'text-white font-semibold' : on ? 'text-green-400 font-semibold' : 'text-gray-300'}>{value}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Module4Page() {
  const location = useLocation();
  const navigate = useNavigate();
  // A question handed over (from the app home page, or by Ask QAIbridge) arrives as router state
  // and is analysed straight away, even when this page is already open.
  const handed = (location.state as { problem?: unknown } | null)?.problem;
  const incoming = typeof handed === 'string' && handed.trim() ? handed : null;
  const [text, setText]                 = useState(incoming ?? '');
  const [file, setFile]                 = useState<File | null>(null);
  const [mode, setMode]                 = useState<AdvisorMode>('auto');
  const [aiStatus, setAiStatus]         = useState<AIStatus | null>(null);
  const [dragging, setDragging]         = useState(false);
  const [result, setResult]             = useState<Advice | null>(null);
  const [offTopic, setOffTopic]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [revealResult, setRevealResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const handledKey = useRef<string | null>(null);
  const ids = { text: useId(), mode: useId(), hint: useId() };

  const ACCEPTED = '.pdf,.docx,.doc,.csv,.txt,.md,.json,.tex,.rtf';

  useEffect(() => {
    aiApi.status().then(setAiStatus).catch(() => undefined);
  }, []);

  const pickFile = (f: File | undefined) => {
    if (f) { setFile(f); setError(''); }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // `reveal` scrolls the answer into view once it arrives (for a question handed over from the app home page).
  const analyze = useCallback(async (problem: string, upload: File | null, reveal = false) => {
    if (!problem.trim() && !upload) {
      setError('Please enter a problem description or upload a file.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setOffTopic(null);
    try {
      const data = upload ? await advisorApi.adviseFile(upload, mode) : await advisorApi.advise(problem, mode);
      setAiStatus(data.ai_status);
      if (data.off_topic) {
        setOffTopic(data.message);
        return;
      }
      setResult(data);
      setExpanded(data.top_algorithm_id);
      setRevealResult(reveal);
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't analyse this problem. Please try again."));
      aiApi.status().then(setAiStatus).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!incoming || handledKey.current === location.key) return;
    handledKey.current = location.key;
    setText(incoming);
    setFile(null);
    navigate(location.pathname, { replace: true, state: null });   // so a reload doesn't ask it again
    analyze(incoming, null, true);
  }, [incoming, location.key, analyze, navigate, location.pathname]);

  useEffect(() => {
    if (!revealResult || !result || loading) return;
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setRevealResult(false);
  }, [revealResult, result, loading]);

  const reset = () => {
    setResult(null);
    setOffTopic(null);
    setText('');
    clearFile();
    setShowFeatures(false);
    setExpanded(null);
  };

  const isQuantum = result?.approach === 'Quantum';
  const top = result?.recommendations[0];
  usePageDetails('advisor', result && top
    ? `Their problem: ${result.input_preview}\nRecommendation: ${result.approach} approach, ${top.algorithm_name} `
      + `(${top.complexity}, ${top.speedup} speed-up), model confidence ${result.top_confidence}%. `
      + `Read as ${result.detected_features.category_label}, size N = ${result.detected_features.data_size}. `
      + `Reasons: ${result.approach_reason}`
      + (result.explanation ? `\nExplanation shown: ${result.explanation}` : '')
    : offTopic ? `They asked something that isn't a computing problem; the page answered: ${offTopic}` : null);

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">

      {/* Header */}
      <section className="px-6 pt-12 pb-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-orange-500 opacity-5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-60 h-60 bg-purple-500 opacity-5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
            Describe Your Problem.{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #f97316, #cc44ff)' }}>
              Get the Best Approach.
            </span>
          </h1>
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed mb-3">
            Type your problem in plain English, or upload a file (PDF, Word, CSV and more). The AI reads it, a trained model
            decides whether <span className="text-quantum-neon font-medium">quantum</span> or{' '}
            <span className="text-red-400 font-medium">classical</span> computing fits best and which algorithm to use,
            and the AI explains why.
          </p>
          <AIStatusLine status={aiStatus} reads="your problem" fallback="The built-in reader is used." />
        </div>
      </section>

      {/* Input area */}
      <div className="max-w-4xl mx-auto px-4 pb-6 space-y-4">

        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
          <label htmlFor={ids.text} className="block text-xs text-gray-300 font-medium uppercase tracking-wide mb-3">
            Describe your problem
          </label>
          <textarea
            id={ids.text}
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            disabled={!!file}
            rows={6}
            aria-describedby={ids.hint}
            placeholder={
              file
                ? 'File selected — remove it to type instead.'
                : 'Examples:\n• "I need to search 50 million unsorted records to find a match."\n• "I want to factorise a large RSA-2048 number to test cryptographic strength."\n• "Find the shortest route visiting 200 cities — the Travelling Salesman Problem."\n• "Our bakery has 12 ovens and 40 orders. Which oven should bake which order?"'
            }
            className={`w-full bg-quantum-900 border border-quantum-600 text-white rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:border-orange-500 transition-colors placeholder-gray-500 ${file ? 'opacity-40 cursor-not-allowed' : ''}`}
          />
          <p id={ids.hint} className="text-xs text-gray-400 mt-1.5">
            Write it however you like. Saying how big it is (how many records, cities or items) makes the advice more accurate.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-quantum-700" />
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">or upload a file</span>
          <div className="flex-1 h-px bg-quantum-700" />
        </div>

        {!file ? (
          <>
            <button
              type="button"
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragging ? 'border-orange-500 bg-orange-900/10' : 'border-quantum-600 hover:border-quantum-500 hover:bg-quantum-800/50'}`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragging ? 'text-orange-400' : 'text-gray-400'}`} aria-hidden="true" />
              <span className="block text-white font-semibold text-sm mb-1">Drag &amp; drop your file here</span>
              <span className="block text-gray-400 text-xs mb-3">or click to browse</span>
              <span className="flex flex-wrap justify-center gap-1.5">
                {['PDF', 'Word', 'CSV', 'TXT', 'JSON', 'Markdown'].map(t => (
                  <span key={t} className="text-xs bg-quantum-700 text-gray-300 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden" tabIndex={-1}
              onChange={e => pickFile(e.target.files?.[0])} />
          </>
        ) : (
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-quantum-700 flex items-center justify-center text-xl flex-shrink-0" aria-hidden="true">
              {getFileIcon(file.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{file.name}</p>
              <p className="text-gray-400 text-xs">{formatBytes(file.size)}</p>
            </div>
            <button type="button" onClick={clearFile} aria-label={`Remove ${file.name}`}
              className="w-8 h-8 rounded-lg bg-quantum-700 hover:bg-red-900/40 flex items-center justify-center text-gray-300 hover:text-red-300 transition-colors flex-shrink-0">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div role="group" aria-labelledby={ids.mode} className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span id={ids.mode} className="text-xs text-gray-300 font-medium">Who reads your problem</span>
          <div className="inline-flex gap-1">
            {MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
                className={`text-xs px-3 py-1.5 rounded-lg border ${mode === m.id ? 'border-quantum-neon text-quantum-neon bg-quantum-neon/10' : 'border-quantum-600 text-gray-300'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="basis-full text-xs text-gray-400">{MODES.find(m => m.id === mode)?.hint}</p>
        </div>

        {error && (
          <div role="alert" className="bg-red-950/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => analyze(text, file)}
          disabled={loading || (!text.trim() && !file)}
          className="w-full py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-[1.01] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{ background: 'linear-gradient(90deg, #f97316, #cc44ff)' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analysing your problem…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" aria-hidden="true" />
              {file ? 'Analyse file' : 'Analyse problem'}
            </span>
          )}
        </button>

        {offTopic && !loading && (
          <div role="status" className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3">
            <MessageCircleQuestion className="w-5 h-5 text-amber-200 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-amber-100 text-sm font-semibold mb-0.5">That doesn't look like a computing problem</p>
              <p className="text-amber-100/90 text-sm leading-relaxed">{offTopic}</p>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {result && top && !loading && (
        <div ref={resultsRef} className="max-w-4xl mx-auto px-4 pb-16 space-y-5 scroll-mt-20">

          {result.ai_note && (
            <p className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />{result.ai_note}
            </p>
          )}

          {/* Verdict banner */}
          <div
            className="rounded-2xl p-6 border relative overflow-hidden"
            style={isQuantum
              ? { background: 'linear-gradient(135deg,#00ffcc10,#cc44ff10)', borderColor: '#00ffcc40' }
              : { background: 'linear-gradient(135deg,#ef444410,#f9731610)', borderColor: '#ef444440' }}
          >
            <div className="flex items-start gap-5 flex-wrap">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${isQuantum ? 'bg-gradient-to-br from-teal-500 to-cyan-400' : 'bg-gradient-to-br from-red-500 to-orange-400'}`}>
                {isQuantum ? <Zap className="w-8 h-8 text-white" aria-hidden="true" /> : <Cpu className="w-8 h-8 text-white" aria-hidden="true" />}
              </div>
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Recommended approach</p>
                <h2 className="text-3xl font-extrabold mb-1" style={{ color: isQuantum ? '#00ffcc' : '#ef4444' }}>
                  {isQuantum ? 'Quantum Approach' : 'Classical Approach'}
                </h2>
                <p className="text-gray-300 text-sm leading-relaxed">{result.approach_reason}</p>
              </div>
              <div className="flex-shrink-0 text-center px-4 py-2 rounded-xl"
                style={{ background: isQuantum ? '#00ffcc15' : '#ef444415', border: `1px solid ${isQuantum ? '#00ffcc40' : '#ef444440'}` }}>
                <p className="text-xs text-gray-400">Model confidence</p>
                <p className="text-xl font-extrabold font-mono" style={{ color: isQuantum ? '#00ffcc' : '#ef4444' }}>
                  {result.top_confidence}%
                </p>
              </div>
            </div>
          </div>

          {/* The AI's plain-words explanation of the model's choice */}
          {result.explanation && (
            <section aria-label="Why, in plain words" className="bg-quantum-800 border border-purple-500/30 rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="text-white font-bold text-sm">Why, in plain words</h3>
                <WrittenByAI checked="based on the model's choice" />
              </div>
              <p className="text-gray-200 text-sm leading-relaxed">{result.explanation}</p>
            </section>
          )}

          {/* Best algorithm card */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3 font-medium flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
              Best algorithm for your problem
            </p>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: top.color + '20', border: `1px solid ${top.color}50` }}>
                <Brain className="w-6 h-6" style={{ color: top.color }} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-white font-bold text-lg">{top.algorithm_name}</h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                    style={{ color: top.color, background: top.color + '18', border: `1px solid ${top.color}40` }}>
                    {top.complexity}
                  </span>
                  <span className="text-xs text-gray-400">{top.speedup} speedup</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-3">{top.reason}</p>
                <div className="flex flex-wrap gap-1.5">
                  {top.use_cases.map(uc => (
                    <span key={uc} className="text-xs bg-quantum-700 text-gray-300 px-2.5 py-1 rounded-lg">{uc}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Solve it now (FE-3) */}
          {(() => {
            const preview = result.input_preview.toLowerCase();
            const finance = /portfolio|stock|asset|invest|shares/.test(preview);
            const knap = /knapsack|budget|capacity/.test(preview);
            const target = result.top_algorithm_id === 'qaoa' && (finance || knap)
              ? { type: '', label: finance ? 'portfolio optimisation (QAOA)' : 'knapsack optimisation (QAOA)',
                  path: `/module5?example=${finance ? 'portfolio' : 'knapsack'}` }
              : SOLVE_TARGET[result.top_algorithm_id] && { ...SOLVE_TARGET[result.top_algorithm_id],
                  path: `/solve?type=${SOLVE_TARGET[result.top_algorithm_id].type}` };
            return (
              <div className="rounded-2xl p-5 border border-quantum-neon/30 bg-quantum-neon/5 flex flex-wrap items-center gap-4">
                <Play className="w-6 h-6 text-quantum-neon flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-[220px]">
                  <p className="text-white font-bold text-sm">Solve it now</p>
                  <p className="text-gray-300 text-xs leading-relaxed">
                    {target
                      ? <>Run {target.label} on your own data — both the classical and the quantum version execute, and the answers are compared.</>
                      : <>This is a simulation-style problem: explore it in the Quantum Simulator, or describe it as code in Code to Quantum.</>}
                  </p>
                </div>
                {target ? (
                  <div className="flex flex-wrap gap-2">
                    <Link to={target.path} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black"
                      style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
                      Enter my data <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                    <Link to="/module2" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white border border-quantum-600 hover:bg-quantum-700">
                      See it in Quantum vs Classical
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link to="/simulator" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black"
                      style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
                      Open the simulator <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                    <Link to="/module5" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white border border-quantum-600 hover:bg-quantum-700">
                      Code to Quantum
                    </Link>
                  </div>
                )}
              </div>
            );
          })()}

          {/* What was read from the input */}
          <button
            type="button"
            onClick={() => setShowFeatures(p => !p)}
            aria-expanded={showFeatures}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-quantum-800/50 border border-quantum-700 text-sm text-gray-300 hover:text-white hover:border-quantum-600 transition-all"
          >
            <span className="flex items-center gap-2">
              <Info className="w-4 h-4" aria-hidden="true" />
              What {result.engine === 'ai' ? 'the AI' : 'the built-in reader'} read from your problem
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showFeatures ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showFeatures && (
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 space-y-3 text-xs">
              {result.engine === 'ai' && result.summary && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-gray-200 text-sm">{result.summary}</p>
                  <WrittenByAI checked="" />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Fact label="Problem type" value={result.detected_features.category_label} />
                <Fact label="Size (N)" value={result.detected_features.data_size.toLocaleString()} />
                <Fact label="Unstructured data" value={result.detected_features.unstructured_data ? 'Yes' : 'No'} on={result.detected_features.unstructured_data} />
                <Fact label="Graph structure" value={result.detected_features.has_graph_structure ? 'Yes' : 'No'} on={result.detected_features.has_graph_structure} />
                <Fact label="Security related" value={result.detected_features.is_security_related ? 'Yes' : 'No'} on={result.detected_features.is_security_related} />
                <Fact label="Continuous variables" value={result.detected_features.continuous_vars ? 'Yes' : 'No'} on={result.detected_features.continuous_vars} />
                {result.source === 'file' && (
                  <div className="bg-quantum-900 rounded-xl p-3 col-span-2 sm:col-span-3">
                    <p className="text-gray-400 mb-1">Read from</p>
                    <p className="text-white font-semibold truncate">{result.filename}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* All algorithms ranked */}
          <div>
            <h3 className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3 px-1">All algorithms ranked by fit</h3>
            <div className="space-y-2">
              {result.recommendations.map(rec => {
                const isTop  = rec.rank === 1;
                const isOpen = expanded === rec.algorithm_id;
                return (
                  <div key={rec.algorithm_id} className="bg-quantum-800 rounded-2xl border transition-all"
                    style={{ borderColor: isTop ? rec.color + '60' : '#374151' }}>
                    <button type="button" className="w-full flex items-center gap-4 px-5 py-3.5 text-left" aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : rec.algorithm_id)}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
                        style={isTop ? { background: rec.color, color: '#000' } : { background: '#374151', color: '#d1d5db' }}>
                        {rec.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">{rec.algorithm_name}</span>
                          <span className="text-xs font-mono" style={{ color: rec.color }}>{rec.complexity}</span>
                          <span className="text-xs text-gray-400">{rec.speedup}</span>
                        </div>
                        <ConfBar value={rec.confidence} color={rec.color} />
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 border-t border-quantum-700">
                        <p className="text-gray-300 text-sm mt-3 leading-relaxed">{rec.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {rec.use_cases.map(uc => (
                            <span key={uc} className="text-xs bg-quantum-700 text-gray-300 px-2.5 py-1 rounded-lg">{uc}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button type="button" onClick={reset}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-300 border border-quantum-700 hover:border-quantum-600 hover:text-white transition-all">
            Analyse another problem
          </button>
        </div>
      )}

      {/* Empty state — example prompts */}
      {!result && !loading && (
        <div className="max-w-4xl mx-auto px-4 pb-16">
          <p className="text-xs text-gray-400 uppercase tracking-widest text-center mb-4">Try an example</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAMPLES.map(ex => (
              <button key={ex.label} type="button" onClick={() => { setText(ex.text); clearFile(); setOffTopic(null); }}
                className="flex items-start gap-3 p-4 bg-quantum-800 border border-quantum-700 rounded-xl text-left hover:border-quantum-600 transition-all group">
                <FileText className="w-4 h-4 text-gray-400 group-hover:text-orange-400 flex-shrink-0 mt-0.5 transition-colors" aria-hidden="true" />
                <span>
                  <span className="block text-white text-xs font-semibold mb-0.5">{ex.label}</span>
                  <span className="block text-gray-300 text-xs leading-relaxed">{ex.text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
