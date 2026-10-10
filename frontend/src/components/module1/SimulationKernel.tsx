import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Play, Square, XCircle } from 'lucide-react';
import type { MemoryCheckResponse, SimulationResult, TheoryCheck } from '../../types';
import { kernelApi, type KernelPreset } from '../../api/kernel';
import { getApiErrorMessage } from '../../api/client';
import { HowToUse } from '../shared/HowToUse';
import { BlochSphere } from '../module3/BlochSphere';
import { OutcomeTable } from './OutcomeTable';
import { MemoryWall } from './MemoryWall';
import { formatBytes, formatChance, formatDuration, ket, stateBytes } from './format';

type CircuitId = Exclude<KernelPreset, 'qft'>;

interface Circuit {
  id: CircuitId;
  name: string;
  blurb: ReactNode;
  expect: (n: number) => ReactNode;
  min: number;
  max: number;
}

const ones = (n: number) => '1'.repeat(n);

const CIRCUITS: Circuit[] = [
  { id: 'ghz', name: 'GHZ state', min: 2, max: 28,
    blurb: 'Every qubit linked together.',
    expect: n => <>All 0s or all 1s, half the time each: {ket(`|${'0'.repeat(n)}>`)} or {ket(`|${ones(n)}>`)}.</> },
  { id: 'bell', name: 'Bell pair', min: 2, max: 2,
    blurb: 'Two linked qubits that always agree.',
    expect: () => <>|00⟩ or |11⟩, half the time each. Never |01⟩ or |10⟩.</> },
  { id: 'grover', name: 'Grover search', min: 2, max: 16,
    blurb: <>Finds one marked item among 2<sup>n</sup>.</>,
    expect: n => <>The marked item {ket(`|${ones(n)}>`)} almost every time, after about √(2<sup>{n}</sup>) rounds.</> },
  { id: 'qft_pattern', name: 'Pattern finder (QFT)', min: 2, max: 28,
    blurb: 'Finds how often a pattern repeats, the key step in Shor’s algorithm.',
    expect: () => <>The input repeats every 4 steps, so the result is 4 evenly spaced peaks, 25% each.</> },
  { id: 'ansatz', name: 'Layered circuit', min: 2, max: 28,
    blurb: 'Layers of turns and links, the shape used by VQE and QAOA.',
    expect: () => <>A spread of outcomes. The check: all chances still add up to exactly 100%.</> },
];

const SHOTS = 1024;
const SOCKET_FAILED = 'socket-failed';

class Stopped extends Error {}

interface Progress { percent: number; step: string; detail: string }
interface Finished { circuit: Circuit; n: number; data: SimulationResult }

/** Small number in the 10^-16 style, with a real <sup>. */
function Tiny({ x }: { x: number }) {
  if (x === 0) return <>0</>;
  const [m, e] = x.toExponential(1).split('e');
  return <>{m} × 10<sup>{Number(e)}</sup></>;
}

function CheckBanner({ check, n, gates }: { check: TheoryCheck; n: number; gates: number }) {
  let body: ReactNode;
  if (check.kind === 'outcomes') {
    const states = Object.keys(check.expected);
    const values = Object.values(check.expected);
    const same = values.every(v => v === values[0]);
    const list = states.map(ket);
    const joined = list.length === 2 ? `${list[0]} and ${list[1]}` : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    body = same
      ? <>The simulator gives {joined} {formatChance(check.measured[states[0]])} each, just as the maths predicts. Every other outcome has no chance at all.</>
      : <>The simulator gives {states.map(s => `${ket(s)} ${formatChance(check.measured[s])}`).join(', ')}, just as the maths predicts.</>;
  } else if (check.kind === 'marked') {
    const [state, expected] = Object.entries(check.expected)[0];
    body = <>The marked item {ket(state)} comes out {formatChance(check.measured[state])} of the time. The maths predicts {formatChance(expected)}.</>;
  } else if (check.kind === 'norm') {
    body = <>All 2<sup>{n}</sup> chances add up to 100%, so no chance was lost over {gates.toLocaleString()} gates.</>;
  } else {
    body = <>Every outcome has the same chance, 1 in {(2 ** n).toLocaleString()}, just as the maths predicts.</>;
  }
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
        <p className="text-sm text-gray-200 mt-1 break-words">{body}</p>
        <p className="text-xs text-gray-400 mt-1">Largest difference from the maths: <Tiny x={check.max_error} /></p>
      </div>
    </div>
  );
}

