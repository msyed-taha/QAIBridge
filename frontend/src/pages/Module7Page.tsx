import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Atom, BookOpen, ChevronDown, Layers, Loader2, Play, Plus, Scale, X } from 'lucide-react';
import {
  qnnApi, type Activation, type CompareResult, type Conversion, type ConverterMethod, type DatasetName, type Datasets, type LayerSpec,
  type ParsedArchitecture,
} from '../api/qnn';
import { getApiErrorMessage } from '../api/client';
import { HowToUse } from '../components/shared/HowToUse';
import { QuantumCircuitDiagram } from '../components/module7/QuantumCircuitDiagram';
import { CLASS_COLORS, DatasetChart, DecisionMap, LossChart, METHOD_COLORS, METHOD_ORDER } from '../components/module7/charts';
import { usePageDetails } from '../components/ai/pageDetails';

const MAX_LAYERS = 4;
const MAX_UNITS = 8;
const ACTIVATIONS: Activation[] = ['relu', 'tanh', 'sigmoid'];
const DATASET_ORDER: DatasetName[] = ['xor', 'circles', 'moons', 'groups'];
const DEFAULT_LAYERS: LayerSpec[] = [
  { type: 'dense', units: 4, activation: 'relu' },
  { type: 'dense', units: 4, activation: 'relu' },
];

const METHOD_TEXT: Record<ConverterMethod, string> = {
  classical: 'the network as you described it.',
  quantum: 'the circuit it becomes, from a fresh random start.',
  warm: "the same circuit, started from the trained classical network: each qubit's turn follows its neuron's input.",
};

