import Plot from 'react-plotly.js';
import { CheckCircle2, Cpu, Info, XCircle, Zap } from 'lucide-react';
import type {
  ComparisonResult, GroverQuantum, QaoaQuantum, ShorQuantum, SideResult,
} from '../../api/sfod';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

// ── small helpers ────────────────────────────────────────────────────────────

const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const num = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString());
const ms = (x: number | null | undefined) =>
  x == null ? '—' : x < 1 ? `${x.toFixed(3)} ms` : x < 1000 ? `${x.toFixed(1)} ms` : `${(x / 1000).toFixed(2)} s`;

function Badge({ ok, yes = 'Correct', no = 'Incorrect' }: { ok: boolean; yes?: string; no?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> {no}
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
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`text-xs font-mono text-right ${accent ? 'text-quantum-neon font-semibold' : 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

// ── Answer formatting per algorithm ──────────────────────────────────────────

function answerText(result: ComparisonResult, side: 'classical' | 'quantum'): string {
  const s = result[side] as SideResult & Record<string, any>;
  const a = s.answer ?? {};
  switch (result.algorithm) {
    case 'search':
      return a.index == null ? 'Not found' : `Item #${a.index}${a.value != null && a.value !== String(a.index) ? ` ("${a.value}")` : ''}`;
    case 'database':
      return side === 'classical'
        ? `${a.matches} matching record(s)`
        : `${a.matches_seen} distinct match(es) retrieved`;
    case 'factoring': {
      const f = a.factors as number[] | null;
      return f && f.length ? `${result.input.N} = ${f.join(' × ')}` : 'No factors found';
    }
    case 'optimization': {
      const t = a.tour as string[] | null;
      return t ? `${t.join(' → ')} (${Math.round(Number(a.length_km)).toLocaleString()} km)` : 'No valid tour sampled';
    }
  }
}

// ── Verdict + side-by-side ───────────────────────────────────────────────────

export function VerdictBanner({ result }: { result: ComparisonResult<any> }) {
  const c = result.classical;
  const q = result.quantum;
  const fewer = c.steps > 0 && q.steps > 0 && q.steps < c.steps;
  let headline: string;
  if (result.algorithm === 'search' || result.algorithm === 'database') {
    headline = q.steps === 0
      ? 'No amplification needed for this input'
      : fewer
        ? `Quantum needed ${num(q.steps)} oracle queries vs ${num(c.steps)} classical ${c.steps_label} — ${(c.steps / q.steps).toFixed(1)}× fewer`
        : `At this tiny size classical needed ${num(c.steps)} ${c.steps_label} vs ${num(q.steps)} oracle queries — the gap opens as N grows`;
  } else if (result.algorithm === 'factoring') {
    headline = q.correct
      ? `Shor's algorithm factored ${result.input.N} from a quantum-measured period`
      : (q as ShorQuantum).message;
  } else {
    const qa = q as QaoaQuantum;
    headline = q.correct
      ? `QAOA's best measured route is the true optimum — ${(qa.amplification ?? 0).toFixed(1)}× more likely than a random guess`
      : `QAOA's best measured route is within ${(((Number(q.answer.length_km) / Number(c.answer.length_km)) - 1) * 100).toFixed(1)}% of optimal`;
  }
  return (
    <div className="rounded-2xl border border-quantum-neon/30 p-5 mb-5"
      style={{ background: 'linear-gradient(135deg, rgba(0,255,204,0.06), rgba(204,68,255,0.06))' }}>
      <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Result</p>
      <p className="text-white font-bold text-base leading-snug">{headline}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="text-xs text-gray-400">Classical answer: <span className="text-gray-200">{answerText(result, 'classical')}</span></span>
        <Badge ok={c.correct} />
        <span className="text-xs text-gray-400 sm:ml-4">Quantum answer: <span className="text-gray-200">{answerText(result, 'quantum')}</span></span>
        <Badge ok={q.correct} />
      </div>
    </div>
  );
}

