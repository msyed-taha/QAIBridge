import { useState } from 'react';
import Plot from 'react-plotly.js';
import { Loader2, Network, Play } from 'lucide-react';
import { optimizerApi, type QaoaAngleReport } from '../../api/optimizer';
import { getApiErrorMessage } from '../../api/client';
import { COLORS, PLOT_CONFIG, darkLayout } from '../shared/plotTheme';

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? 'bg-quantum-neon/5 border-quantum-neon/30' : 'bg-quantum-900 border-quantum-700'}`}>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent ? 'text-quantum-neon' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * OBJ-3 / FE-2: a neural network that predicts QAOA's γ and β for a new graph,
 * so the classical optimiser starts close to the answer.
 */
export function QaoaAnglePredictor() {
  const [trainGraphs, setTrainGraphs] = useState(40);
  const [layers, setLayers] = useState(2);
  const [report, setReport] = useState<QaoaAngleReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await optimizerApi.qaoaAngles(trainGraphs, 10, layers));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Training failed'));
    } finally {
      setLoading(false);
    }
  };

  const s = report?.summary;
  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6 mt-8">
      <div className="flex items-center gap-2 mb-2">
        <Network className="w-5 h-5 text-quantum-neon" />
        <h2 className="text-white font-bold text-lg">Neural QAOA angle predictor — learning γ and β</h2>
      </div>
      <p className="text-gray-400 text-sm mb-5 max-w-3xl">
        QAOA needs 2p angles (γ, β) tuned by a classical optimiser — hundreds of circuit runs per problem. Optimal angles
        are similar for similar graphs, so a small PyTorch network can <em>learn</em> them: it is trained on random Max-Cut
        graphs whose optimal angles were found the slow way, then predicts angles for graphs it has never seen.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-2">Training graphs: {trainGraphs}</label>
          <input type="range" min={10} max={80} step={10} value={trainGraphs} onChange={e => setTrainGraphs(Number(e.target.value))} className="w-full accent-teal-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-2">QAOA depth p = {layers} ({2 * layers} angles)</label>
          <input type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} className="w-full accent-teal-400" />
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60"
          style={{ background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Building data set & training…</> : <><Play className="w-4 h-4" />Train predictor &amp; compare</>}
        </button>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}

      {report && s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <Stat label="Cold start (optimiser only)" value={`${s.cold_evaluations} runs`} sub={`approx. ratio ${s.cold_ratio.toFixed(3)}`} />
            <Stat label="Neural prediction only" value="0 runs" sub={`approx. ratio ${s.neural_ratio.toFixed(3)}`} />
            <Stat label="Neural warm start" value={`${s.warm_evaluations} runs`} sub={`approx. ratio ${s.warm_ratio.toFixed(3)}`} accent />
            <Stat label="Circuit runs saved" value={`${s.evaluations_saved_pct}%`} sub="same solution quality" accent />
            <Stat label="Training" value={`${(report.total_ms / 1000).toFixed(1)} s`} sub={`${report.train_graphs} graphs · loss ${report.final_loss.toFixed(4)}`} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Training loss (mean squared angle error)</p>
              <Plot
                data={[{ type: 'scatter', mode: 'lines', x: report.loss_curve.map((_, i) => i * 10), y: report.loss_curve,
                  line: { color: COLORS.neon, width: 2 }, name: 'MSE' }]}
                layout={darkLayout({ xaxis: { title: { text: 'Epoch' } }, yaxis: { title: { text: 'Loss (log)' }, type: 'log' }, showlegend: false, margin: { t: 16, r: 16, b: 48, l: 56 } })}
                config={PLOT_CONFIG} style={{ width: '100%', height: 240 }}
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Unseen graphs — circuit runs needed</p>
              <Plot
                data={[
                  { type: 'bar', name: 'Cold start', x: report.tests.map((t, i) => `G${i + 1} (${t.nodes}n)`), y: report.tests.map(t => t.cold_evaluations), marker: { color: COLORS.classical } },
                  { type: 'bar', name: 'Neural warm start', x: report.tests.map((t, i) => `G${i + 1} (${t.nodes}n)`), y: report.tests.map(t => t.warm_evaluations), marker: { color: COLORS.neon } },
                ]}
                layout={darkLayout({ barmode: 'group', xaxis: { title: { text: 'Test graph' } }, yaxis: { title: { text: 'Circuit evaluations' } } })}
                config={PLOT_CONFIG} style={{ width: '100%', height: 240 }}
              />
            </div>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead className="text-gray-500 text-left">
                <tr><th className="py-1 pr-3">Graph</th><th className="pr-3">Nodes / edges</th><th className="pr-3">Predicted γ, β</th><th className="pr-3">Optimised γ, β</th><th className="pr-3">Cold ratio</th><th className="pr-3">Neural-only ratio</th><th>Warm ratio</th></tr>
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
                    <td>{t.warm_ratio.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs mt-3 leading-relaxed">
            The approximation ratio is the expected cut divided by the best possible cut (1.0 = always optimal). Warm starts
            reach the same quality as the full optimiser with a fraction of the circuit runs — the practical value of a
            learned angle optimiser on real hardware, where every circuit run costs time and money.
          </p>
        </>
      )}
    </div>
  );
}
