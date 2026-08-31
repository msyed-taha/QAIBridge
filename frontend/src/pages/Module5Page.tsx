import { useState, useRef, useEffect } from 'react';
import {
  Play, Zap, Code2, ChevronRight, Copy, Check,
  AlertCircle, Clock, Cpu, Layers, TrendingUp,
  BookOpen, FlaskConical, RotateCcw, Info
} from 'lucide-react';
import apiClient, { getApiErrorMessage } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClassicalResult {
  output: string;
  error: string;
  success: boolean;
  time_ms: number;
  note?: string;
}

interface TransformResult {
  pattern: string;
  algo_name: string;
  speedup_type: string;
  quantum_code: string;
  steps: string[];
  params: Record<string, unknown>;
  note: string;
}

interface QuantumSimResult {
  pattern: string;
  result: Record<string, unknown>;
}

interface Example {
  id: string;
  label: string;
  language: string;
  code: string;
}

// ── Pattern display info ───────────────────────────────────────────────────────

const PATTERN_INFO: Record<string, { label: string; color: string; icon: string }> = {
  search:       { label: 'Search',       color: '#00ffcc', icon: '🔍' },
  factoring:    { label: 'Factoring',    color: '#cc44ff', icon: '🔢' },
  sorting:      { label: 'Sorting',      color: '#f97316', icon: '📊' },
  matrix:       { label: 'Matrix Ops',  color: '#3b82f6', icon: '🧮' },
  optimization: { label: 'Optimization',color: '#22c55e', icon: '⚡' },
  general:      { label: 'General',      color: '#9ca3af', icon: '💡' },
};

// Transform/pattern-detection works language-agnostically (it's static keyword
// matching, not execution), so all of these stay selectable for that. Only
// "Run Classical" actually executes code server-side, and that's Python-only.
const LANGUAGES = ['python', 'javascript', 'typescript', 'c++', 'java', 'go', 'ruby', 'rust'];

// ── Code editor with line numbers ─────────────────────────────────────────────

function CodeEditor({
  value, onChange, language
}: { value: string; onChange: (v: string) => void; language: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineRef     = useRef<HTMLDivElement>(null);

  const lines = value.split('\n').length;
  const lineNums = Array.from({ length: Math.max(lines, 20) }, (_, i) => i + 1);

  const syncScroll = () => {
    if (textareaRef.current && lineRef.current) {
      lineRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta    = textareaRef.current!;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const next  = value.substring(0, start) + '    ' + value.substring(end);
      onChange(next);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 4; }, 0);
    }
  };

  return (
    <div className="relative flex border border-quantum-600 rounded-xl overflow-hidden font-mono text-sm"
      style={{ background: '#0a0d14', minHeight: '320px' }}>
      {/* Line numbers */}
      <div ref={lineRef}
        className="select-none overflow-hidden flex-shrink-0 text-right pr-3 pl-3 pt-3"
        style={{ color: '#4b5563', background: '#0f1118', minWidth: '44px', overflowY: 'hidden' }}>
        {lineNums.map(n => (
          <div key={n} style={{ lineHeight: '1.5rem', fontSize: '12px' }}>{n}</div>
        ))}
      </div>
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleTab}
        spellCheck={false}
        placeholder={`# Enter your ${language} code here…\n# Use the examples below or write your own`}
        className="flex-1 resize-none bg-transparent text-gray-200 p-3 focus:outline-none leading-6 text-xs"
        style={{ caretColor: '#00ffcc', minHeight: '320px', tabSize: 4 }}
      />
    </div>
  );
}

// ── Output terminal ────────────────────────────────────────────────────────────

