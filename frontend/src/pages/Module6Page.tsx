import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Activity, BookOpen, ChevronDown, Loader2, Play, TrendingDown } from 'lucide-react';
import { optimizerApi, type PlateauStudy, type RaceMethod, type RaceResult, type Shots } from '../api/optimizer';
import { getApiErrorMessage } from '../api/client';
import { HowToUse } from '../components/shared/HowToUse';
import { QaoaAnglePredictor } from '../components/module6/QaoaAnglePredictor';
import { METHOD_COLORS, METHOD_ORDER, MonitorChart, PlateauStudyChart, RaceChart } from '../components/module6/charts';
import { usePageDetails } from '../components/ai/pageDetails';

const METHOD_TEXT: Record<RaceMethod, string> = {
  random: 'every angle random between 0 and 2π: the usual default.',
  rescued: 'the same random start, watched by the plateau monitor, which restarts it near zero if it gets stuck.',
  near_zero: 'every angle close to 0, so the circuit starts close to doing nothing.',
  neural: 'a small neural network outputs all the angles. It starts near zero, and training adjusts the network instead of the angles.',
};

const PRESETS = [
  { name: 'Small', n: 3, layers: 2, note: 'no plateau expected' },
  { name: 'Deep', n: 8, layers: 16, note: 'a plateau starts' },
  { name: 'Deeper', n: 10, layers: 20, note: 'a strong plateau' },
];

const SHOTS: { value: Shots; label: string; note: string }[] = [
  { value: 1000, label: '1,000 shots', note: 'a typical setting on real hardware' },
  { value: 100, label: '100 shots', note: 'quick and cheap, so noisier' },
  { value: 0, label: 'Exact', note: 'a perfect simulator: no measurement noise' },
];

const GLOSSARY = [
  ['Gradient', 'How much the result changes when one angle is nudged. Training follows it downhill.'],
  ['Shot', 'One run and measurement of the circuit. A measured value is an average over many shots, so it carries noise of about 1/√shots.'],
  ['Barren plateau', 'A training landscape so flat that its gradients are smaller than the noise in measuring them. It gets exponentially worse as deep, randomly started circuits grow.'],
  ['Near-zero start', 'Every angle starts close to 0, so the circuit starts close to doing nothing. Its gradients keep their size as it grows.'],
  ['Neural Angle Optimizer', 'A small neural network whose output is the circuit\'s angles. Training adjusts the network\'s weights; its output starts near zero.'],
  ['Signal ÷ noise', 'How much of a measured gradient is real change rather than measurement noise. Below 1, noise dominates.'],
  ['QAOA angles (γ, β)', 'The two angles in each layer of the QAOA algorithm, normally tuned with hundreds of circuit runs.'],
  ['Approximation ratio', 'The cut QAOA finds divided by the best possible cut. 1.0 is perfect.'],
];

