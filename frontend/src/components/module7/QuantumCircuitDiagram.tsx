const ROW_H = 46;
const COL_W = 46;
const LEFT = 40;
const TOP = 44;
const BOX = 32;

const COLOR = { ry: '#cc44ff', rz: '#ff6bcb', cnot: '#00ffcc', wire: '#3a3a6a', block: '#5555cc', text: '#cccccc', measure: '#e5e7eb' };

type Column = { kind: 'ry' | 'rz'; block: number; qubits: number } | { kind: 'cnot'; block: number; control: number } | { kind: 'measure' };

function columns(blocks: number[]): Column[] {
  const cols: Column[] = [];
  blocks.forEach((u, b) => {
    cols.push({ kind: 'ry', block: b, qubits: u }, { kind: 'rz', block: b, qubits: u });
    for (let c = u - 1; c >= 1; c--) cols.push({ kind: 'cnot', block: b, control: c });
  });
  cols.push({ kind: 'measure' });
  return cols;
}

/**
 * The converted circuit exactly as it runs: one block per Dense layer, on as many qubits as that layer has
 * neurons. Each qubit is turned by RY(w·x + b) and RZ(φ), then CNOTs pass each result down to q0, which is measured.
 */
export function QuantumCircuitDiagram({ blocks, labels }: { blocks: number[]; labels: string[] }) {
  const n = Math.max(...blocks);
  const cols = columns(blocks);
  const width = LEFT + cols.length * COL_W + 16;
  const height = TOP + (n - 1) * ROW_H + 30;
  const y = (q: number) => TOP + q * ROW_H;
  const x = (i: number) => LEFT + i * COL_W + COL_W / 2;
  const spans = blocks.map((u, b) => {
    const idx = cols.map((c, i) => ('block' in c && c.block === b ? i : -1)).filter(i => i >= 0);
    return { b, u, first: idx[0], last: idx[idx.length - 1] };
  });
  const summary = `Circuit with ${n} qubit${n > 1 ? 's' : ''} and ${blocks.length} block${blocks.length > 1 ? 's' : ''}: `
    + blocks.map((u, b) => `block ${b + 1} on ${u} qubit${u > 1 ? 's' : ''}`).join(', ') + '; q0 is measured.';

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label={summary} style={{ minWidth: width }}>
        {spans.map(s => (
          <g key={`block-${s.b}`}>
            <rect x={x(s.first) - COL_W / 2 + 3} y={TOP - 34} width={(s.last - s.first + 1) * COL_W - 6}
              height={(s.u - 1) * ROW_H + 34 + BOX / 2 + 8} rx={8} fill="rgba(85,85,204,0.08)" stroke={COLOR.block} strokeDasharray="4 4" />
            <text x={x(s.first) - COL_W / 2 + 10} y={TOP - 20} fontSize={12} fill={COLOR.text}>{labels[s.b] ?? `Block ${s.b + 1}`}</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, q) => (
          <g key={`wire-${q}`}>
            <text x={6} y={y(q) + 4} fontSize={12} fill="#aaaaaa" fontFamily="monospace">q{q}</text>
            <line x1={LEFT - 6} y1={y(q)} x2={q === 0 ? x(cols.length - 1) - BOX / 2 : width - 12} y2={y(q)} stroke={COLOR.wire} strokeWidth={1.5} />
          </g>
        ))}
        {cols.map((c, i) => {
          const cx = x(i);
          if (c.kind === 'ry' || c.kind === 'rz') {
            const color = c.kind === 'ry' ? COLOR.ry : COLOR.rz;
            return (
              <g key={i}>
                {Array.from({ length: c.qubits }, (_, q) => (
                  <g key={q}>
                    <rect x={cx - BOX / 2} y={y(q) - BOX / 2} width={BOX} height={BOX} rx={6} fill="#12122b" stroke={color} strokeWidth={1.5} />
                    <text x={cx} y={y(q) + 4} fontSize={12} fill={color} fontFamily="monospace" textAnchor="middle" fontWeight={700}>
                      {c.kind === 'ry' ? 'RY' : 'RZ'}
                    </text>
                  </g>
                ))}
              </g>
            );
          }
          if (c.kind === 'cnot') {
            const yc = y(c.control);
            const yt = y(c.control - 1);
            return (
              <g key={i}>
                <line x1={cx} y1={yc} x2={cx} y2={yt - 11} stroke={COLOR.cnot} strokeWidth={1.5} />
                <circle cx={cx} cy={yc} r={5} fill={COLOR.cnot} />
                <circle cx={cx} cy={yt} r={11} fill="none" stroke={COLOR.cnot} strokeWidth={1.5} />
                <line x1={cx - 11} y1={yt} x2={cx + 11} y2={yt} stroke={COLOR.cnot} strokeWidth={1.5} />
                <line x1={cx} y1={yt - 11} x2={cx} y2={yt + 11} stroke={COLOR.cnot} strokeWidth={1.5} />
              </g>
            );
          }
          return (
            <g key={i}>
              <rect x={cx - BOX / 2} y={y(0) - BOX / 2} width={BOX} height={BOX} rx={6} fill="#12122b" stroke={COLOR.measure} strokeWidth={1.5} />
              <text x={cx} y={y(0) + 4} fontSize={12} fill={COLOR.measure} fontFamily="monospace" textAnchor="middle" fontWeight={700}>M</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