const GLOSSARY = [
  ['Neuron', 'A unit of a classical network. It multiplies its inputs by weights, adds a bias and passes the result through its activation.'],
  ['Activation', 'The curve a neuron applies to its input: relu, tanh or sigmoid. A qubit has a built-in one: its chance of 1 follows a cosine curve of its angle.'],
  ['RY and RZ', 'Turning a qubit by an angle. RY changes its chance of reading 1; RZ changes its phase, which matters once qubits interact.'],
  ['CNOT', 'A gate on two qubits: it flips one when the other is 1. It is how qubits pass information to each other.'],
  ['Data re-uploading', 'Reading the inputs again in every block. A qubit can only be turned, not fed numbers, so each block turns its qubits by the inputs once more.'],
  ['Warm start', 'Starting the quantum network from what the trained classical network learned, instead of from random numbers.'],
  ['Test points', 'Points kept back during training. Accuracy on them shows whether a network learned the pattern or only memorised its points.'],
  ['Seed', 'The random numbers a run starts from. Training from 3 seeds shows how much a result depends on luck.'],
  ['Loss (cross-entropy)', 'How wrong the predicted chances are on the points a network learns from. Lower is better.'],
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const range = (s: { min: number; max: number }) => (Math.round(s.min * 100) === Math.round(s.max * 100) ? pct(s.min) : `${pct(s.min)}–${pct(s.max)}`);
/** The runs' spread in a sentence: "all 93%" or "90%–92%". */
const runs = (s: { min: number; max: number }) => (Math.round(s.min * 100) === Math.round(s.max * 100) ? `all ${pct(s.min)}` : range(s));

/** The network as the server describes it back, to tell whether a result is for the current settings. */
const normalised = (layers: LayerSpec[]) =>
  layers.map(l => (l.type === 'dense' ? { type: 'dense', units: l.units, activation: l.activation } : { type: 'dropout', units: null, activation: null }));

const describe = (layers: LayerSpec[]) =>
  layers.map(l => (l.type === 'dense' ? `Dense ${l.units} ${l.activation}` : 'Dropout')).join(' → ');

/** Two or three sentences on what the comparison showed, from its own numbers. */
function headline(r: CompareResult, datasets: Datasets | null): string {
  const { classical: c, quantum: q, warm: w } = r.methods;
  const name = datasets?.[r.dataset].label ?? r.dataset;
  const qa = q.test_accuracy.mean;
  const ca = c.test_accuracy.mean;
  const word = Math.abs(qa - ca) <= 0.02 ? 'matched' : qa > ca ? 'beat' : 'trailed';
  let text = `On ${name}, the quantum network ${word} the classical one on the ${r.test_points} test points: ${pct(qa)} against ${pct(ca)}`
    + ` (average of ${r.seeds} runs), with ${q.params} trainable numbers against ${c.params}.`;
  const wa = w.test_accuracy.mean;
  const spreadQ = q.test_accuracy.max - q.test_accuracy.min;
  const spreadW = w.test_accuracy.max - w.test_accuracy.min;
  if (Math.abs(wa - qa) <= 0.01) {
    text += spreadW < spreadQ - 0.01
      ? ` Starting from the classical weights gave about the same average (${pct(wa)}) with steadier runs (${runs(w.test_accuracy)}, against ${runs(q.test_accuracy)}).`
      : ` Starting from the classical weights made no real difference (${pct(wa)}).`;
  } else if (wa > qa) {
    text += ` Starting from the classical weights helped: ${pct(wa)}${spreadW < spreadQ - 0.01 ? `, with steadier runs (${runs(w.test_accuracy)})` : ''}.`;
  } else {
    text += ` Starting from the classical weights didn't help here: ${pct(wa)}.`;
  }
  return text;
}

function Section({ step, title, icon, children }: { step: number; title: string; icon: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 sm:p-6 mb-6">
      <h2 id={id} className="flex items-center gap-2 text-white font-bold text-lg mb-2">
        {icon}<span className="text-gray-400 font-normal flex-shrink-0 whitespace-nowrap">{step} ·</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4 border bg-quantum-900 border-quantum-700">
      <p className="text-gray-300 text-xs mb-1">{label}</p>
      <p className="font-bold text-lg font-mono" style={{ color: color ?? '#fff' }}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function LayerCard({ layer, index, count, onChange, onRemove }: {
  layer: LayerSpec; index: number; count: number; onChange: (l: LayerSpec) => void; onRemove: () => void;
}) {
  const ids = { type: useId(), units: useId(), activation: useId() };
  const field = 'w-full bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-purple-400';
  return (
    <li className={`w-full sm:w-44 rounded-xl border p-3 ${layer.type === 'dense' ? 'bg-purple-500/10 border-purple-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white"><Layers className="w-4 h-4" aria-hidden="true" /> Layer {index + 1}</span>
        <button type="button" onClick={onRemove} disabled={count <= 1} aria-label={`Remove layer ${index + 1}`}
          className="p-1 rounded text-gray-300 hover:text-red-300 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={ids.type} className="block text-xs text-gray-300 mb-1">Type</label>
      <select id={ids.type} value={layer.type} className={field}
        onChange={e => onChange(e.target.value === 'dense' ? { type: 'dense', units: 4, activation: 'relu' } : { type: 'dropout' })}>
        <option value="dense">Dense</option>
        <option value="dropout">Dropout</option>
      </select>
      {layer.type === 'dense' ? (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label htmlFor={ids.units} className="block text-xs text-gray-300 mb-1">Neurons</label>
            <select id={ids.units} value={layer.units} className={field} onChange={e => onChange({ ...layer, units: Number(e.target.value) })}>
              {Array.from({ length: MAX_UNITS }, (_, i) => i + 1).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.activation} className="block text-xs text-gray-300 mb-1">Activation</label>
            <select id={ids.activation} value={layer.activation} className={field} onChange={e => onChange({ ...layer, activation: e.target.value as Activation })}>
              {ACTIVATIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-200 mt-2 leading-relaxed">Switches off 20% of the neurons before it while the network trains.</p>
      )}
    </li>
  );
}

export function Module7Page() {
  const [layers, setLayers] = useState<LayerSpec[]>(DEFAULT_LAYERS);
  const [datasetName, setDatasetName] = useState<DatasetName>('xor');
  const [steps, setSteps] = useState(100);
  const [datasets, setDatasets] = useState<Datasets | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [conversion, setConversion] = useState<(Conversion & { parsed: ParsedArchitecture }) | null>(null);
  const [convError, setConvError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const ids = { steps: useId(), glossary: useId(), datasets: useId() };

  // The datasets load as soon as the page opens (and the server starts preparing the default network on each).
  useEffect(() => {
    let live = true;
    qnnApi.datasets()
      .then(d => { if (live) setDatasets(d); })
      .catch(e => { if (live) setDataError(getApiErrorMessage(e, "Couldn't load the datasets. Please reload the page.")); });
    return () => { live = false; };
  }, []);

  // The quantum network follows the classical one as it is edited.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      qnnApi.convert(layers)
        .then(r => {
          if (!live) return;
          setConversion(r.ok ? r : null);
          setConvError(r.ok ? null : r.error);
        })
        .catch(e => { if (live) { setConversion(null); setConvError(getApiErrorMessage(e, "Couldn't convert this network. Please try again.")); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [layers]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const train = async () => {
    setRunning(true);
    setElapsed(0);
    setRunError(null);
    try {
      setResult(await qnnApi.trainCompare(layers, datasetName, steps));
    } catch (e) {
      setRunError(getApiErrorMessage(e, "Training couldn't finish. Please try again."));
    } finally {
      setRunning(false);
    }
  };

  const updateLayer = (i: number, l: LayerSpec) => setLayers(ls => ls.map((x, k) => (k === i ? l : x)));
  const removeLayer = (i: number) => setLayers(ls => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls));
  const addLayer = () => setLayers(ls => (ls.length < MAX_LAYERS ? [...ls, { type: 'dense', units: 4, activation: 'relu' }] : ls));

  const stale = !!result && (result.dataset !== datasetName || result.steps !== steps
    || JSON.stringify(result.layers) !== JSON.stringify(normalised(layers)));
  const blockLabels = conversion
    ? conversion.parsed.layers.flatMap((l, i) => (l.type === 'dense' ? [`Layer ${i + 1}: ${l.units} neuron${l.units === 1 ? '' : 's'}`] : []))
    : [];
  const data = datasets?.[datasetName] ?? null;
  const resultData = result && datasets ? datasets[result.dataset] : null;

  // What Ask QAIbridge is told about this page.
  const details = useMemo(() => {
    const lines = ['Neural Network Converter page.', `Classical network: 2 inputs → ${describe(layers)} → 1 output. Dataset: ${datasetName}.`];
    if (conversion) {
      const q = conversion.qnn;
      lines.push(`It becomes: ${q.n_qubits} qubits, ${q.blocks.length} blocks (qubits per block ${q.blocks.join(', ')}), ${q.trainable} trainable numbers`
        + ` vs ${conversion.classical_params} classical weights; gates ${q.gates.RY} RY, ${q.gates.RZ} RZ, ${q.gates.CNOT} CNOT.`);
    }
    if (convError) lines.push(`It can't be converted: ${convError}`);
    if (result) {
      lines.push(`Comparison (${describe(result.layers)}, ${result.dataset}, ${result.steps} steps, ${result.seeds} seeds each):`);
      for (const k of METHOD_ORDER) {
        const m = result.methods[k];
        lines.push(`- ${m.label}: test accuracy ${pct(m.test_accuracy.mean)} (${range(m.test_accuracy)}), training accuracy ${pct(m.train_accuracy.mean)},`
          + ` final loss ${m.final_loss.mean.toFixed(3)}, ${m.params} trainable numbers, learning rate ${m.learning_rate}.`);
      }
      lines.push(headline(result, datasets));
    }
    return lines.join('\n');
  }, [layers, datasetName, conversion, convError, result, datasets]);
  usePageDetails('neural-network-converter', details);

  return (
    <div className="min-h-screen px-4 py-10 max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-400" aria-hidden="true" />
          Neural Network Converter
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Turn a classical neural network into a quantum one</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Describe a classical network. Each neuron becomes a qubit and each layer a block of quantum gates. Then both networks
          learn the same data on equal terms, and you see what each one learned, tested on points neither of them has seen.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <>In section 1, build a classical network of up to {MAX_LAYERS} layers: Dense (1 to {MAX_UNITS} neurons, relu, tanh or sigmoid) or Dropout. Then pick a dataset.</>,
          <>Section 2 shows the quantum network it becomes, as you edit: the circuit, and what each layer turned into.</>,
          <>In section 3, press <strong>Train both and compare</strong>. Each network trains 3 times from different seeds. The maps show what each learned, and the table shows its accuracy on the test points.</>,
          <>The default network is prepared on every dataset as soon as the page opens, so it shows at once. The biggest networks take up to about half a minute.</>,
        ]}
        outcome={<>Whether the quantum network learns the data as well as the classical one, with how many trainable numbers, and whether starting from the classical weights helps.</>}
      />

      {/* 1 · The classical network */}
      <Section step={1} title="Your classical network" icon={<Layers className="w-5 h-5 text-blue-400" aria-hidden="true" />}>
        <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-3xl">
          It takes 2 inputs (a point's two features) and gives 1 output: the chance that the point is class 1.
        </p>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mb-5">
          <span className="rounded-xl bg-quantum-900 border border-quantum-700 px-3 py-2 text-sm text-gray-300 sm:self-center">Input: <strong className="text-white">2</strong></span>
          <ol aria-label="Layers" className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {layers.map((l, i) => (
              <LayerCard key={i} layer={l} index={i} count={layers.length} onChange={nl => updateLayer(i, nl)} onRemove={() => removeLayer(i)} />
            ))}
          </ol>
          <button type="button" onClick={addLayer} disabled={layers.length >= MAX_LAYERS}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-quantum-500 px-3 py-2 text-sm text-gray-300 hover:text-white hover:border-quantum-400 disabled:opacity-40 sm:self-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <Plus className="w-4 h-4" aria-hidden="true" /> Add layer
          </button>
          <span className="rounded-xl bg-quantum-900 border border-quantum-700 px-3 py-2 text-sm text-gray-300 sm:self-center">Output: <strong className="text-white">1</strong></span>
        </div>

        <h3 id={ids.datasets} className="text-white font-semibold text-sm mb-2">The data both networks learn</h3>
        {dataError && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-3">{dataError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div role="group" aria-labelledby={ids.datasets} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DATASET_ORDER.map(name => (
              <button key={name} type="button" onClick={() => setDatasetName(name)} aria-pressed={datasetName === name} disabled={running}
                className={`text-left rounded-xl border px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${datasetName === name ? 'border-quantum-neon bg-quantum-neon/10 text-white' : 'border-quantum-600 text-gray-300 hover:border-quantum-400'}`}>
                <strong>{datasets?.[name].label ?? name}</strong>
                {datasets && <span className="block text-xs text-gray-300 mt-0.5 leading-relaxed">{datasets[name].about}</span>}
              </button>
            ))}
          </div>
          <div>
            {data ? <DatasetChart data={data} /> : !dataError && (
              <p role="status" className="flex items-center gap-2 text-sm text-gray-300 py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading the data…</p>
            )}
            {data && (
              <p className="text-xs text-gray-400 leading-relaxed">
                {data.train.x.length} points to learn from (filled) and {data.test.x.length} kept back to test (rings).{' '}
                <span style={{ color: CLASS_COLORS[0] }}>Amber</span> is class 0, <span style={{ color: CLASS_COLORS[1] }}>blue</span> is class 1.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 2 · The conversion */}
      <Section step={2} title="The quantum network it becomes" icon={<Atom className="w-5 h-5 text-purple-400" aria-hidden="true" />}>
        <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-3xl">
          Each neuron becomes a qubit, and each Dense layer a block of gates on that many qubits. A neuron's weights and bias
          become the angle that turns its qubit, and CNOTs pass each qubit's result on, as a layer passes its outputs to the next.
          At the end one qubit is measured: its chance of reading 1 is the chance of class 1.
        </p>
        {convError && <p role="alert" className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 text-amber-100 text-sm">{convError}</p>}
        {!conversion && !convError && (
          <p role="status" className="flex items-center gap-2 text-sm text-gray-300 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Converting…</p>
        )}
        {conversion && (
          <div aria-live="polite">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Stat label="Classical network" value={conversion.classical_layer_sizes.join(' → ')}
                sub={`${conversion.classical_params} trainable weights and biases`} color={METHOD_COLORS.classical} />
              <Stat label="Quantum network" value={`${conversion.qnn.n_qubits} qubit${conversion.qnn.n_qubits > 1 ? 's' : ''}, ${conversion.qnn.blocks.length} block${conversion.qnn.blocks.length > 1 ? 's' : ''}`}
                sub={`${conversion.qnn.trainable} trainable numbers · ${conversion.qnn.gates.RY} RY, ${conversion.qnn.gates.RZ} RZ, ${conversion.qnn.gates.CNOT} CNOT`}
                color={METHOD_COLORS.quantum} />
            </div>
            <div className="bg-quantum-900/60 border border-quantum-700 rounded-xl p-3">
              <QuantumCircuitDiagram blocks={conversion.qnn.blocks} labels={blockLabels} />
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-300 mt-2 mb-5">
              <li><strong className="text-[#cc44ff]">RY</strong>: turned by w·x + b, its neuron's weights times the inputs, plus its bias</li>
              <li><strong className="text-[#ff6bcb]">RZ</strong>: a trainable phase</li>
              <li><strong className="text-quantum-neon">⊕</strong>: CNOT, passes a qubit's result towards q0</li>
              <li><strong className="text-gray-100">M</strong>: q0 is measured</li>
            </ul>

            <h3 className="text-white font-semibold text-sm mb-2">Layer by layer</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">What each classical layer becomes in the circuit</caption>
                <thead className="text-gray-400 text-left text-xs">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Classical layer</th><th className="pr-3 font-medium">Weights</th>
                    <th className="pr-3 font-medium">Becomes</th><th className="font-medium">Trainable numbers</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  {conversion.rows.map((row, i) => (
                    <tr key={i} className="border-t border-quantum-700/60 align-top">
                      <td className="py-2 pr-3">{row.classical}</td>
                      <td className="py-2 pr-3 font-mono">{row.classical_params}</td>
                      <td className={`py-2 pr-3 ${row.quantum_params === null ? 'text-amber-200' : ''}`}>{row.quantum}</td>
                      <td className="py-2 font-mono">{row.quantum_params ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-white font-semibold text-sm mt-5 mb-2">What carries over, and what doesn't</h3>
            <ul className="space-y-1.5">
              {conversion.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
                  <span className="text-quantum-neon" aria-hidden="true">•</span>{note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 3 · The comparison */}
      <Section step={3} title="Train both and compare" icon={<Scale className="w-5 h-5 text-quantum-neon" aria-hidden="true" />}>
        <p className="text-gray-300 text-sm leading-relaxed mb-3 max-w-3xl">
          All three learn the same points with the same optimiser, the same loss and the same number of steps. Each tries two
          learning rates and keeps its better one, and each trains 3 times from different seeds.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          {METHOD_ORDER.map(k => (
            <li key={k} className="flex gap-2 text-sm text-gray-300 bg-quantum-900/60 border border-quantum-700 rounded-xl px-3 py-2">
              <span className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ background: METHOD_COLORS[k] }} aria-hidden="true" />
              <span><strong className="text-white">{{ classical: 'Classical network', quantum: 'Quantum network', warm: 'Quantum, warm-started' }[k]}:</strong> {METHOD_TEXT[k]}</span>
            </li>
          ))}
        </ul>

        <div className="mb-4 max-w-md">
          <label htmlFor={ids.steps} className="block text-sm text-gray-300 mb-1">Training steps: <strong className="text-white">{steps}</strong></label>
          <input id={ids.steps} type="range" min={20} max={200} step={10} value={steps} onChange={e => setSteps(Number(e.target.value))}
            disabled={running} className="w-full accent-purple-400" />
        </div>
        <button type="button" onClick={train} disabled={running || !!convError || !conversion}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ background: 'linear-gradient(90deg,#60a5fa,#cc44ff,#00ffcc)' }}>
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Training 3 networks × 3 runs… {elapsed} s</>
            : <><Play className="w-4 h-4" aria-hidden="true" />Train both and compare</>}
        </button>
        <p className="text-xs text-gray-400 mt-2 mb-4">
          Most networks take a few seconds; the biggest (4 layers of 8) up to about half a minute. Results are kept, so the same settings show at once next time.
        </p>

        {runError && <p role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm mb-4">{runError}</p>}

        {result && (
          <div aria-live="polite">
            {stale && (
              <p className="text-sm text-amber-100 bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-2 mb-3">
                These results are for {describe(result.layers)} on {datasets?.[result.dataset].label ?? result.dataset} with {result.steps} steps.
                Press <strong>Train both and compare</strong> for the current settings.
              </p>
            )}
            <p className="text-white text-sm leading-relaxed bg-quantum-900/60 border border-quantum-600 rounded-xl px-4 py-3 mb-4">{headline(result, datasets)}</p>

            <h3 className="text-white font-semibold text-sm mb-1">What each network learned</h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-2">
              The shading is each network's chance of class 1 at every point (<span style={{ color: CLASS_COLORS[0] }}>amber</span> for class 0,{' '}
              <span style={{ color: CLASS_COLORS[1] }}>blue</span> for class 1) and the dotted line is where it changes its answer.
              Filled dots are the points it learned from; rings are the test points.
            </p>
            {resultData && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {METHOD_ORDER.map(k => (
                  <figure key={k} className="bg-quantum-900/60 border border-quantum-700 rounded-xl p-2">
                    <figcaption className="flex items-center gap-2 text-sm text-white px-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: METHOD_COLORS[k] }} aria-hidden="true" />
                      {result.methods[k].label}
                      <span className="ml-auto text-gray-300 font-mono">{pct(result.methods[k].test_accuracy.mean)}</span>
                    </figcaption>
                    <DecisionMap result={result} method={k} data={resultData} />
                  </figure>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">Results for each network</caption>
                <thead className="text-gray-400 text-left text-xs">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Network</th><th className="pr-3 font-medium">Trainable numbers</th>
                    <th className="pr-3 font-medium">Test accuracy (range)</th><th className="pr-3 font-medium">Training accuracy</th>
                    <th className="pr-3 font-medium">Final loss (range)</th><th className="font-medium">Learning rate</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200">
                  {METHOD_ORDER.map(k => {
                    const m = result.methods[k];
                    return (
                      <tr key={k} className="border-t border-quantum-700/60">
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: METHOD_COLORS[k] }} aria-hidden="true" />{m.label}
                          </span>
                        </td>
                        <td className="pr-3 font-mono">{m.params}</td>
                        <td className="pr-3 font-mono">{pct(m.test_accuracy.mean)} <span className="text-gray-400">({range(m.test_accuracy)})</span></td>
                        <td className="pr-3 font-mono">{pct(m.train_accuracy.mean)}</td>
                        <td className="pr-3 font-mono">{m.final_loss.mean.toFixed(3)} <span className="text-gray-400">({m.final_loss.min.toFixed(2)}–{m.final_loss.max.toFixed(2)})</span></td>
                        <td className="font-mono">{m.learning_rate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="text-white font-semibold text-sm mt-6 mb-1">How the training went</h3>
            <LossChart result={result} />

            <p className="text-xs text-gray-400 leading-relaxed mt-3">
              Same {result.train_points} points at every step, {result.steps} steps, optimiser (Adam) and loss (cross-entropy) for all three.
              Each tried two learning rates and kept the one with the lower training loss, so the {result.test_points} test points never
              helped choose: {METHOD_ORDER.map(k => `${result.methods[k].label.toLowerCase()} ${result.methods[k].learning_rates_tried.join(' or ')} (chose ${result.methods[k].learning_rate})`).join(', ')}.
              Each trained {result.seeds} times from different seeds; lines show the average and shading the best and worst run, and the maps
              show the run in the middle. The warm start begins from the classical network of the same seed.
              {result.cached ? ' These results were kept from an earlier run with the same settings.' : ` Took ${result.seconds.toFixed(1)} s.`}
            </p>
          </div>
        )}
      </Section>

      <div className="mt-6">
        <button type="button" onClick={() => setGlossary(g => !g)} aria-expanded={glossary} aria-controls={ids.glossary}
          className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white border border-quantum-600 rounded-full px-3 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <BookOpen className="w-4 h-4" aria-hidden="true" /> Words used on this page
          <ChevronDown className={`w-4 h-4 transition-transform ${glossary ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {glossary && (
          <dl id={ids.glossary} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {GLOSSARY.map(([term, plain]) => (
              <div key={term} className="bg-quantum-800 border border-quantum-700 rounded-xl p-3">
                <dt className="text-quantum-neon text-sm font-semibold mb-1">{term}</dt>
                <dd className="text-gray-300 text-sm leading-relaxed">{plain}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
