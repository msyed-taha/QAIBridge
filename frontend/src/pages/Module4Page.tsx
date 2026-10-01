import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Upload, FileText, X, ChevronDown, Zap, Cpu, Info, CheckCircle, AlertCircle, ArrowRight, Play } from 'lucide-react';

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlgoRec {
  rank: number;
  algorithm_id: string;
  algorithm_name: string;
  confidence: number;
  color: string;
  complexity: string;
  speedup: string;
  reason: string;
  use_cases: string[];
}

interface DetectedFeatures {
  category_label: string;
  data_size: number;
  unstructured_data: boolean;
  has_graph_structure: boolean;
  is_security_related: boolean;
  continuous_vars: boolean;
  periodic_structure: boolean;
}

interface AdviseResponse {
  approach: 'Quantum' | 'Classical';
  approach_reason: string;
  top_algorithm_id: string;
  top_algorithm_name: string;
  top_confidence: number;
  recommendations: AlgoRec[];
  detected_features: DetectedFeatures;
  source: string;
  filename?: string;
  input_preview: string;
}

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

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-quantum-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right text-gray-400">{value.toFixed(1)}%</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Module4Page() {
  const [text, setText]                 = useState('');
  const [file, setFile]                 = useState<File | null>(null);
  const [dragging, setDragging]         = useState(false);
  const [result, setResult]             = useState<AdviseResponse | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [revealResult, setRevealResult] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const handedOff = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  const ACCEPTED = '.pdf,.docx,.doc,.csv,.txt,.md,.json,.tex,.rtf';

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setError(''); }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(''); }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // `problem` overrides the text box (used for a question handed over from the
  // app home page); `reveal` scrolls the answer into view once it arrives.
  const analyze = async (problem = text, reveal = false) => {
    if (!problem.trim() && !file) {
      setError('Please enter a problem description or upload a file.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        res = await fetch('/api/module4/advise-file', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/module4/advise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem_text: problem }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || `Server error ${res.status}`);
      }
      const data: AdviseResponse = await res.json();
      setResult(data);
      setExpanded(data.top_algorithm_id);
      setRevealResult(reveal);
    } catch (e: unknown) {
      setError((e as Error).message || 'Request failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  // A question asked on the app home page arrives as router state: fill it in
  // and analyse it straight away. The state is then cleared, so reloading or
  // coming back to this page doesn't ask it again.
  useEffect(() => {
    const problem = (location.state as { problem?: unknown } | null)?.problem;
    if (handedOff.current || typeof problem !== 'string' || !problem.trim()) return;
    handedOff.current = true;
    setText(problem);
    navigate(location.pathname, { replace: true, state: null });
    analyze(problem, true);
  }, []);

  useEffect(() => {
    if (!revealResult || !result || loading) return;
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setRevealResult(false);
  }, [revealResult, result, loading]);

  const reset = () => {
    setResult(null);
    setText('');
    clearFile();
    setShowFeatures(false);
    setExpanded(null);
  };

  const isQuantum = result?.approach === 'Quantum';

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
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #f97316, #cc44ff)' }}
            >
              Get the Best Approach.
            </span>
          </h1>
          <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
            Type your problem in plain English — or upload a file (PDF, Word, CSV, etc.).
            The AI tells you whether{' '}
            <span className="text-quantum-neon font-medium">Quantum</span> or{' '}
            <span className="text-red-400 font-medium">Classical</span>{' '}
            computing is the best approach, and which algorithm to use.
          </p>
        </div>
      </section>

      {/* Input area */}
      <div className="max-w-4xl mx-auto px-4 pb-6 space-y-4">

        {/* Text area */}
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
          <label className="block text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">
            Describe Your Problem
          </label>
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            disabled={!!file}
            rows={6}
            placeholder={
              file
                ? 'File selected — remove it to type instead.'
                : 'Examples:\n• "I need to search 50 million unsorted records to find a match."\n• "I want to factorise a large RSA-2048 number to test cryptographic strength."\n• "Find the shortest route visiting 200 cities — the Travelling Salesman Problem."\n• "Simulate the ground state energy of a hydrogen molecule for drug discovery."'
            }
            className={`w-full bg-quantum-900 border border-quantum-600 text-white rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:border-orange-500 transition-colors placeholder-gray-600 ${file ? 'opacity-40 cursor-not-allowed' : ''}`}
          />
          <p className="text-xs text-gray-600 mt-1.5">
            The more detail you give (data size, whether it is sorted, graph structure, security context), the more accurate the recommendation.
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-quantum-700" />
          <span className="text-xs text-gray-600 font-medium uppercase tracking-wider">or upload a file</span>
          <div className="flex-1 h-px bg-quantum-700" />
        </div>

        {/* File upload */}
        {!file ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-orange-500 bg-orange-900/10' : 'border-quantum-600 hover:border-quantum-500 hover:bg-quantum-800/50'}`}
          >
            <Upload className={`w-8 h-8 mx-auto mb-3 transition-colors ${dragging ? 'text-orange-400' : 'text-gray-600'}`} />
            <p className="text-white font-semibold text-sm mb-1">Drag &amp; drop your file here</p>
            <p className="text-gray-500 text-xs mb-3">or click to browse</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['PDF', 'Word', 'CSV', 'TXT', 'JSON', 'Markdown'].map(t => (
                <span key={t} className="text-[10px] bg-quantum-700 text-gray-400 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-quantum-700 flex items-center justify-center text-xl flex-shrink-0">
              {getFileIcon(file.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{file.name}</p>
              <p className="text-gray-500 text-xs">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={clearFile}
              className="w-8 h-8 rounded-lg bg-quantum-700 hover:bg-red-900/40 flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={() => analyze()}
          disabled={loading || (!text.trim() && !file)}
          className="w-full py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-[1.01] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{ background: 'linear-gradient(90deg, #f97316, #cc44ff)' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analysing your problem…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" />
              {file ? 'Analyse File' : 'Analyse Problem'}
            </span>
          )}
        </button>

      </div>

      {/* Results section */}
      {result && !loading && (
        <div ref={resultsRef} className="max-w-4xl mx-auto px-4 pb-16 space-y-5 scroll-mt-20">

          {/* Verdict banner */}
          <div
            className="rounded-2xl p-6 border relative overflow-hidden"
            style={
              isQuantum
                ? { background: 'linear-gradient(135deg,#00ffcc10,#cc44ff10)', borderColor: '#00ffcc40' }
                : { background: 'linear-gradient(135deg,#ef444410,#f9731610)', borderColor: '#ef444440' }
            }
          >
            <div className="flex items-start gap-5 flex-wrap">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${isQuantum ? 'bg-gradient-to-br from-teal-500 to-cyan-400' : 'bg-gradient-to-br from-red-500 to-orange-400'}`}>
                {isQuantum ? <Zap className="w-8 h-8 text-white" /> : <Cpu className="w-8 h-8 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Recommended Approach</p>
                <h2
                  className="text-3xl font-extrabold mb-1"
                  style={{ color: isQuantum ? '#00ffcc' : '#ef4444' }}
                >
                  {isQuantum ? 'Quantum Approach' : 'Classical Approach'}
                </h2>
                <p className="text-gray-300 text-sm leading-relaxed">{result.approach_reason}</p>
              </div>
              <div
                className="flex-shrink-0 text-center px-4 py-2 rounded-xl"
                style={{
                  background: isQuantum ? '#00ffcc15' : '#ef444415',
                  border: `1px solid ${isQuantum ? '#00ffcc40' : '#ef444440'}`,
                }}
              >
                <p className="text-xs text-gray-500">AI confidence</p>
                <p className="text-xl font-extrabold font-mono" style={{ color: isQuantum ? '#00ffcc' : '#ef4444' }}>
                  {result.top_confidence}%
                </p>
              </div>
            </div>
          </div>

          {/* Best algorithm card */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-medium flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              Best Algorithm for Your Problem
            </p>
            <div className="flex items-start gap-4 flex-wrap">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: result.recommendations[0].color + '20',
                  border: `1px solid ${result.recommendations[0].color}50`,
                }}
              >
                <Brain className="w-6 h-6" style={{ color: result.recommendations[0].color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-white font-bold text-lg">{result.recommendations[0].algorithm_name}</h3>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded-full"
                    style={{
                      color: result.recommendations[0].color,
                      background: result.recommendations[0].color + '18',
                      border: `1px solid ${result.recommendations[0].color}40`,
                    }}
                  >
                    {result.recommendations[0].complexity}
                  </span>
                  <span className="text-xs text-gray-500">{result.recommendations[0].speedup} speedup</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-3">{result.recommendations[0].reason}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.recommendations[0].use_cases.map(uc => (
                    <span key={uc} className="text-[11px] bg-quantum-700 text-gray-300 px-2.5 py-1 rounded-lg">{uc}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Solve it now (FE-3) */}
          {(() => {
            const preview = String((result as any).input_preview ?? '').toLowerCase();
            const finance = /portfolio|stock|asset|invest|shares/.test(preview);
            const knap = /knapsack|budget|capacity/.test(preview);
            const target = result.top_algorithm_id === 'qaoa' && (finance || knap)
              ? { type: '', label: finance ? 'portfolio optimisation (QAOA)' : 'knapsack optimisation (QAOA)',
                  path: `/module5?example=${finance ? 'portfolio' : 'knapsack'}` }
              : SOLVE_TARGET[result.top_algorithm_id] && { ...SOLVE_TARGET[result.top_algorithm_id],
                  path: `/solve?type=${SOLVE_TARGET[result.top_algorithm_id].type}` };
            return (
              <div className="rounded-2xl p-5 border border-quantum-neon/30 bg-quantum-neon/5 flex flex-wrap items-center gap-4">
                <Play className="w-6 h-6 text-quantum-neon flex-shrink-0" />
                <div className="flex-1 min-w-[220px]">
                  <p className="text-white font-bold text-sm">Solve it now</p>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {target
                      ? <>Run {target.label} on your own data — both the classical and the quantum version execute, and the answers are compared.</>
                      : <>This is a simulation-style problem: explore it on the QAIBridge simulation kernel, or describe it as code in the Logic Transformer.</>}
                  </p>
                </div>
                {target ? (
                  <div className="flex flex-wrap gap-2">
                    <Link to={target.path}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black"
                      style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
                      Enter my data <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link to="/module2" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white border border-quantum-600 hover:bg-quantum-700">
                      See it in the SFOD Suite
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link to="/simulator" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-black"
                      style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
                      Open the simulator <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link to="/module5" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-white border border-quantum-600 hover:bg-quantum-700">
                      Logic Transformer
                    </Link>
                  </div>
                )}
              </div>
            );
          })()}

          {/* What AI detected toggle */}
          <button
            onClick={() => setShowFeatures(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-quantum-800/50 border border-quantum-700 text-sm text-gray-400 hover:text-white hover:border-quantum-600 transition-all"
          >
            <span className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              What the AI detected from your input
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showFeatures ? 'rotate-180' : ''}`} />
          </button>

          {showFeatures && (
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Problem Type</p>
                <p className="text-white font-semibold">{result.detected_features.category_label}</p>
              </div>
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Estimated N</p>
                <p className="text-white font-semibold font-mono">{result.detected_features.data_size.toLocaleString()}</p>
              </div>
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Unstructured Data</p>
                <p className={result.detected_features.unstructured_data ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {result.detected_features.unstructured_data ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Graph Structure</p>
                <p className={result.detected_features.has_graph_structure ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {result.detected_features.has_graph_structure ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Security Related</p>
                <p className={result.detected_features.is_security_related ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {result.detected_features.is_security_related ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="bg-quantum-900 rounded-xl p-3">
                <p className="text-gray-500 mb-1">Continuous Variables</p>
                <p className={result.detected_features.continuous_vars ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {result.detected_features.continuous_vars ? 'Yes' : 'No'}
                </p>
              </div>
              {result.source === 'file' && (
                <div className="bg-quantum-900 rounded-xl p-3 col-span-2 sm:col-span-3">
                  <p className="text-gray-500 mb-1">Extracted from</p>
                  <p className="text-white font-semibold truncate">{result.filename}</p>
                </div>
              )}
            </div>
          )}

          {/* All algorithms ranked */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 px-1">All Algorithms Ranked by Fit</p>
            <div className="space-y-2">
              {result.recommendations.map(rec => {
                const isTop  = rec.rank === 1;
                const isOpen = expanded === rec.algorithm_id;
                return (
                  <div
                    key={rec.algorithm_id}
                    className="bg-quantum-800 rounded-2xl border transition-all"
                    style={{ borderColor: isTop ? rec.color + '60' : '#374151' }}
                  >
                    <button
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
                      onClick={() => setExpanded(isOpen ? null : rec.algorithm_id)}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
                        style={isTop ? { background: rec.color, color: '#000' } : { background: '#374151', color: '#9ca3af' }}
                      >
                        {rec.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">{rec.algorithm_name}</span>
                          <span className="text-xs font-mono" style={{ color: rec.color }}>{rec.complexity}</span>
                          <span className="text-xs text-gray-600">{rec.speedup}</span>
                        </div>
                        <ConfBar value={rec.confidence} color={rec.color} />
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 border-t border-quantum-700">
                        <p className="text-gray-300 text-sm mt-3 leading-relaxed">{rec.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {rec.use_cases.map(uc => (
                            <span key={uc} className="text-[11px] bg-quantum-700 text-gray-400 px-2.5 py-1 rounded-lg">{uc}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reset button */}
          <button
            onClick={reset}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-400 border border-quantum-700 hover:border-quantum-600 hover:text-white transition-all"
          >
            Analyse Another Problem
          </button>

        </div>
      )}

      {/* Empty state — example prompts */}
      {!result && !loading && (
        <div className="max-w-4xl mx-auto px-4 pb-16">
          <p className="text-xs text-gray-600 uppercase tracking-widest text-center mb-4">Try an example</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Search Problem',    text: 'I need to find a specific record in an unsorted database of 10 million entries.' },
              { label: 'Crypto / Factoring', text: 'I need to factorise a large RSA-2048 integer to test cryptographic strength.' },
              { label: 'Optimisation',      text: 'Find the shortest route visiting 500 cities — the Travelling Salesman Problem with a graph of nodes and edges.' },
              { label: 'Quantum Chemistry', text: 'Simulate the ground state energy of a hydrogen molecule for drug discovery involving continuous molecular orbitals.' },
            ].map(ex => (
              <button
                key={ex.label}
                onClick={() => { setText(ex.text); clearFile(); }}
                className="flex items-start gap-3 p-4 bg-quantum-800 border border-quantum-700 rounded-xl text-left hover:border-quantum-600 transition-all group"
              >
                <FileText className="w-4 h-4 text-gray-600 group-hover:text-orange-400 flex-shrink-0 mt-0.5 transition-colors" />
                <div>
                  <p className="text-white text-xs font-semibold mb-0.5">{ex.label}</p>
                  <p className="text-gray-500 text-xs leading-relaxed">{ex.text}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
