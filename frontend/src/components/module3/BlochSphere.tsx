interface Props {
  qubit: number;
  x: number;
  y: number;
  z: number;
  entangled: boolean;
  size?: number;
}

/**
 * A lightweight SVG Bloch sphere. The state vector (x, y, z) is drawn with an
 * oblique projection: z up (|0⟩ top, |1⟩ bottom), y to the right (|+i⟩), and
 * x toward the viewer (|+⟩, drawn down-left). A qubit that is entangled with
 * the others has a shorter vector (its reduced state is mixed), shown dashed.
 */
export function BlochSphere({ qubit, x, y, z, entangled, size = 132 }: Props) {
  const c = size / 2;
  const R = size * 0.36;
  const k = 0.42;                                  // depth foreshortening of the x axis
  const project = (px: number, py: number, pz: number) => ({
    sx: c + R * (py - k * px * 0.87),
    sy: c - R * (pz - k * px * 0.5),
  });
  const tip = project(x, y, z);
  const len = Math.sqrt(x * x + y * y + z * z);
  const pts = (list: [number, number, number][]) => list.map(([a, b, d]) => project(a, b, d));
  const axisX = pts([[-1, 0, 0], [1, 0, 0]]);
  const color = entangled ? '#cc44ff' : '#00ffcc';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Bloch sphere of qubit ${qubit}`}>
        <circle cx={c} cy={c} r={R} fill="rgba(85,85,204,0.08)" stroke="#3a3a7a" strokeWidth={1} />
        <ellipse cx={c} cy={c} rx={R} ry={R * k * 0.55} fill="none" stroke="#3a3a7a" strokeDasharray="3 3" />
        <line x1={c} y1={c - R} x2={c} y2={c + R} stroke="#2e2e66" strokeWidth={1} />
        <line x1={c - R} y1={c} x2={c + R} y2={c} stroke="#2e2e66" strokeWidth={1} />
        <line x1={axisX[0].sx} y1={axisX[0].sy} x2={axisX[1].sx} y2={axisX[1].sy} stroke="#2e2e66" strokeWidth={1} />
        <text x={c} y={c - R - 5} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="monospace">|0⟩</text>
        <text x={c} y={c + R + 12} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="monospace">|1⟩</text>
        <text x={axisX[1].sx - 6} y={axisX[1].sy + 12} fontSize={8} fill="#6b7280" fontFamily="monospace">|+⟩</text>
        <text x={c + R + 2} y={c + 3} fontSize={8} fill="#6b7280" fontFamily="monospace">|i⟩</text>
        <line x1={c} y1={c} x2={tip.sx} y2={tip.sy} stroke={color} strokeWidth={2.5}
          strokeDasharray={entangled ? '4 3' : undefined} strokeLinecap="round" />
        <circle cx={tip.sx} cy={tip.sy} r={4} fill={color} />
        <circle cx={c} cy={c} r={2} fill="#9ca3af" />
      </svg>
      <p className="text-[11px] font-mono text-gray-300 -mt-1">q{qubit}</p>
      <p className="text-[10px] text-gray-500 font-mono">
        {entangled ? `entangled · |r| = ${len.toFixed(2)}` : `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`}
      </p>
    </div>
  );
}
