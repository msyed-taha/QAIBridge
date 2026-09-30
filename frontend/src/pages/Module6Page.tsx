import { useState } from 'react';
import { Brain, Play, Loader2, BookOpen, Zap, Cpu, AlertTriangle } from 'lucide-react';
import { optimizerApi } from '../api/optimizer';
import type { OptimizationReport } from '../types';
import { ConvergenceChart } from '../components/module6/ConvergenceChart';
import { BarrenPlateauChart } from '../components/module6/BarrenPlateauChart';
import { GradientMonitorChart } from '../components/module6/GradientMonitorChart';
import { HowToUse } from '../components/shared/HowToUse';
import { QaoaAnglePredictor } from '../components/module6/QaoaAnglePredictor';

const GLOSSARY = [
  { term: 'Polar / azimuthal angle (θ, φ)', plain: 'The two numbers that orient a qubit\'s state on the Bloch sphere — set here by the RY(θ) and RZ(φ) gates.' },
  { term: 'γ, β (QAOA angles)', plain: 'The cost-layer angle and the mixer angle of each QAOA layer. The predictor at the bottom of this page learns them directly from a graph\'s structure.' },
  { term: 'Barren plateau', plain: 'A region of the training landscape where gradients become vanishingly small as circuits grow, so gradient descent effectively stalls.' },
  { term: 'Small-angle initialisation', plain: 'Starting all rotation angles near zero (an almost-identity circuit) instead of fully random — a known, citable way to keep gradients alive at the start of training.' },
  { term: 'Hypernetwork', plain: 'A neural network whose output is not a prediction but the parameters (here: gate angles) of another model — the "Neural Angle Optimizer" itself.' },
];