function Terminal({ output, error, success, time_ms }: {
  output: string; error: string; success: boolean; time_ms: number;
}) {
  if (!output && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-3 bg-quantum-900/50 rounded-xl border border-quantum-700/50">
        <Play className="w-8 h-8 text-gray-600" />
        <p className="text-gray-500 text-sm">Click "Run Classical" to execute your code</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border font-mono text-xs overflow-hidden"
      style={{ borderColor: success ? '#00ffcc30' : '#ef444430', background: '#070a10' }}>
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: '#0f1118', borderColor: success ? '#00ffcc20' : '#ef444420' }}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${success ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-gray-400 text-xs">{success ? 'Execution successful' : 'Execution error'}</span>
        </div>
        <span className="text-gray-600 text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" /> {time_ms}ms
        </span>
      </div>
      {/* Output */}
      <div className="p-4 max-h-64 overflow-y-auto">
        {output && (
          <pre className="text-green-300 whitespace-pre-wrap leading-relaxed">{output}</pre>
        )}
        {error && (
          <pre className="text-red-400 whitespace-pre-wrap leading-relaxed mt-2">{error}</pre>
        )}
      </div>
    </div>
  );
}

// ── Quantum code block ────────────────────────────────────────────────────────

function QuantumCodeBlock({ data }: { data: TransformResult }) {
  const [copied, setCopied] = useState(false);
  const pi = PATTERN_INFO[data.pattern] || PATTERN_INFO.general;

  const copy = () => {
    navigator.clipboard.writeText(data.quantum_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Algorithm banner */}
      <div className="rounded-2xl p-4 border flex items-center justify-between flex-wrap gap-3"
        style={{ background: pi.color + '08', borderColor: pi.color + '40' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{pi.icon}</span>
            <span className="text-xs uppercase tracking-wide font-medium"
              style={{ color: pi.color }}>{pi.label} pattern detected</span>
          </div>
          <h3 className="text-white font-bold text-base">{data.algo_name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{data.speedup_type}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-1">Quantum framework</p>
          <span className="text-xs font-bold px-2 py-1 rounded-lg"
            style={{ color: pi.color, background: pi.color + '20' }}>Qiskit 1.x</span>
        </div>
      </div>

      {/* Transformation steps */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> How the transformation works
        </p>
        <div className="space-y-2">
          {data.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-black mt-0.5"
                style={{ background: pi.color }}>
                {i + 1}
              </div>
              <p className="text-gray-300 text-xs leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Qiskit code */}
      <div className="rounded-xl border overflow-hidden"
        style={{ borderColor: pi.color + '30', background: '#070a10' }}>
        <div className="flex items-center justify-between px-4 py-2 border-b"
          style={{ background: '#0f1118', borderColor: pi.color + '20' }}>
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5" style={{ color: pi.color }} />
            <span className="text-xs font-mono" style={{ color: pi.color }}>quantum_equivalent.py</span>
          </div>
          <button onClick={copy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-quantum-700">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="p-4 text-xs text-gray-300 overflow-x-auto max-h-96 leading-relaxed font-mono whitespace-pre">
          {data.quantum_code}
        </pre>
      </div>

      {/* Note */}
      <div className="flex items-start gap-2 bg-blue-950/30 border border-blue-800/50 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-300">{data.note}</p>
      </div>
    </div>
  );
}

// ── Quantum simulation result ─────────────────────────────────────────────────

function QuantumResult({ data }: { data: QuantumSimResult }) {
  const r  = data.result;
  const pi = PATTERN_INFO[data.pattern] || PATTERN_INFO.general;

  const renderRows = () => {
    const rows: { label: string; value: string; highlight?: boolean }[] = [];
    const add = (label: string, value: unknown, highlight = false) => {
      if (value !== undefined && value !== null && value !== '') {
        rows.push({ label, value: String(value), highlight });
      }
    };

    if (data.pattern === 'search') {
      add('Algorithm', r.algo as string);
      add('Result', r.summary as string, true);
      add('Found index', String(r.found_index), true);
      add('Success', (r.success as boolean) ? '✅ Yes' : '❌ No', true);
      add('Target probability', `${r.target_prob_pct}%`);
      add('Grover iterations', String(r.iterations));
      add('Classical steps', String(r.classical_steps));
      add('Quantum steps', String(r.quantum_steps));
      add('Speedup', `${r.speedup}×`, true);
      add('Complexity', r.complexity_class as string);
    } else if (data.pattern === 'factoring') {
      add('Algorithm', r.algo as string);
      add('Result', r.summary as string, true);
      add('Factors', (r.factors as number[]).join(' × '), true);
      add('Period r', String(r.period_r));
      add('Base a', String(r.base_a));
      add('Classical ops', String(r.classical_ops));
      add('Quantum ops', String(r.quantum_ops));
      add('Speedup', `${r.speedup}×`, true);
      add('Complexity', r.complexity_class as string);
    } else if (data.pattern === 'sorting') {
      add('Algorithm', r.algo as string);
      add('Summary', r.summary as string, true);
      add('Input', (r.input_array as number[]).join(', '));
      add('Sorted', (r.sorted_array as number[]).join(', '), true);
      add('Classical comparisons', String(r.classical_comparisons));
      add('Quantum circuit depth', String(r.quantum_depth));
      add('Depth speedup', `${r.speedup}×`, true);
      add('Complexity', r.complexity_class as string);
    } else if (data.pattern === 'optimization') {
      add('Algorithm', r.algo as string);
      add('Summary', r.summary as string, true);
      add('Selected items', (r.selected_items as string[]).join(', '), true);
      add('Total cost', `$${r.total_cost}`);
      add('Total value', String(r.total_value), true);
      add('Budget', `$${r.budget}`);
      add('Classical steps', String(r.classical_steps));
      add('Quantum steps', String(r.quantum_steps));
      add('Speedup', `${r.speedup}×`, true);
      add('Complexity', r.complexity_class as string);
    } else {
      add('Summary', r.summary as string, true);
      add('Qubits', String(r.n_qubits));
      add('States in superposition', String(r.n_states));
      add('Entanglement type', r.entanglement as string);
      add('Note', r.speedup_note as string);
    }
    return rows;
  };

  const rows = renderRows();

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="rounded-2xl p-4 border"
        style={{ background: pi.color + '08', borderColor: pi.color + '40' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{pi.icon}</span>
          <span className="text-sm font-bold text-white">Quantum Simulation Complete</span>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ color: pi.color, background: pi.color + '20' }}>
            numpy state-vector
          </span>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{String(r.summary)}</p>
      </div>

      {/* Metrics table */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        {rows.map((row, i) => (
          <div key={i}
            className={`flex items-start justify-between px-4 py-2.5 border-b border-quantum-700/40 last:border-0 ${row.highlight ? 'bg-quantum-700/20' : ''}`}>
            <span className="text-xs text-gray-500 flex-shrink-0 w-36">{row.label}</span>
            <span className={`text-xs font-mono text-right ${row.highlight ? 'font-bold' : 'text-gray-400'}`}
              style={row.highlight ? { color: pi.color } : {}}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Top states (search only) */}
      {data.pattern === 'search' && Array.isArray(r.top_states) && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
            Top measurement states
          </p>
          {(r.top_states as { index: number; prob_pct: number }[]).map((s, i) => (
            <div key={i} className="flex items-center gap-3 mb-1.5">
              <span className="text-xs font-mono text-gray-500 w-16 flex-shrink-0">index {s.index}</span>
              <div className="flex-1 h-2 bg-quantum-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${s.prob_pct}%`, background: pi.color }} />
              </div>
              <span className="text-xs font-mono w-12 text-right flex-shrink-0"
                style={{ color: pi.color }}>{s.prob_pct}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Speedup callout */}
      {Boolean(r.speedup) && (
        <div className="flex items-center gap-3 bg-quantum-800 border border-quantum-700 rounded-2xl px-4 py-3">
          <TrendingUp className="w-5 h-5 text-quantum-neon flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-bold">{String(r.speedup)}× quantum speedup</p>
            <p className="text-gray-500 text-xs">{String(r.complexity_class)}</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-quantum-800/50 border border-quantum-700/50 rounded-xl px-3 py-2.5">
        <Info className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500">
          Simulated using numpy state-vector (no quantum hardware required).
          The Qiskit code in the Transform tab runs on real quantum simulators or IBM hardware.
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'classical' | 'transform' | 'quantum';

export function Module5Page() {
  const [language, setLanguage]           = useState('python');
  const [code, setCode]                   = useState('');
  const [examples, setExamples]           = useState<Example[]>([]);
  const [activeTab, setActiveTab]         = useState<Tab>('classical');

  const [classicalResult, setClassicalResult] = useState<ClassicalResult | null>(null);
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null);
  const [quantumResult,   setQuantumResult]   = useState<QuantumSimResult | null>(null);

  const [loadingC, setLoadingC] = useState(false);
  const [loadingT, setLoadingT] = useState(false);
  const [loadingQ, setLoadingQ] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load examples on mount
  useEffect(() => {
    apiClient.get('/api/module5/examples')
      .then(({ data }) => setExamples(data.examples || []))
      .catch(() => {});
  }, []);

  const loadExample = (ex: Example) => {
    setCode(ex.code);
    setLanguage(ex.language);
    setClassicalResult(null);
    setTransformResult(null);
    setQuantumResult(null);
    setErrorMsg('');
  };

  const runClassical = async () => {
    if (!code.trim()) { setErrorMsg('Please enter some code first.'); return; }
    if (language !== 'python') { setErrorMsg('Classical execution currently supports Python only.'); return; }
    setLoadingC(true); setErrorMsg(''); setClassicalResult(null); setActiveTab('classical');
    try {
      const { data } = await apiClient.post<ClassicalResult>('/api/module5/run-classical', { code, language });
      setClassicalResult(data);
    } catch (e: unknown) {
      setErrorMsg(getApiErrorMessage(e, 'Backend not running?'));
    } finally { setLoadingC(false); }
  };

  const runTransform = async () => {
    if (!code.trim()) { setErrorMsg('Please enter some code first.'); return; }
    setLoadingT(true); setErrorMsg(''); setTransformResult(null); setActiveTab('transform');
    try {
      const { data } = await apiClient.post<TransformResult>('/api/module5/transform', { code, language });
      setTransformResult(data);
    } catch (e: unknown) {
      setErrorMsg(getApiErrorMessage(e, 'Backend not running?'));
    } finally { setLoadingT(false); }
  };

  const runQuantum = async () => {
    if (!code.trim()) { setErrorMsg('Please enter some code first.'); return; }
    setLoadingQ(true); setErrorMsg(''); setQuantumResult(null); setActiveTab('quantum');
    try {
      const { data } = await apiClient.post<QuantumSimResult>('/api/module5/run-quantum', {
        code, language,
        pattern: transformResult?.pattern ?? null,
      });
      setQuantumResult(data);
    } catch (e: unknown) {
      setErrorMsg(getApiErrorMessage(e, 'Backend not running?'));
    } finally { setLoadingQ(false); }
  };

  const clear = () => {
    setCode(''); setClassicalResult(null); setTransformResult(null);
    setQuantumResult(null); setErrorMsg('');
  };

  const detectedPattern = transformResult?.pattern;
  const pi = detectedPattern ? PATTERN_INFO[detectedPattern] : null;

  return (
    <div className="min-h-screen">

      {/* ── Header ── */}
      <section className="px-6 pt-12 pb-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-purple-500 opacity-5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-60 h-60 bg-teal-500 opacity-5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
            Classical Code{' '}
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #a855f7, #00ffcc)' }}>
              → Quantum
            </span>
          </h1>
          <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
            Paste any classical code. Run it, transform it to{' '}
            <span className="text-purple-400 font-medium">Qiskit quantum code</span>,
            and simulate the quantum execution — all in one place.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <div className="max-w-4xl mx-auto px-4 mb-8">
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: '1', icon: <Play className="w-4 h-4" />, label: 'Run Classical', desc: 'Execute your Python code and see the output', color: '#22c55e' },
            { step: '2', icon: <Zap className="w-4 h-4" />, label: 'Transform', desc: 'AI detects pattern → generates Qiskit quantum code', color: '#a855f7' },
            { step: '3', icon: <FlaskConical className="w-4 h-4" />, label: 'Run Quantum', desc: 'Simulate the quantum equivalent with speedup stats', color: '#00ffcc' },
          ].map(s => (
            <div key={s.step} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4 text-center">
              <div className="w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center"
                style={{ background: s.color + '20', color: s.color }}>
                {s.icon}
              </div>
              <p className="text-white text-sm font-semibold mb-1">
                <span className="text-xs mr-1.5 opacity-50">Step {s.step}</span>{s.label}
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body: Editor + Output ── */}
      <div className="max-w-7xl mx-auto px-4 pb-16 grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── LEFT: Code editor ── */}
        <div className="space-y-4">

          {/* Language + clear */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Language:</span>
              <div className="flex gap-1">
                {LANGUAGES.map(lang => (
                  <button key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                      language === lang
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'text-gray-500 hover:text-gray-300 border border-transparent'
                    }`}>
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            {code && (
              <button onClick={clear}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Code editor */}
          <CodeEditor value={code} onChange={setCode} language={language} />

          {/* Example buttons */}
          {examples.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Example snippets:
              </p>
              <div className="flex flex-wrap gap-2">
                {examples.map(ex => {
                  const info = PATTERN_INFO[ex.id] || PATTERN_INFO.general;
                  return (
                    <button key={ex.id} onClick={() => loadExample(ex)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:scale-[1.02]"
                      style={{
                        color: info.color,
                        borderColor: info.color + '40',
                        background: info.color + '10',
                      }}>
                      <span>{info.icon}</span>
                      {ex.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detected pattern badge */}
          {pi && detectedPattern && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
              style={{ borderColor: pi.color + '40', background: pi.color + '08' }}>
              <span>{pi.icon}</span>
              <span className="text-gray-400">Pattern detected:</span>
              <span className="font-semibold" style={{ color: pi.color }}>{pi.label}</span>
              <span className="text-gray-500 ml-1">— {transformResult?.algo_name}</span>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 bg-red-950/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3">
            {/* Run Classical */}
            <button onClick={runClassical} disabled={loadingC}
              title={language !== 'python' ? 'Classical execution is Python-only' : undefined}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 border"
              style={{ background: '#22c55e15', borderColor: '#22c55e40', color: '#22c55e' }}>
              {loadingC
                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                : <Play className="w-4 h-4" />
              }
              <span>Run Classical</span>
            </button>

            {/* Transform to Quantum */}
            <button onClick={runTransform} disabled={loadingT}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 border"
              style={{ background: '#a855f715', borderColor: '#a855f740', color: '#a855f7' }}>
              {loadingT
                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                : <Zap className="w-4 h-4" />
              }
              <span>Transform</span>
            </button>

            {/* Run Quantum */}
            <button onClick={runQuantum} disabled={loadingQ}
              className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl font-semibold text-xs transition-all hover:scale-[1.02] hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 border"
              style={{ background: '#00ffcc15', borderColor: '#00ffcc40', color: '#00ffcc' }}>
              {loadingQ
                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                : <FlaskConical className="w-4 h-4" />
              }
              <span>Run Quantum</span>
            </button>
          </div>

          {/* Quick guide */}
          <div className="bg-quantum-800/50 border border-quantum-700/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-400" />
              <span>
                <strong className="text-gray-400">Tip:</strong> Use the example buttons to load a pre-built snippet.
                Click <strong className="text-green-400">Run Classical</strong> to execute it,{' '}
                <strong className="text-purple-400">Transform</strong> to see the Qiskit quantum equivalent,
                then <strong className="text-quantum-neon">Run Quantum</strong> to simulate the quantum result.
              </span>
            </p>
          </div>
        </div>

        {/* ── RIGHT: Output panel ── */}
        <div className="space-y-4">

          {/* Tabs */}
          <div className="flex bg-quantum-800 border border-quantum-700 rounded-xl p-1 gap-1">
            {([
              { id: 'classical', icon: <Play className="w-3.5 h-3.5" />,       label: 'Classical Output', hasResult: !!classicalResult },
              { id: 'transform', icon: <Zap className="w-3.5 h-3.5" />,        label: 'Quantum Code',     hasResult: !!transformResult },
              { id: 'quantum',   icon: <FlaskConical className="w-3.5 h-3.5" />, label: 'Quantum Output',  hasResult: !!quantumResult  },
            ] as { id: Tab; icon: React.ReactNode; label: string; hasResult: boolean }[]).map(tab => (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all relative ${
                  activeTab === tab.id ? 'bg-quantum-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.hasResult && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-quantum-neon" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-[400px]">

            {/* ─ Classical output ─ */}
            {activeTab === 'classical' && (
              <div>
                {!classicalResult && !loadingC && (
                  <div className="flex flex-col items-center justify-center h-64 text-center gap-4 bg-quantum-800/30 border border-quantum-700/50 rounded-2xl">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#22c55e20' }}>
                      <Play className="w-6 h-6 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">Run your code classically</p>
                      <p className="text-gray-500 text-sm mt-1">
                        Supports Python execution. See stdout, stderr, and runtime.
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-600">
                      <div className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> Python 3</div>
                      <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 10s timeout</div>
                    </div>
                  </div>
                )}
                {loadingC && (
                  <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Executing code…
                  </div>
                )}
                {classicalResult && !loadingC && (
                  <Terminal
                    output={classicalResult.output}
                    error={classicalResult.error}
                    success={classicalResult.success}
                    time_ms={classicalResult.time_ms}
                  />
                )}
              </div>
            )}

            {/* ─ Quantum code ─ */}
            {activeTab === 'transform' && (
              <div>
                {!transformResult && !loadingT && (
                  <div className="flex flex-col items-center justify-center h-64 text-center gap-4 bg-quantum-800/30 border border-quantum-700/50 rounded-2xl">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#a855f720' }}>
                      <Zap className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">Transform to quantum</p>
                      <p className="text-gray-500 text-sm mt-1">
                        Auto-detects your algorithm and generates the Qiskit equivalent
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {Object.values(PATTERN_INFO).map(p => (
                        <span key={p.label} className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ color: p.color, borderColor: p.color + '40', background: p.color + '10' }}>
                          {p.icon} {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {loadingT && (
                  <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analysing and transforming code…
                  </div>
                )}
                {transformResult && !loadingT && (
                  <QuantumCodeBlock data={transformResult} />
                )}
              </div>
            )}

            {/* ─ Quantum output ─ */}
            {activeTab === 'quantum' && (
              <div>
                {!quantumResult && !loadingQ && (
                  <div className="flex flex-col items-center justify-center h-64 text-center gap-4 bg-quantum-800/30 border border-quantum-700/50 rounded-2xl">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: '#00ffcc15' }}>
                      <FlaskConical className="w-6 h-6 text-quantum-neon" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">Run quantum simulation</p>
                      <p className="text-gray-500 text-sm mt-1">
                        numpy state-vector simulation — see speedup, probability, and quantum results
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <ChevronRight className="w-3.5 h-3.5" />
                      No Qiskit required — runs instantly in the browser
                    </div>
                  </div>
                )}
                {loadingQ && (
                  <div className="flex items-center justify-center h-64 gap-3 text-gray-400">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Running quantum simulation…
                  </div>
                )}
                {quantumResult && !loadingQ && (
                  <QuantumResult data={quantumResult} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
