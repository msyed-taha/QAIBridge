import Plot from 'react-plotly.js';
import { CheckCircle2, Cpu, Info, XCircle, Zap } from 'lucide-react';
import type {
  ComparisonResult, DatabaseResult, FactoringResult, GroverQuantum, OptimizationResult, QaoaQuantum, SearchResult,
  ShorDetail,
} from '../../api/sfod';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

// ── small helpers ────────────────────────────────────────────────────────────

export const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
export const num = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString());
const ms = (x: number | null | undefined) =>
  x == null ? '—' : x < 1 ? `${x.toFixed(3)} ms` : x < 1000 ? `${x.toFixed(1)} ms` : `${(x / 1000).toFixed(2)} s`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const times = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;

function Badge({ ok, yes = 'Correct', no = 'Incorrect' }: { ok: boolean; yes?: string; no?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" aria-hidden="true" /> {no}
    </span>
  );
}

export function Card({ title, icon, children, className = '' }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-quantum-800 border border-quantum-700 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-white font-bold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-quantum-700/50 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-xs font-mono text-right ${accent ? 'text-quantum-neon font-semibold' : 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

// ── Answers in plain words ───────────────────────────────────────────────────

function itemText(index: number | null, value: string | null) {
  if (index == null) return 'Not in the list';
  return `Item #${index}${value != null && value !== String(index) ? ` ("${value}")` : ''}`;
}

function factorsText(N: number, f: number[] | null) {
  if (!f || !f.length) return 'No factors found';
  return f.length === 1 ? `${N} is prime` : `${N} = ${f.join(' × ')}`;
}

function routeText(tour: string[] | null, km: number | null) {
  return tour && km != null ? `${tour.join(' → ')} (${Math.round(km).toLocaleString()} km)` : 'No valid route measured';
}

export function answerText(result: ComparisonResult, side: 'classical' | 'quantum'): string {
  switch (result.algorithm) {
    case 'search': {
      const a = result[side].answer;
      return itemText(a.index, a.value);
    }
    case 'database':
      if (side === 'classical') {
        const a = result.classical.answer;
        return a.index == null ? 'No matching record' : `${plural(a.matches, 'matching record')} (first: #${a.index})`;
      }
      return result.quantum.answer.index == null ? 'No matching record' : `A matching record (#${result.quantum.answer.index})`;
    case 'factoring':
      return factorsText(result.input.N, result[side].answer.factors);
    case 'optimization':
      return side === 'classical'
        ? routeText(result.classical.answer.tour, result.classical.answer.length_km)
        : routeText(result.quantum.answer.tour, result.quantum.answer.length_km);
  }
}

// ── Verdict + side-by-side ───────────────────────────────────────────────────

function verdict(result: ComparisonResult): string {
  switch (result.algorithm) {
    case 'search':
    case 'database': {
      const { classical: c, quantum: q, comparison } = result;
      const what = result.algorithm === 'search' ? 'comparisons' : 'record reads';
      if (!result.quantum.n_marked) {
        const thing = result.algorithm === 'search' ? `"${result.input.target}" isn't in the list` : `No record matches "${result.input.query}"`;
        return `${thing}. Classical: ${plural(c.steps, what.slice(0, -1), what)} to be sure. Quantum: `
          + `${plural(q.steps, 'oracle query', 'oracle queries')}, ${pct(q.runs.confidence, 0)} sure.`;
      }
      if (!q.runs.found) return `No measured item passed the check in ${plural(q.runs.runs, 'run')}.`;
      const avg = comparison.classical_expected;
      const head = `Quantum found ${result.algorithm === 'search' ? 'it' : 'a match'} with ${plural(q.steps, 'oracle query', 'oracle queries')}; `
        + `classical needed ${plural(c.steps, what.slice(0, -1), what)} (${avg.toLocaleString(undefined, { maximumFractionDigits: 1 })} on average)`;
      return avg > q.steps ? `${head}: ${times(avg / q.steps)} fewer than the classical average.` : `${head}. At this small size classical wins; the gap opens as N grows.`;
    }
    case 'factoring': {
      const q = result.quantum;
      return q.from_period
        ? `Shor's algorithm factored ${factorsText(result.input.N, q.answer.factors)} from a period it measured (a = ${q.a}, r = ${q.period}).`
        : q.message;
    }
    case 'optimization': {
      const q = result.quantum;
      const best = q.answer.length_km;
      if (best == null) return `None of QAOA's ${q.shots.toLocaleString()} measurements was a valid route.`;
      return q.correct
        ? `QAOA's best measured route is the shortest one. QAOA made it ${times(q.amplification ?? 0)} more likely than a random guess.`
        : `QAOA's best measured route is ${((best / result.classical.answer.length_km - 1) * 100).toFixed(1)}% longer than the shortest.`;
    }
  }
}

export function VerdictBanner({ result }: { result: ComparisonResult }) {
  const c = result.classical;
  const q = result.quantum;
  return (
    <div className="rounded-2xl border border-quantum-neon/30 p-5 mb-5"
      style={{ background: 'linear-gradient(135deg, rgba(0,255,204,0.06), rgba(204,68,255,0.06))' }}>
      <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-1">Result</h2>
      <p className="text-white font-bold text-base leading-snug">{verdict(result)}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-xs text-gray-400">Classical answer: <span className="text-gray-200">{answerText(result, 'classical')}</span></span>
        <Badge ok={c.correct} />
        <span className="text-xs text-gray-400 sm:ml-4">Quantum answer: <span className="text-gray-200">{answerText(result, 'quantum')}</span></span>
        <Badge ok={q.correct} />
      </div>
    </div>
  );
}

function circuitOf(result: ComparisonResult) {
  if (result.algorithm === 'factoring') {
    const d = result.quantum.detail;
    return d?.qubits != null ? { qubits: d.qubits, gates: d.gates ?? null, depth: d.depth ?? null } : null;
  }
  return result.quantum.circuit;
}

export function SideBySide({ result }: { result: ComparisonResult }) {
  const c = result.classical;
  const q = result.quantum;
  const circ = circuitOf(result);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      <div className="rounded-2xl p-5 border bg-red-950/10 border-red-900/40">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-red-400" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest text-red-400">Classical</span>
          <span className="ml-auto font-mono text-red-300 text-sm">{c.complexity}</span>
        </div>
        <p className="text-white font-bold text-sm mb-3">{c.algorithm}</p>
        <Row label={`Steps: ${c.steps_label}`} value={num(c.steps)} />
        {result.algorithm === 'search' && result.input.n_marked > 0 && (
          <Row label="Average for this size, (N+1)/2" value={num(result.comparison.classical_expected)} />
        )}
        {result.algorithm === 'database' && <Row label="Full scan (lists every match)" value={`${num(result.comparison.full_scan_reads)} reads`} />}
        {result.algorithm === 'optimization' && (
          <Row label="Greedy nearest-city rule"
            value={`${Math.round(result.classical.greedy.length).toLocaleString()} km (${result.comparison.greedy_gap_pct}% longer)`} />
        )}
        <Row label="Time on the CPU" value={ms(c.time_ms)} />
        <Row label="Answer" value={answerText(result, 'classical')} />
      </div>
      <div className="rounded-2xl p-5 border bg-teal-950/10 border-teal-800/50">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-quantum-neon" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest text-quantum-neon">Quantum (simulated)</span>
          <span className="ml-auto font-mono text-quantum-neon text-sm">{q.complexity}</span>
        </div>
        <p className="text-white font-bold text-sm mb-3">{q.algorithm}</p>
        <Row label={`Steps: ${q.steps_label}`} value={num(q.steps)} accent />
        {(result.algorithm === 'search' || result.algorithm === 'database') && (
          <>
            <Row label="Runs × (rounds + 1 check)"
              value={`${num(result.quantum.runs.runs)} × (${result.quantum.runs.rounds} + 1)`} />
            <Row label="Chance of a match per run" value={pct(result.quantum.success_probability)} accent />
          </>
        )}
        {result.algorithm === 'optimization' && (
          <Row label="Chance of the shortest route vs a random guess"
            value={`${pct(result.quantum.p_optimal, 2)} vs ${pct(result.quantum.random_p_optimal, 3)}`} accent />
        )}
        {circ && <Row label="Qubits · gates · depth" value={`${circ.qubits} · ${num(circ.gates)} · ${num(circ.depth)}`} />}
        <Row label="Time to simulate it on the CPU" value={ms(q.time_ms)} />
        <Row label="Answer" value={answerText(result, 'quantum')} />
      </div>
    </div>
  );
}

export function NotesPanel({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="bg-quantum-800/60 border border-quantum-700 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-blue-300" aria-hidden="true" />
        <h3 className="text-white font-bold text-sm">How to read this</h3>
      </div>
      <ul className="space-y-1.5 list-disc pl-5">
        {notes.map((n, i) => <li key={i} className="text-gray-300 text-sm leading-relaxed">{n}</li>)}
      </ul>
    </div>
  );
}

// ── Grover / amplitude amplification ─────────────────────────────────────────

/** How far the simulator's per-round chance is from sin²((2k+1)θ), in words. */
export function theoryGap(q: GroverQuantum) {
  const gap = Math.max(0, ...q.curve.map(p => Math.abs(p.success_probability - p.theory)));
  return gap < 5e-7 ? 'matches the theory curve to 6 decimal places' : `is within ${gap.toExponential(1)} of the theory curve`;
}

export function AmplificationChart({ q, height = 260 }: { q: GroverQuantum; height?: number }) {
  const x = q.curve.map(p => p.iteration);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Theory: sin²((2k+1)θ)', x, y: q.curve.map(p => p.theory),
          line: { color: COLORS.purple, width: 2, dash: 'dot' }, hovertemplate: 'round %{x}: %{y:.4f}<extra>theory</extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'Measured on the simulator', x, y: q.curve.map(p => p.success_probability),
          line: { color: COLORS.neon, width: 2 }, marker: { size: 8 }, hovertemplate: 'round %{x}: %{y:.4f}<extra>simulator</extra>' },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Grover round k' }, ...(x.length <= 12 ? { dtick: 1 } : {}) },
        yaxis: { title: { text: 'Chance of a match' }, range: [0, 1.05] },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height }}
    />
  );
}

