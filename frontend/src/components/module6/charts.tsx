import Plot from 'react-plotly.js';
import type { MethodResult, PlateauStudy, RaceMethod, RaceResult } from '../../api/optimizer';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

// Each training method keeps one colour everywhere on the page.
export const METHOD_COLORS: Record<RaceMethod, string> = {
  random: COLORS.classical,
  rescued: COLORS.amber,
  near_zero: COLORS.neon,
  neural: COLORS.purple,
};
export const METHOD_ORDER: RaceMethod[] = ['random', 'rescued', 'near_zero', 'neural'];

const TEXT = { color: COLORS.text, family: 'Inter, sans-serif', size: 12 };
const TICKS = { color: COLORS.muted, size: 12 };
const LEGEND = { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: COLORS.text, size: 12 }, bgcolor: 'rgba(0,0,0,0)' } as const;

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Typical gradient size against qubits: a random start collapses, a near-zero start doesn't. */
export function PlateauStudyChart({ study }: { study: PlateauStudy }) {
  const line = (y: number[], name: string, color: string, dash: 'solid' | 'dot' = 'solid') => ({
    type: 'scatter' as const, mode: 'lines+markers' as const, name, x: study.qubits, y,
    line: { color, width: 2, dash }, marker: { color, size: 7 },
    hovertemplate: `%{x} qubits: typical gradient %{y:.3f}<extra>${name}</extra>`,
  });
  return (
    <Plot
      data={[
        line(study.lines.deep_random, 'Random start, 2 layers per qubit', METHOD_COLORS.random),
        line(study.lines.deep_near_zero, 'Near-zero start, 2 layers per qubit', METHOD_COLORS.near_zero),
        line(study.lines.shallow_random, 'Random start, 1 layer', COLORS.muted, 'dot'),
      ]}
      layout={darkLayout({
        font: TEXT, legend: LEGEND, margin: { t: 70, r: 16, b: 52, l: 64 },
        xaxis: { title: { text: 'Qubits' }, dtick: 1, tickfont: TICKS },
        yaxis: { title: { text: 'Typical gradient size (log scale)' }, type: 'log', tickfont: TICKS,
          tickvals: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1], ticktext: ['0.01', '0.02', '0.05', '0.1', '0.2', '0.5', '1'] },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 340 }}
    />
  );
}

/** Training loss per step: the average of the seeds, with the best and worst run shaded. */
export function RaceChart({ result }: { result: RaceResult }) {
  const steps = result.methods.random.curve_mean.map((_, i) => i);
  const traces = METHOD_ORDER.flatMap(m => {
    const d: MethodResult = result.methods[m];
    const color = METHOD_COLORS[m];
    return [
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_max, line: { width: 0 }, hoverinfo: 'skip' as const,
        showlegend: false, legendgroup: m },
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_min, line: { width: 0 }, fill: 'tonexty' as const,
        fillcolor: rgba(color, 0.12), hoverinfo: 'skip' as const, showlegend: false, legendgroup: m },
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_mean, name: d.label, legendgroup: m,
        line: { color, width: 2, dash: m === 'rescued' ? ('dash' as const) : ('solid' as const) },
        hovertemplate: `step %{x}: loss %{y:.3f}<extra>${d.label}</extra>` },
    ];
  });
  return (
    <Plot
      data={traces}
      layout={darkLayout({
        font: TEXT, legend: LEGEND, margin: { t: 70, r: 16, b: 52, l: 60 },
        xaxis: { title: { text: 'Training step' }, tickfont: TICKS },
        yaxis: { title: { text: 'Loss on the training data' }, rangemode: 'tozero', tickfont: TICKS },
        shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: result.target_loss, y1: result.target_loss,
          line: { color: COLORS.muted, width: 1, dash: 'dot' } }],
        annotations: [{ xref: 'paper', x: 0.01, y: result.target_loss, xanchor: 'left', yanchor: 'top', showarrow: false,
          text: `learned (below ${result.target_loss})`, font: { color: COLORS.muted, size: 12 } }],
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 360 }}
    />
  );
}

/** The monitor's view: gradient signal ÷ measurement noise, averaged over its window, with the plateaus it flagged. */
export function MonitorChart({ result, window = 6 }: { result: RaceResult; window?: number }) {
  const shown: RaceMethod[] = ['random', 'neural'];
  const floor = 1e-3;
  const traces = shown.flatMap(m => {
    const d = result.methods[m];
    const raw = d.signal_to_noise.map(v => v ?? 0);
    const avg = raw.map((_, i) => {
      const part = raw.slice(Math.max(0, i - window + 1), i + 1);
      return Math.max(floor, part.reduce((a, b) => a + b, 0) / part.length);
    });
    const x = avg.map((_, i) => i);
    const flagged = d.events[0] ?? [];
    return [
      { type: 'scatter' as const, mode: 'lines' as const, x, y: avg, name: d.label,
        line: { color: METHOD_COLORS[m], width: 2 }, hovertemplate: `step %{x}: signal ÷ noise %{y:.2f}<extra>${d.label}</extra>` },
      ...(flagged.length ? [{
        type: 'scatter' as const, mode: 'markers' as const, x: flagged, y: flagged.map(s => avg[s] ?? floor),
        name: `Plateau flagged (${d.label})`, marker: { symbol: 'x', size: 12, color: METHOD_COLORS[m], line: { width: 2 } },
        hovertemplate: `step %{x}: plateau flagged<extra>${d.label}</extra>`,
      }] : []),
    ];
  });
  return (
    <Plot
      data={traces}
      layout={darkLayout({
        font: TEXT, legend: LEGEND, margin: { t: 70, r: 16, b: 52, l: 64 },
        xaxis: { title: { text: 'Training step' }, tickfont: TICKS },
        yaxis: { title: { text: 'Signal ÷ noise (log scale)' }, type: 'log', tickfont: TICKS,
          tickvals: [floor, 0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 1000],
          ticktext: ['0', '0.01', '0.1', '0.2', '0.5', '1', '2', '5', '10', '20', '50', '100', '1000'] },
        shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: COLORS.muted, width: 1, dash: 'dot' } }],
        annotations: [{ xref: 'paper', x: 1, y: 0, yref: 'y', xanchor: 'right', yanchor: 'bottom', showarrow: false,
          text: 'signal = noise', font: { color: COLORS.muted, size: 12 } }],
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 320 }}
    />
  );
}