function MetricCard({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${accent ? 'bg-quantum-neon/5 border-quantum-neon/30' : 'bg-quantum-900 border-quantum-700'}`}>
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent ? 'text-quantum-neon' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export function Module6Page() {
  const [nQubits, setNQubits] = useState(3);
  const [layers, setLayers] = useState(2);
  const [iterations, setIterations] = useState(30);
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(true);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await optimizerApi.train(nQubits, layers, iterations);
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Training failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          Module 6 — Neural Angle Optimizer
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Training a Quantum Classifier's Gate Angles</h1>
        <p className="text-gray-500 text-sm max-w-2xl mx-auto">
          A small variational quantum circuit learns to classify a toy dataset. Compare gradient-descending
          the raw gate angles directly against training a neural network whose output <em>is</em> the angle
          vector — with small-angle initialisation to keep gradients alive as circuits grow.
        </p>
      </div>

      <HowToUse
        steps={[
          <>Pick <strong>Qubits</strong>, <strong>Layers</strong> and <strong>Training iterations</strong> with the sliders. Bigger values = larger circuit = the barren-plateau effect shows up more clearly (and the run takes longer).</>,
          <>Click <strong>Train &amp; Compare</strong>. The backend runs real gradient descent twice on the same toy dataset — once on the raw gate angles, once through the neural network — so a run can take ~10–20&nbsp;s.</>,
          <>Read the <strong>accuracy</strong> and <strong>&ldquo;converged in N iters&rdquo;</strong> cards to see which method learned faster.</>,
          <>Check the <strong>Live Barren Plateau Monitor</strong> chart — a red&nbsp;× marks where the raw-angle method got stuck and had to be restarted.</>,
          <>Use the <strong>glossary</strong> below if any term is unfamiliar.</>,
        ]}
        outcome={<>Three charts and four metric cards comparing the classical raw-angle optimizer against the Neural Angle Optimizer: a loss/convergence curve, the per-iteration gradient-norm monitor, and a separate study of how gradient variance collapses as the circuit grows.</>}
      />

      {/* Glossary */}
      <div className="mb-6">
        <button
          onClick={() => setShowGlossary(g => !g)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-quantum-600 rounded-full px-3 py-1.5 transition-colors mb-3"
        >
          <BookOpen className="w-3.5 h-3.5" />
          {showGlossary ? 'Hide glossary' : 'New here? Show glossary'}
        </button>
        {showGlossary && (
          <div className="bg-quantum-800 rounded-lg p-5 border border-quantum-600">
            <p className="text-sm font-semibold text-white mb-3">📖 Quick glossary</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GLOSSARY.map(g => (
                <div key={g.term} className="bg-quantum-900/50 rounded-lg p-3">
                  <p className="text-quantum-neon text-xs font-semibold mb-1">{g.term}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{g.plain}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Config */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6 mb-6">
        <h3 className="text-white font-bold text-sm mb-4">Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2">Qubits</label>
            <input type="range" min={2} max={4} value={nQubits} onChange={e => setNQubits(Number(e.target.value))} className="w-full accent-purple-400" />
            <p className="text-center text-white font-semibold text-sm mt-1">{nQubits}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2">Layers (rotation + entangle blocks)</label>
            <input type="range" min={1} max={3} value={layers} onChange={e => setLayers(Number(e.target.value))} className="w-full accent-purple-400" />
            <p className="text-center text-white font-semibold text-sm mt-1">{layers}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2">Training iterations</label>
            <input type="range" min={10} max={100} step={5} value={iterations} onChange={e => setIterations(Number(e.target.value))} className="w-full accent-purple-400" />
            <p className="text-center text-white font-semibold text-sm mt-1">{iterations}</p>
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(90deg,#cc44ff,#00ffcc)' }}
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Training both methods — real gradient descent, can take up to ~20s…</>
            : <><Play className="w-4 h-4" />Train &amp; Compare</>}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>
      )}

      {!report && !loading && (
        <div className="flex-1 flex items-center justify-center bg-quantum-800 border border-quantum-700 border-dashed rounded-2xl p-10 text-center">
          <div>
            <Brain className="w-10 h-10 text-purple-400 mx-auto mb-3 opacity-60" />
            <p className="text-gray-500 text-sm">Set your parameters and click</p>
            <p className="text-white font-semibold text-sm">Train &amp; Compare</p>
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <MetricCard label="Neural Accuracy" value={`${(report.neural_accuracy * 100).toFixed(0)}%`} accent />
            <MetricCard label="Classical Accuracy" value={`${(report.classical_accuracy * 100).toFixed(0)}%`} />
            <MetricCard label="Neural Converged" value={`${report.neural_iters_to_converge} iters`} sub="Loss < 0.35" accent />
            <MetricCard label="Classical Converged" value={`${report.classical_iters_to_converge} iters`} sub="Loss < 0.35" />
          </div>

          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-quantum-neon" />
              <h3 className="text-white font-bold text-sm">Training Convergence — Classical vs Neural Angle Optimizer</h3>
            </div>
            <ConvergenceChart classicalLoss={report.classical_loss_curve} neuralLoss={report.neural_loss_curve} />
            <p className="text-gray-500 text-xs mt-2">
              {report.speedup_iterations > 1
                ? `The Neural Angle Optimizer reached the convergence threshold ${report.speedup_iterations}× faster than direct gradient descent on the raw angles.`
                : 'Both methods converged at a comparable rate for this configuration — try more qubits/layers to see the gap widen.'}
            </p>
          </div>

          {report.live_barren_plateau_monitor.classical.plateau_detected && (
            <div className="bg-amber-950/40 border border-amber-700 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-amber-300 text-xs leading-relaxed">
                <span className="font-semibold">Barren plateau detected during classical training.</span>{' '}
                The live monitor found {report.live_barren_plateau_monitor.classical.num_events} point(s) where the
                gradient norm and its rolling variance both collapsed for several consecutive iterations, and
                reinitialised the stuck angles to a small-angle configuration to recover (see markers below).
              </p>
            </div>
          )}

          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-bold text-sm">Live Barren Plateau Monitor — Gradient Norm per Iteration</h3>
            </div>
            <GradientMonitorChart
              classicalGradNorm={report.classical_grad_norm_curve}
              neuralGradNorm={report.neural_grad_norm_curve}
              classicalEvents={report.live_barren_plateau_monitor.classical.events}
            />
            <p className="text-gray-500 text-xs mt-2">
              Tracked live from this run's actual backward pass (no extra circuit evaluations). If the gradient
              norm and its short-window variance both stay near zero for several steps in a row, the monitor
              flags a plateau and reinitialises the stuck parameters — shown as a red × marker.
            </p>
          </div>

          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-gray-400" />
              <h3 className="text-white font-bold text-sm">Barren Plateau Study — Gradient Variance vs Circuit Size</h3>
            </div>
            <BarrenPlateauChart data={report.barren_plateau} />
            <p className="text-gray-500 text-xs mt-2">
              A separate, ex-post diagnostic: for each qubit count, 20 random trials measure the exact
              parameter-shift gradient of the first rotation angle under each initialisation strategy, independent
              of the training run above.
            </p>
          </div>
        </>
      )}

      <QaoaAnglePredictor />
    </div>
  );
}
