// Shared Plotly styling so every chart matches the dark QAIBridge theme.

export const COLORS = {
  neon: '#00ffcc',
  purple: '#cc44ff',
  classical: '#f87171',
  grid: '#252560',
  text: '#cccccc',
  muted: '#888888',
  amber: '#fbbf24',
  blue: '#60a5fa',
};

export function darkLayout(overrides: Record<string, any> = {}): Record<string, any> {
  const { xaxis, yaxis, ...rest } = overrides;
  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: COLORS.text, family: 'Inter, sans-serif', size: 11 },
    margin: { t: 40, r: 16, b: 48, l: 56 },
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: '#aaa', size: 10 },
              bgcolor: 'rgba(0,0,0,0)' },
    xaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, tickfont: { color: COLORS.muted }, ...xaxis },
    yaxis: { gridcolor: COLORS.grid, zerolinecolor: COLORS.grid, tickfont: { color: COLORS.muted }, ...yaxis },
    ...rest,
  };
}

export const PLOT_CONFIG = { displayModeBar: false, responsive: true };
