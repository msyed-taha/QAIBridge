import Plot from 'react-plotly.js';
import { CheckCircle2, Cpu, Sigma, XCircle, Zap } from 'lucide-react';
import { Card } from '../module2/SfodResultViews';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);

// ── Solutions in plain words ─────────────────────────────────────────────────

export function describeSolution(kind: string, s: Record<string, any> | null | undefined): string {
  if (!s) return '—';
  switch (kind) {
    case 'knapsack':
      return `${(s.selected ?? []).join(', ') || 'nothing'} — value ${s.total_value}, weight ${s.total_weight}${s.feasible === false ? ' (over capacity)' : ''}`;
    case 'maxcut':
      return `groups {${(s.partition?.[0] ?? []).join(', ')}} | {${(s.partition?.[1] ?? []).join(', ')}} — cut ${s.cut_value}`;
    case 'partition':
      return `{${(s.sets?.[0] ?? []).join(', ')}} vs {${(s.sets?.[1] ?? []).join(', ')}} — difference ${s.difference}`;
    case 'tsp':
      return s.feasible ? `tour ${(s.tour ?? []).join(' → ')} — length ${Number(s.length).toFixed(2)}` : 'not a valid tour';
    case 'portfolio':
      return s.feasible === false
        ? `${(s.selected ?? []).join(', ') || 'nothing'} — wrong number of assets`
        : `hold ${(s.selected ?? []).join(', ')} — return ${(s.expected_return * 100).toFixed(1)}%, risk ${(s.volatility * 100).toFixed(1)}%`;
    default:
      return JSON.stringify(s);
  }
}

// ── QUBO heat-map ────────────────────────────────────────────────────────────

