import Plot from 'react-plotly.js';
import type { BenchmarkReport } from '../../types';

interface Props {
  chartData: BenchmarkReport['chart_data'];
}

export function BenchmarkChart({ chartData }: Props) {
  const { labels, classical_times, quantum_times, speedups } = chartData;

  const classicalTrace = {
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Classical O(N)',
    x: labels,
    y: classical_times,
    line: { color: '#ff6b6b', width: 2 },
    marker: { color: '#ff6b6b', size: 6 },
    hovertemplate: 'N=%{x}<br>Classical: %{y:.4f}<extra></extra>',
  };

  const quantumTrace = {
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Quantum O(√N)',
    x: labels,
    y: quantum_times,
    line: { color: '#00ffcc', width: 2 },
    marker: { color: '#00ffcc', size: 6 },
    hovertemplate: 'N=%{x}<br>Quantum: %{y:.4f}<extra></extra>',
  };

  const speedupTrace = {
    type: 'bar' as const,
    name: 'Speedup Factor',
    x: labels,
    y: speedups,
    yaxis: 'y2',
    marker: {
      color: speedups.map(s => s >= 2 ? '#cc44ff' : '#888'),
      opacity: 0.6,
    },
    hovertemplate: 'N=%{x}<br>Speedup: %{y:.2f}×<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: { title: 'Problem Size (N)', gridcolor: '#252560', tickfont: { color: '#888' } },
    yaxis: { title: 'Relative Time (normalised)', gridcolor: '#252560', tickfont: { color: '#888' } },
    yaxis2: {
      title: 'Speedup Factor (×)',
      overlaying: 'y' as const,
      side: 'right' as const,
      tickfont: { color: '#cc44ff' },
      showgrid: false,
    },
    legend: { orientation: 'h' as const, y: -0.2, font: { color: '#aaa' } },
    margin: { t: 10, r: 70, b: 60, l: 60 },
  };

  return (
    <Plot
      data={[classicalTrace, quantumTrace, speedupTrace]}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '300px' }}
    />
  );
}
