import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Bot, Brain, CheckCircle2, ChevronRight, Code2, Cpu, Loader2, Play, RefreshCw,
  Sparkles, Terminal, WifiOff, XCircle, Zap,
} from 'lucide-react';
import { HowToUse } from '../components/shared/HowToUse';
import { CodeBlock } from '../components/shared/CodeBlock';
import { GroverViews, ShorViews, SideBySide, TspViews } from '../components/module2/SfodResultViews';
import { LogicView, QaoaProblemView } from '../components/module5/TransformerViews';
import {
  transformerApi, type ClassicalRun, type EngineStatus, type Example, type ProblemSpec, type TransformResult,
} from '../api/transformer';
import { getApiErrorMessage } from '../api/client';

const TYPE_LABEL: Record<string, string> = {
  search: 'Unstructured search', database: 'Database query', factoring: 'Integer factoring',
  tsp: 'Route optimisation (TSP)', knapsack: 'Knapsack optimisation', maxcut: 'Graph Max-Cut',
  partition: 'Number partitioning', portfolio: 'Portfolio selection (finance)', boolean: 'Boolean logic / SAT',
  unsupported: 'No quantum advantage',
};

const PIPELINE = ['Understand', 'Bridge', 'Circuit', 'Run', 'Verify', 'Export'];

const STARTER = `# Paste classical code here, or pick an example above.
def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1

arr = [3, 14, 7, 42, 5, 9, 26, 11]
print(linear_search(arr, 26))
`;

function EngineBadge({ engine }: { engine: EngineStatus | null }) {
  if (!engine) return null;
  return engine.enabled ? (
    <span className="inline-flex items-center gap-1.5 text-xs text-purple-200 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1">
      <Bot className="w-3.5 h-3.5" /> AI engine: {engine.provider} · {engine.model}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1"
      title={engine.how_to_enable ?? ''}>
      <WifiOff className="w-3.5 h-3.5" /> Offline analyzer (no LLM key configured)
    </span>
  );
}