function HistogramChart({ q, label }: { q: GroverQuantum; label: (i: number) => string }) {
  const bars = q.histogram.slice(0, 16);
  return (
    <Plot
      data={[{
        type: 'bar', x: bars.map(b => label(b.index)), y: bars.map(b => b.count),
        marker: { color: bars.map(b => (b.marked ? COLORS.neon : '#4b4b8a')) },
        customdata: bars.map(b => (b.marked ? 'a match' : 'not a match')),
        hovertemplate: '%{x}: %{y} shots (%{customdata})<extra></extra>',
      }]}
      layout={darkLayout({
        xaxis: { title: { text: 'Measured item' }, type: 'category', tickangle: -35 },
        yaxis: { title: { text: `Count (of ${q.shots.toLocaleString()} shots)` } },
        margin: { t: 10, r: 10, b: 80, l: 56 },
        showlegend: false,
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 260 }}
    />
  );
}

function ScalingChart({ rows }: { rows: SearchResult['comparison']['scaling'] }) {
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Classical ≈ N/2 comparisons', x: rows.map(r => r.n_items),
          y: rows.map(r => r.classical_expected), line: { color: COLORS.classical, width: 2 } },
        { type: 'scatter', mode: 'lines', name: "Grover ≈ π/4·√N queries", x: rows.map(r => r.n_items),
          y: rows.map(r => r.quantum), line: { color: COLORS.neon, width: 2 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Items N (log scale)' }, type: 'log', dtick: 3 },
        yaxis: { title: { text: 'Queries (log scale)' }, type: 'log', dtick: 3 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 260 }}
    />
  );
}

