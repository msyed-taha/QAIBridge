import Plot from 'react-plotly.js';
import type { PlateauEvent } from '../../types';

interface Props {
  classicalGradNorm: number[];
  neuralGradNorm: number[];
  classicalEvents: PlateauEvent[];
}

export function GradientMonitorChart({ classicalGradNorm, neuralGradNorm, classicalEvents }: Props) {
  const iterations = classicalGradNorm.map((_, i) => i + 1);

  const classicalTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Classical — ||∂L/∂angles||',
    x: iterations,
    y: classicalGradNorm,
    line: { color: '#8888aa', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Gradient norm: %{y:.5f}<extra></extra>',
  };

  const neuralTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Neural — ||∂L/∂angles|| (via AngleNet)',
    x: iterations,
    y: neuralGradNorm,
    line: { color: '#00ffcc', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Gradient norm: %{y:.5f}<extra></extra>',
  };

  const eventMarkers = {
    type: 'scatter' as const,
    mode: 'markers' as const,
    name: 'Plateau detected → reinitialised',
    x: classicalEvents.map(e => e.iteration + 1),
    y: classicalEvents.map(e => e.grad_norm),
    marker: { color: '#ff6b6b', size: 10, symbol: 'x' },
    hovertemplate: 'Reinitialised at iteration %{x}<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: { title: { text: 'Training iteration' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    yaxis: { title: { text: 'Gradient norm' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    legend: { orientation: 'h' as const, y: -0.25, font: { color: '#aaa' } },
    margin: { t: 10, r: 20, b: 60, l: 55 },
  };

  const data = classicalEvents.length > 0
    ? [classicalTrace, neuralTrace, eventMarkers]
    : [classicalTrace, neuralTrace];

  return (
    <Plot
      data={data}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '280px' }}
    />
  );
}
