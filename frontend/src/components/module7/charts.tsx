import Plot from 'react-plotly.js';
import type { CompareResult, ConverterMethod, Dataset } from '../../api/qnn';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

// Each network keeps one colour everywhere on the page; the warm start is also dashed.
export const METHOD_COLORS: Record<ConverterMethod, string> = {
  classical: COLORS.blue,
  quantum: COLORS.purple,
  warm: COLORS.neon,
};
export const METHOD_ORDER: ConverterMethod[] = ['classical', 'quantum', 'warm'];

// The two classes, on the maps and the dataset.
export const CLASS_COLORS = ['#fbbf24', '#38bdf8'] as const;

const TEXT = { color: COLORS.text, family: 'Inter, sans-serif', size: 12 };
const TICKS = { color: COLORS.muted, size: 12 };
const LEGEND = { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: COLORS.text, size: 12 }, bgcolor: 'rgba(0,0,0,0)' } as const;
const SURFACE = '#12122b';

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The dataset's points: filled to learn from, rings kept back to test. */
function pointTraces(data: Dataset) {
  return ([0, 1] as const).flatMap(cls => {
    const pick = (set: 'train' | 'test') => data[set].x.filter((_, i) => data[set].y[i] === cls);
    const train = pick('train');
    const test = pick('test');
    return [
      { type: 'scatter' as const, mode: 'markers' as const, x: train.map(p => p[0]), y: train.map(p => p[1]),
        marker: { color: CLASS_COLORS[cls], size: 6, line: { color: SURFACE, width: 1 } },
        name: `Class ${cls}, to learn from`, hovertemplate: `(%{x:.2f}, %{y:.2f})<extra>class ${cls}, learn</extra>` },
      { type: 'scatter' as const, mode: 'markers' as const, x: test.map(p => p[0]), y: test.map(p => p[1]),
        marker: { color: SURFACE, size: 9, symbol: 'circle', line: { color: CLASS_COLORS[cls], width: 2 } },
        name: `Class ${cls}, test`, hovertemplate: `(%{x:.2f}, %{y:.2f})<extra>class ${cls}, test</extra>` },
    ];
  });
}

const square = (title: boolean) => ({
  font: TEXT, showlegend: false, margin: { t: 8, r: 8, b: title ? 44 : 28, l: title ? 48 : 32 },
  xaxis: { range: [-1.12, 1.12], tickvals: [-1, 0, 1], tickfont: TICKS, zeroline: false, constrain: 'domain' as const,
    ...(title ? { title: { text: 'Feature 1' } } : {}) },
  yaxis: { range: [-1.12, 1.12], tickvals: [-1, 0, 1], tickfont: TICKS, zeroline: false, scaleanchor: 'x' as const, constrain: 'domain' as const,
    ...(title ? { title: { text: 'Feature 2' } } : {}) },
});

/** The chosen dataset before any training. */
export function DatasetChart({ data }: { data: Dataset }) {
  return (
    <Plot data={pointTraces(data)} layout={darkLayout(square(true))} config={PLOT_CONFIG} style={{ width: '100%', height: 300 }} />
  );
}

/** What one network learned: its chance of class 1 everywhere, its 50% line, and the points. */
export function DecisionMap({ result, method, data }: { result: CompareResult; method: ConverterMethod; data: Dataset }) {
  const m = result.methods[method];
  const scale: [number, string][] = [[0, rgba(CLASS_COLORS[0], 0.42)], [0.5, SURFACE], [1, rgba(CLASS_COLORS[1], 0.42)]];
  return (
    <Plot
      data={[
        { type: 'heatmap' as const, x: result.grid, y: result.grid, z: m.map, zmin: 0, zmax: 1, colorscale: scale, showscale: false,
          hovertemplate: `(%{x:.2f}, %{y:.2f}): chance of class 1 is %{z:.2f}<extra>${m.label}</extra>` },
        { type: 'contour' as const, x: result.grid, y: result.grid, z: m.map, showscale: false, hoverinfo: 'skip' as const,
          contours: { start: 0.5, end: 0.5, size: 1, coloring: 'none' as const }, line: { color: '#ffffff', width: 1.5, dash: 'dot' as const } },
        ...pointTraces(data),
      ]}
      layout={darkLayout(square(false))}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 280 }}
    />
  );
}

/** Training loss per step: the average of the seeds, with the best and worst run shaded. */
export function LossChart({ result }: { result: CompareResult }) {
  const steps = result.methods.classical.curve_mean.map((_, i) => i);
  const traces = METHOD_ORDER.flatMap(k => {
    const d = result.methods[k];
    const color = METHOD_COLORS[k];
    return [
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_max, line: { width: 0 }, hoverinfo: 'skip' as const,
        showlegend: false, legendgroup: k },
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_min, line: { width: 0 }, fill: 'tonexty' as const,
        fillcolor: rgba(color, 0.12), hoverinfo: 'skip' as const, showlegend: false, legendgroup: k },
      { type: 'scatter' as const, mode: 'lines' as const, x: steps, y: d.curve_mean, name: d.label, legendgroup: k,
        line: { color, width: 2, dash: k === 'warm' ? ('dash' as const) : ('solid' as const) },
        hovertemplate: `step %{x}: loss %{y:.3f}<extra>${d.label}</extra>` },
    ];
  });
  return (
    <Plot
      data={traces}
      layout={darkLayout({
        font: TEXT, legend: LEGEND, margin: { t: 50, r: 16, b: 52, l: 60 },
        xaxis: { title: { text: 'Training step' }, tickfont: TICKS },
        yaxis: { title: { text: 'Loss on the points it learns from' }, rangemode: 'tozero', tickfont: TICKS },
      })}
      config={PLOT_CONFIG}
      style={{ width: '100%', height: 340 }}
    />
  );
}