export function GroverViews({ result }: { result: SearchResult | DatabaseResult }) {
  const q = result.quantum;
  const label = (i: number) => (result.algorithm === 'database' ? `#${i}` : `${i}`);
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="Amplitude amplification: the chance of a match, round by round" icon={<Zap className="w-4 h-4 text-quantum-neon" aria-hidden="true" />}>
          {q.n_marked ? (
            <>
              <AmplificationChart q={q} />
              <p className="text-gray-300 text-xs mt-1 leading-relaxed">
                It starts at {q.n_marked}/N = {pct(q.n_marked * q.uniform_probability, 3)} (equal superposition) and reaches{' '}
                {pct(q.success_probability)} after {plural(q.iterations, 'round')}. The simulator {theoryGap(q)}.
              </p>
            </>
          ) : (
            <p className="text-gray-300 text-sm leading-relaxed">
              Nothing matches, so the oracle has nothing to mark and the rounds change nothing: every one of the {q.n_items.toLocaleString()}{' '}
              states keeps the same {pct(q.uniform_probability, 3)} chance.
            </p>
          )}
        </Card>
        <Card title={`What ${q.shots.toLocaleString()} measurements gave`} icon={<Zap className="w-4 h-4 text-quantum-neon" aria-hidden="true" />}>
          <HistogramChart q={q} label={label} />
          <p className="text-gray-300 text-xs mt-1">
            Bright bars are matches. {pct(q.measured_success_rate)} of the measurements were a match. The 16 most frequent outcomes are shown.
          </p>
        </Card>
      </div>
      {result.algorithm === 'search' && (
        <Card title="Why it matters at scale: queries needed as the list grows" className="mb-5">
          <ScalingChart rows={result.comparison.scaling} />
          <p className="text-gray-300 text-xs mt-1">
            For a billion items a classical search needs about 500 million comparisons on average; Grover's needs about 24,800 oracle queries.
          </p>
        </Card>
      )}
      {result.algorithm === 'database' && result.input.n_matches > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <Card title={`Matches measured in ${q.shots.toLocaleString()} runs (${result.quantum.answer.matches_seen} of ${result.input.n_matches})`}>
            <RecordList rows={result.quantum.retrieved.map(r => ({ index: r.index, text: r.record, extra: `${r.count}×` }))} />
          </Card>
          <Card title={`Every match, from the classical full scan (${result.input.n_matches})`}>
            <RecordList rows={result.classical.matching_records.map(r => ({ index: r.index, text: r.record }))} />
          </Card>
        </div>
      )}
    </>
  );
}

