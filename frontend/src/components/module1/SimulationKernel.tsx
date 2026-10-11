import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Play, Square, Upload, XCircle } from 'lucide-react';
import type { QasmInspect, QasmProblem, SimulationResult, TheoryCheck } from '../../types';
import { kernelApi, type ExampleId } from '../../api/kernel';
import { getApiErrorMessage } from '../../api/client';
import { HowToUse } from '../shared/HowToUse';
import { OutcomeTable } from './OutcomeTable';
import { QasmEditor, goToLine, scrollToLine } from './QasmEditor';
import { MAX_STEPS, MAX_STEP_QUBITS, StepThrough } from './StepThrough';
import { AmplitudesView } from './AmplitudesView';
import { QubitsView } from './QubitsView';
import { ResultDownloads } from './ResultDownloads';
import { SaveBar, useSavedCircuit } from '../work/SaveBar';
import { usePageDetails } from '../ai/pageDetails';
import { workApi } from '../../api/work';
import { formatBytes, formatChance, formatDuration, ket } from './format';

interface Example { id: ExampleId; name: string; expect: ReactNode }

const EXAMPLES: Example[] = [
  { id: 'ghz', name: 'Entangle all (GHZ)', expect: <>All 0s or all 1s, half the time each, and nothing else.</> },
  { id: 'qft_pattern', name: 'Find a repeating pattern (QFT)', expect: <>4 evenly spaced peaks, 25% each.</> },
  { id: 'layered', name: 'Layered circuit (VQE-style)', expect: <>A spread of outcomes, some far likelier than others.</> },
  { id: 'random', name: 'Random circuit', expect: <>Outcomes spread out unevenly, with no clear winner.</> },
];
const SIZES = Array.from({ length: 27 }, (_, i) => i + 2);
const MAX_QUBITS = 28;
const MAX_FILE_CHARS = 200_000;
const SHOT_CHOICES = [100, 1024, 10000];
const BLANK = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n\nqreg q[2];\ncreg c[2];\n\n';
const SOCKET_FAILED = 'socket-failed';

class Stopped extends Error {}

/** A run that failed; `line` points into the circuit when the circuit itself is the problem. */
class RunProblem extends Error {
  constructor(message: string, readonly line: number | null = null) { super(message); }
}

interface Progress { percent: number; step: string; detail: string }
type Tab = 'outcomes' | 'steps' | 'amplitudes' | 'qubits';
const TABS: { id: Tab; label: string; short?: string }[] = [
  { id: 'outcomes', label: 'Outcomes' }, { id: 'steps', label: 'Step by step', short: 'Steps' },
  { id: 'amplitudes', label: 'Amplitudes' }, { id: 'qubits', label: 'Qubits' },
];
interface Loaded { id: ExampleId; n: number; text: string }

const nameOf = (id: string | null | undefined) => EXAMPLES.find(e => e.id === id)?.name;

/** Small number in the 10^-16 style, with a real <sup>. */
function Tiny({ x }: { x: number }) {
  if (x === 0) return <>0</>;
  const [m, e] = x.toExponential(1).split('e');
  return <>{m} × 10<sup>{Number(e)}</sup></>;
}