export function SideBySide({ result }: { result: ComparisonResult<any> }) {
  const c = result.classical;
  const q = result.quantum as SideResult & Record<string, any>;
  const qCirc = q.circuit ?? (q.detail ? { qubits: q.detail.qubits, gates: q.detail.gates, depth: q.detail.depth } : null);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      <div className="rounded-2xl p-5 border bg-red-950/10 border-red-900/40">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-red-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-red-400">Classical</span>
          <span className="ml-auto font-mono text-red-300 text-sm">{c.complexity}</span>
        </div>
        <p className="text-white font-bold text-sm mb-3">{c.algorithm}</p>
        <Row label={`Steps (${c.steps_label})`} value={num(c.steps)} />
        {result.algorithm === 'search' && <Row label="Expected on average (N/2)" value={num(result.comparison.classical_expected)} />}
        {result.algorithm === 'database' && <Row label="Full scan (all matches)" value={`${num(result.comparison.full_scan_reads)} reads`} />}
        {result.algorithm === 'optimization' && c.greedy && (
          <Row label="Greedy heuristic" value={`${Math.round(Number(c.greedy.length)).toLocaleString()} km (${result.comparison.greedy_gap_pct}% longer)`} />
        )}
        <Row label="Wall-clock time (CPU)" value={ms(c.time_ms)} />
        <Row label="Answer" value={answerText(result, 'classical')} />
      </div>
      <div className="rounded-2xl p-5 border bg-teal-950/10 border-teal-800/50">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-quantum-neon" />
          <span className="text-xs font-semibold uppercase tracking-widest text-quantum-neon">Quantum (simulated)</span>
          <span className="ml-auto font-mono text-quantum-neon text-sm">{q.complexity}</span>
        </div>
        <p className="text-white font-bold text-sm mb-3">{q.algorithm}</p>
        <Row label={`Steps (${q.steps_label})`} value={num(q.steps)} accent />
        {'success_probability' in q && <Row label="Success probability (state vector)" value={pct(q.success_probability as number)} accent />}
        {'p_optimal' in q && <Row label="P(optimal tour) vs random guess" value={`${pct(q.p_optimal as number, 2)} vs ${pct(q.random_p_optimal as number, 3)}`} accent />}
        {qCirc && <Row label="Qubits · gates · depth" value={`${qCirc.qubits} · ${num(qCirc.gates)} · ${num(qCirc.depth)}`} />}
        <Row label="Simulation time (CPU emulating the QPU)" value={ms(q.time_ms)} />
        <Row label="Answer" value={answerText(result, 'quantum')} />
      </div>
    </div>
  );
}

export function NotesPanel({ notes }: { notes: string[] }) {
  if (!notes?.length) return null;
  return (
    <div className="bg-quantum-800/60 border border-quantum-700 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Info className="w-4 h-4 text-blue-300" />
        <h3 className="text-white font-bold text-sm">How to read this</h3>
      </div>
      <ul className="space-y-1.5">
        {notes.map((n, i) => <li key={i} className="text-gray-400 text-xs leading-relaxed">• {n}</li>)}
      </ul>
    </div>
  );
}

// ── Grover / amplitude amplification ─────────────────────────────────────────

export function AmplificationChart({ q }: { q: GroverQuantum }) {
  const x = q.curve.map(p => p.iteration);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Theory sin²((2k+1)θ)', x, y: q.curve.map(p => p.theory),
          line: { color: COLORS.purple, width: 2, dash: 'dot' } },
        { type: 'scatter', mode: 'lines+markers', name: 'Measured on the kernel', x, y: q.curve.map(p => p.success_probability),
          line: { color: COLORS.neon, width: 2 }, marker: { size: 6 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Grover iteration k' }, ...(x.length <= 12 ? { dtick: 1 } : {}) },
        yaxis: { title: { text: 'P(measure a marked item)' }, range: [0, 1.05] },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 260 }}
    />
  );
}

export function HistogramChart({ q, label }: { q: GroverQuantum; label: (i: number) => string }) {
  const bars = q.histogram.slice(0, 16);
  return (
    <Plot
      data={[{
        type: 'bar', x: bars.map(b => label(b.index)), y: bars.map(b => b.count),
        marker: { color: bars.map(b => (b.marked ? COLORS.neon : '#3b3b7a')) },
        hovertemplate: '%{x}: %{y} shots<extra></extra>',
      }]}
      layout={darkLayout({
        xaxis: { title: { text: 'Measured outcome' }, type: 'category', tickangle: -35 },
        yaxis: { title: { text: `Count (of ${q.shots} shots)` } },
        margin: { t: 10, r: 10, b: 80, l: 56 },
        showlegend: false,
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 260 }}
    />
  );
}

export function ScalingChart({ rows }: { rows: { n_items: number; classical_expected: number; quantum: number }[] }) {
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Classical ≈ N/2 comparisons', x: rows.map(r => r.n_items),
          y: rows.map(r => r.classical_expected), line: { color: COLORS.classical, width: 2 } },
        { type: 'scatter', mode: 'lines', name: "Grover ≈ π/4·√N queries", x: rows.map(r => r.n_items),
          y: rows.map(r => r.quantum), line: { color: COLORS.neon, width: 2 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Items N (log scale)' }, type: 'log' },
        yaxis: { title: { text: 'Queries (log scale)' }, type: 'log' },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 260 }}
    />
  );
}