function RecordList({ rows }: { rows: { index: number; text: string; extra?: string }[] }) {
  if (!rows.length) return <p className="text-gray-400 text-xs">No records.</p>;
  return (
    <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
      {rows.map(r => (
        <li key={r.index} className="flex items-center gap-2 bg-quantum-900/60 rounded-lg px-2.5 py-1.5">
          <span className="text-gray-400 font-mono text-xs w-12 flex-shrink-0">#{r.index}</span>
          <span className="text-gray-300 text-xs flex-1 truncate" title={r.text}>{r.text}</span>
          {r.extra && <span className="text-quantum-neon font-mono text-xs">{r.extra}</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Shor ─────────────────────────────────────────────────────────────────────

export function ShorPeaksChart({ d, height = 260 }: { d: ShorDetail; height?: number }) {
  const size = 2 ** (d.counting_qubits ?? 0);
  return (
    <Plot
      data={[{
        type: 'bar', x: d.peaks.map(p => p.y), y: d.peaks.map(p => p.probability),
        marker: { color: COLORS.neon }, hovertemplate: 'y = %{x}<br>chance %{y:.4f}<extra></extra>',
      }]}
      layout={darkLayout({
        xaxis: { title: { text: `Measured value y (0 to ${size - 1})` }, range: [-0.5, size] },
        yaxis: { title: { text: 'Chance' } },
        showlegend: false,
        bargap: 0.1,
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height }}
    />
  );
}

export function ShorViews({ result }: { result: FactoringResult }) {
  const q = result.quantum;
  const d = q.detail;
  const table = result.comparison.crypto_table;
  const last = table[table.length - 1];
  return (
    <>
      {d && d.peaks && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
          <Card title={`What the counting register shows after the inverse QFT (a = ${d.a})`} className="lg:col-span-3"
            icon={<Zap className="w-4 h-4 text-quantum-neon" aria-hidden="true" />}>
            <ShorPeaksChart d={d} />
            <p className="text-gray-300 text-xs mt-1 leading-relaxed">
              The peaks sit at multiples of 2<sup>{d.counting_qubits}</sup>/r = {(2 ** (d.counting_qubits ?? 0) / (d.true_period || 1)).toFixed(2)}:
              their spacing encodes the period r = {d.true_period} of {d.a}<sup>x</sup> mod {result.input.N}.
              Circuit: {d.qubits} qubits ({d.counting_qubits} counting + {d.work_qubits} work), {num(d.gates)} gates, depth {num(d.depth)}.
            </p>
          </Card>
          <Card title="Reading the period: continued fractions" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th scope="col" className="py-1 pr-2 font-medium">y</th><th scope="col" className="pr-2 font-medium">shots</th>
                    <th scope="col" className="pr-2 font-medium">y/2<sup>t</sup></th>
                    <th scope="col" className="pr-2 font-medium">≈ s/r</th><th scope="col" className="font-medium">period?</th>
                  </tr>
                </thead>
                <tbody>
                  {d.post_processing.map((pp, i) => (
                    <tr key={i} className="border-t border-quantum-700/50 text-gray-300 font-mono">
                      <td className="py-1 pr-2">{pp.measured}</td>
                      <td className="pr-2">{pp.count}</td>
                      <td className="pr-2">{pp.phase.toFixed(4)}</td>
                      <td className="pr-2">{pp.fraction}</td>
                      <td className={pp.period ? 'text-quantum-neon' : 'text-gray-400'}>{pp.period ?? 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.from_period && q.period != null && q.answer.factors && (
              <p className="text-xs text-gray-300 mt-3 leading-relaxed">
                r = {q.period} is even, so gcd({q.a}<sup>{q.period / 2}</sup> ± 1, {result.input.N}) gives the factors{' '}
                <span className="text-quantum-neon font-mono">{q.answer.factors.join(' × ')}</span>.
              </p>
            )}
          </Card>
        </div>
      )}
      {q.attempts.length > 1 && (
        <Card title="Attempts (Shor's algorithm is probabilistic)" className="mb-5">
          <ul className="flex flex-wrap gap-2">
            {q.attempts.map((a, i) => (
              <li key={i} className={`text-xs font-mono px-2 py-1 rounded-lg border ${a.success ? 'border-emerald-600/50 text-emerald-300' : 'border-quantum-600 text-gray-400'}`}>
                a = {a.a} · r = {a.true_period ?? '?'} → {a.success ? 'factors found' : 'try another a'}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="What it means for encryption: factoring RSA-size numbers" className="mb-5">
        <Plot
          data={[
            { type: 'scatter', mode: 'lines+markers', name: 'Best classical method (number field sieve), operations',
              x: table.map(r => r.bits), y: table.map(r => r.classical_gnfs_ops), line: { color: COLORS.classical } },
            { type: 'scatter', mode: 'lines+markers', name: "Shor's algorithm, gates (about 4n³)",
              x: table.map(r => r.bits), y: table.map(r => r.quantum_gates), line: { color: COLORS.neon } },
          ]}
          layout={darkLayout({
            xaxis: { title: { text: 'Key size (bits)' }, type: 'log', tickvals: table.map(r => r.bits) },
            yaxis: { title: { text: 'Operations (log scale)' }, type: 'log', dtick: 5, exponentformat: 'power' },
          })}
          config={PLOT_CONFIG}
          style={{ width: '100%', height: 260 }}
        />
        <p className="text-gray-300 text-xs mt-1 leading-relaxed">
          RSA-{last.bits} would need about {num(last.logical_qubits)} error-corrected qubits (2n + 3): far beyond today's hardware,
          but only polynomial effort. That is why post-quantum encryption is being standardised now.
        </p>
      </Card>
    </>
  );
}

// ── QAOA / TSP ───────────────────────────────────────────────────────────────

export function QaoaTraceChart({ q, height = 300 }: { q: QaoaQuantum; height?: number }) {
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Energy of each try', x: q.trace.map(t => t.evaluation),
          y: q.trace.map(t => t.value), line: { color: '#8888cc', width: 1 } },
        { type: 'scatter', mode: 'lines', name: 'Best so far', x: q.trace.map(t => t.evaluation),
          y: q.trace.map(t => t.best), line: { color: COLORS.neon, width: 2 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Circuit run' } },
        yaxis: { title: { text: 'Energy (lower = shorter route)' } },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height }}
    />
  );
}

export function TspViews({ result }: { result: OptimizationResult }) {
  const q = result.quantum;
  const names = result.input.cities;
  const coords = result.input.coords;
  const path = (tour: number[] | null | undefined) => (tour ?? []).map(i => coords[i]);
  const opt = path(result.classical.tour);
  const best = path(q.best_sampled.tour);
  const greedy = path(result.classical.greedy.tour);
  const cityTrace = (pick: number, position: 'top center' | 'bottom center', show: boolean) => {
    const idx = names.map((_, i) => i).filter(i => i % 2 === pick);
    return {
      type: 'scatter' as const, mode: 'text+markers' as const, name: 'Cities', legendgroup: 'cities', showlegend: show,
      x: idx.map(i => coords[i][1]), y: idx.map(i => coords[i][0]), text: idx.map(i => names[i]),
      textposition: position, marker: { size: 10, color: '#ffffff' }, textfont: { color: '#dddddd' },
      hovertemplate: '%{text}<extra></extra>',
    };
  };
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="The routes on the map (longitude, latitude)">
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'Greedy', x: greedy.map(c => c[1]), y: greedy.map(c => c[0]),
                line: { color: COLORS.amber, width: 1.5, dash: 'dot' }, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', name: 'Shortest (classical)', x: opt.map(c => c[1]), y: opt.map(c => c[0]),
                line: { color: COLORS.classical, width: 6 }, opacity: 0.5, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', name: 'QAOA best measured', x: best.map(c => c[1]), y: best.map(c => c[0]),
                line: { color: COLORS.neon, width: 2 }, hoverinfo: 'skip' },
              cityTrace(0, 'top center', true),
              cityTrace(1, 'bottom center', false),
            ]}
            layout={darkLayout({
              xaxis: { title: { text: 'Longitude' } },
              yaxis: { title: { text: 'Latitude' }, scaleanchor: 'x' },
            })}
            config={PLOT_CONFIG}
            style={{ width: '100%', height: 300 }}
          />
        </Card>
        <Card title="Training QAOA: a classical optimiser tunes the angles γ and β">
          <QaoaTraceChart q={q} />
          <p className="text-gray-300 text-xs mt-1 font-mono break-words">
            γ = [{q.gammas.map(g => g.toFixed(3)).join(', ')}] · β = [{q.betas.map(b => b.toFixed(3)).join(', ')}]
          </p>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="The most frequently measured bit-strings">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th scope="col" className="py-1 pr-2 font-medium">bits</th><th scope="col" className="pr-2 font-medium">shots</th>
                  <th scope="col" className="pr-2 font-medium">valid?</th><th scope="col" className="font-medium">route</th>
                </tr>
              </thead>
              <tbody>
                {q.solutions.slice(0, 12).map(s => (
                  <tr key={s.bits} className="border-t border-quantum-700/50 font-mono">
                    <td className={`py-1 pr-2 ${s.optimal ? 'text-quantum-neon' : 'text-gray-400'}`}>{s.bits}</td>
                    <td className="pr-2 text-gray-300">{s.count}</td>
                    <td className="pr-2 text-gray-300">{s.feasible ? 'yes' : 'no'}</td>
                    <td className="text-gray-300">{s.tour_names ? `${s.tour_names.join('→')} (${Math.round(Number(s.length))} km)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-300 text-xs mt-2">
            Valid routes: {pct(q.p_feasible)} of the chance (random bit-strings: {pct(q.random_p_feasible, 2)}). Highlighted bits are a shortest route.
          </p>
        </Card>
        <Card title="The Bridge: route problem → Ising Hamiltonian">
          <ol className="space-y-1 mb-3 list-decimal pl-5">
            {q.bridge.steps.map((s, i) => <li key={i} className="text-gray-300 text-xs leading-relaxed">{s}</li>)}
          </ol>
          <p className="text-xs font-mono text-quantum-neon/80 bg-quantum-900/60 rounded-lg p-2 max-h-24 overflow-y-auto break-words">
            {q.bridge.ising.hamiltonian}
          </p>
          <p className="text-gray-300 text-xs mt-2">
            {q.bridge.qubo.n} qubits · {q.bridge.qubo.nonzero_terms} QUBO terms · {plural(q.layers, 'QAOA layer')} · {num(q.circuit.gates)} gates
          </p>
        </Card>
      </div>
    </>
  );
}