export function SimulationKernel() {
  const [circuit, setCircuit]   = useState<Circuit>(CIRCUITS[0]);
  const [n, setN]               = useState(10);
  const [mem, setMem]           = useState<MemoryCheckResponse | null>(null);
  const [limitBytes, setLimit]  = useState<number | null>(null);
  const [result, setResult]     = useState<Finished | null>(null);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState<Progress>({ percent: 0, step: '', detail: '' });
  const [transport, setTransport] = useState<'websocket' | 'rest' | null>(null);
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const [notice, setNotice]     = useState<string | null>(null);
  const socketRef   = useRef<WebSocket | null>(null);
  const stoppingRef = useRef(false);
  const sliderId = useId();
  const pickHeading = useId();

  // Leaving the page closes the socket, which stops a run still going on the server.
  useEffect(() => () => socketRef.current?.close(), []);

  // Memory check for the chosen size (after the slider settles).
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      kernelApi.memoryCheck(n)
        .then(m => { if (live) { setMem(m); setLimit(m.limit_bytes); } })
        .catch(() => undefined);
    }, 150);
    return () => { live = false; window.clearTimeout(t); };
  }, [n]);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [loading]);

  const choose = (c: Circuit) => {
    setCircuit(c);
    setN(v => Math.min(c.max, Math.max(c.min, v)));
  };

  const runOverSocket = (preset: CircuitId, qubits: number) => new Promise<SimulationResult>((resolve, reject) => {
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
      ws.send(JSON.stringify({ action: 'preset', payload: { preset, n_qubits: qubits, shots: SHOTS } }));
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.type === 'progress') setProgress({ percent: msg.percent, step: msg.step, detail: msg.detail ?? '' });
      else if (msg.type === 'result') settle(() => resolve(msg.result));
      else if (msg.type === 'cancelled') settle(() => reject(new Stopped(msg.detail)));
      else if (msg.type === 'error') settle(() => reject(new Error(msg.detail)));
      if (msg.type !== 'progress') ws.close();
    };
    ws.onclose = () => {
      window.clearTimeout(timer);
      settle(() => reject(
        stoppingRef.current ? new Stopped('Stopped.')
        : opened ? new Error('The connection to the simulator was lost. Please try again.')
        : new Error(SOCKET_FAILED)));
    };
  });

  const run = async () => {
    if (loading) return;
    if (mem && mem.n_qubits === n && !mem.is_safe) {
      setNotice(null);
      setError(`${n} qubits need ${formatBytes(stateBytes(n))}, more than the ${formatBytes(mem.limit_bytes)} this server can spare right now. Try fewer qubits.`);
      return;
    }
    const started = { circuit, n };
    setLoading(true); setError(null); setNotice(null); setResult(null); setTransport(null);
    stoppingRef.current = false; setStopping(false);
    setProgress({ percent: 2, step: 'Connecting to the simulator…', detail: '' });
    try {
      let data: SimulationResult;
      try {
        data = await runOverSocket(circuit.id, n);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== SOCKET_FAILED) throw e;
        setTransport('rest');
        setProgress({ percent: 40, step: 'Applying gates…', detail: '' });
        data = await kernelApi.preset(circuit.id, n, SHOTS);
      }
      setResult({ ...started, data });
    } catch (e) {
      if (e instanceof Stopped) setNotice(`${e.message} Nothing was kept, and the server has freed the memory.`);
      else setError(getApiErrorMessage(e, 'The simulation failed. Please try again.'));
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

  const fits = !mem || mem.n_qubits !== n || mem.is_safe;
  const r = result?.data;

  return (
    <div className="space-y-6 px-4 py-10">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-quantum-neon" aria-hidden="true" />
          Built from scratch, with no Qiskit inside
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum Simulator</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          QAIbridge's own simulator, written in Python and NumPy. It follows every one of the 2<sup>n</sup> possible
          outcomes exactly, up to 28 qubits when memory allows, and its answers match Qiskit's on more than 70 test circuits.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Choose a <strong>circuit</strong>. Each one says what you should see.</>,
          <>Choose how many <strong>qubits</strong>. The memory check tells you whether it fits.</>,
          <>Press <strong>Run</strong> and watch the gates being applied live. You can stop at any time.</>,
          <>Read the result: the most likely outcomes, and a check against the maths.</>,
        ]}
        outcome={<>A ✓ when the simulator's chances match the textbook answer, a table of the most likely outcomes, one sphere per qubit for small circuits, and the memory wall.</>}
      />

      <section aria-labelledby={pickHeading} className="bg-quantum-800 rounded-xl p-5 border border-quantum-600 space-y-6">
        <div>
          <h2 id={pickHeading} className="text-base font-semibold text-white mb-3">1. Choose a circuit</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CIRCUITS.map(c => {
              const on = c.id === circuit.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => choose(c)} disabled={loading}
                  className={`flex flex-col justify-start text-left rounded-lg px-3 py-2.5 border transition-colors disabled:cursor-not-allowed ${
                    on ? 'bg-quantum-500/40 border-quantum-neon' : 'bg-quantum-700 border-quantum-600 hover:border-quantum-400'}`}>
                  <span className={`block text-sm font-semibold ${on ? 'text-white' : 'text-gray-200'}`}>{c.name}</span>
                  <span className="block text-xs text-gray-400 mt-0.5 leading-snug">{c.blurb}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-gray-300 mt-3 break-words">
            <span className="text-gray-400">What you should see: </span>{circuit.expect(n)}
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">2. Choose the size</h2>
          {circuit.min === circuit.max ? (
            <p className="text-sm text-gray-300">A {circuit.name} always uses {circuit.min} qubits.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <label htmlFor={sliderId} className="text-sm text-gray-300">Qubits</label>
                <span className="text-lg font-bold text-quantum-neon tabular-nums">{n}</span>
              </div>
              <input id={sliderId} type="range" min={circuit.min} max={circuit.max} value={n} disabled={loading}
                onChange={e => setN(Number(e.target.value))}
                aria-valuetext={`${n} qubits`}
                className="w-full accent-[#00ffcc] cursor-pointer disabled:cursor-not-allowed" />
              <div className="flex justify-between text-xs text-gray-400 mt-1" aria-hidden="true">
                <span>{circuit.min}</span><span>{circuit.max}</span>
              </div>
            </>
          )}
          <p className="text-sm text-gray-300 mt-3">
            2<sup>{n}</sup> = {(2 ** n).toLocaleString()} possible outcomes, which needs <strong className="text-white">{formatBytes(stateBytes(n))}</strong> of memory.
          </p>
          {mem && mem.n_qubits === n && (
            <p className={`text-sm mt-1 flex items-start gap-1.5 ${fits ? 'text-green-300' : 'text-amber-300'}`}>
              {fits ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />}
              {fits ? <>Fits. This server can spare up to {formatBytes(mem.limit_bytes)} right now.</>
                    : <>Too big right now: this server can spare only {formatBytes(mem.limit_bytes)}.</>}
            </p>
          )}
          {n >= 26 && <p className="text-sm text-gray-400 mt-1">Big runs can take a minute or two. You can stop at any time.</p>}
          {n >= 23 && n <= 25 && <p className="text-sm text-gray-400 mt-1">This may take a few seconds.</p>}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={run} disabled={loading}
            className="flex-1 min-w-[12rem] flex items-center justify-center gap-2 py-2.5 px-4 bg-quantum-neon text-black font-semibold rounded-lg hover:bg-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <Play className="w-4 h-4" aria-hidden="true" />
            {loading ? 'Running…' : `Run ${circuit.name} on ${n} qubits`}
          </button>
          {loading && transport === 'websocket' && (
            <button type="button" onClick={stop} disabled={stopping}
              className="flex items-center gap-2 py-2.5 px-4 rounded-lg border border-red-700 text-red-300 hover:bg-red-900/30 disabled:opacity-50 transition-colors">
              <Square className="w-4 h-4" aria-hidden="true" />
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
      </section>

      {loading && (
        <div className="bg-quantum-800 rounded-xl p-4 border border-quantum-600">
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
      )}

      {error && (
        <div role="alert" className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span className="break-words min-w-0">{error}</span>
        </div>
      )}
      {notice && <p role="status" className="bg-quantum-800 border border-quantum-600 rounded-xl p-4 text-sm text-gray-200">{notice}</p>}

      {result && r && !loading && (
        <section aria-labelledby="sim-result" className="space-y-4">
          <h2 id="sim-result" className="text-lg font-semibold text-white">
            Result: {result.circuit.name} on {result.n} qubits
          </h2>
          {r.check && <CheckBanner check={r.check} n={r.n_qubits} gates={r.gate_count} />}

          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Qubits', value: r.n_qubits },
              { label: 'Gates', value: r.gate_count.toLocaleString() },
              { label: 'Depth', value: (r.depth ?? 0).toLocaleString() },
              { label: 'Time', value: formatDuration(r.elapsed_ms) },
              { label: 'Entangled', value: r.is_entangled ? 'Yes' : 'No' },
            ].map(card => (
              <div key={card.label} className="bg-quantum-800 rounded-xl p-4 border border-quantum-600 text-center last:col-span-2 sm:last:col-span-1">
                <dt className="text-xs text-gray-400">{card.label}</dt>
                <dd className="text-xl font-bold text-quantum-neon mt-1 tabular-nums">{card.value}</dd>
              </div>
            ))}
          </dl>

          <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
            <h3 className="text-base font-semibold text-white mb-3">Most likely outcomes</h3>
            <OutcomeTable result={r} shots={SHOTS} />
          </div>

          {r.bloch && r.bloch.length > 0 && r.n_qubits <= 8 && (
            <div className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
              <h3 className="text-base font-semibold text-white mb-1">Each qubit on its own</h3>
              <p className="text-sm text-gray-400 mb-3">
                Arrow up means 0, down means 1. A short dashed arrow means the qubit is entangled with others,
                so it has no state of its own.
              </p>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {r.bloch.map(b => (
                  <BlochSphere key={b.qubit} qubit={b.qubit} x={b.x} y={b.y} z={b.z} entangled={b.purity < 1 - 1e-6} size={124} />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            {transport === 'rest'
              ? 'Run on the QAIbridge server.'
              : 'Run on the QAIbridge server, with live progress over a WebSocket.'}
          </p>
        </section>
      )}

      <section aria-labelledby="sim-wall" className="bg-quantum-800 rounded-xl p-5 border border-quantum-600">
        <h2 id="sim-wall" className="text-base font-semibold text-white mb-1">The memory wall</h2>
        <p className="text-sm text-gray-400 mb-2">
          Every extra qubit doubles the memory a simulator needs. The dashed line is the most one run may use on this
          server right now: 85% of its free memory, and never more than 5 GB.
        </p>
        <MemoryWall qubits={n} limitBytes={limitBytes} />
      </section>
    </div>
  );
}