export function GroverViews({ result }: { result: ComparisonResult<GroverQuantum> }) {
  const q = result.quantum;
  const label = (i: number) => (result.algorithm === 'database' ? `#${i}` : `${i}`);
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="Amplitude amplification — probability of the answer" icon={<Zap className="w-4 h-4 text-quantum-neon" />}>
          <AmplificationChart q={q} />
          <p className="text-gray-500 text-xs mt-1">
            Starts at 1/N = {pct(q.uniform_probability, 3)} (uniform superposition) and rises to {pct(q.success_probability)} after
            {' '}{q.iterations} iteration(s). The kernel's values sit exactly on the theoretical curve.
          </p>
        </Card>
        <Card title={`Measurement histogram (${q.shots} simulated shots)`} icon={<Zap className="w-4 h-4 text-quantum-neon" />}>
          <HistogramChart q={q} label={label} />
          <p className="text-gray-500 text-xs mt-1">
            Green bars are marked items. {pct(q.measured_success_rate)} of the shots returned a correct answer.
          </p>
        </Card>
      </div>
      {result.algorithm === 'search' && result.comparison.scaling && (
        <Card title="Why it matters at scale — queries needed vs dataset size" className="mb-5">
          <ScalingChart rows={result.comparison.scaling} />
          <p className="text-gray-500 text-xs mt-1">
            For a billion items a classical scan needs ~500 million comparisons on average; Grover needs ~24,800 oracle queries.
          </p>
        </Card>
      )}
      {result.algorithm === 'database' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <Card title={`Records retrieved by amplitude amplification (${q.retrieved?.length ?? 0} distinct)`}>
            <RecordList rows={(q.retrieved ?? []).map(r => ({ index: r.index, text: r.record, extra: `${r.count}×` }))} />
          </Card>
          <Card title={`All matching records — classical full scan (${result.input.n_matches})`}>
            <RecordList rows={(result.classical.matching_records ?? []).map((r: any) => ({ index: r.index, text: r.record }))} />
          </Card>
        </div>
      )}
    </>
  );
}

