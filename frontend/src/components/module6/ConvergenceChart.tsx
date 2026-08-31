import Plot from 'react-plotly.js';

interface Props {
  classicalLoss: number[];
  neuralLoss: number[];
}

export function ConvergenceChart({ classicalLoss, neuralLoss }: Props) {
  const iterations = classicalLoss.map((_, i) => i + 1);

  const classicalTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Classical (raw-angle SGD)',
    x: iterations,
    y: classicalLoss,
    line: { color: '#8888aa', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Loss: %{y:.4f}<extra></extra>',
  };

  const neuralTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Neural Angle Optimizer',
    x: iterations,
    y: neuralLoss,
    line: { color: '#00ffcc', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Loss: %{y:.4f}<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: { title: { text: 'Training iteration' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    yaxis: { title: { text: 'Loss (binary cross-entropy)' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    legend: { orientation: 'h' as const, y: -0.25, font: { color: '#aaa' } },
    margin: { t: 10, r: 20, b: 60, l: 55 },
  };

  return (
    <Plot
      data={[classicalTrace, neuralTrace]}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '280px' }}
    />
  );
}
