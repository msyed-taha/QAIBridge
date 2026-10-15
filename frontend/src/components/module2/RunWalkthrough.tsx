import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight, Footprints } from 'lucide-react';
import type { ComparisonResult, DatabaseResult, FactoringResult, OptimizationResult, SearchResult } from '../../api/sfod';
import { AmplificationChart, QaoaTraceChart, ShorPeaksChart, pct, plural, theoryGap } from './SfodResultViews';

// "Step by step": how one run worked, told with that run's own numbers. Every figure
// here comes from the result (or is worked out from it, like the Grover amplitudes,
// which follow exactly from the number of items and matches).

interface Step { title: string; body: React.ReactNode; visual?: React.ReactNode }

const fmt = (x: number, d = 1) => x.toLocaleString(undefined, { maximumFractionDigits: d });
/** 3.4 × 10<sup>10</sup>, for numbers too big to write out. */
function Sci({ x, digits = 1 }: { x: number; digits?: number }) {
  const [m, e] = x.toExponential(digits).split('e');
  return <>{m} × 10<sup>{Number(e)}</sup></>;
}
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const powMod = (a: number, e: number, n: number) => {
  let r = 1;
  for (let i = 0; i < e; i++) r = (r * a) % n;
  return r;
};

// ── Grover amplitudes, worked out exactly ────────────────────────────────────

/** Amplitudes after `rounds` rounds (and, with `oracleOnly`, after the next round's oracle): marked, then each unmarked state. */
function groverAmplitudes(N: number, M: number, rounds: number, oracleOnly = false) {
  if (!M) return { marked: 0, other: 1 / Math.sqrt(N) };
  const angle = (2 * rounds + 1) * Math.asin(Math.sqrt(M / N));
  const marked = Math.sin(angle) / Math.sqrt(M);
  return { marked: oracleOnly ? -marked : marked, other: M < N ? Math.cos(angle) / Math.sqrt(N - M) : 0 };
}

/** Up to 8 states to draw (they fit a phone): the first matches, then the first other states, in index order. */
function shownStates(N: number, marked: number[]) {
  const set = new Set(marked);
  const pick = marked.slice(0, 3);
  for (let i = 0; i < N && pick.length < 8; i++) if (!set.has(i)) pick.push(i);
  return { states: pick.sort((a, b) => a - b), set, more: N - pick.length };
}

function AmplitudeBars({ N, marked, amps, label }: {
  N: number; marked: number[]; amps: { marked: number; other: number }; label: (i: number) => string;
}) {
  const { states, set, more } = shownStates(N, marked);
  const height = 56;                                   // pixels for an amplitude of ±1
  const amp = (a: number) => a.toFixed(3).replace('-', '−');
  const summary = `${marked.length ? `Each match: amplitude ${amp(amps.marked)} (chance ${pct(amps.marked ** 2, 2)}). ` : ''}`
    + `Every other state: amplitude ${amp(amps.other)} (chance ${pct(amps.other ** 2, 2)}).`;
  return (
    <figure className="mt-3">
      <div role="img" aria-label={summary} className="flex items-stretch gap-1 sm:gap-1.5 px-1">
        {states.map(i => {
          const a = set.has(i) ? amps.marked : amps.other;
          const h = Math.max(2, Math.abs(a) * height);
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="w-full flex flex-col justify-end" style={{ height }}>
                {a > 0 && <div className={`w-full rounded-t ${set.has(i) ? 'bg-quantum-neon' : 'bg-indigo-400/70'}`} style={{ height: h }} />}
              </div>
              <div className="w-full h-px bg-gray-400" />
              <div className="w-full flex flex-col justify-start" style={{ height }}>
                {a < 0 && <div className={`w-full rounded-b ${set.has(i) ? 'bg-quantum-neon' : 'bg-indigo-400/70'}`} style={{ height: h }} />}
              </div>
              <span className={`text-xs mt-1 truncate max-w-full ${set.has(i) ? 'text-quantum-neon font-semibold' : 'text-gray-400'}`}>{label(i)}</span>
            </div>
          );
        })}
        {more > 0 && <span className="self-center text-xs text-gray-400 pl-1">+{more.toLocaleString()} more</span>}
      </div>
      <figcaption className="text-xs text-gray-300 mt-2 leading-relaxed">
        {summary} Above the line is positive, below is negative; the chance of measuring a state is its amplitude squared.
      </figcaption>
    </figure>
  );
}

// ── Search and database ──────────────────────────────────────────────────────

