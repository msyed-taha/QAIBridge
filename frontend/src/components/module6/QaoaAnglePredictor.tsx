import { useId, useState } from 'react';
import Plot from 'react-plotly.js';
import { Loader2, Network, Play } from 'lucide-react';
import { optimizerApi, type QaoaAngleReport } from '../../api/optimizer';
import { getApiErrorMessage } from '../../api/client';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

const TEXT = { color: COLORS.text, family: 'Inter, sans-serif', size: 12 };
const TICKS = { color: COLORS.muted, size: 12 };
const SIMPLE = { average: 'Average of the training angles', ramp: 'Standard linear ramp', random: 'Random start' } as const;

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? 'bg-quantum-neon/5 border-quantum-neon/30' : 'bg-quantum-900 border-quantum-700'}`}>
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent ? 'text-quantum-neon' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * A neural network that predicts QAOA's γ and β for a new graph, so the optimiser
 * starts close to the answer, compared fairly with simple starts on the same budget.
 */
export function QaoaAnglePredictor() {
  const [trainGraphs, setTrainGraphs] = useState(40);
  const [layers, setLayers] = useState(2);
  const [report, setReport] = useState<QaoaAngleReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { title: useId(), graphs: useId(), depth: useId() };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await optimizerApi.qaoaAngles(trainGraphs, 10, layers));
    } catch (e) {
      setError(getApiErrorMessage(e, "Training couldn't finish. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const s = report?.summary;
  const simple = s ? Object.values(s.baselines) : [];
  return (
    <section aria-labelledby={ids.title} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 sm:p-6 mb-6">
      <h2 id={ids.title} className="flex items-center gap-2 text-white font-bold text-lg mb-2">
        <Network className="w-5 h-5 text-quantum-neon" aria-hidden="true" /><span className="text-gray-400 font-normal">3 ·</span> A neural network that learns QAOA angles
      </h2>
      <p className="text-gray-300 text-sm leading-relaxed mb-5 max-w-3xl">
        QAOA solves graph problems such as Max-Cut, but it needs 2 angles per layer (γ and β), normally tuned with hundreds of
        circuit runs per problem. Good angles are similar for similar graphs, so a small neural network can learn them: it trains on
        random graphs whose best angles were found the slow way, then predicts angles for graphs it has never seen. A short
        refinement of 40 steps finishes the job.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
        <div>
          <label htmlFor={ids.graphs} className="block text-sm text-gray-300 mb-1">Training graphs: <strong className="text-white">{trainGraphs}</strong></label>
          <input id={ids.graphs} type="range" min={10} max={80} step={10} value={trainGraphs} onChange={e => setTrainGraphs(Number(e.target.value))} disabled={loading} className="w-full accent-teal-400" />
        </div>
        <div>
          <label htmlFor={ids.depth} className="block text-sm text-gray-300 mb-1">QAOA layers: <strong className="text-white">{layers}</strong> ({2 * layers} angles)</label>
          <input id={ids.depth} type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} disabled={loading} className="w-full accent-teal-400" />
        </div>
        <button type="button" onClick={run} disabled={loading}
          className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Finding training angles and learning them…</> : <><Play className="w-4 h-4" aria-hidden="true" />Train the predictor and compare</>}
        </button>
      </div>

      {error && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">{error}</p>}

      {report && s && (
        <div aria-live="polite">
          <p className="text-white text-sm leading-relaxed bg-quantum-900/60 border border-quantum-600 rounded-xl px-4 py-3 mb-4">
            On {report.test_graphs} graphs it never saw, the network's start plus {s.budget_steps} steps reached {s.warm_ratio.toFixed(3)} of the
            best cut, using {s.evaluations_saved_pct}% fewer circuit runs than the full optimiser ({s.cold_ratio.toFixed(3)} in {Math.round(s.cold_evaluations)} runs).
            Simple starts given the same {s.budget_steps} steps reached only {Math.min(...simple).toFixed(3)}–{Math.max(...simple).toFixed(3)}, so the
            saving comes from what the network learned.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Stat label="Full optimiser" value={`${Math.round(s.cold_evaluations)} runs`} sub={`reaches ${s.cold_ratio.toFixed(3)}`} />
            <Stat label={`Network's start + ${s.budget_steps} steps`} value={`${Math.round(s.warm_evaluations)} runs`} sub={`reaches ${s.warm_ratio.toFixed(3)}`} accent />
            <Stat label={`Best simple start + ${s.budget_steps} steps`} value={`${Math.round(s.warm_evaluations)} runs`} sub={`reaches ${Math.max(...simple).toFixed(3)}`} />
            <Stat label="Circuit runs saved" value={`${s.evaluations_saved_pct}%`} sub="against the full optimiser" accent />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm text-gray-300 mb-1">Same {s.budget_steps}-step budget: how good is each start?</h3>
              <Plot
                data={[{
                  type: 'bar', orientation: 'h',
                  y: ['Network\'s start', ...Object.keys(SIMPLE).map(k => SIMPLE[k as keyof typeof SIMPLE])],
                  x: [s.warm_ratio, s.baselines.average, s.baselines.ramp, s.baselines.random],
                  marker: { color: [COLORS.neon, COLORS.muted, COLORS.muted, COLORS.muted] },
                  text: [s.warm_ratio, s.baselines.average, s.baselines.ramp, s.baselines.random].map(v => v.toFixed(3)),
                  textposition: 'outside', hovertemplate: '%{y}: %{x:.3f}<extra></extra>',
                }]}
                layout={darkLayout({
                  font: TEXT, showlegend: false, margin: { t: 16, r: 40, b: 48, l: 200 },
                  xaxis: { title: { text: 'Share of the best cut reached' }, range: [0.5, 1], tickfont: TICKS },
                  yaxis: { autorange: 'reversed', tickfont: TICKS },
                  shapes: [{ type: 'line', x0: s.cold_ratio, x1: s.cold_ratio, yref: 'paper', y0: 0, y1: 1, line: { color: COLORS.amber, dash: 'dot', width: 1.5 } }],
                  annotations: [{ x: s.cold_ratio, yref: 'paper', y: 1, yanchor: 'bottom', showarrow: false, text: 'full optimiser', font: { color: COLORS.amber, size: 12 } }],
                })}
                config={PLOT_CONFIG} style={{ width: '100%', height: 250 }}
              />
            </div>
            <div>
              <h3 className="text-sm text-gray-300 mb-1">Circuit runs needed on each unseen graph</h3>
              <Plot
                data={[
                  { type: 'bar', name: 'Full optimiser', x: report.tests.map((t, i) => `G${i + 1}`), y: report.tests.map(t => t.cold_evaluations), marker: { color: COLORS.amber } },
                  { type: 'bar', name: 'Network\'s start + refinement', x: report.tests.map((t, i) => `G${i + 1}`), y: report.tests.map(t => t.warm_evaluations), marker: { color: COLORS.neon } },
                ]}
                layout={darkLayout({ font: TEXT, barmode: 'group', legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: COLORS.text, size: 12 } },
                  margin: { t: 40, r: 16, b: 48, l: 56 }, xaxis: { title: { text: 'Unseen graph' }, tickfont: TICKS }, yaxis: { title: { text: 'Circuit runs' }, tickfont: TICKS } })}
                config={PLOT_CONFIG} style={{ width: '100%', height: 250 }}
              />
            </div>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-quantum-neon hover:text-white">See each graph</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead className="text-gray-400 text-left">
                  <tr><th className="py-1 pr-3">Graph</th><th className="pr-3">Nodes / edges</th><th className="pr-3">Predicted γ, β</th><th className="pr-3">Best γ, β</th><th className="pr-3">Full optimiser</th><th className="pr-3">Prediction only</th><th className="pr-3">Network + {s.budget_steps}</th><th>Best simple + {s.budget_steps}</th></tr>
                </thead>
                <tbody>
                  {report.tests.map((t, i) => (
                    <tr key={i} className="border-t border-quantum-700/50 font-mono text-gray-300">
                      <td className="py-1 pr-3">G{i + 1}</td>
                      <td className="pr-3">{t.nodes} / {t.edges}</td>
                      <td className="pr-3 text-quantum-neon">{t.predicted.map(a => a.toFixed(2)).join(', ')}</td>
                      <td className="pr-3">{t.optimal.map(a => a.toFixed(2)).join(', ')}</td>
                      <td className="pr-3">{t.cold_ratio.toFixed(3)}</td>
                      <td className="pr-3">{t.neural_ratio.toFixed(3)}</td>
                      <td className="pr-3">{t.warm_ratio.toFixed(3)}</td>
                      <td>{Math.max(...Object.values(t.baselines)).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="text-gray-400 text-xs mt-3 leading-relaxed">
            "Share of the best cut" is the expected cut divided by the best possible cut (1.0 = always optimal). Trained on{' '}
            {report.train_graphs} graphs in {(report.total_ms / 1000).toFixed(1)} s. On real hardware every circuit run costs time and
            money, which is where a learned start pays off.
          </p>
        </div>
      )}
    </section>
  );
}
