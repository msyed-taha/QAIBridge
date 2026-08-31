import { useState } from 'react';
import { GitBranch, Play, Loader2, BookOpen, Plus, Minus, Layers, ScanSearch, AlertTriangle } from 'lucide-react';
import { qnnApi } from '../api/qnn';
import type { ConversionReport, LayerSpec, ParsedArchitecture, TrainCompareReport } from '../types';
import { StructuralComparison } from '../components/module7/StructuralComparison';
import { TrainingCompareChart } from '../components/module7/TrainingCompareChart';
import { HowToUse } from '../components/shared/HowToUse';

const GLOSSARY = [
  { term: 'Angle encoding', plain: 'Turning a classical input number into a qubit rotation (RX) — the quantum equivalent of feeding a value into an input neuron.' },
  { term: 'Variational block', plain: 'A layer of trainable rotation gates (RY, RZ) followed by entangling gates — the quantum analogue of one classical hidden layer.' },
  { term: 'Qubit reuse', plain: 'Unlike classical neurons, qubits are reused across every layer of the circuit rather than allocating a fresh qubit per hidden unit.' },
  { term: 'Readout', plain: 'Measuring a qubit\'s Z-expectation and mapping it to a probability — the quantum equivalent of an output neuron + sigmoid.' },
  { term: 'Weight warm start', plain: "Instead of starting the QNN's angles randomly, they're derived from a trained classical MLP's weights (squashed with tanh to stay in a valid angle range) — a real classical-to-quantum parameter mapping, not just an architecture analogy." },
];

const INPUT_DIM = 2;
const OUTPUT_DIM = 1;
const ACTIVATIONS = ['relu', 'tanh', 'sigmoid'] as const;

function defaultLayers(): LayerSpec[] {
  return [
    { type: 'dense', units: 4, activation: 'relu' },
    { type: 'dense', units: 4, activation: 'relu' },
  ];
}