function groverSteps(result: SearchResult | DatabaseResult): Step[] {
  const q = result.quantum;
  const r = q.runs;
  const N = q.n_items;
  const M = q.n_marked;
  const isSearch = result.algorithm === 'search';
  const nReal = isSearch ? result.input.n_items : result.input.n_records;
  const marked = isSearch ? result.input.marked : result.classical.matches;
  const thing = isSearch ? 'item' : 'record';
  const label = (i: number) => (i >= nReal ? 'pad' : `#${i}`);
  const bars = (rounds: number, oracleOnly = false) => (
    <AmplitudeBars N={N} marked={marked} amps={groverAmplitudes(N, M, rounds, oracleOnly)} label={label} />
  );
  const target = isSearch ? `"${result.input.target}"` : `records matching "${result.input.query}"`;
  const c = result.classical;
  const steps: Step[] = [];

  steps.push({
    title: 'The classical way',
    body: isSearch
      ? (M ? <>A linear search looks at the {nReal.toLocaleString()} items one by one. It found {target} at position {c.steps.toLocaleString()} after {plural(c.steps, 'comparison')}; on average it needs (N+1)/2 = {fmt(result.comparison.classical_expected)}.</>
           : <>A linear search has to look at all {nReal.toLocaleString()} items to be sure {target} isn't there: {plural(c.steps, 'comparison')}.</>)
      : (M ? <>With no index, a scan reads the {nReal.toLocaleString()} records in order. It reached the first of the {M} {target} after {plural(c.steps, 'read')}; listing them all takes a full scan of {nReal.toLocaleString()} reads.</>
           : <>With no index, a scan has to read all {nReal.toLocaleString()} records to be sure none matches: {plural(c.steps, 'read')}.</>),
  });
  steps.push({
    title: `Every ${thing} at once, with equal chance`,
    body: <>{q.n_qubits} qubits hold 2<sup>{q.n_qubits}</sup> = {N.toLocaleString()} basis states, one per {thing}
      {N > nReal ? <> ({N - nReal} extra "pad" states fill up the power of two; they never match)</> : null}. Hadamard gates give every
      state the same amplitude, 1/√{N.toLocaleString()} = {(1 / Math.sqrt(N)).toFixed(3)}: measuring now would give any one {thing} with
      chance {pct(1 / N, 2)}.</>,
    visual: bars(0),
  });
  if (!M) {
    steps.push({
      title: 'Rounds that change nothing',
      body: <>Nothing matches, but the algorithm can't know that in advance, so it plans {plural(r.rounds, 'round')} as if there were one match.
        Each round, the oracle has nothing to mark and the diffuser leaves equal amplitudes as they are: every state keeps its {pct(1 / N, 2)} chance.</>,
      visual: bars(r.rounds),
    });
  } else if (q.iterations === 0) {
    steps.push({
      title: 'No rounds needed',
      body: <>{M.toLocaleString()} of the {N.toLocaleString()} states match: at least half. A plain measurement already gives a match with
        chance {pct(q.success_probability)}, and a Grover round would make it worse, so none is run.</>,
    });
  } else {
    steps.push({
      title: 'Round 1, part 1: the oracle marks the matches',
      body: <>One oracle query flips the sign of every matching state's amplitude. It doesn't say where they are: the chance of
        measuring a match is still {pct(M / N, 2)}, because a chance is the amplitude squared.</>,
      visual: bars(0, true),
    });
    const after1 = groverAmplitudes(N, M, 1);
    steps.push({
      title: 'Round 1, part 2: the diffuser',
      body: <>The diffuser reflects every amplitude around their average. The flipped ones were far below the average, so they land far
        above it: the chance of a match rises from {pct(M / N, 2)} to {pct(M * after1.marked ** 2, 2)}.</>,
      visual: bars(1),
    });
    const next = Math.sin((2 * q.iterations + 3) * Math.asin(Math.sqrt(M / N))) ** 2;
    steps.push({
      title: `${plural(q.iterations, 'round')} in all`,
      body: <>Each round repeats both parts. After {plural(q.iterations, 'round')} the chance of a match is {pct(q.success_probability)}:
        the simulator {theoryGap(q)} sin²((2k+1)θ). Stopping here matters, since one more round would overshoot to {pct(next)}.</>,
      visual: q.curve.length > 2 ? <AmplificationChart q={q} height={220} /> : bars(q.iterations),
    });
  }
  steps.push({
    title: 'Measure, then check',
    body: r.found
      ? <>Each run ends with a measurement, and one more oracle query checks the {thing} it gave. {r.runs === 1
          ? <>The first run's {thing}, #{result.quantum.answer.index}, passed.</>
          : <>{plural(r.runs - 1, 'run')} gave a non-match first; run {r.runs} gave #{result.quantum.answer.index}, which passed.</>}{' '}
          In all: {r.runs} × ({plural(r.rounds, 'round')} + 1 check) = {plural(r.queries, 'oracle query', 'oracle queries')}.</>
      : <>In {plural(r.runs, 'run')} no measured {thing} passed the check. Had there been a match, each run would have found it with
          chance {(r.p_if_there ?? 0) >= 0.9995 ? 'over 99.9%' : pct(r.p_if_there)}, so the answer "not there" is at
          least {pct(r.confidence, 0)} certain. {r.runs} × ({plural(r.rounds, 'round')} + 1 check) = {plural(r.queries, 'oracle query', 'oracle queries')}.</>,
  });
  if (result.algorithm === 'database' && M && result.quantum.collect_all) {
    const all = result.quantum.collect_all;
    steps.push({
      title: 'Listing every match',
      body: <>One run returns one match. Repeating the same circuit until each of the {M} matches had come up took {plural(all.runs, 'run')} ={' '}
        {plural(all.queries, 'oracle query', 'oracle queries')}, against {nReal.toLocaleString()} reads for a full classical scan.
        {all.queries >= nReal ? ' Here the scan is cheaper: amplitude amplification pays off for finding a match, not for listing a large share of the records.' : ''}</>,
    });
  }
  const avg = result.comparison.classical_expected;
  steps.push({
    title: 'The comparison',
    body: isSearch
      ? <>Classical: {plural(c.steps, 'comparison')} this time, {fmt(avg)} on average. Quantum: {plural(q.steps, 'oracle query', 'oracle queries')}.
          The gap grows with the list: Grover's needs about π/4·√N queries, a classical search about N/2 comparisons.
          For a billion items that is about 24,800 queries against 500 million comparisons.</>
      : <>Classical: {plural(c.steps, 'read')} to the first match ({fmt(avg)} on average). Quantum: {plural(q.steps, 'oracle query', 'oracle queries')}.
          Amplitude amplification needs about π/4·√(N/M) queries per run, a scan about N/(M+1) reads. For a million records with
          one match that is about 786 queries against 500,000 reads.</>,
  });
  return steps;
}

// ── Shor ─────────────────────────────────────────────────────────────────────

function PowerRow({ a, N, r }: { a: number; N: number; r: number }) {
  const count = Math.min(24, 2 * r + 2);
  const values = Array.from({ length: count }, (_, x) => powMod(a, x, N));
  return (
    <figure className="mt-3">
      <ol className="flex flex-wrap gap-1.5" aria-label={`${a} to the power x, mod ${N}, for x from 0 to ${count - 1}`}>
        {values.map((v, x) => (
          <li key={x} className={`rounded-lg border px-2 py-1 text-center font-mono ${v === 1 ? 'border-quantum-neon text-quantum-neon' : 'border-quantum-600 text-gray-200'}`}>
            <span className="block text-xs text-gray-400">x={x}</span>
            <span className="text-sm">{v}</span>
          </li>
        ))}
      </ol>
      <figcaption className="text-xs text-gray-300 mt-2">
        {r < count
          ? <>The values return to 1 every {r} steps (outlined): that repeat length is the period r.</>
          : <>The values only return to 1 after r = {r} steps, beyond the {count} shown.</>}
      </figcaption>
    </figure>
  );
}

function shorSteps(result: FactoringResult): Step[] {
  const q = result.quantum;
  const c = result.classical;
  const N = result.input.N;
  const steps: Step[] = [{
    title: 'The classical way',
    body: <>Trial division tries 2 and then odd numbers in turn: it found {c.answer.factors.length === 1 ? `that ${N} is prime` : `${N} = ${c.answer.factors.join(' × ')}`} after{' '}
      {plural(c.steps, 'division')}. Its worst case grows like √N, so the work doubles with every 2 bits added to N.</>,
  }];
  const d = q.detail;
  if (!q.from_period || !d || q.a == null || q.period == null) {
    steps.push({
      title: 'No quantum step needed',
      body: <>Shor's algorithm starts with quick classical checks, and this number didn't get past them: {q.message} The quantum period-finding
        circuit is only needed for odd numbers with two or more different prime factors, like 15, 21 or 91.</>,
    });
    return steps;
  }
  const a = q.a;
  const r = q.period;
  const t = d.counting_qubits ?? 0;
  const Q = 2 ** t;
  const used = d.post_processing.find(pp => pp.period === r) ?? d.post_processing.find(pp => pp.period);
  const half = powMod(a, r / 2, N);
  const failed = q.attempts.filter(att => !att.success);
  steps.push({
    title: 'Turn factoring into finding a period',
    body: <>Pick a number that shares no factor with {N}: a = {a}{failed.length ? ` (after ${plural(failed.length, 'base')} that didn't work out: ${failed.map(f => f.a).join(', ')})` : ''}.
      The powers {a}<sup>x</sup> mod {N} repeat. If we know how often they repeat, the period r, a little arithmetic gives the factors.
      Listing powers until they repeat is hopeless for big N; the quantum circuit finds r without listing them.</>,
    visual: <PowerRow a={a} N={N} r={r} />,
  });
  steps.push({
    title: 'All powers at once',
    body: <>{t} counting qubits hold every x from 0 to {(Q - 1).toLocaleString()} in superposition. Controlled multiplications by {a}<sup>2<sup>j</sup></sup> mod {N}{' '}
      write {a}<sup>x</sup> mod {N} into {d.work_qubits} work qubits, for every x at the same time. Circuit: {d.qubits} qubits,{' '}
      {(d.gates ?? 0).toLocaleString()} gates, depth {(d.depth ?? 0).toLocaleString()}.</>,
  });
  steps.push({
    title: 'The inverse QFT turns the repeat into peaks',
    body: <>The inverse quantum Fourier transform turns a pattern that repeats every r into peaks at multiples of 2<sup>{t}</sup>/r ={' '}
      {Q.toLocaleString()}/{r} = {fmt(Q / r, 2)}. Measuring the counting register now gives one of those peaks.</>,
    visual: <ShorPeaksChart d={d} height={220} />,
  });
  steps.push({
    title: 'Measure, and read off r',
    body: used
      ? <>{q.shots.toLocaleString()} measurements were taken. Continued fractions turn a measured y into a fraction s/r: y = {used.measured} gives{' '}
          {used.measured}/{Q.toLocaleString()} ≈ {used.fraction}, so r = {r}. A quick check confirms it: {a}<sup>{r}</sup> mod {N} = 1.</>
      : <>Continued fractions on the measured values gave r = {r}; {a}<sup>{r}</sup> mod {N} = 1 confirms it.</>,
  });
  steps.push({
    title: 'From r to the factors',
    body: <>r = {r} is even, so {a}<sup>{r / 2}</sup> mod {N} = {half}. Then gcd({half} − 1, {N}) = {gcd(half - 1, N)} and gcd({half} + 1, {N}) ={' '}
      {gcd(half + 1, N)}: {N} = {(q.answer.factors ?? []).join(' × ')}.</>,
  });
  const last = result.comparison.crypto_table[result.comparison.crypto_table.length - 1];
  steps.push({
    title: 'Why it matters',
    body: <>For a number this small trial division is instant. But its cost grows exponentially with the number of digits, while Shor's grows
      like n³. For an RSA-{last.bits} key the best classical method needs about <Sci x={last.classical_gnfs_ops} digits={0} />{' '}
      operations; Shor's needs about <Sci x={last.quantum_gates} /> gates on {last.logical_qubits.toLocaleString()}{' '}
      error-corrected qubits, which no machine has yet.</>,
  });
  return steps;
}

// ── QAOA ─────────────────────────────────────────────────────────────────────

function qaoaSteps(result: OptimizationResult): Step[] {
  const q = result.quantum;
  const c = result.classical;
  const cities = result.input.cities;
  const n = cities.length;
  const valid = factorial(n - 1);
  const best = q.answer.length_km;
  return [
    {
      title: 'The classical way',
      body: <>Exhaustive search tried all {plural(c.steps, 'route')} that start at {cities[0]} and kept the shortest:{' '}
        {c.answer.tour.join(' → ')}, {Math.round(c.answer.length_km).toLocaleString()} km. The greedy rule (always go to the nearest city)
        gives {Math.round(c.greedy.length).toLocaleString()} km, {result.comparison.greedy_gap_pct}% longer.</>,
    },
    {
      title: 'Routes as qubits',
      body: <>One qubit per (city, stop) pair: it is 1 when that city is that stop. With {cities[0]} fixed as the start, {n - 1} cities × {n - 1}{' '}
        stops = {q.qubits} qubits. That makes {(2 ** q.qubits).toLocaleString()} bit-strings, of which only {valid.toLocaleString()} are valid routes.</>,
    },
    {
      title: 'The Bridge: distance becomes energy',
      body: <>The distances become a QUBO with {q.bridge.qubo.nonzero_terms} terms. Penalties make invalid bit-strings (a city twice, a stop
        empty) cost extra. Writing each bit as (1 − Z)/2 turns it into an Ising Hamiltonian, whose lowest energy is the shortest route.</>,
      visual: <p className="mt-3 text-xs font-mono text-quantum-neon/80 bg-quantum-900/60 rounded-lg p-2 max-h-24 overflow-y-auto break-words">{q.bridge.ising.hamiltonian}</p>,
    },
    {
      title: 'The QAOA circuit',
      body: <>Hadamard gates start every bit-string with the same chance. Then come {plural(q.layers, 'layer')}, each a cost step (RZ and RZZ gates
        set by the Hamiltonian, turned by an angle γ) and a mixer step (RX gates, turned by an angle β): {q.circuit.gates.toLocaleString()} gates,
        depth {q.circuit.depth.toLocaleString()}.</>,
    },
    {
      title: 'Tuning the angles',
      body: <>A classical optimiser (COBYLA) ran the circuit {plural(q.circuit_evaluations, 'time')}, each time computing its average energy over the
        best outcomes, and kept the angles that gave the lowest: γ = [{q.gammas.map(g => g.toFixed(2)).join(', ')}],
        β = [{q.betas.map(b => b.toFixed(2)).join(', ')}].</>,
      visual: <QaoaTraceChart q={q} height={220} />,
    },
    {
      title: 'Measure',
      body: <>{q.shots.toLocaleString()} measurements of the tuned circuit: {pct(q.p_feasible)} of the chance is on valid routes (random bit-strings:{' '}
        {pct(q.random_p_feasible, 2)}), and the shortest route comes up {pct(q.p_optimal, 2)} of the time against {pct(q.random_p_optimal, 3)} by
        chance{q.amplification ? `, ${fmt(q.amplification)}× more likely` : ''}.{' '}
        {best == null ? 'No measured bit-string was a valid route.'
          : <>The best measured route, {(q.answer.tour ?? []).join(' → ')} ({Math.round(best).toLocaleString()} km), {q.correct ? 'is the shortest one.' : `is ${((best / c.answer.length_km - 1) * 100).toFixed(1)}% longer than the shortest.`}</>}</>,
    },
    {
      title: 'The comparison',
      body: <>At this size exhaustive search is far cheaper: {plural(c.steps, 'route')} against {plural(q.circuit_evaluations, 'circuit run')}.
        QAOA is a heuristic with no proven speed-up. It is studied for large problems, where the (N−1)! routes of exhaustive search become
        impossible to check: 20 cities already have about <Sci x={factorial(19)} />.</>,
    },
  ];
}

function stepsFor(result: ComparisonResult): Step[] {
  switch (result.algorithm) {
    case 'search':
    case 'database':
      return groverSteps(result);
    case 'factoring':
      return shorSteps(result);
    case 'optimization':
      return qaoaSteps(result);
  }
}

export function RunWalkthrough({ result }: { result: ComparisonResult }) {
  const steps = stepsFor(result);
  const [at, setAt] = useState(0);
  const id = useId();
  const i = Math.min(at, steps.length - 1);
  const step = steps[i];
  return (
    <section aria-labelledby={id} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
      <h2 id={id} className="flex items-center gap-2 text-white font-bold text-base mb-3">
        <Footprints className="w-5 h-5 text-quantum-neon" aria-hidden="true" /> Step by step: how this run worked
      </h2>
      <ol className="flex flex-wrap gap-1.5 mb-4">
        {steps.map((s, k) => (
          <li key={s.title}>
            <button type="button" onClick={() => setAt(k)} aria-current={k === i ? 'step' : undefined}
              className={`text-xs rounded-full px-2.5 py-1 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                k === i ? 'border-quantum-neon text-quantum-neon bg-quantum-neon/10' : 'border-quantum-600 text-gray-300 hover:text-white'}`}>
              {k + 1}<span className="sr-only">: {s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div aria-live="polite">
        <h3 className="text-white font-semibold text-sm mb-1">
          <span className="text-gray-400 font-normal">Step {i + 1} of {steps.length} · </span>{step.title}
        </h3>
        <p className="text-gray-300 text-sm leading-relaxed max-w-3xl">{step.body}</p>
        {step.visual}
      </div>
      <div className="flex justify-between gap-3 mt-4">
        <button type="button" onClick={() => setAt(i - 1)} disabled={i === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-xl border border-quantum-600 text-sm text-gray-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
        </button>
        <button type="button" onClick={() => setAt(i + 1)} disabled={i === steps.length - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-xl border border-quantum-neon/50 text-sm text-quantum-neon hover:bg-quantum-neon/10 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
