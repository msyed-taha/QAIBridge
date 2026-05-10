import Plot from 'react-plotly.js';
import type { AmplitudeEntry } from '../../types';

interface Props {
  amplitudes: AmplitudeEntry[];
}

export function StateVectorChart({ amplitudes }: Props) {
  const top = amplitudes.slice(0, 32); // Show top 32 states

  const barTrace = {
    type: 'bar' as const,
    x: top.map(a => a.state),
    y: top.map(a => a.probability),
    marker: {
      color: top.map(a => a.probability),
      colorscale: [
        [0, '#1a1a3e'],
        [0.5, '#5555cc'],
        [1, '#00ffcc'],
      ],
      line: { color: '#00ffcc', width: 0.5 },
    },
    name: 'Probability',
    hovertemplate: '<b>%{x}</b><br>P = %{y:.4f}<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: {
      title: 'Basis State',
      tickfont: { color: '#888', size: 9, family: 'Fira Code, monospace' },
      gridcolor: '#1a1a3e',
      tickangle: -45,
    },
    yaxis: {
      title: 'Probability',
      gridcolor: '#252560',
      tickfont: { color: '#888' },
      range: [0, 1.05],
    },
    margin: { t: 10, r: 20, b: 80, l: 60 },
    bargap: 0.15,
    showlegend: false,
  };

  return (
    <Plot
      data={[barTrace]}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '280px' }}
    />
  );
}