export function Module7Page() {
  const [layers, setLayers] = useState<LayerSpec[]>(defaultLayers());
  const [iterations, setIterations] = useState(30);

  const [parsed, setParsed] = useState<ParsedArchitecture | null>(null);
  const [conversion, setConversion] = useState<ConversionReport | null>(null);
  const [training, setTraining] = useState<TrainCompareReport | null>(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingConvert, setLoadingConvert] = useState(false);
  const [loadingTrain, setLoadingTrain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(true);

  const updateUnits = (i: number, value: number) => {
    setLayers(ls => ls.map((l, idx) => (idx === i ? { ...l, units: Math.max(1, Math.min(16, value)) } : l)));
  };
  const updateActivation = (i: number, value: LayerSpec['activation']) => {
    setLayers(ls => ls.map((l, idx) => (idx === i ? { ...l, activation: value } : l)));
  };
  const toggleType = (i: number) => {
    setLayers(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      return l.type === 'dense' ? { type: 'dropout' } : { type: 'dense', units: 4, activation: 'relu' };
    }));
  };
  const addLayer = () => setLayers(ls => (ls.length < 4 ? [...ls, { type: 'dense', units: 4, activation: 'relu' }] : ls));
  const removeLayer = (i: number) => setLayers(ls => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const resetDownstream = () => {
    setError(null);
    setParsed(null);
    setConversion(null);
    setTraining(null);
  };

  const handleAnalyze = async () => {
    setLoadingAnalyze(true);
    resetDownstream();
    try {
      const data = await qnnApi.analyze(layers);
      setParsed(data);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setLoadingAnalyze(false);
    }
  };

  const handleConvert = async () => {
    setLoadingConvert(true);
    setError(null);
    setTraining(null);
    try {
      const data = await qnnApi.convert(layers);
      setConversion(data);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setLoadingConvert(false);
    }
  };

  const handleTrain = async () => {
    setLoadingTrain(true);
    setError(null);
    try {
      const data = await qnnApi.trainCompare(layers, iterations);
      setTraining(data);
      setConversion(data.conversion);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setLoadingTrain(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
          Module 7 — Classical to Quantum Neural Network Converter
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Convert a Classical NN into a QNN</h1>
        <p className="text-gray-500 text-sm max-w-2xl mx-auto">
          Describe a classical MLP layer by layer, analyze it, see it mapped to an equivalent quantum
          variational circuit, then train both — plus a version of the QNN warm-started from the
          classical model's own weights — on the same toy dataset.
        </p>
      </div>

      <HowToUse
        steps={[
          <>Build a classical network in the <strong>Classical Architecture</strong> row: click <strong>Add layer</strong>, set each dense layer's <strong>units</strong> and <strong>activation</strong>, or toggle a layer to <strong>dropout</strong>. Input is fixed at 2 features, output at 1 (binary classification).</>,
          <><strong>Analyze</strong> — validates the architecture and tells you what will and won't map to quantum (e.g. dropout is skipped, softmax is rejected).</>,
          <><strong>Convert to QNN</strong> — shows the generated quantum circuit diagram and a side-by-side classical-vs-quantum comparison table.</>,
          <><strong>Convert &amp; Train All</strong> — trains three models on the same toy dataset: the classical MLP, the mapped QNN from scratch, and the mapped QNN warm-started from the classical model's trained weights. Takes ~15–25&nbsp;s.</>,
          <>Compare the three <strong>accuracy</strong> cards and the loss curves to see whether the quantum mapping — and the weight warm-start — actually helped.</>,
        ]}
        outcome={<>A parsed-architecture summary, the generated variational circuit (RX encoding → RY/RZ + CNOT per dense layer → ⟨Z⟩ readout), a structural comparison table, and a 3-way training loss chart with accuracy cards.</>}
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

      {/* Architecture builder */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6 mb-6">
        <h3 className="text-white font-bold text-sm mb-4">Classical Architecture</h3>

        <div className="flex flex-wrap items-start gap-2 mb-5">
          <div className="px-3 py-2 rounded-lg bg-quantum-900 border border-quantum-700 text-xs text-gray-400">
            Input: <span className="text-white font-semibold">{INPUT_DIM}</span>
          </div>

          {layers.map((layer, i) => (
            <div key={i} className={`flex flex-col gap-1.5 px-3 py-2 rounded-lg border ${layer.type === 'dense' ? 'bg-purple-500/10 border-purple-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <div className="flex items-center gap-1.5">
                <button onClick={() => toggleType(i)} className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-gray-300 hover:text-white">
                  <Layers className="w-3 h-3" />
                  {layer.type}
                </button>
                <button onClick={() => removeLayer(i)} disabled={layers.length <= 1} className="ml-auto text-gray-500 hover:text-red-400 disabled:opacity-30">
                  <Minus className="w-3 h-3" />
                </button>
              </div>
              {layer.type === 'dense' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={layer.units}
                    onChange={e => updateUnits(i, Number(e.target.value))}
                    className="w-10 bg-transparent text-white text-sm font-semibold text-center outline-none border-b border-quantum-600"
                  />
                  <select
                    value={layer.activation}
                    onChange={e => updateActivation(i, e.target.value as LayerSpec['activation'])}
                    className="bg-transparent text-gray-300 text-xs outline-none"
                  >
                    {ACTIVATIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-amber-300/70 text-[11px]">p=0.2, no quantum equivalent</p>
              )}
            </div>
          ))}

          <button
            onClick={addLayer}
            disabled={layers.length >= 4}
            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-quantum-600 text-gray-400 hover:text-white hover:border-quantum-500 text-xs disabled:opacity-30 self-center"
          >
            <Plus className="w-3 h-3" /> Add layer
          </button>
          <div className="px-3 py-2 rounded-lg bg-quantum-900 border border-quantum-700 text-xs text-gray-400 self-center">
            Output: <span className="text-white font-semibold">{OUTPUT_DIM}</span>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs text-gray-400 font-medium mb-2">Training iterations</label>
          <input type="range" min={10} max={100} step={5} value={iterations} onChange={e => setIterations(Number(e.target.value))} className="w-full accent-pink-400" />
          <p className="text-center text-white font-semibold text-sm mt-1">{iterations}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loadingAnalyze}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:bg-quantum-700 border border-quantum-600 disabled:opacity-60"
          >
            {loadingAnalyze ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</> : <><ScanSearch className="w-4 h-4" />Analyze</>}
          </button>
          <button
            onClick={handleConvert}
            disabled={loadingConvert}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:bg-quantum-700 border border-quantum-600 disabled:opacity-60"
          >
            {loadingConvert ? <><Loader2 className="w-4 h-4 animate-spin" />Converting…</> : <><GitBranch className="w-4 h-4" />Convert to QNN</>}
          </button>
          <button
            onClick={handleTrain}
            disabled={loadingTrain}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60"
            style={{ background: 'linear-gradient(90deg,#cc44ff,#ff6bcb)' }}
          >
            {loadingTrain ? <><Loader2 className="w-4 h-4 animate-spin" />Training all three — can take up to ~25s…</> : <><Play className="w-4 h-4" />Convert &amp; Train All</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>
      )}

      {parsed && !conversion && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
          <h3 className="text-white font-bold text-sm mb-3">Parsed Architecture</h3>
          <p className="text-gray-400 text-xs mb-3 font-mono">
            input({parsed.input_dim}) → {parsed.layers.map((l, i) => (
              <span key={i}>{l.type === 'dense' ? `dense(${l.units}, ${l.activation})` : 'dropout'}{i < parsed.layers.length - 1 ? ' → ' : ''}</span>
            ))} → output({parsed.output_dim})
          </p>
          <p className="text-gray-500 text-xs mb-3">{parsed.dense_layer_count} Dense layer(s) will map to quantum variational blocks.</p>
          {parsed.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 items-start text-xs text-amber-300/80 bg-amber-950/20 border border-amber-800/30 rounded-lg p-2.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
        </div>
      )}

      {!conversion && !parsed && !loadingConvert && !loadingTrain && !loadingAnalyze && (
        <div className="flex-1 flex items-center justify-center bg-quantum-800 border border-quantum-700 border-dashed rounded-2xl p-10 text-center">
          <div>
            <GitBranch className="w-10 h-10 text-pink-400 mx-auto mb-3 opacity-60" />
            <p className="text-gray-500 text-sm">Design your architecture and click</p>
            <p className="text-white font-semibold text-sm">Analyze, then Convert to QNN</p>
          </div>
        </div>
      )}

      {conversion && <StructuralComparison report={conversion} />}

      {training && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mt-5">
          <h3 className="text-white font-bold text-sm mb-1">Training Comparison</h3>
          <p className="text-gray-500 text-xs mb-4">
            Classical MLP vs. mapped QNN (from-scratch) vs. mapped QNN (classical-weight warm start) —
            all trained on the same toy dataset, same iteration budget.
          </p>
          <TrainingCompareChart
            classicalLoss={training.classical_loss_curve}
            quantumLoss={training.quantum_loss_curve}
            quantumWarmLoss={training.quantum_warm_loss_curve}
          />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl p-4 border bg-quantum-900 border-quantum-700">
              <p className="text-gray-500 text-xs mb-1">Classical MLP</p>
              <p className="font-bold text-lg text-blue-300">{(training.classical_accuracy * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded-xl p-4 border bg-purple-500/5 border-purple-500/30">
              <p className="text-gray-500 text-xs mb-1">QNN (from-scratch)</p>
              <p className="font-bold text-lg text-purple-300">{(training.quantum_accuracy * 100).toFixed(0)}%</p>
            </div>
            <div className="rounded-xl p-4 border bg-quantum-neon/5 border-quantum-neon/30">
              <p className="text-gray-500 text-xs mb-1">QNN (warm start)</p>
              <p className="font-bold text-lg text-quantum-neon">{(training.quantum_warm_accuracy * 100).toFixed(0)}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function extractError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const resp = (e as { response?: { data?: { detail?: string } } }).response;
    if (resp?.data?.detail) return resp.data.detail;
  }
  return e instanceof Error ? e.message : 'Request failed';
}
