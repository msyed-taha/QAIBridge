import Plot from 'react-plotly.js';
import type { AiPoint, FactoringPoint, KernelPoint, OptimizationPoint, SearchPoint } from '../../api/dashboard';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

// One y-axis per chart: a second measure goes in the hover text and the numbers table, or in its own panel.
const H = 300;
const EMPTY = (
  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm border border-dashed border-quantum-700 rounded-xl">
    Waiting for data: run the benchmark
  </div>
);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Queries needed to find one item: linear search against Grover's oracle calls. */
export function SearchChart({ points }: { points: SearchPoint[] }) {
  if (!points.length) return EMPTY;
  const x = points.map(p => p.items);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Linear search, expected (N/2)', x, y: points.map(p => p.classical_expected),
          line: { color: COLORS.classical, width: 2, dash: 'dot' }, hovertemplate: '%{x} items: %{y} comparisons expected<extra></extra>' },
        { type: 'scatter', mode: 'markers', name: 'Linear search, measured', x, y: points.map(p => p.classical_comparisons),
          marker: { color: COLORS.classical, size: 8 }, hovertemplate: '%{x} items: %{y} comparisons<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'Grover oracle queries', x, y: points.map(p => Math.max(p.grover_queries, 1)),
          customdata: points.map(p => [pct(p.success_probability), p.query_speedup]),
          line: { color: COLORS.neon, width: 2 }, marker: { size: 8 },
          hovertemplate: '%{x} items: %{y} queries, finds it with %{customdata[0]} chance (%{customdata[1]}× fewer)<extra></extra>' },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Items N (log scale)' }, type: 'log', dtick: 1 },
        yaxis: { title: { text: 'Queries (log scale)' }, type: 'log', dtick: 1 },
        margin: { t: 60, r: 16, b: 52, l: 60 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

/** Qubits Shor's algorithm used for each number; green when it found the factors. */
export function FactoringChart({ points }: { points: FactoringPoint[] }) {
  if (!points.length) return EMPTY;
  return (
    <Plot
      data={[
        { type: 'bar', name: 'Qubits used', x: points.map(p => String(p.N)), y: points.map(p => p.qubits ?? 0),
          marker: { color: points.map(p => (p.success ? COLORS.neon : COLORS.classical)) },
          customdata: points.map(p => [p.success ? `factored: ${p.factors}` : 'not factored', p.period ?? '—', p.classical_divisions]),
          hovertemplate: 'N = %{x}: %{y} qubits, %{customdata[0]}, period %{customdata[1]}<br>trial division: %{customdata[2]} divisions<extra></extra>' },
      ]}
      layout={darkLayout({
        showlegend: false,
        xaxis: { title: { text: 'N (green: factored by Shor, red: not)' }, type: 'category' },
        yaxis: { title: { text: 'Qubits used' } },
        margin: { t: 20, r: 16, b: 52, l: 56 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

/** Chance of sampling the best cut: QAOA against a random guess. */
export function OptimizationChart({ points }: { points: OptimizationPoint[] }) {
  if (!points.length) return EMPTY;
  const x = points.map(p => p.nodes);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines+markers', name: 'QAOA', x, y: points.map(p => p.p_optimal),
          customdata: points.map(p => [p.approx_ratio, p.amplification]),
          line: { color: COLORS.neon, width: 2 }, marker: { size: 8 },
          hovertemplate: '%{x} nodes: best cut with chance %{y:.3f} (%{customdata[1]:.1f}× a guess), approximation ratio %{customdata[0]:.3f}<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'Random guess', x, y: points.map(p => p.random_p_optimal),
          line: { color: COLORS.classical, width: 1.5, dash: 'dot' }, marker: { size: 7 },
          hovertemplate: '%{x} nodes: best cut with chance %{y:.4f}<extra></extra>' },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Graph nodes (= qubits)' }, dtick: 1 },
        yaxis: { title: { text: 'Chance of the best cut (log scale)' }, type: 'log', dtick: 1 },
        margin: { t: 60, r: 16, b: 52, l: 64 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

/** The memory wall: memory and time per circuit, in two panels that share the qubit axis. */
export function KernelChart({ points }: { points: KernelPoint[] }) {
  const pts = points.filter(p => !p.skipped);
  if (!pts.length) return EMPTY;
  const x = pts.map(p => p.qubits);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines+markers', name: 'State-vector memory', x, y: pts.map(p => p.memory_mb ?? 0),
          line: { color: COLORS.amber, width: 2 }, hovertemplate: '%{x} qubits: %{y} MB<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'QFT run time', x, y: pts.map(p => p.qft_ms ?? 0), xaxis: 'x', yaxis: 'y2',
          line: { color: COLORS.neon, width: 2 }, hovertemplate: '%{x} qubits: QFT in %{y:.1f} ms<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'GHZ run time', x, y: pts.map(p => p.ghz_ms ?? 0), xaxis: 'x', yaxis: 'y2',
          line: { color: COLORS.purple, width: 1.5 }, hovertemplate: '%{x} qubits: GHZ in %{y:.1f} ms<extra></extra>' },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Qubits' }, dtick: 2, anchor: 'y2' },
        yaxis: { title: { text: 'Memory (MB)' }, type: 'log', dtick: 1, domain: [0.56, 1] },
        yaxis2: { title: { text: 'Time (ms)' }, type: 'log', dtick: 1, domain: [0, 0.44], gridcolor: COLORS.grid, zerolinecolor: COLORS.grid },
        margin: { t: 60, r: 16, b: 52, l: 64 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H + 60 }}
    />
  );
}

/** Training loss of both AI experiments, each in its own panel: they measure loss differently. */
export function AiChart({ points }: { points: AiPoint[] }) {
  if (!points.length) return EMPTY;
  const colors = { qnn_vs_mlp: [COLORS.blue, COLORS.purple], angle_optimizer: [COLORS.classical, COLORS.neon] } as const;
  const names = { qnn_vs_mlp: ['Classical network', 'Quantum network'], angle_optimizer: ['Random start', 'Neural Angle Optimizer'] } as const;
  const traces = points.flatMap(p => {
    const axis = p.experiment === 'qnn_vs_mlp' ? { xaxis: 'x', yaxis: 'y' } : { xaxis: 'x2', yaxis: 'y2' };
    const [cc, qc] = colors[p.experiment];
    const [cn, qn] = names[p.experiment];
    return [
      { type: 'scatter' as const, mode: 'lines' as const, name: cn, ...axis, x: p.classical_curve.map((_, k) => k), y: p.classical_curve,
        line: { color: cc, width: 1.5, dash: 'dot' as const }, hovertemplate: `step %{x}: loss %{y:.3f}<extra>${cn}</extra>` },
      { type: 'scatter' as const, mode: 'lines' as const, name: qn, ...axis, x: p.quantum_curve.map((_, k) => k), y: p.quantum_curve,
        line: { color: qc, width: 2 }, hovertemplate: `step %{x}: loss %{y:.3f}<extra>${qn}</extra>` },
    ];
  });
  return (
    <Plot
      data={traces}
      layout={darkLayout({
        xaxis: { title: { text: 'Training step' }, domain: [0, 0.44] },
        yaxis: { title: { text: 'Converter loss (cross-entropy)' }, rangemode: 'tozero' },
        xaxis2: { title: { text: 'Training step' }, domain: [0.56, 1], anchor: 'y2', gridcolor: COLORS.grid, zerolinecolor: COLORS.grid },
        yaxis2: { title: { text: 'Race loss (squared error)' }, anchor: 'x2', rangemode: 'tozero', gridcolor: COLORS.grid, zerolinecolor: COLORS.grid },
        margin: { t: 60, r: 16, b: 52, l: 56 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H + 20 }}
    />
  );
}
