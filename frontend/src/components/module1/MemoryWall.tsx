import Plot from 'react-plotly.js';
import type { Data } from 'plotly.js';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';
import { formatBytes, qubitsThatFit, stateBytes } from './format';

const MAX_QUBITS = 28;
const QUBITS = Array.from({ length: MAX_QUBITS }, (_, i) => i + 1);
const TICKS = [1, 2 ** 10, 2 ** 20, 2 ** 30];           // 1 B, 1 KB, 1 MB, 1 GB

/**
 * Memory needed per qubit count (log scale) against what this server allows
 * one run right now. The sentence under the chart says the same in words.
 */
export function MemoryWall({ qubits, limitBytes }: { qubits: number; limitBytes: number | null }) {
  const fits = limitBytes ? Math.min(MAX_QUBITS, qubitsThatFit(limitBytes)) : null;
  const data: Data[] = [
    {
      type: 'scatter', mode: 'lines+markers', name: 'Memory a run needs', x: QUBITS, y: QUBITS.map(stateBytes),
      line: { color: COLORS.neon, width: 2 }, marker: { size: 6 },
      text: QUBITS.map(q => formatBytes(stateBytes(q))),
      hovertemplate: '%{x} qubits: %{text}<extra></extra>',
    },
    {
      type: 'scatter', mode: 'markers', name: `Your choice (${qubits} qubits)`, x: [qubits], y: [stateBytes(qubits)],
      marker: { size: 14, color: 'rgba(0,0,0,0)', line: { color: '#ffffff', width: 2 } },
      hoverinfo: 'skip',
    },
  ];
  if (limitBytes) {
    data.push({
      type: 'scatter', mode: 'lines', name: `Limit on this server now (${formatBytes(limitBytes)})`,
      x: [1, MAX_QUBITS], y: [limitBytes, limitBytes], line: { color: COLORS.amber, dash: 'dash', width: 2 },
      hoverinfo: 'skip',
    });
  }
  const summary = `At ${qubits} qubits a run needs ${formatBytes(stateBytes(qubits))} of memory.`
    + (fits ? ` Right now this server can run up to ${fits} qubits.` : '');

  return (
    <div>
      <div role="img" aria-label={`Chart: memory needed for 1 to ${MAX_QUBITS} qubits, doubling with every qubit. ${summary}`}>
        <Plot
          data={data}
          layout={darkLayout({
            font: { color: COLORS.text, family: 'Inter, sans-serif', size: 12 },
            legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: '#d1d5db', size: 12 }, bgcolor: 'rgba(0,0,0,0)' },
            margin: { t: 48, r: 16, b: 48, l: 64 },
            xaxis: { title: { text: 'Qubits' }, dtick: 4, range: [0.5, MAX_QUBITS + 0.5], tickfont: { color: '#9ca3af', size: 12 } },
            yaxis: { title: { text: 'Memory' }, type: 'log', tickvals: TICKS, ticktext: ['1 B', '1 KB', '1 MB', '1 GB'],
                     tickfont: { color: '#9ca3af', size: 12 } },
            hovermode: 'closest',
          })}
          config={PLOT_CONFIG}
          style={{ width: '100%', height: 280 }}
          useResizeHandler
        />
      </div>
      <p className="text-sm text-gray-300 mt-2">{summary}</p>
    </div>
  );
}