export function QuboHeatmap({ matrix, variables }: { matrix: number[][]; variables: string[] }) {
  const n = matrix.length;
  const full = matrix.map((row, i) => row.map((v, j) => (j >= i ? v : matrix[j][i])));   // show symmetric view
  const labels = variables.map((v, i) => (v.length > 12 ? `x${i}` : v));
  return (
    <Plot
      data={[{
        type: 'heatmap', z: full, x: labels, y: labels,
        colorscale: [[0, '#cc44ff'], [0.5, '#12122b'], [1, '#00ffcc']], zmid: 0,
        hovertemplate: 'Q[%{y}, %{x}] = %{z:.3f}<extra></extra>', showscale: n <= 12,
      } as any]}
      layout={darkLayout({
        margin: { t: 10, r: 10, b: 70, l: 80 },
        xaxis: { tickangle: -45, tickfont: { size: 9 } },
        yaxis: { autorange: 'reversed', tickfont: { size: 9 } },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: Math.min(380, 140 + n * 18) }}
    />
  );
}

// ── Optimisation problems solved through the Bridge + QAOA ───────────────────

export function QaoaProblemView({ kind, details }: { kind: string; details: any }) {
  const { bridge, exact, qaoa } = details;
  const best = qaoa.best_sampled;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl p-5 border bg-red-950/10 border-red-900/40">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-red-400">Classical — exhaustive search</span>
          </div>
          <p className="text-white text-sm font-semibold mb-1">{describeSolution(kind, exact)}</p>
          <p className="text-gray-500 text-xs">{exact.method}: {exact.evaluations.toLocaleString()} evaluations in {exact.time_ms} ms.</p>
        </div>
        <div className="rounded-2xl p-5 border bg-teal-950/10 border-teal-800/50">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-quantum-neon" />
            <span className="text-xs font-semibold uppercase tracking-widest text-quantum-neon">Quantum — QAOA p = {qaoa.layers}</span>
          </div>
          <p className="text-white text-sm font-semibold mb-1">{describeSolution(kind, best)}</p>
          <p className="text-gray-500 text-xs">
            Best of {qaoa.shots} measurements · P(optimal) {pct(qaoa.p_optimal, 2)} vs {pct(qaoa.random_p_optimal, 2)} for a random guess
            {qaoa.p_feasible != null && <> · valid answers {pct(qaoa.p_feasible)}</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title={`QUBO matrix — ${bridge.qubo.n} variables`} icon={<Sigma className="w-4 h-4 text-purple-300" />}>
          <QuboHeatmap matrix={bridge.qubo.matrix} variables={bridge.qubo.variables} />
          <p className="text-gray-500 text-xs mt-1">
            Diagonal = linear terms, off-diagonal = pair interactions. Purple / green = negative / positive energy.
          </p>
        </Card>
        <Card title="QAOA training — the classical optimiser tunes γ, β">
          <Plot
            data={[
              { type: 'scatter', mode: 'lines', name: 'Objective', x: qaoa.trace.map((t: any) => t.evaluation),
                y: qaoa.trace.map((t: any) => t.value), line: { color: '#6666aa', width: 1 } },
              { type: 'scatter', mode: 'lines', name: 'Best so far', x: qaoa.trace.map((t: any) => t.evaluation),
                y: qaoa.trace.map((t: any) => t.best), line: { color: COLORS.neon, width: 2 } },
            ]}
            layout={darkLayout({ xaxis: { title: { text: 'Circuit evaluation' } }, yaxis: { title: { text: 'Energy' } } })}
            config={PLOT_CONFIG}
            style={{ width: '100%', height: 260 }}
          />
          <p className="text-gray-500 text-xs mt-1 font-mono">
            γ = [{qaoa.gammas.map((g: number) => g.toFixed(3)).join(', ')}] · β = [{qaoa.betas.map((b: number) => b.toFixed(3)).join(', ')}]
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card title="Ising Hamiltonian (what the quantum computer minimises)">
          <p className="text-[11px] font-mono text-quantum-neon/80 bg-quantum-900/60 rounded-lg p-3 max-h-40 overflow-y-auto break-words leading-relaxed">
            {bridge.ising.hamiltonian}
          </p>
          <ul className="mt-3 space-y-1">
            {bridge.steps.map((s: string, i: number) => <li key={i} className="text-gray-400 text-xs leading-relaxed">{i + 1}. {s}</li>)}
          </ul>
        </Card>
        <Card title="Most frequently measured answers">
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 text-left"><th className="py-1 pr-2">bits</th><th className="pr-2">shots</th><th>meaning</th></tr>
              </thead>
              <tbody>
                {qaoa.solutions.slice(0, 12).map((s: any) => (
                  <tr key={s.bits} className="border-t border-quantum-700/50 font-mono">
                    <td className={`py-1 pr-2 ${s.optimal ? 'text-quantum-neon' : 'text-gray-400'}`}>{s.bits}</td>
                    <td className="pr-2 text-gray-300">{s.count}</td>
                    <td className="text-gray-300">{describeSolution(kind, s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs mt-2">Highlighted = optimal (lowest energy).</p>
        </Card>
      </div>
    </>
  );
}

// ── Boolean logic ────────────────────────────────────────────────────────────

export function LogicView({ details }: { details: any }) {
  const d = details;
  const g = d.grover;
  const solSet = new Set((d.solutions ?? []).map((s: any) => s.index));
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card title="Truth table (classical reference)" className="lg:col-span-1">
          <p className="text-xs text-gray-400 mb-2 font-mono break-words">f = {d.normalized}</p>
          <div className="overflow-y-auto max-h-64">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-gray-500 text-left">
                  {d.variables.map((v: string) => <th key={v} className="pr-2 py-1">{v}</th>)}
                  <th>f</th>
                </tr>
              </thead>
              <tbody>
                {d.truth_table.map((r: any) => (
                  <tr key={r.index} className={`border-t border-quantum-700/40 ${r.value ? 'text-quantum-neon' : 'text-gray-500'}`}>
                    {r.bits.split('').map((b: string, i: number) => <td key={i} className="pr-2">{b}</td>)}
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.truth_table_truncated && <p className="text-[10px] text-gray-600 mt-1">First 64 rows shown.</p>}
          <p className="text-xs text-gray-400 mt-2">
            {d.n_solutions} of {2 ** d.n_variables} assignments satisfy f
            {d.tautology ? ' (always true)' : !d.satisfiable ? ' (unsatisfiable)' : ''}.
          </p>
        </Card>

        <Card title="Translation into linear algebra" className="lg:col-span-2">
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-gray-500 mb-1">1 · Phase oracle O<sub>f</sub> = diag((−1)<sup>f(x)</sup>) — first diagonal entries</p>
              <p className="font-mono text-gray-200 break-words">[{d.oracle.diagonal_preview.join(', ')}{2 ** d.n_variables > 16 ? ', …' : ''}]</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">2 · Algebraic normal form (XOR of AND-terms) → one multi-controlled X per term</p>
              <p className="font-mono text-quantum-neon/90 break-words">f = {d.anf}</p>
              <p className="text-gray-500 mt-1">
                Reversible circuit: {d.reversible_circuit.qubits} qubits, {d.reversible_circuit.gates} gate(s) —{' '}
                {Object.entries(d.reversible_circuit.ops).map(([k, v]) => `${v}× ${k}`).join(', ') || 'no gates (constant)'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">3 · Hamiltonian H<sub>f</sub> = Σ (1 − f(x))|x⟩⟨x| — ground states are the solutions</p>
              <p className="font-mono text-purple-300 break-words max-h-20 overflow-y-auto">{d.hamiltonian.hamiltonian}</p>
              <p className="text-gray-500 mt-1">{d.hamiltonian.n_terms} Pauli-Z term(s), up to {d.hamiltonian.max_locality}-body interactions.</p>
            </div>
            <div className={`flex items-start gap-2 rounded-lg p-2 border ${d.verification.verified ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-red-600/40 bg-red-500/5'}`}>
              {d.verification.verified
                ? <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-300 flex-shrink-0" />}
              <p className={d.verification.verified ? 'text-emerald-200' : 'text-red-200'}>{d.verification.method}</p>
            </div>
          </div>
        </Card>
      </div>

      {d.satisfiable && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <Card title="Grover search for a satisfying assignment" icon={<Zap className="w-4 h-4 text-quantum-neon" />}>
            {g.curve.length > 1 ? (
              <Plot
                data={[
                  { type: 'scatter', mode: 'lines', name: 'Theory', x: g.curve.map((p: any) => p.iteration),
                    y: g.curve.map((p: any) => p.theory), line: { color: COLORS.purple, dash: 'dot' } },
                  { type: 'scatter', mode: 'lines+markers', name: 'Kernel', x: g.curve.map((p: any) => p.iteration),
                    y: g.curve.map((p: any) => p.success_probability), line: { color: COLORS.neon } },
                ]}
                layout={darkLayout({ xaxis: { title: { text: 'Iteration' }, dtick: 1 }, yaxis: { title: { text: 'P(satisfying)' }, range: [0, 1.05] } })}
                config={PLOT_CONFIG}
                style={{ width: '100%', height: 240 }}
              />
            ) : (
              <p className="text-gray-400 text-xs">
                {d.n_solutions} of {2 ** d.n_variables} assignments are solutions (≥ half), so no amplification is needed —
                a single measurement already succeeds with probability {pct(g.success_probability)}.
              </p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              {g.iterations} iteration(s) · {g.qubits} qubits · {g.gates} gates · P(satisfying) = {pct(g.success_probability)}
            </p>
          </Card>
          <Card title={`Measured assignments (${g.shots} shots)`}>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {g.measured.map((m: any) => (
                <div key={m.index} className="flex items-center gap-2 text-xs font-mono">
                  <span className={m.satisfies ? 'text-quantum-neon' : 'text-gray-500'}>{m.bits}</span>
                  <span className="text-gray-400">
                    {d.variables.map((v: string, i: number) => `${v}=${m.bits[i]}`).join(' ')}
                  </span>
                  <span className="ml-auto text-gray-500">{m.count}×</span>
                  {m.satisfies ? <CheckCircle2 className="w-3.5 h-3.5 text-quantum-neon" /> : <XCircle className="w-3.5 h-3.5 text-gray-600" />}
                </div>
              ))}
            </div>
            {solSet.size > 0 && <p className="text-gray-500 text-xs mt-2">Green rows satisfy f (checked against the truth table).</p>}
          </Card>
        </div>
      )}
    </>
  );
}