const fmt = (v: number, d = 3) => v.toFixed(d);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 border bg-quantum-900 border-quantum-700">
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="font-bold text-lg" style={{ color: color ?? '#fff' }}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ step, title, icon, children }: { step: number; title: string; icon: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 sm:p-6 mb-6">
      <h2 id={id} className="flex items-center gap-2 text-white font-bold text-lg mb-2">
        {icon}<span className="text-gray-400 font-normal">{step} ·</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Numbers({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-quantum-neon hover:text-white">{summary}</summary>
      <div className="overflow-x-auto mt-2">{children}</div>
    </details>
  );
}

/** One sentence on what the race showed, from its own numbers. */
function headline(r: RaceResult): string {
  const m = r.methods;
  const best = m[r.best];
  const name = (k: RaceMethod) => (k === 'neural' ? m[k].label : m[k].label.toLowerCase());
  const size = `With ${r.n_qubits} qubits and ${r.layers} layer${r.layers > 1 ? 's' : ''}`;
  const stepsOf = (k: RaceMethod) => median(m[k].steps_to_target.filter((s): s is number => s !== null)) ?? Infinity;
  const runnerUp: RaceMethod = m.near_zero.final_loss.mean <= m.neural.final_loss.mean ? 'near_zero' : 'neural';
  let text = m.random.reached_target < r.seeds && best.reached_target === r.seeds
    ? `${size} the random start learned in ${m.random.reached_target ? `only ${m.random.reached_target}` : 'none'} of ${r.seeds} runs`
      + ` (loss ${fmt(m.random.final_loss.mean)}), while the ${name(r.best)} learned in all of them and ended lowest (loss ${fmt(best.final_loss.mean)}).`
    : r.best === 'random' || r.best === 'rescued'
      ? `${size} the ${name(r.best)} ended lowest (loss ${fmt(best.final_loss.mean)}), ahead of the ${name(runnerUp)} (${fmt(m[runnerUp].final_loss.mean)}).`
      : `${size} the ${name(r.best)} ended lowest (loss ${fmt(best.final_loss.mean)}); the random start ended at ${fmt(m.random.final_loss.mean)}.`;
  // the quickest to learn, among the methods that learned in every run
  const always = (['random', 'near_zero', 'neural'] as RaceMethod[]).filter(k => m[k].reached_target === r.seeds);
  const fastest = [...always].sort((a, b) => stepsOf(a) - stepsOf(b))[0];
  if (always.length > 1 && fastest) {
    text += fastest === r.best
      ? ` It also learned fastest, in about ${stepsOf(fastest)} steps.`
      : ` The ${name(fastest)} learned fastest, in about ${stepsOf(fastest)} steps against ${always.filter(k => k !== fastest).map(k => `${stepsOf(k)} for the ${name(k)}`).join(' and ')}.`;
  }
  const caught = m.rescued.events.map(e => e[0]).filter((s): s is number => s !== undefined);
  if (r.shots === 0) text += ' With exact gradients there is no measurement noise, so the monitor has nothing to judge.';
  else if (caught.length) {
    text += ` The plateau monitor caught the random start in ${caught.length} of ${r.seeds} runs (around step ${median(caught)}) and restarted it near zero,`
      + ` which brought its loss to ${fmt(m.rescued.final_loss.mean)}.`;
  } else text += ' The plateau monitor found no plateau, as expected at this size.';
  return text;
}

export function Module6Page() {
  const [study, setStudy] = useState<PlateauStudy | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [n, setN] = useState(3);
  const [layers, setLayers] = useState(2);
  const [shots, setShots] = useState<Shots>(1000);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [raceError, setRaceError] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const ids = { qubits: useId(), layers: useId(), shots: useId(), glossary: useId() };

  // The study runs as soon as the page opens (and the server starts preparing the presets).
  useEffect(() => {
    let live = true;
    optimizerApi.plateauStudy()
      .then(s => { if (live) setStudy(s); })
      .catch(e => { if (live) setStudyError(getApiErrorMessage(e, "Couldn't measure the gradients. Please reload the page.")); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const runRace = async (q = n, l = layers, s = shots) => {
    setRunning(true);
    setElapsed(0);
    setRaceError(null);
    try {
      setResult(await optimizerApi.race(q, l, s));
    } catch (e) {
      setRaceError(getApiErrorMessage(e, "The race couldn't finish. Please try again."));
    } finally {
      setRunning(false);
    }
  };

  const pickPreset = (q: number, l: number) => { setN(q); setLayers(l); runRace(q, l, shots); };
  const preset = PRESETS.find(p => p.n === n && p.layers === layers);

  // What Ask QAIbridge is told about this page.
  const details = useMemo(() => {
    const lines = ['Neural Optimizer page.'];
    if (study) {
      const last = study.qubits.length - 1;
      lines.push(`Barren plateau study (typical gradient size, 2 layers per qubit): random start ${fmt(study.lines.deep_random[0])} at 2 qubits`
        + ` to ${fmt(study.lines.deep_random[last])} at ${study.qubits[last]}; near-zero start about ${fmt(study.lines.deep_near_zero[last])} at every size;`
        + ` 1-layer random start stays about ${fmt(study.lines.shallow_random[last])}.`);
    }
    if (result) {
      lines.push(`Race: ${result.n_qubits} qubits, ${result.layers} layers, ${result.shots ? `${result.shots} shots` : 'exact gradients'}, ${result.seeds} runs each, each method with its better learning rate.`);
      for (const m of METHOD_ORDER) {
        const d = result.methods[m];
        lines.push(`- ${d.label}: final loss ${fmt(d.final_loss.mean)}, learned in ${d.reached_target}/${result.seeds} runs, test accuracy ${pct(d.test_accuracy)}.`);
      }
      lines.push(headline(result));
    }
    return lines.join('\n');
  }, [study, result]);
  usePageDetails('neural-optimizer', details);

  const last = study ? study.qubits.length - 1 : 0;
  const shotsGrowth = study ? 1 / study.deep_random_factor_per_qubit ** 2 : 0;

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-purple-400" aria-hidden="true" />
          Neural Optimizer
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Training quantum circuits that don't get stuck</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Big quantum circuits can stop learning: their gradients shrink until the noise in measuring them drowns them out.
          This is called a barren plateau. See it happen, race four ways of training a quantum classifier on equal terms,
          and watch a neural network learn good starting angles for QAOA.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>Section 1 measures gradient size from 2 to 10 qubits as soon as the page opens. A falling red line is a barren plateau.</>,
          <>In section 2, pick a circuit size (or a preset) and how many measurements each value gets, then press <strong>Run the race</strong>. Each method trains 3 times: the lines show the average, the shading the best and worst run.</>,
          <>Bigger circuits take longer, up to about two minutes at 10 qubits. The presets are prepared as soon as the page opens, and results are kept, so the same settings show at once next time.</>,
          <>In section 3, train the QAOA angle predictor and compare it with the full optimiser, and with simple starts given the same budget.</>,
        ]}
        outcome={<>Where barren plateaus appear and why, which training method learns at each size, when the plateau monitor steps in, and how much a learned starting point saves.</>}
      />

      {/* 1 · The study */}
      <Section step={1} title="Barren plateaus: why big circuits stop learning" icon={<TrendingDown className="w-5 h-5 text-red-400" aria-hidden="true" />}>
        <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-3xl">
          Training a quantum circuit means following its gradient: how the result changes when an angle is nudged. On a quantum
          computer every gradient is measured, so it carries noise. This is how big gradients typically are as the circuit
          grows, measured over {study?.draws ?? 200} starts at each size.
        </p>
        {studyError && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">{studyError}</p>}
        {!study && !studyError && (
          <p role="status" className="flex items-center gap-2 text-sm text-gray-300 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Measuring gradients from 2 to 10 qubits…
          </p>
        )}
        {study && (
          <>
            <PlateauStudyChart study={study} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Stat label={`Random start at ${study.qubits[last]} qubits`} value={fmt(study.lines.deep_random[last])}
                sub={`down from ${fmt(study.lines.deep_random[0])} at 2 qubits`} color={METHOD_COLORS.random} />
              <Stat label={`Near-zero start at ${study.qubits[last]} qubits`} value={fmt(study.lines.deep_near_zero[last])}
                sub="about the same at every size" color={METHOD_COLORS.near_zero} />
              <Stat label={`Shots needed per measurement at ${study.qubits[last]} qubits`}
                value={`${study.shots_needed.deep_random[last].toLocaleString()} vs ${study.shots_needed.deep_near_zero[last]}`}
                sub="random start vs near-zero start" />
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mt-4">
              With a random start and 2 layers per qubit, each extra qubit makes gradients about {pct(1 - study.deep_random_factor_per_qubit)} smaller,
              so the shots needed to see them grow about {shotsGrowth.toFixed(1)}× per qubit: exponential growth. Started near zero, the
              same circuit keeps its gradients. A 1-layer circuit has no plateau at all: plateaus come from deep, randomly started circuits.
            </p>
            <Numbers summary="See the numbers">
              <table className="text-xs font-mono text-gray-300">
                <thead className="text-gray-400 text-left">
                  <tr><th className="pr-4 py-1 font-sans">Qubits</th><th className="pr-4 font-sans">Random, 2 per qubit</th><th className="pr-4 font-sans">Near zero, 2 per qubit</th><th className="pr-4 font-sans">Random, 1 layer</th><th className="font-sans">Shots needed (random)</th></tr>
                </thead>
                <tbody>
                  {study.qubits.map((q, i) => (
                    <tr key={q} className="border-t border-quantum-700/50">
                      <td className="pr-4 py-1">{q}</td><td className="pr-4">{fmt(study.lines.deep_random[i])}</td>
                      <td className="pr-4">{fmt(study.lines.deep_near_zero[i])}</td><td className="pr-4">{fmt(study.lines.shallow_random[i])}</td>
                      <td>{study.shots_needed.deep_random[i].toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Numbers>
          </>
        )}
      </Section>

      {/* 2 · The race */}
      <Section step={2} title="A fair race: four ways to train a quantum classifier" icon={<Activity className="w-5 h-5 text-quantum-neon" aria-hidden="true" />}>
        <p className="text-gray-300 text-sm leading-relaxed mb-3 max-w-3xl">
          The task: sort 48 points in an XOR pattern into two classes (32 to learn from, 16 kept back to test). Every method gets the
          same data, the same optimiser, 40 steps of 8 points, the same measurement noise and its best learning rate. Only the start differs:
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {METHOD_ORDER.map(m => (
            <li key={m} className="flex gap-2 text-sm text-gray-300 bg-quantum-900/60 border border-quantum-700 rounded-xl px-3 py-2">
              <span className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ background: METHOD_COLORS[m] }} aria-hidden="true" />
              <span><strong className="text-white">{result?.methods[m].label ?? { random: 'Random start', rescued: 'Random start + plateau monitor', near_zero: 'Near-zero start', neural: 'Neural Angle Optimizer' }[m]}:</strong> {METHOD_TEXT[m]}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-4 mb-5">
          <div role="group" aria-label="Presets" className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.name} type="button" onClick={() => pickPreset(p.n, p.layers)} disabled={running}
                aria-pressed={preset?.name === p.name}
                className={`text-left rounded-xl border px-3 py-2 text-sm disabled:opacity-50 ${preset?.name === p.name ? 'border-quantum-neon bg-quantum-neon/10 text-white' : 'border-quantum-600 text-gray-300 hover:border-quantum-400'}`}>
                <strong>{p.name}</strong> · {p.n} qubits, {p.layers} layers
                <span className="block text-xs text-gray-400">{p.note}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor={ids.qubits} className="block text-sm text-gray-300 mb-1">Qubits: <strong className="text-white">{n}</strong></label>
              <input id={ids.qubits} type="range" min={2} max={10} value={n} onChange={e => setN(Number(e.target.value))} disabled={running} className="w-full accent-purple-400" />
            </div>
            <div>
              <label htmlFor={ids.layers} className="block text-sm text-gray-300 mb-1">Layers: <strong className="text-white">{layers}</strong></label>
              <input id={ids.layers} type="range" min={1} max={20} value={layers} onChange={e => setLayers(Number(e.target.value))} disabled={running} className="w-full accent-purple-400" />
            </div>
            <fieldset>
              <legend id={ids.shots} className="block text-sm text-gray-300 mb-1">Measurements per value</legend>
              <div className="flex flex-wrap gap-1.5">
                {SHOTS.map(o => (
                  <button key={o.value} type="button" onClick={() => setShots(o.value)} aria-pressed={shots === o.value} disabled={running}
                    title={o.note}
                    className={`rounded-lg border px-2.5 py-1 text-sm ${shots === o.value ? 'border-purple-400 bg-purple-500/15 text-white' : 'border-quantum-600 text-gray-300 hover:border-quantum-400'}`}>
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{SHOTS.find(o => o.value === shots)?.note}</p>
            </fieldset>
          </div>
          <button type="button" onClick={() => runRace()} disabled={running}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            style={{ background: 'linear-gradient(90deg,#cc44ff,#00ffcc)' }}>
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Training 4 methods × 3 runs… {elapsed} s</>
              : <><Play className="w-4 h-4" aria-hidden="true" />Run the race</>}
          </button>
          <p className="text-xs text-gray-400">Bigger circuits take up to about two minutes. The presets are prepared as soon as this page opens, and results are kept, so the same settings show at once next time.</p>
        </div>

        {raceError && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">{raceError}</p>}

        {result && (
          <div aria-live="polite">
            <p className="text-white text-sm leading-relaxed bg-quantum-900/60 border border-quantum-600 rounded-xl px-4 py-3 mb-3">{headline(result)}</p>
            <RaceChart result={result} />
            <div className="overflow-x-auto mt-3">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">Results for each training method</caption>
                <thead className="text-gray-400 text-left text-xs">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Method</th><th className="pr-3 font-medium">Final loss (range)</th>
                    <th className="pr-3 font-medium">Learned</th><th className="pr-3 font-medium">Steps to learn</th>
                    <th className="pr-3 font-medium">Test accuracy</th><th className="font-medium">Monitor</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  {METHOD_ORDER.map(m => {
                    const d = result.methods[m];
                    const steps = median(d.steps_to_target.filter((s): s is number => s !== null));
                    const flagged = d.events.filter(e => e.length).length;
                    return (
                      <tr key={m} className={`border-t border-quantum-700/60 ${m === result.best ? 'bg-quantum-neon/5' : ''}`}>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: METHOD_COLORS[m] }} aria-hidden="true" />
                            {d.label}{m === result.best && <span className="text-xs text-quantum-neon">best</span>}
                          </span>
                        </td>
                        <td className="pr-3 font-mono">{fmt(d.final_loss.mean)} <span className="text-gray-400">({fmt(d.final_loss.min, 2)}–{fmt(d.final_loss.max, 2)})</span></td>
                        <td className="pr-3">{d.reached_target} of {result.seeds}</td>
                        <td className="pr-3">{steps === null ? '—' : steps}</td>
                        <td className="pr-3">{pct(d.test_accuracy)}</td>
                        <td className="text-gray-300">
                          {result.shots === 0 ? '—' : !flagged ? 'no plateau'
                            : m === 'rescued' ? `restarted in ${flagged} of ${result.seeds}` : `flagged in ${flagged} of ${result.seeds}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="text-white font-bold text-sm mt-6 mb-1">The plateau monitor</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-2 max-w-3xl">
              A device can tell how noisy each measured gradient is from its own shots. The monitor compares that noise with the
              gradient: when, over 6 steps, the signal stays below the noise, the loss barely falls and the loss is still high,
              training is stuck on a plateau. It then restarts the angles near zero, once. It never restarts a run that has already learned.
            </p>
            {result.shots === 0
              ? <p className="text-sm text-gray-300 bg-quantum-900/60 border border-quantum-700 rounded-xl px-4 py-3">With exact gradients there is no measurement noise, so even a very flat landscape can be followed. Plateaus bite on real hardware, where every gradient is measured: choose 1,000 or 100 shots to see it.</p>
              : <MonitorChart result={result} />}

            <p className="text-xs text-gray-400 leading-relaxed mt-4">
              Same data, optimiser (Adam), {result.steps} steps of {result.batch} points and measurement noise for every method.
              The best step size depends on the circuit, so each method tried two learning rates here and kept its better one:{' '}
              {(['random', 'near_zero', 'neural'] as RaceMethod[]).map(m => `${result.methods[m].label.toLowerCase()} ${result.methods[m].learning_rate}`).join(', ')}
              {' '}(the monitored run uses the random start's). Each method ran {result.seeds} times with different seeds; lines show the
              average, shading the best and worst run. The circuit: RY encoding of the two features, then {result.layers} layer{result.layers > 1 ? 's' : ''} of
              RY and RZ on every qubit with a CNOT chain ({result.angles} angles), read out as ⟨Z⟩ on q0.
              {result.cached ? ' These results were kept from an earlier run with the same settings.' : ` Took ${Math.round(result.seconds)} s.`}
            </p>
          </div>
        )}
      </Section>

      {/* 3 · QAOA angles */}
      <QaoaAnglePredictor />

      <div className="mt-6">
        <button type="button" onClick={() => setGlossary(g => !g)} aria-expanded={glossary} aria-controls={ids.glossary}
          className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-quantum-600 rounded-full px-3 py-1.5">
          <BookOpen className="w-4 h-4" aria-hidden="true" /> Words used on this page
          <ChevronDown className={`w-4 h-4 transition-transform ${glossary ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {glossary && (
          <dl id={ids.glossary} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {GLOSSARY.map(([term, plain]) => (
              <div key={term} className="bg-quantum-800 border border-quantum-700 rounded-xl p-3">
                <dt className="text-quantum-neon text-sm font-semibold mb-1">{term}</dt>
                <dd className="text-gray-300 text-sm leading-relaxed">{plain}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