function RecordList({ rows }: { rows: { index: number; text: string; extra?: string }[] }) {
  if (!rows.length) return <p className="text-gray-500 text-xs">No records.</p>;
  return (
    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
      {rows.map(r => (
        <div key={r.index} className="flex items-center gap-2 bg-quantum-900/60 rounded-lg px-2.5 py-1.5">
          <span className="text-gray-600 font-mono text-[10px] w-10 flex-shrink-0">#{r.index}</span>
          <span className="text-gray-300 text-xs flex-1 truncate">{r.text}</span>
          {r.extra && <span className="text-quantum-neon font-mono text-[10px]">{r.extra}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Shor ─────────────────────────────────────────────────────────────────────

export function ShorViews({ result }: { result: ComparisonResult<ShorQuantum> }) {
  const q = result.quantum;
  const d = q.detail;
  const table = result.comparison.crypto_table as { bits: number; logical_qubits: number; quantum_gates: number; classical_gnfs_ops: number }[];
  return (
    <>
      {d && d.peaks && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
          <Card title={`Counting-register distribution after the inverse QFT (a = ${d.a})`} className="lg:col-span-3"
            icon={<Zap className="w-4 h-4 text-quantum-neon" />}>
            <Plot
              data={[{
                type: 'bar', x: d.peaks.map(p => p.y), y: d.peaks.map(p => p.probability),
                marker: { color: COLORS.neon }, hovertemplate: 'y = %{x}<br>P = %{y:.4f}<extra></extra>',
              }]}
              layout={darkLayout({
                xaxis: { title: { text: `Measured value y (0 … ${2 ** (d.counting_qubits ?? 0) - 1})` },
                         range: [-0.5, 2 ** (d.counting_qubits ?? 0)] },
                yaxis: { title: { text: 'Probability' } },
                showlegend: false,
                bargap: 0.1,
              })}
              config={PLOT_CONFIG}
              style={{ width: '100%', height: 260 }}
            />
            <p className="text-gray-500 text-xs mt-1">
              Peaks sit at multiples of 2^{d.counting_qubits}/r = {(2 ** (d.counting_qubits ?? 0) / (d.true_period || 1)).toFixed(2)}
              {' '}— the period r = {d.true_period} of {d.a}^x mod {result.input.N} is encoded in their spacing.
              Circuit: {d.qubits} qubits ({d.counting_qubits} counting + {d.work_qubits} work), {num(d.gates)} gates, depth {num(d.depth)}.
            </p>
          </Card>
          <Card title="Classical post-processing (continued fractions)" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="py-1 pr-2">y</th><th className="pr-2">shots</th><th className="pr-2">y/2^t</th>
                    <th className="pr-2">≈ s/r</th><th>period?</th>
                  </tr>
                </thead>
                <tbody>
                  {d.post_processing.map((pp, i) => (
                    <tr key={i} className="border-t border-quantum-700/50 text-gray-300 font-mono">
                      <td className="py-1 pr-2">{pp.measured}</td>
                      <td className="pr-2">{pp.count}</td>
                      <td className="pr-2">{pp.phase.toFixed(4)}</td>
                      <td className="pr-2">{pp.fraction}</td>
                      <td className={pp.period ? 'text-quantum-neon' : 'text-gray-500'}>{pp.period ?? '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.period && (
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                r = {q.period} is even, so gcd({q.a}<sup>{q.period / 2}</sup> ± 1, {result.input.N}) gives the factors
                {' '}<span className="text-quantum-neon font-mono">{(q.answer.factors as number[] | null)?.join(' × ')}</span>.
              </p>
            )}
          </Card>
        </div>
      )}
      {q.attempts.length > 1 && (
        <Card title="Attempts (Shor's algorithm is probabilistic)" className="mb-5">
          <div className="flex flex-wrap gap-2">
            {q.attempts.map((a, i) => (
              <span key={i} className={`text-xs font-mono px-2 py-1 rounded-lg border ${a.success ? 'border-emerald-600/50 text-emerald-300' : 'border-quantum-600 text-gray-400'}`}>
                a={a.a} · r={a.true_period ?? '?'} → {a.success ? 'factors ✓' : 'retry'}
              </span>
            ))}
          </div>
        </Card>
      )}
      {table && (
        <Card title="Cryptographic implications — factoring RSA-size numbers" className="mb-5">
          <Plot
            data={[
              { type: 'scatter', mode: 'lines+markers', name: 'Classical (number field sieve) operations',
                x: table.map(r => r.bits), y: table.map(r => r.classical_gnfs_ops), line: { color: COLORS.classical } },
              { type: 'scatter', mode: 'lines+markers', name: "Shor's algorithm gates (~4n³)",
                x: table.map(r => r.bits), y: table.map(r => r.quantum_gates), line: { color: COLORS.neon } },
            ]}
            layout={darkLayout({
              xaxis: { title: { text: 'Key size (bits)' }, type: 'log', tickvals: table.map(r => r.bits) },
              yaxis: { title: { text: 'Operations (log scale)' }, type: 'log' },
            })}
            config={PLOT_CONFIG}
            style={{ width: '100%', height: 260 }}
          />
          <p className="text-gray-500 text-xs mt-1">
            RSA-2048 would need ≈ {num(table[table.length - 1].logical_qubits)} error-corrected logical qubits (2n+3) —
            far beyond today's hardware, but only polynomial effort, which is why post-quantum cryptography is being standardised.
          </p>
        </Card>
      )}
    </>
  );
}

// ── QAOA / TSP ───────────────────────────────────────────────────────────────

export function TspViews({ result }: { result: ComparisonResult<QaoaQuantum> }) {
  const q = result.quantum;
  const names: string[] = result.input.cities;
  const coords: [number, number][] = result.input.coords;
  const path = (tour: number[] | null | undefined) => (tour ?? []).map(i => coords[i]);
  const opt = path(result.classical.tour as number[]);
  const best = path(q.best_sampled.tour ?? undefined);
  const greedy = path(result.classical.greedy?.tour as number[]);
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="Routes on real coordinates (longitude / latitude)">
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'Greedy', x: greedy.map(c => c[1]), y: greedy.map(c => c[0]),
                line: { color: COLORS.amber, width: 1.5, dash: 'dot' } },
              { type: 'scatter', mode: 'lines', name: 'Classical optimum', x: opt.map(c => c[1]), y: opt.map(c => c[0]),
                line: { color: COLORS.classical, width: 5 }, opacity: 0.5 },
              { type: 'scatter', mode: 'lines', name: 'QAOA best sample', x: best.map(c => c[1]), y: best.map(c => c[0]),
                line: { color: COLORS.neon, width: 2 } },
              { type: 'scatter', mode: 'text+markers', name: 'Cities', x: coords.map(c => c[1]), y: coords.map(c => c[0]),
                text: names, textposition: names.map((_, i) => (i % 2 ? 'bottom center' : 'top center')) as any,
                marker: { size: 10, color: '#ffffff' }, textfont: { color: '#ddd' } },
            ]}
            layout={darkLayout({
              xaxis: { title: { text: 'Longitude' } },
              yaxis: { title: { text: 'Latitude' }, scaleanchor: 'x' },
            })}
            config={PLOT_CONFIG}
            style={{ width: '100%', height: 300 }}
          />
        </Card>
        <Card title="QAOA training — classical optimiser tuning γ, β">
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'Objective (CVaR energy)', x: q.trace.map(t => t.evaluation),
                y: q.trace.map(t => t.value), line: { color: '#6666aa', width: 1 } },
              { type: 'scatter', mode: 'lines', name: 'Best so far', x: q.trace.map(t => t.evaluation),
                y: q.trace.map(t => t.best), line: { color: COLORS.neon, width: 2 } },
            ]}
            layout={darkLayout({
              xaxis: { title: { text: 'Circuit evaluation' } },
              yaxis: { title: { text: 'Energy (lower = shorter route)' } },
            })}
            config={PLOT_CONFIG}
            style={{ width: '100%', height: 300 }}
          />
          <p className="text-gray-500 text-xs mt-1 font-mono">
            γ = [{q.gammas.map(g => g.toFixed(3)).join(', ')}] · β = [{q.betas.map(b => b.toFixed(3)).join(', ')}]
          </p>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="Most frequently measured bit-strings">
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1 pr-2">bits</th><th className="pr-2">shots</th><th className="pr-2">valid?</th><th>route</th>
                </tr>
              </thead>
              <tbody>
                {q.solutions.slice(0, 12).map(s => (
                  <tr key={s.bits} className="border-t border-quantum-700/50 font-mono">
                    <td className={`py-1 pr-2 ${s.optimal ? 'text-quantum-neon' : 'text-gray-400'}`}>{s.bits}</td>
                    <td className="pr-2 text-gray-300">{s.count}</td>
                    <td className="pr-2">{s.feasible ? '✓' : '✗'}</td>
                    <td className="text-gray-300">{s.tour_names ? `${s.tour_names.join('→')} (${Math.round(Number(s.length))} km)` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs mt-2">
            Valid tours: {pct(q.p_feasible)} of the probability (random guessing: {pct(q.random_p_feasible, 2)}). Highlighted rows are optimal.
          </p>
        </Card>
        <Card title="The Bridge — route problem → Ising Hamiltonian">
          <ul className="space-y-1 mb-3">
            {q.bridge.steps.map((s, i) => <li key={i} className="text-gray-400 text-xs leading-relaxed">{i + 1}. {s}</li>)}
          </ul>
          <p className="text-[10px] font-mono text-quantum-neon/80 bg-quantum-900/60 rounded-lg p-2 max-h-24 overflow-y-auto break-words">
            {q.bridge.ising.hamiltonian}
          </p>
          <p className="text-gray-500 text-[11px] mt-2">
            {q.bridge.qubo.n} qubits · {q.bridge.qubo.nonzero_terms} QUBO terms · {q.layers} QAOA layer(s) · {num(q.circuit.gates)} gates
          </p>
        </Card>
      </div>
    </>
  );
}
