import { AlertTriangle, Cpu, Zap } from 'lucide-react';
import type { ConversionReport } from '../../types';
import { QuantumCircuitDiagram } from './QuantumCircuitDiagram';

interface Props {
  report: ConversionReport;
}

export function StructuralComparison({ report }: Props) {
  return (
    <div className="space-y-5">
      {/* Two-column classical vs quantum cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-lg p-5 border border-blue-500/30">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-400 opacity-10 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-blue-300" />
              <h3 className="text-lg font-bold text-blue-300">Classical Network</h3>
            </div>
            <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded mb-3">
              {report.classical_layer_sizes.join(' → ')}
            </p>
            <div className="space-y-1 text-sm">
              <p className="text-gray-400">Neurons: <span className="text-white font-semibold">{report.classical_neurons}</span></p>
              <p className="text-gray-400">Trainable weights: <span className="text-white font-semibold">{report.classical_params}</span></p>
              <p className="text-gray-400">Depth: <span className="text-white font-semibold">{report.classical_depth} layers</span></p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-lg p-5 border border-purple-500/30">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 opacity-10 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-purple-300" />
              <h3 className="text-lg font-bold text-purple-300">Mapped QNN</h3>
            </div>
            <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded mb-3">
              {report.qnn.n_qubits} qubits × {report.qnn.n_layers} variational block(s)
            </p>
            <div className="space-y-1 text-sm">
              <p className="text-gray-400">Qubits: <span className="text-white font-semibold">{report.qnn.n_qubits}</span></p>
              <p className="text-gray-400">Trainable angles: <span className="text-white font-semibold">{report.qnn.trainable_angles}</span></p>
              <p className="text-gray-400">Circuit depth: <span className="text-white font-semibold">{report.qnn.circuit_depth} rounds</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Generated quantum circuit */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
        <h3 className="text-white font-bold text-sm mb-1">Generated Quantum Circuit</h3>
        <p className="text-gray-500 text-xs mb-4">
          Exactly what runs through the simulation kernel — angle-encoding, then (RY + RZ + CNOT-chain) per mapped layer.
        </p>
        <QuantumCircuitDiagram qnn={report.qnn} />
      </div>

      {/* Comparison table */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
        <h3 className="text-white font-bold text-sm mb-4">Structural Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-quantum-700">
                <th className="text-left py-2 font-medium">Metric</th>
                <th className="text-right py-2 font-medium text-blue-300">Classical</th>
                <th className="text-right py-2 font-medium text-purple-300">Quantum</th>
              </tr>
            </thead>
            <tbody>
              {report.comparison_rows.map(row => (
                <tr key={row.metric} className="border-b border-quantum-700/50 last:border-0">
                  <td className="py-2 text-gray-300">{row.metric}</td>
                  <td className="py-2 text-right text-white font-mono">{row.classical}</td>
                  <td className="py-2 text-right text-white font-mono">{row.quantum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mapping steps */}
      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
        <h3 className="text-white font-bold text-sm mb-3">How the conversion works</h3>
        <ol className="space-y-2">
          {report.mapping_steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-400 leading-relaxed">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-quantum-neon/10 text-quantum-neon text-xs font-bold flex items-center justify-center">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Approximation notes */}
      {report.approximation_notes.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-white font-bold text-sm">What this mapping is — and isn't</h3>
          </div>
          <ul className="space-y-2">
            {report.approximation_notes.map((note, i) => (
              <li key={i} className="text-amber-200/80 text-xs leading-relaxed flex gap-2">
                <span className="text-amber-500">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