function PipelineBar({ reached }: { reached: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {PIPELINE.map((p, i) => (
        <div key={p} className="flex items-center gap-1.5">
          <span className={`text-xs px-3 py-1 rounded-full border ${
            i < reached ? 'border-quantum-neon/50 text-quantum-neon bg-quantum-neon/10' : 'border-quantum-700 text-gray-500'}`}>
            {i + 1}. {p}
          </span>
          {i < PIPELINE.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-700" />}
        </div>
      ))}
    </div>
  );
}

export function Module5Page() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [examples, setExamples] = useState<Example[]>([]);
  const [code, setCode] = useState(STARTER);
  const [mode, setMode] = useState<'auto' | 'local' | 'llm'>('auto');
  const [layers, setLayers] = useState(2);

  const [spec, setSpec] = useState<ProblemSpec | null>(null);
  const [specText, setSpecText] = useState('');
  const [specError, setSpecError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);
  const [classicalRun, setClassicalRun] = useState<ClassicalRun | null>(null);

  const [busy, setBusy] = useState<'analyze' | 'execute' | 'classical' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    transformerApi.status().then(setEngine).catch(() => undefined);
    transformerApi.examples().then(list => {
      setExamples(list);
      const wanted = list.find(ex => ex.id === searchParams.get('example'));   // e.g. from the Module 4 advisor
      if (wanted) setCode(wanted.code);
    }).catch(() => undefined);
  }, [searchParams]);

  const loadExample = (ex: Example) => {
    setCode(ex.code);
    setSpec(null);
    setResult(null);
    setClassicalRun(null);
    setError(null);
  };

  const runPipeline = async (useSpec?: ProblemSpec) => {
    setError(null);
    setResult(null);
    try {
      let s = useSpec;
      if (!s) {
        setBusy('analyze');
        s = (await transformerApi.analyze(code, mode)).spec;
        setSpec(s);
        setSpecText(JSON.stringify(s.parameters, null, 2));
      }
      setBusy('execute');
      setResult(await transformerApi.execute(s, layers, 1024));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Transformation failed'));
    } finally {
      setBusy(null);
    }
  };

  const rerunWithEditedParams = () => {
    if (!spec) return;
    try {
      const params = JSON.parse(specText);
      setSpecError(null);
      const edited = { ...spec, parameters: params };
      setSpec(edited);
      runPipeline(edited);
    } catch {
      setSpecError('The parameters are not valid JSON.');
    }
  };

  const runClassical = async () => {
    setBusy('classical');
    setClassicalRun(null);
    try {
      setClassicalRun(await transformerApi.runClassical(code));
    } catch (e) {
      setClassicalRun({ output: '', error: getApiErrorMessage(e, 'Could not run the code'), success: false, time_ms: 0 });
    } finally {
      setBusy(null);
    }
  };

  const reached = result ? (result.supported ? 6 : 1) : spec ? 1 : 0;
  const details = result?.details;

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          Module 5 — Classical → Quantum Logic Transformer
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">From Classical Code to a Verified Quantum Circuit</h1>
        <p className="text-gray-400 text-sm max-w-2xl mx-auto mb-3">
          The engine reads your code, the Mathematical Bridge turns it into a Hamiltonian or oracle, the circuit runs on
          QAIBridge's simulator, and the quantum answer is checked against the classical one.
        </p>
        <EngineBadge engine={engine} />
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Pick an example or paste your own Python (or a Boolean formula such as <span className="font-mono">(a and not b) or c</span>).</>,
          <>Optionally click <strong>Run classically</strong> to execute it in the sandbox.</>,
          <>Click <strong>Transform &amp; run on quantum</strong>. The engine explains what it understood; you can edit the extracted parameters and re-run.</>,
          <>Read the pipeline: the QUBO / Hamiltonian or oracle, the circuit size, the measured answer and the verification ✓ — then export the Qiskit code.</>,
        ]}
        outcome={<>A step-by-step translation with the Hamiltonian, probability charts, a correctness check against the classical answer and runnable Qiskit code. Sorting-style code gets an honest "no quantum speed-up" answer instead of a fake one.</>}
      />

      {/* ── Examples ── */}
      {examples.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {examples.map(ex => (
            <button key={ex.id} onClick={() => loadExample(ex)}
              className="text-left px-3 py-2 rounded-xl border border-quantum-700 bg-quantum-800 hover:border-quantum-neon/40 transition-all">
              <span className="block text-xs text-white font-semibold">{ex.label}</span>
              <span className="block text-[10px] text-gray-500">{ex.family}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Editor + controls ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Code2 className="w-4 h-4 text-quantum-neon" />
            <span className="text-white font-bold text-sm">Classical code</span>
            <span className="ml-auto text-[10px] text-gray-500">{code.split('\n').length} lines</span>
          </div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-72 bg-quantum-900 border border-quantum-700 rounded-xl p-3 font-mono text-xs text-gray-200 leading-relaxed focus:outline-none focus:border-quantum-neon/50 resize-y"
          />
        </div>
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Understanding engine</p>
            <div className="grid grid-cols-3 gap-1">
              {(['auto', 'llm', 'local'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} disabled={m === 'llm' && !engine?.enabled}
                  className={`text-xs py-1.5 rounded-lg border ${mode === m ? 'border-quantum-neon text-quantum-neon bg-quantum-neon/10' : 'border-quantum-600 text-gray-400'} disabled:opacity-30`}>
                  {m === 'auto' ? 'Auto' : m === 'llm' ? 'AI (LLM)' : 'Offline'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
              {engine?.enabled
                ? 'Auto uses the LLM and falls back to the offline analyzer if the API is unreachable.'
                : engine?.how_to_enable ?? 'Offline analyzer parses Python with the ast module.'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">QAOA depth p = {layers} <span className="text-gray-600">(optimisation problems)</span></p>
            <input type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} className="w-full accent-purple-400" />
          </div>
          <button onClick={() => runPipeline()} disabled={busy !== null || !code.trim()}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg,#cc44ff,#00ffcc)' }}>
            {busy === 'analyze' ? <><Loader2 className="w-4 h-4 animate-spin" />Understanding the code…</>
              : busy === 'execute' ? <><Loader2 className="w-4 h-4 animate-spin" />Building & running the circuit…</>
              : <><Sparkles className="w-4 h-4" />Transform &amp; run on quantum</>}
          </button>
          <button onClick={runClassical} disabled={busy !== null || !code.trim()}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-white border border-quantum-600 hover:bg-quantum-700 disabled:opacity-60">
            {busy === 'classical' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
            Run classically (sandbox)
          </button>
        </div>
      </div>

      {classicalRun && (
        <div className={`rounded-2xl border p-4 mb-6 ${classicalRun.success ? 'border-quantum-700 bg-quantum-800' : 'border-red-800 bg-red-950/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-red-400" />
            <span className="text-white font-bold text-sm">Classical run</span>
            <span className="ml-auto text-xs text-gray-500">{classicalRun.time_ms} ms · isolated sandbox</span>
          </div>
          {classicalRun.output && <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap max-h-48 overflow-auto">{classicalRun.output}</pre>}
          {classicalRun.error && <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap max-h-40 overflow-auto mt-2">{classicalRun.error}</pre>}
        </div>
      )}

      {error && <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>}

      {(spec || result) && <PipelineBar reached={reached} />}

      {/* ── Step 1: what the engine understood ── */}
      {spec && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-purple-300" />
            <h3 className="text-white font-bold text-sm">1 · What the engine understood</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-quantum-neon/10 border border-quantum-neon/30 text-quantum-neon">
              {TYPE_LABEL[spec.problem_type] ?? spec.problem_type}
            </span>
            <span className="text-xs text-gray-400">→ {spec.quantum_algorithm}</span>
            <span className="ml-auto text-xs text-gray-500">
              {spec.engine === 'llm' ? `LLM (${spec.llm?.model ?? ''})` : 'offline analyzer'} · confidence {(spec.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed mb-3">{spec.explanation}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Evidence</p>
              <ul className="space-y-1">
                {spec.evidence.map((e, i) => <li key={i} className="text-xs text-gray-400">• {e}</li>)}
              </ul>
            </div>
            {spec.problem_type !== 'unsupported' && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Extracted parameters (editable)</p>
                <textarea value={specText} onChange={e => setSpecText(e.target.value)} spellCheck={false}
                  className="w-full h-32 bg-quantum-900 border border-quantum-700 rounded-lg p-2 font-mono text-[11px] text-gray-200 focus:outline-none focus:border-quantum-neon/50" />
                {specError && <p className="text-xs text-red-400">{specError}</p>}
                <button onClick={rerunWithEditedParams} disabled={busy !== null}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-quantum-neon border border-quantum-neon/40 rounded-lg px-3 py-1.5 hover:bg-quantum-neon/10 disabled:opacity-50">
                  <RefreshCw className="w-3.5 h-3.5" /> Re-run with these parameters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Unsupported: honest answer ── */}
      {result && !result.supported && (
        <div className="bg-amber-950/20 border border-amber-700/50 rounded-2xl p-5 mb-5">
          <p className="text-amber-200 font-bold text-sm mb-1">No genuine quantum speed-up for this code</p>
          <p className="text-amber-100/80 text-sm leading-relaxed">{result.reason}</p>
        </div>
      )}

      {/* ── Steps 2-6 ── */}
      {result && result.supported && (
        <>
          <div className={`rounded-2xl border p-5 mb-5 ${result.verification?.match ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-amber-600/40 bg-amber-500/5'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.verification?.match
                ? <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                : <XCircle className="w-5 h-5 text-amber-300" />}
              <p className="text-white font-bold text-sm">
                {result.verification?.match ? 'Verified — the quantum answer matches the classical answer' : 'Check the result'}
              </p>
              {result.total_ms != null && <span className="ml-auto text-xs text-gray-500">{(result.total_ms / 1000).toFixed(2)} s end-to-end</span>}
            </div>
            <p className="text-xs text-gray-400 mb-3">{result.verification?.detail}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {result.stages.map((s, i) => (
                <div key={i} className="bg-quantum-900/60 border border-quantum-700 rounded-xl p-3">
                  <p className="text-[11px] font-bold text-quantum-neon mb-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> {s.title}
                  </p>
                  <p className="text-[11px] text-gray-300 leading-relaxed">{s.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {details && ['search', 'database'].includes(result.problem_type) && (<><SideBySide result={details} /><GroverViews result={details} /></>)}
          {details && result.problem_type === 'factoring' && (<><SideBySide result={details} /><ShorViews result={details} /></>)}
          {details && result.problem_type === 'tsp' && details.algorithm === 'optimization' && (<><SideBySide result={details} /><TspViews result={details} /></>)}
          {details && ['knapsack', 'maxcut', 'partition', 'portfolio'].includes(result.problem_type) && <QaoaProblemView kind={result.problem_type} details={details} />}
          {details && result.problem_type === 'tsp' && details.algorithm !== 'optimization' && <QaoaProblemView kind="tsp" details={details} />}
          {details && result.problem_type === 'boolean' && <LogicView details={details} />}

          {result.qiskit && (
            <CodeBlock code={result.qiskit} title="6 · Export — runnable Qiskit code"
              subtitle="the exact circuit that ran here, ready for Qiskit Aer or IBM Quantum" />
          )}
        </>
      )}

      {!spec && !result && (
        <div className="flex items-center justify-center bg-quantum-800 border border-quantum-700 border-dashed rounded-2xl p-10 text-center">
          <div>
            <Zap className="w-10 h-10 text-purple-400 mx-auto mb-3 opacity-60" />
            <p className="text-gray-500 text-sm">Choose an example or paste code, then click</p>
            <p className="text-white font-semibold text-sm">Transform &amp; run on quantum</p>
          </div>
        </div>
      )}
    </div>
  );
}
