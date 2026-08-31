import Plot from 'react-plotly.js';

interface Props {
  classicalLoss: number[];
  quantumLoss: number[];
  quantumWarmLoss?: number[];
}

export function TrainingCompareChart({ classicalLoss, quantumLoss, quantumWarmLoss }: Props) {
  const iterations = classicalLoss.map((_, i) => i + 1);

  const classicalTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Classical MLP',
    x: iterations,
    y: classicalLoss,
    line: { color: '#60a5fa', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Loss: %{y:.4f}<extra></extra>',
  };

  const quantumTrace = {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Mapped QNN (from-scratch)',
    x: iterations,
    y: quantumLoss,
    line: { color: '#cc44ff', width: 2 },
    hovertemplate: 'Iteration %{x}<br>Loss: %{y:.4f}<extra></extra>',
  };

  const quantumWarmTrace = quantumWarmLoss && {
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Mapped QNN (classical-weight warm start)',
    x: iterations,
    y: quantumWarmLoss,
    line: { color: '#00ffcc', width: 2, dash: 'dot' as const },
    hovertemplate: 'Iteration %{x}<br>Loss: %{y:.4f}<extra></extra>',
  };

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#ccc', family: 'Inter, sans-serif', size: 11 },
    xaxis: { title: { text: 'Training iteration' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    yaxis: { title: { text: 'Loss (binary cross-entropy)' }, gridcolor: '#252560', tickfont: { color: '#888' } },
    legend: { orientation: 'h' as const, y: -0.3, font: { color: '#aaa' } },
    margin: { t: 10, r: 20, b: 75, l: 55 },
  };

  const data = quantumWarmTrace ? [classicalTrace, quantumTrace, quantumWarmTrace] : [classicalTrace, quantumTrace];

  return (
    <Plot
      data={data}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: '280px' }}
    />
  );
}
