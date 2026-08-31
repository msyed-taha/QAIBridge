import type { QNNSpec } from '../../types';

interface Props {
  qnn: QNNSpec;
}

const ROW_H = 56;
const COL_W = 64;
const LEFT_PAD = 96;
const TOP_PAD = 24;
const GATE_R = 14;

type Column =
  | { kind: 'rx' }
  | { kind: 'ry' }
  | { kind: 'rz' }
  | { kind: 'cnot'; control: number; target: number }
  | { kind: 'measure' };

function buildColumns(n_qubits: number, n_layers: number): Column[] {
  const cols: Column[] = [{ kind: 'rx' }];
  for (let l = 0; l < n_layers; l++) {
    cols.push({ kind: 'ry' });
    cols.push({ kind: 'rz' });
    for (let q = 0; q < n_qubits - 1; q++) cols.push({ kind: 'cnot', control: q, target: q + 1 });
  }
  cols.push({ kind: 'measure' });
  return cols;
}

/** Static SVG rendering of the generated variational circuit — RX angle-encoding,
 * then (RY + RZ + CNOT-chain) per mapped Dense layer, then measurement — matching
 * exactly what quantum_layer.py executes, not an illustrative approximation. */
export function QuantumCircuitDiagram({ qnn }: Props) {
  const { n_qubits, n_layers } = qnn;
  const columns = buildColumns(n_qubits, n_layers);
  const width = LEFT_PAD + columns.length * COL_W + 40;
  const height = TOP_PAD * 2 + (n_qubits - 1) * ROW_H + 20;

  const yFor = (q: number) => TOP_PAD + q * ROW_H;
  const xFor = (i: number) => LEFT_PAD + i * COL_W + COL_W / 2;

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="min-w-full" style={{ minWidth: width }}>
        {/* Qubit wires + labels */}
        {Array.from({ length: n_qubits }).map((_, q) => (
          <g key={`wire-${q}`}>
            <text x={8} y={yFor(q) + 4} fontSize={12} fill="#888" fontFamily="monospace">
              q{q}
            </text>
            <line x1={LEFT_PAD} y1={yFor(q)} x2={width - 20} y2={yFor(q)} stroke="#3a3a6a" strokeWidth={1.5} />
          </g>
        ))}

        {columns.map((col, i) => {
          const x = xFor(i);
          if (col.kind === 'rx' || col.kind === 'ry' || col.kind === 'rz') {
            const label = col.kind.toUpperCase();
            const color = col.kind === 'rx' ? '#00ffcc' : col.kind === 'ry' ? '#cc44ff' : '#ff6bcb';
            return (
              <g key={i}>
                {Array.from({ length: n_qubits }).map((_, q) => (
                  <g key={q}>
                    <rect x={x - 18} y={yFor(q) - 14} width={36} height={28} rx={6} fill="#12122b" stroke={color} strokeWidth={1.5} />
                    <text x={x} y={yFor(q) + 4} fontSize={11} fill={color} fontFamily="monospace" textAnchor="middle" fontWeight={700}>
                      {label}
                    </text>
                  </g>
                ))}
              </g>
            );
          }
          if (col.kind === 'cnot') {
            const yC = yFor(col.control);
            const yT = yFor(col.target);
            return (
              <g key={i}>
                <line x1={x} y1={yC} x2={x} y2={yT} stroke="#00ffcc" strokeWidth={1.5} />
                <circle cx={x} cy={yC} r={5} fill="#00ffcc" />
                <circle cx={x} cy={yT} r={GATE_R} fill="none" stroke="#00ffcc" strokeWidth={1.5} />
                <line x1={x - GATE_R} y1={yT} x2={x + GATE_R} y2={yT} stroke="#00ffcc" strokeWidth={1.5} />
                <line x1={x} y1={yT - GATE_R} x2={x} y2={yT + GATE_R} stroke="#00ffcc" strokeWidth={1.5} />
              </g>
            );
          }
          // measure
          return (
            <g key={i}>
              {Array.from({ length: n_qubits }).map((_, q) => (
                <g key={q}>
                  <rect x={x - 22} y={yFor(q) - 14} width={44} height={28} rx={6} fill="#12122b" stroke="#8888aa" strokeWidth={1.5} />
                  <text x={x} y={yFor(q) + 4} fontSize={9} fill="#aaa" fontFamily="monospace" textAnchor="middle">
                    {q === 0 ? 'M ⟨Z⟩' : 'M'}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
