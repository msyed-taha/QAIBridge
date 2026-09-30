import Plot from 'react-plotly.js';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

const H = 280;
const EMPTY = (
  <div className="h-[280px] flex items-center justify-center text-gray-600 text-xs border border-dashed border-quantum-700 rounded-xl">
    Waiting for data — run the benchmark
  </div>
);

export function SearchChart({ points }: { points: any[] }) {
  if (!points.length) return EMPTY;
  const x = points.map(p => p.items);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines', name: 'Classical expected (N/2)', x, y: points.map(p => p.classical_expected),
          line: { color: COLORS.classical, width: 2, dash: 'dot' } },
        { type: 'scatter', mode: 'markers', name: 'Classical measured', x, y: points.map(p => p.classical_comparisons),
          marker: { color: COLORS.classical, size: 7 } },
        { type: 'scatter', mode: 'lines+markers', name: 'Grover oracle queries', x, y: points.map(p => Math.max(p.grover_queries, 1)),
          line: { color: COLORS.neon, width: 2 }, marker: { size: 7 } },
        { type: 'scatter', mode: 'lines', name: 'P(success) →', x, y: points.map(p => p.success_probability), yaxis: 'y2',
          line: { color: COLORS.purple, width: 1.5 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Items N (log)' }, type: 'log' },
        yaxis: { title: { text: 'Queries (log)' }, type: 'log' },
        yaxis2: { overlaying: 'y', side: 'right', range: [0, 1.05], tickfont: { color: COLORS.purple }, showgrid: false,
                  title: { text: 'P(success)', font: { color: COLORS.purple } } },
        margin: { t: 44, r: 56, b: 48, l: 56 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

export function FactoringChart({ points }: { points: any[] }) {
  if (!points.length) return EMPTY;
  const x = points.map(p => String(p.N));
  return (
    <Plot
      data={[
        { type: 'bar', name: 'Qubits used', x, y: points.map(p => p.qubits ?? 0),
          marker: { color: points.map(p => (p.success ? COLORS.neon : COLORS.classical)) },
          hovertemplate: 'N = %{x}<br>%{y} qubits<extra></extra>' },
        { type: 'scatter', mode: 'lines+markers', name: 'Simulation time (ms) →', x, y: points.map(p => p.quantum_sim_ms),
          yaxis: 'y2', line: { color: COLORS.purple, width: 2 } },
        { type: 'scatter', mode: 'lines+markers', name: 'Trial divisions →', x, y: points.map(p => p.classical_divisions),
          yaxis: 'y2', line: { color: COLORS.classical, width: 1.5, dash: 'dot' } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'N (green = factored by Shor)' }, type: 'category' },
        yaxis: { title: { text: 'Qubits' } },
        yaxis2: { overlaying: 'y', side: 'right', type: 'log', showgrid: false, tickfont: { color: COLORS.purple } },
        margin: { t: 44, r: 56, b: 48, l: 48 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

export function OptimizationChart({ points }: { points: any[] }) {
  if (!points.length) return EMPTY;
  const x = points.map(p => p.nodes);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines+markers', name: 'QAOA P(optimal)', x, y: points.map(p => p.p_optimal),
          line: { color: COLORS.neon, width: 2 } },
        { type: 'scatter', mode: 'lines+markers', name: 'Random guess P(optimal)', x, y: points.map(p => p.random_p_optimal),
          line: { color: COLORS.classical, width: 1.5, dash: 'dot' } },
        { type: 'scatter', mode: 'lines+markers', name: 'Approximation ratio →', x, y: points.map(p => p.approx_ratio),
          yaxis: 'y2', line: { color: COLORS.purple, width: 2 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Graph nodes = qubits' }, dtick: 1 },
        yaxis: { title: { text: 'Probability (log)' }, type: 'log' },
        yaxis2: { overlaying: 'y', side: 'right', range: [0, 1.05], showgrid: false, tickfont: { color: COLORS.purple } },
        margin: { t: 44, r: 56, b: 48, l: 56 },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

export function KernelChart({ points }: { points: any[] }) {
  const pts = points.filter(p => !p.skipped);
  if (!pts.length) return EMPTY;
  const x = pts.map(p => p.qubits);
  return (
    <Plot
      data={[
        { type: 'scatter', mode: 'lines+markers', name: 'State-vector memory (MB)', x, y: pts.map(p => p.memory_mb),
          line: { color: COLORS.amber, width: 2 } },
        { type: 'scatter', mode: 'lines+markers', name: 'QFT time (ms)', x, y: pts.map(p => p.qft_ms),
          line: { color: COLORS.neon, width: 2 } },
        { type: 'scatter', mode: 'lines+markers', name: 'GHZ time (ms)', x, y: pts.map(p => p.ghz_ms),
          line: { color: COLORS.purple, width: 1.5 } },
      ]}
      layout={darkLayout({
        xaxis: { title: { text: 'Qubits' }, dtick: 2 },
        yaxis: { title: { text: 'MB / ms (log)' }, type: 'log' },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}

export function AiChart({ points }: { points: any[] }) {
  if (!points.length) return EMPTY;
  const traces: any[] = [];
  const palette = [[COLORS.classical, COLORS.neon], ['#f59e0b', COLORS.purple]];
  points.forEach((p, i) => {
    const [cc, qc] = palette[i % 2];
    const name = p.experiment === 'qnn_vs_mlp' ? ['Classical MLP', 'Quantum NN'] : ['Raw-angle SGD', 'Neural Angle Optimizer'];
    traces.push({ type: 'scatter', mode: 'lines', name: name[0], x: p.classical_curve.map((_: number, k: number) => k + 1),
      y: p.classical_curve, line: { color: cc, width: 1.5, dash: 'dot' } });
    traces.push({ type: 'scatter', mode: 'lines', name: name[1], x: p.quantum_curve.map((_: number, k: number) => k + 1),
      y: p.quantum_curve, line: { color: qc, width: 2 } });
  });
  return (
    <Plot
      data={traces}
      layout={darkLayout({ xaxis: { title: { text: 'Training iteration' } }, yaxis: { title: { text: 'Loss' } } })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: H }}
    />
  );
}
