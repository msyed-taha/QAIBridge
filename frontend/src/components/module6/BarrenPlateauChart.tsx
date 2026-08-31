import Plot from 'react-plotly.js';
import type { BarrenPlateauData } from '../../types';

interface Props {
  data: BarrenPlateauData;
}

export function BarrenPlateauChart({ data }: Props) {
  const randomTrace = {
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Random init (classical baseline)',
    x: data.qubits,
    y: data.random_init_variance,
    line: { color: '#ff6b6b', width: 2 },
    marker: { color: '#ff6b6b', size: 7 },
    hovertemplate: '%{x} qubits<br>Gradient variance: %{y:.5f}<extra></extra>',
  };

  const smallTrace = {
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Small-angle init (Neural Angle Optimizer)',
    x: data.qubits,
    y: data.small_angle_init_variance,
    line: { color: '#00ffcc', width: 2 },
    marker: { color: '#00ffcc', size: 7 },
    hovertemplate: '%{x} qubits<br>Gradient variance: %{y:.5f}<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: { title: { text: 'Number of qubits' }, gridcolor: '#252560', tickfont: { color: '#888' }, dtick: 1 },
    yaxis: {
      title: { text: 'Gradient variance (log scale)' },
      gridcolor: '#252560',
      tickfont: { color: '#888' },
      type: 'log' as const,
    },
    legend: { orientation: 'h' as const, y: -0.25, font: { color: '#aaa' } },
    margin: { t: 10, r: 20, b: 60, l: 60 },
  };

  return (
    <Plot
      data={[randomTrace, smallTrace]}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '280px' }}
    />
  );
}