/** An example with a known answer: what the simulator gave against what the maths says. */
function CheckBanner({ check }: { check: Extract<TheoryCheck, { kind: 'outcomes' }> }) {
  const states = Object.keys(check.expected);
  const list = states.map(ket);
  const joined = list.length === 2 ? `${list[0]} and ${list[1]}` : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return (
    <div role="status" className={`rounded-xl p-4 border flex gap-3 ${
      check.passed ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}>
      {check.passed
        ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />}
      <div className="min-w-0">
        <p className={`font-semibold ${check.passed ? 'text-green-300' : 'text-red-300'}`}>
          {check.passed ? 'Matches the maths' : 'Does not match the maths'}
        </p>
        <p className="text-sm text-gray-200 mt-1 break-words">
          The simulator gives {joined} {formatChance(check.measured[states[0]])} each, just as the maths predicts.
          Every other outcome has no chance at all.
        </p>
        <p className="text-xs text-gray-400 mt-1">Largest difference from the maths: <Tiny x={check.max_error} /></p>
      </div>
    </div>
  );
}

/** Any other circuit: the one thing that must always hold, that every chance still adds up to 100%. */
function NormLine({ check, n }: { check: Extract<TheoryCheck, { kind: 'norm' }>; n: number }) {
  return (
    <p className={`text-sm flex items-start gap-1.5 ${check.passed ? 'text-gray-300' : 'text-red-300'}`}>
      {check.passed
        ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-400" aria-hidden="true" />
        : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />}
      <span>
        {check.passed ? <>All 2<sup>{n}</sup> chances add up to 100%</> : <>The chances add up to {check.total}, not 100%</>}
        {' '}{check.max_error === 0 ? <>(to 10 decimal places).</> : <>(off by <Tiny x={check.max_error} />).</>}
      </span>
    </p>
  );
}

/** A circuit handed to this page by the Circuit Builder or by Ask QAIbridge. */
interface Handed { qasm: string; from: 'builder' | 'assistant' }

function handedOver(state: unknown): Handed | null {
  const s = state as { qasm?: unknown; from?: unknown } | null;
  return typeof s?.qasm === 'string' ? { qasm: s.qasm, from: s.from === 'assistant' ? 'assistant' : 'builder' } : null;
}

export function SimulationKernel() {
  const [source, setSource]       = useState('');
  const [loaded, setLoaded]       = useState<Loaded | null>(null);
  const [size, setSize]           = useState(5);
  const [inspect, setInspect]     = useState<{ text: string; info: QasmInspect } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult]       = useState<SimulationResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState<Progress>({ percent: 0, step: '', detail: '' });
  const [transport, setTransport] = useState<'websocket' | 'rest' | null>(null);
  const [stopping, setStopping]   = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [runError, setRunError]   = useState<QasmProblem | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);
  const [shots, setShots]         = useState(1024);
  const [ranSource, setRanSource] = useState('');            // the circuit text the result belongs to
  const [ranShots, setRanShots]   = useState(1024);
  const [runId, setRunId]         = useState(0);
  const [tab, setTab]             = useState<Tab>('outcomes');
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const socketRef   = useRef<WebSocket | null>(null);
  const stoppingRef = useRef(false);
  const editorRef   = useRef<HTMLTextAreaElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const inspectSeq  = useRef(0);
  const ids = { circuit: useId(), editor: useId(), summary: useId(), example: useId(), size: useId(), result: useId(), shots: useId() };

  // The editor still holds an example, untouched.
  const current = loaded && source === loaded.text ? loaded : null;
  const edited = source.trim() !== '' && !current;
  const info = inspect?.text === source ? inspect.info : null;
  const problem = runError ?? (info && !info.ok ? info.error : null);

  const loadExample = useCallback(async (id: ExampleId, n: number) => {
    setFileError(null);
    try {
      const text = await kernelApi.example(id, n);
      setSource(text);
      setLoaded({ id, n, text });
      setRunError(null);
    } catch (e) {
      setFileError(getApiErrorMessage(e, "Couldn't load the example. Please try again."));
    }
  }, []);

  // Saving: once saved (or opened from My work), every change saves itself.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const content = useMemo(() => ({ qasm: source }), [source]);
  const saved = useSavedCircuit(content);
  const { attach, detach } = saved;

  // What to open: a saved circuit (?c=<id>), a circuit handed over (Circuit Builder, Ask QAIbridge), or an example.
  const location = useLocation();
  const [handed, setHanded] = useState(() => handedOver(location.state));
  const [sent] = useState(() => handed?.qasm ?? null);
  const [openId] = useState(() => Number(params.get('c')) || 0);
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (!openId) {
      if (sent) setSource(sent);
      else loadExample('ghz', 5);
      return;
    }
    workApi.circuit(openId)
      .then(c => {
        // Circuit Builder circuits open in the Builder, where their drawing lives.
        if (c.layout) { navigate(`/circuit?c=${c.id}`, { replace: true }); return; }
        setSource(c.qasm);
        setLoaded(null);
        attach(c);
      })
      .catch(() => {
        navigate('/simulator', { replace: true });
        loadExample('ghz', 5);
      });
  }, [openId, sent, loadExample, attach, navigate]);

  // A circuit handed over while the page is already open (Ask QAIbridge can do that): it starts a new, unsaved circuit.
  const arriving = handedOver(location.state);
  const arrivedKey = useRef(location.key);
  useEffect(() => {
    if (!arriving || location.key === arrivedKey.current) return;
    arrivedKey.current = location.key;
    detach();
    setSource(arriving.qasm);
    setLoaded(null);
    setResult(null);
    setRunError(null);
    setHanded(arriving);
    setParams({}, { replace: true });
  }, [arriving, location.key, detach, setParams]);

  const newCircuit = () => {
    detach();
    setParams({}, { replace: true });
    setSource(BLANK);
    setLoaded(null);
    setRunError(null);
  };

  // Leaving the page closes the socket, which stops a run still going on the server.
  useEffect(() => () => socketRef.current?.close(), []);

  // Read the circuit as it is typed (after a short pause): its size, or what to fix.
  useEffect(() => {
    if (!source.trim()) { setInspect(null); return; }
    const seq = ++inspectSeq.current;
    const t = window.setTimeout(() => {
      kernelApi.inspect(source)
        .then(res => { if (seq === inspectSeq.current) setInspect({ text: source, info: res }); })
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(t);
  }, [source]);

  // Step by step marks the current gate's line; keep it in view.
  useEffect(() => { if (activeLine) scrollToLine(editorRef.current, activeLine); }, [activeLine]);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [loading]);

  // An example or a file starts a new circuit. A saved circuit is left as it is;
  // unsaved changes are only replaced after asking.
  const okToReplace = () => {
    if (saved.attached) {
      detach();
      setParams({}, { replace: true });
      return true;
    }
    return !edited || window.confirm('Replace your circuit? The changes you made will be lost.');
  };

  const chooseExample = (id: ExampleId) => {
    if (okToReplace()) loadExample(id, size);
  };

  const chooseSize = (n: number) => {
    if (!current || !okToReplace()) return;
    setSize(n);
    loadExample(current.id, n);
  };

  const openFile = async (file: File) => {
    setFileError(null);
    if (file.size > MAX_FILE_CHARS) {
      setFileError(`${file.name} is too big. Circuit files can be up to 200 KB.`);
      return;
    }
    if (!okToReplace()) return;
    try {
      setSource(await file.text());
      setLoaded(null);
      setRunError(null);
    } catch {
      setFileError(`Couldn't read ${file.name}.`);
    }
  };

  const edit = (text: string) => {
    setSource(text);
    setRunError(null);
  };

  const runOverSocket = (text: string, shots: number) => new Promise<SimulationResult>((resolve, reject) => {
    const ws = kernelApi.socket();
    socketRef.current = ws;
    let opened = false;
    let settled = false;
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const timer = window.setTimeout(() => { if (!opened) ws.close(); }, 2500);
    ws.onopen = () => {
      opened = true;
      window.clearTimeout(timer);
      setTransport('websocket');
      ws.send(JSON.stringify({ action: 'qasm', payload: { source: text, shots } }));
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.type === 'progress') setProgress({ percent: msg.percent, step: msg.step, detail: msg.detail ?? '' });
      else if (msg.type === 'result') settle(() => resolve(msg.result));
      else if (msg.type === 'cancelled') settle(() => reject(new Stopped(msg.detail)));
      else if (msg.type === 'error') settle(() => reject(new RunProblem(msg.detail, msg.line ?? null)));
      if (msg.type !== 'progress') ws.close();
    };
    ws.onclose = () => {
      window.clearTimeout(timer);
      settle(() => reject(
        stoppingRef.current ? new Stopped('Stopped.')
        : opened ? new RunProblem('The connection to the simulator was lost. Please try again.')
        : new Error(SOCKET_FAILED)));
    };
  });

  const showProblem = (p: QasmProblem) => {
    setRunError(p);
    if (p.line) goToLine(editorRef.current, p.line);
  };

  const run = async () => {
    if (loading) return;
    const text = source;
    const measurements = shots;
    setNotice(null);
    if (!text.trim()) {
      showProblem({ message: 'Write a circuit first, upload a .qasm file, or choose an example.', line: null });
      editorRef.current?.focus();
      return;
    }
    if (info && !info.ok) { showProblem(info.error); return; }

    setLoading(true); setRunError(null); setResult(null); setTransport(null);
    stoppingRef.current = false; setStopping(false);
    setProgress({ percent: 2, step: 'Connecting to the simulator…', detail: '' });
    try {
      let data: SimulationResult;
      try {
        data = await runOverSocket(text, measurements);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== SOCKET_FAILED) throw e;
        setTransport('rest');
        setProgress({ percent: 40, step: 'Applying gates…', detail: '' });
        data = await kernelApi.runQasm(text, measurements);
      }
      setResult(data);
      setRanSource(text);
      setRanShots(measurements);
      setRunId(id => id + 1);
      setTab('outcomes');
    } catch (e) {
      if (e instanceof Stopped) {
        setNotice(`${e.message} Nothing was kept, and the server has freed the memory.`);
      } else if (e instanceof RunProblem) {
        showProblem({ message: e.message, line: e.line });
      } else {
        const message = getApiErrorMessage(e, 'The simulation failed. Please try again.');
        const line = /^Line (\d+):/.exec(message);
        showProblem({ message, line: line ? Number(line[1]) : null });
      }
    } finally {
      socketRef.current = null;
      setLoading(false);
    }
  };

  const stop = () => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    stoppingRef.current = true;
    setStopping(true);
    ws.send(JSON.stringify({ action: 'cancel' }));
    // If the server is slow to answer (e.g. still waiting for a free slot), just hang up: that stops it too.
    window.setTimeout(() => { if (socketRef.current === ws) ws.close(); }, 3000);
  };

  // What Ask QAIbridge is told about this page: the circuit, and the last result that belongs to it.
  const fresh = result && ranSource === source ? result : null;
  const askDetails = useMemo(() => {
    const lines = [`Their OpenQASM circuit${current ? ` (the "${current.id}" example, ${current.n} qubits)` : ''}:\n${source.slice(0, 2500)}`];
    if (problem) lines.push(`Problem shown${problem.line ? ` on line ${problem.line}` : ''}: ${problem.message}`);
    if (fresh) {
      const top = Object.entries(fresh.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([state, p]) => `${ket(state)} ${formatChance(p)}`).join(', ');
      lines.push(`Last run: ${fresh.n_qubits} qubits, ${fresh.gate_count} gates, ${ranShots} measurements. `
        + `Most likely outcomes: ${top}.${fresh.is_entangled ? ' The qubits are entangled.' : ''}`
        + (fresh.check ? ` Check against the textbook answer: ${fresh.check.passed ? 'passed' : 'failed'}.` : ''));
    }
    return lines.join('\n');
  }, [source, current, problem, fresh, ranShots]);
  usePageDetails('simulator', source.trim() ? askDetails : null);

  const r = result;
  const canStep = !!r && r.n_qubits <= MAX_STEP_QUBITS && r.gate_count <= MAX_STEPS;

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(TABS.findIndex(t => t.id === tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    document.getElementById(`${ids.result}-tab-${next}`)?.focus();
  };

  return (
    <div className="space-y-6 px-4 py-10">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon" aria-hidden="true" />
          Built from scratch, with no Qiskit inside
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum Simulator</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Run your own quantum circuit on QAIbridge's engine, up to {MAX_QUBITS} qubits. Write it in OpenQASM, the
          format Qiskit and IBM Quantum export, or start from an example.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Paste your circuit in <strong>OpenQASM</strong> (version 2 or 3), upload a <strong>.qasm</strong> file, or start from an example.</>,
          <>Check the line under the editor: it shows your circuit's size, or the line to fix.</>,
          <>Press <strong>Run</strong> and watch the gates being applied. You can stop at any time.</>,
          <>Read the most likely outcomes. Examples are also checked against the maths.</>,
        ]}
        outcome={<>Your circuit's most likely outcomes with their exact chances and how often each came up when measured, a gate-by-gate replay, the amplitudes and each qubit on its own, downloads of your results, and for examples a ✓ when the result matches the textbook answer.</>}
      />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* ── Your circuit ─────────────────────────────────────────── */}
        <section aria-labelledby={ids.circuit} className="bg-quantum-800 rounded-xl p-5 border border-quantum-600 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={ids.circuit} className="text-base font-semibold text-white">Your circuit</h2>
            <SaveBar saved={saved} suggestName={current ? nameOf(current.id) ?? 'My circuit' : 'My circuit'}
              onNew={newCircuit} onSaved={c => setParams({ c: String(c.id) }, { replace: true })} disabled={loading} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-quantum-600 text-gray-200 hover:border-quantum-400 disabled:opacity-50 transition-colors">
              <Upload className="w-4 h-4" aria-hidden="true" />
              Upload file
            </button>
            <input ref={fileRef} type="file" accept=".qasm,.txt,text/plain" className="hidden" tabIndex={-1}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openFile(f); }} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
            <div className="min-w-0">
              <label htmlFor={ids.example} className="block text-xs text-gray-400 mb-1">Start from an example</label>
              <select id={ids.example} value={current?.id ?? ''} disabled={loading}
                onChange={e => chooseExample(e.target.value as ExampleId)}
                className="w-full bg-quantum-700 border border-quantum-600 rounded-lg px-3 py-2 text-sm text-gray-100 disabled:opacity-50">
                <option value="" disabled>{edited ? 'Your own circuit' : 'Choose an example'}</option>
                {EXAMPLES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={ids.size} className="block text-xs text-gray-400 mb-1">Size</label>
              <select id={ids.size} value={current?.n ?? size} disabled={loading || !current}
                onChange={e => chooseSize(Number(e.target.value))}
                className="bg-quantum-700 border border-quantum-600 rounded-lg px-3 py-2 text-sm text-gray-100 disabled:opacity-50">
                {SIZES.map(n => <option key={n} value={n}>{n} qubits</option>)}
              </select>
            </div>
          </div>
          {handed && source === handed.qasm && (
            <p className="text-sm text-gray-300">
              {handed.from === 'assistant'
                ? <>Written by Ask QAIbridge. Check it, then press <strong>Run</strong>.</>
                : <>Opened from the <Link to="/circuit" className="underline hover:text-white">Circuit Builder</Link>.</>}
            </p>
          )}
          {current && (
            <p className="text-sm text-gray-300">
              <span className="text-gray-400">What you should see: </span>{EXAMPLES.find(e => e.id === current.id)?.expect}
            </p>
          )}

          <div>
            <QasmEditor
              ref={editorRef}
              id={ids.editor}
              value={source}
              onChange={edit}
              onFile={openFile}
              errorLine={problem?.line ?? null}
              activeLine={tab === 'steps' ? activeLine : null}
              labelledBy={ids.circuit}
              describedBy={ids.summary}
              disabled={loading}
              placeholder={'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0], q[1];'}
            />
            <div id={ids.summary} className="mt-2 text-sm min-h-[1.5rem]">
              {problem ? (
                // Only a failed Run is announced; problems found while typing are shown quietly.
                <p role={runError ? 'alert' : undefined} className="text-red-300 flex items-start gap-1.5 break-words">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    {problem.line ? <>Line {problem.line}: {problem.message.replace(/^Line \d+: /, '')}</> : problem.message}
                    {problem.line && (
                      <>{' '}<button type="button" onClick={() => goToLine(editorRef.current, problem.line!)}
                        className="underline text-red-200 hover:text-white">Go to line {problem.line}</button></>
                    )}
                  </span>
                </p>
              ) : info?.ok ? (
                <p className="text-gray-300">
                  {info.n_qubits} qubit{info.n_qubits === 1 ? '' : 's'} · {info.gate_count.toLocaleString()} gate{info.gate_count === 1 ? '' : 's'} ·
                  depth {info.depth.toLocaleString()} · needs {formatBytes(info.required_bytes)} of memory
                </p>
              ) : source.trim() ? (
                <p className="text-gray-400">Reading your circuit…</p>
              ) : null}
              {fileError && <p role="alert" className="text-red-300 mt-1">{fileError}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor={ids.shots} className="block text-xs text-gray-400 mb-1">Measurements</label>
              <select id={ids.shots} value={shots} disabled={loading} onChange={e => setShots(Number(e.target.value))}
                className="bg-quantum-700 border border-quantum-600 rounded-lg px-3 py-2.5 text-sm text-gray-100 disabled:opacity-50">
                {SHOT_CHOICES.map(s => <option key={s} value={s}>{s.toLocaleString()}</option>)}
              </select>
            </div>
            <button type="button" onClick={run} disabled={loading}
              className="flex-1 min-w-[10rem] flex items-center justify-center gap-2 py-2.5 px-4 bg-quantum-neon text-black font-semibold rounded-lg hover:bg-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <Play className="w-4 h-4" aria-hidden="true" />
              {loading ? 'Running…' : info?.ok ? `Run on ${info.n_qubits} qubit${info.n_qubits === 1 ? '' : 's'}` : 'Run'}
            </button>
            {loading && transport === 'websocket' && (
              <button type="button" onClick={stop} disabled={stopping}
                className="flex items-center gap-2 py-2.5 px-4 rounded-lg border border-red-700 text-red-300 hover:bg-red-900/30 disabled:opacity-50 transition-colors">
                <Square className="w-4 h-4" aria-hidden="true" />
                {stopping ? 'Stopping…' : 'Stop'}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Up to {MAX_QUBITS} qubits. Every extra qubit doubles the memory a run needs; the{' '}
            <Link to="/dashboard" className="underline hover:text-gray-200">memory-wall benchmark on the Dashboard</Link>{' '}
            shows how far that goes.
          </p>
        </section>

        {/* ── Result ───────────────────────────────────────────────── */}
        <section aria-labelledby={ids.result} className="bg-quantum-800 rounded-xl p-5 border border-quantum-600 space-y-4 min-w-0">
          <h2 id={ids.result} className="text-base font-semibold text-white">
            {r && !loading ? <>Result: {nameOf(r.example) ?? 'your circuit'} on {r.n_qubits} qubit{r.n_qubits === 1 ? '' : 's'}</> : 'Result'}
          </h2>

          {loading ? (
            <div>
              <div className="flex justify-between gap-3 text-sm mb-2">
                <span className="text-gray-200 min-w-0 break-words">
                  {progress.step}{progress.detail && <span className="text-gray-400"> · {progress.detail}</span>}
                </span>
                <span className="text-quantum-neon tabular-nums whitespace-nowrap">{elapsed} s</span>
              </div>
              <div role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
                className="w-full bg-quantum-700 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-quantum-neon to-quantum-purple rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          ) : r ? (
            <>
              {r.check?.kind === 'outcomes' && <CheckBanner check={r.check} />}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Qubits', value: r.n_qubits },
                  { label: 'Gates', value: r.gate_count.toLocaleString() },
                  { label: 'Depth', value: (r.depth ?? 0).toLocaleString() },
                  { label: 'Time', value: formatDuration(r.elapsed_ms) },
                ].map(card => (
                  <div key={card.label} className="bg-quantum-900/60 rounded-xl p-3 border border-quantum-600 text-center">
                    <dt className="text-xs text-gray-400">{card.label}</dt>
                    <dd className="text-lg font-bold text-quantum-neon mt-0.5 tabular-nums">{card.value}</dd>
                  </div>
                ))}
              </dl>
              {r.check?.kind === 'norm' && <NormLine check={r.check} n={r.n_qubits} />}
              <div>
                <div className="relative overflow-x-auto mb-3">
                <div role="tablist" aria-label="Ways to look at the result" onKeyDown={onTabKey}
                  className="flex sm:gap-1 border-b border-quantum-600 min-w-max">
                  {TABS.map(t => (
                    <button key={t.id} type="button" role="tab" id={`${ids.result}-tab-${t.id}`}
                      aria-selected={tab === t.id} aria-controls={`${ids.result}-panel`} tabIndex={tab === t.id ? 0 : -1}
                      onClick={() => setTab(t.id)} aria-label={t.short ? t.label : undefined}
                      className={`px-2.5 sm:px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t.id
                        ? 'border-quantum-neon text-white font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
                      {t.short ? <><span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span></> : t.label}
                    </button>
                  ))}
                </div>
                </div>
                <div role="tabpanel" id={`${ids.result}-panel`} aria-labelledby={`${ids.result}-tab-${tab}`}>
                  {tab === 'outcomes' ? (
                    <>
                      <OutcomeTable result={r} shots={ranShots} />
                      {canStep && (
                        <p className="text-sm text-gray-300 mt-3">
                          Want to see how it got here?{' '}
                          <button type="button" onClick={() => setTab('steps')} className="underline text-quantum-neon hover:text-teal-200">
                            Watch it step by step
                          </button>
                        </p>
                      )}
                    </>
                  ) : tab === 'steps' ? (
                    <StepThrough key={runId} source={ranSource} nQubits={r.n_qubits} gateCount={r.gate_count}
                      edited={source !== ranSource} onLine={setActiveLine} />
                  ) : tab === 'amplitudes' ? (
                    <AmplitudesView key={runId} result={r} />
                  ) : (
                    <QubitsView result={r} />
                  )}
                </div>
              </div>
              <ResultDownloads result={r} source={ranSource} shots={ranShots}
                slug={(nameOf(r.example) ?? 'circuit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')} />
            </>
          ) : notice ? (
            <p role="status" className="text-sm text-gray-200">{notice}</p>
          ) : (
            <p className="text-sm text-gray-400">Run the circuit to see its most likely outcomes here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
