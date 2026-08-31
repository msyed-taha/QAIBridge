import { useState, useCallback } from 'react';
import { Trash2, Play, Loader2, Info, Zap, Link } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type GateName = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'SDG' | 'TDG' | 'CNOT' | 'CZ';

interface PlacedGate {
  id:           string;
  gate:         GateName;
  qubit:        number;
  col:          number;
  controlQubit?: number;   // for CNOT / CZ
}

interface StateEntry {
  label:        string;
  probability:  number;
  amplitude_re: number;
  amplitude_im: number;
}

interface SimResult {
  num_qubits:       number;
  states:           StateEntry[];
  is_superposition: boolean;
  is_entangled:     boolean;
  gate_count:       number;
}

// ── Gate palette metadata ─────────────────────────────────────────────────────

const GATE_META: { name: GateName; label: string; color: string; desc: string; isTwoQubit?: boolean }[] = [
  { name: 'H',   label: 'H',   color: '#00ffcc', desc: 'Hadamard — creates superposition' },
  { name: 'X',   label: 'X',   color: '#f97316', desc: 'Pauli-X — quantum NOT gate' },
  { name: 'Y',   label: 'Y',   color: '#a855f7', desc: 'Pauli-Y — bit + phase flip' },
  { name: 'Z',   label: 'Z',   color: '#3b82f6', desc: 'Pauli-Z — phase flip' },
  { name: 'S',   label: 'S',   color: '#ec4899', desc: 'S gate — π/2 phase rotation' },
  { name: 'T',   label: 'T',   color: '#eab308', desc: 'T gate — π/4 phase rotation' },
  { name: 'SDG', label: 'S†',  color: '#ec4899', desc: 'Inverse S gate' },
  { name: 'TDG', label: 'T†',  color: '#eab308', desc: 'Inverse T gate' },
  { name: 'CNOT',label: 'CX',  color: '#00ffcc', desc: 'CNOT — controlled NOT, creates entanglement', isTwoQubit: true },
  { name: 'CZ',  label: 'CZ',  color: '#a855f7', desc: 'Controlled-Z gate', isTwoQubit: true },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const WIRE_Y    = (q: number) => 60 + q * 70;  // Y position for qubit wire q
const COL_X     = (c: number) => 90 + c * 70;  // X position for column c
const MAX_COLS  = 10;
const GATE_SIZE = 36;

let _id = 0;
const uid = () => `g${++_id}`;

// ── Circuit Canvas ─────────────────────────────────────────────────────────────

function CircuitCanvas({
  numQubits, gates, onDropGate, onRemoveGate, selectedGate, pendingCnot, onCancelCnot,
}: {
  numQubits:    number;
  gates:        PlacedGate[];
  onDropGate:   (col: number, qubit: number) => void;
  onRemoveGate: (id: string) => void;
  selectedGate: GateName | null;
  pendingCnot:  { col: number; qubit: number } | null;
  onCancelCnot: () => void;
}) {
  const svgW = COL_X(MAX_COLS) + 30;
  const svgH = WIRE_Y(numQubits - 1) + 60;

  const handleWireClick = (e: React.MouseEvent<SVGRectElement>, col: number, qubit: number) => {
    e.stopPropagation();
    onDropGate(col, qubit);
  };

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgW}
        height={svgH}
        className="select-none"
        onClick={pendingCnot ? onCancelCnot : undefined}
        style={{ minWidth: svgW }}
      >
        {/* Qubit wire labels */}
        {Array.from({ length: numQubits }, (_, q) => (
          <g key={`label-${q}`}>
            <text x={10} y={WIRE_Y(q) + 5} fill="#9ca3af" fontSize={12} fontFamily="monospace">
              q{q}
            </text>
            {/* Wire line */}
            <line
              x1={40} y1={WIRE_Y(q)}
              x2={svgW - 10} y2={WIRE_Y(q)}
              stroke="#374151" strokeWidth={2}
            />
          </g>
        ))}

        {/* Drop zones (invisible clickable rectangles per cell) */}
        {Array.from({ length: MAX_COLS }, (_, col) =>
          Array.from({ length: numQubits }, (_, qubit) => (
            <rect
              key={`zone-${col}-${qubit}`}
              x={COL_X(col) - GATE_SIZE / 2 - 5}
              y={WIRE_Y(qubit) - GATE_SIZE / 2 - 5}
              width={GATE_SIZE + 10}
              height={GATE_SIZE + 10}
              fill="transparent"
              className={selectedGate ? 'cursor-crosshair' : 'cursor-default'}
              onClick={e => handleWireClick(e, col, qubit)}
            />
          ))
        )}

        {/* Placed gates */}
        {gates.map(g => {
          const meta = GATE_META.find(m => m.name === g.gate)!;
          const gx   = COL_X(g.col);
          const gy   = WIRE_Y(g.qubit);

          return (
            <g key={g.id}>
              {/* CNOT/CZ connector line */}
              {(g.gate === 'CNOT' || g.gate === 'CZ') && g.controlQubit !== undefined && (
                <>
                  <line
                    x1={gx} y1={WIRE_Y(g.controlQubit)}
                    x2={gx} y2={gy}
                    stroke={meta.color} strokeWidth={2}
                  />
                  {/* Control dot */}
                  <circle cx={gx} cy={WIRE_Y(g.controlQubit)} r={6} fill={meta.color} />
                </>
              )}

              {/* Gate box */}
              <rect
                x={gx - GATE_SIZE / 2} y={gy - GATE_SIZE / 2}
                width={GATE_SIZE} height={GATE_SIZE}
                rx={6} ry={6}
                fill="#1a2535"
                stroke={meta.color}
                strokeWidth={2}
              />
              <text
                x={gx} y={gy + 5}
                textAnchor="middle"
                fill={meta.color}
                fontSize={13}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {meta.label}
              </text>

              {/* Remove button */}
              <g
                onClick={e => { e.stopPropagation(); onRemoveGate(g.id); }}
                className="cursor-pointer"
              >
                <circle cx={gx + GATE_SIZE / 2 - 4} cy={gy - GATE_SIZE / 2 + 4} r={7} fill="#1f2937" />
                <text x={gx + GATE_SIZE / 2 - 4} y={gy - GATE_SIZE / 2 + 8}
                  textAnchor="middle" fill="#ef4444" fontSize={10} fontWeight="bold">✕</text>
              </g>
            </g>
          );
        })}

        {/* Pending CNOT indicator */}
        {pendingCnot && (
          <circle
            cx={COL_X(pendingCnot.col)}
            cy={WIRE_Y(pendingCnot.qubit)}
            r={8}
            fill="#00ffcc"
            opacity={0.8}
          />
        )}
      </svg>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Module3Page() {
  const [numQubits,   setNumQubits]   = useState(2);
  const [gates,       setGates]       = useState<PlacedGate[]>([]);
  const [selectedGate,setSelectedGate]= useState<GateName | null>(null);
  const [pendingCnot, setPendingCnot] = useState<{ col: number; qubit: number } | null>(null);
  const [result,      setResult]      = useState<SimResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [tooltip,     setTooltip]     = useState<string | null>(null);

  // ── Place a gate on the canvas ──────────────────────────────────────────────

  const handleDrop = useCallback((col: number, qubit: number) => {
    if (!selectedGate) return;

    // Check if something is already there (single-qubit)
    const occupied = gates.some(g => g.col === col && g.qubit === qubit);
    if (occupied) return;

    if (selectedGate === 'CNOT' || selectedGate === 'CZ') {
      if (!pendingCnot) {
        // First click = control qubit
        setPendingCnot({ col, qubit });
        return;
      }
      // Second click = target qubit
      if (pendingCnot.col !== col || pendingCnot.qubit === qubit) {
        // Must be same column, different qubit
        if (pendingCnot.col !== col) {
          setPendingCnot({ col, qubit });
          return;
        }
      }
      setGates(prev => [...prev, {
        id: uid(), gate: selectedGate, qubit,
        col: pendingCnot.col, controlQubit: pendingCnot.qubit,
      }]);
      setPendingCnot(null);
      return;
    }

    setGates(prev => [...prev, { id: uid(), gate: selectedGate, qubit, col }]);
  }, [selectedGate, pendingCnot, gates]);

  const handleRemove = (id: string) => {
    setGates(prev => prev.filter(g => g.id !== id));
    setResult(null);
  };

  const handleClear = () => {
    setGates([]);
    setResult(null);
    setError(null);
    setPendingCnot(null);
    setSelectedGate(null);
  };

  const handleQubitChange = (n: number) => {
    setNumQubits(n);
    setGates([]);
    setResult(null);
    setPendingCnot(null);
    setSelectedGate(null);
  };

  // ── Simulate ────────────────────────────────────────────────────────────────

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        num_qubits: numQubits,
        gates: gates
          .sort((a, b) => a.col - b.col || a.qubit - b.qubit)
          .map(g => ({
            gate:          g.gate,
            qubit:         g.qubit,
            control_qubit: g.controlQubit ?? null,
          })),
      };
      const res  = await fetch('/api/module3/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Simulation failed');
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation error');
    } finally {
      setLoading(false);
    }
  };

  const maxProb = result ? Math.max(...result.states.map(s => s.probability), 0.01) : 1;

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 text-center">
<h1 className="text-3xl font-extrabold text-white mb-2">Quantum Circuit Builder</h1>
        <p className="text-gray-500 text-sm max-w-xl mx-auto">
          Drag quantum gates onto qubit wires, then simulate to see the full statevector,
          probability distribution, and circuit properties in real time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── Left panel: Gate palette ──────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Qubit selector */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-3">Qubits</h3>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => handleQubitChange(n)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    numQubits === n
                      ? 'text-black'
                      : 'bg-quantum-700 text-gray-400 hover:text-white'
                  }`}
                  style={numQubits === n ? { background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' } : {}}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Gate palette */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-3">Gate Palette</h3>
            <p className="text-gray-600 text-[10px] mb-3">Click a gate then click a wire cell to place it.</p>

            {/* Single-qubit gates */}
            <p className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">Single Qubit</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {GATE_META.filter(g => !g.isTwoQubit).map(g => (
                <button
                  key={g.name}
                  onClick={() => {
                    setSelectedGate(prev => prev === g.name ? null : g.name);
                    setPendingCnot(null);
                  }}
                  onMouseEnter={() => setTooltip(g.desc)}
                  onMouseLeave={() => setTooltip(null)}
                  className={`w-full aspect-square rounded-lg text-xs font-bold transition-all border ${
                    selectedGate === g.name
                      ? 'scale-105 shadow-lg'
                      : 'border-quantum-600 bg-quantum-900 hover:border-quantum-500'
                  }`}
                  style={selectedGate === g.name
                    ? { borderColor: g.color, background: `${g.color}20`, color: g.color }
                    : { color: g.color }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* Two-qubit gates */}
            <p className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">Two Qubit</p>
            <div className="grid grid-cols-2 gap-1.5">
              {GATE_META.filter(g => g.isTwoQubit).map(g => (
                <button
                  key={g.name}
                  onClick={() => {
                    setSelectedGate(prev => prev === g.name ? null : g.name);
                    setPendingCnot(null);
                  }}
                  onMouseEnter={() => setTooltip(g.desc)}
                  onMouseLeave={() => setTooltip(null)}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    selectedGate === g.name
                      ? 'scale-105'
                      : 'border-quantum-600 bg-quantum-900 hover:border-quantum-500'
                  }`}
                  style={selectedGate === g.name
                    ? { borderColor: g.color, background: `${g.color}20`, color: g.color }
                    : { color: g.color }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* Tooltip */}
            {tooltip && (
              <div className="mt-3 p-2 bg-quantum-700 rounded-lg border border-quantum-600">
                <p className="text-gray-300 text-[10px] leading-relaxed">{tooltip}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={handleSimulate}
              disabled={loading || gates.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Simulating…</>
                : <><Play className="w-4 h-4" />Simulate Circuit</>}
            </button>
            <button
              onClick={handleClear}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-gray-400 bg-quantum-800 border border-quantum-700 hover:border-red-700 hover:text-red-400 transition-all"
            >
              <Trash2 className="w-4 h-4" />Clear Canvas
            </button>
          </div>
        </div>

        {/* ── Right: Canvas + Results ───────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Active gate indicator */}
          {selectedGate && (
            <div className="flex items-center gap-2 bg-quantum-neon/5 border border-quantum-neon/30 rounded-xl px-4 py-2.5 text-sm">
              <Zap className="w-4 h-4 text-quantum-neon" />
              <span className="text-white font-semibold">{selectedGate}</span>
              <span className="text-gray-400">selected —</span>
              {(selectedGate === 'CNOT' || selectedGate === 'CZ') ? (
                pendingCnot
                  ? <span className="text-yellow-400">Now click the <strong>target qubit</strong> cell in the same column</span>
                  : <span className="text-gray-300">Click the <strong>control qubit</strong> cell first</span>
              ) : (
                <span className="text-gray-300">Click any wire cell to place</span>
              )}
              <button onClick={() => { setSelectedGate(null); setPendingCnot(null); }}
                className="ml-auto text-gray-600 hover:text-white text-xs">✕ Cancel</button>
            </div>
          )}

          {/* Canvas */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-sm">Circuit Canvas</h3>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{numQubits} qubit{numQubits > 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{gates.length} gate{gates.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <CircuitCanvas
              numQubits={numQubits}
              gates={gates}
              onDropGate={handleDrop}
              onRemoveGate={handleRemove}
              selectedGate={selectedGate}
              pendingCnot={pendingCnot}
              onCancelCnot={() => setPendingCnot(null)}
            />
            {gates.length === 0 && (
              <div className="text-center py-6 text-gray-600 text-sm">
                Select a gate from the palette, then click on a qubit wire to place it.
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Property badges */}
              <div className="flex flex-wrap gap-3">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${
                  result.is_superposition
                    ? 'bg-teal-500/10 border-teal-500/30 text-teal-400'
                    : 'bg-quantum-800 border-quantum-700 text-gray-500'
                }`}>
                  <Zap className="w-4 h-4" />
                  Superposition {result.is_superposition ? '✓ Active' : '✗ Not present'}
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${
                  result.is_entangled
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                    : 'bg-quantum-800 border-quantum-700 text-gray-500'
                }`}>
                  <Link className="w-4 h-4" />
                  Entanglement {result.is_entangled ? '✓ Active' : '✗ Not present'}
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-quantum-800 border-quantum-700 text-gray-400 text-sm">
                  <Info className="w-4 h-4" />
                  {result.gate_count} gate{result.gate_count !== 1 ? 's' : ''} · {2 ** result.num_qubits} states
                </div>
              </div>

              {/* State vector visualization */}
              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
                <h3 className="text-white font-bold text-sm mb-4">State Vector — Probability Distribution</h3>
                <div className="space-y-2">
                  {result.states.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-400 w-12 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 h-6 bg-quantum-700 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-500"
                          style={{
                            width: `${(s.probability / maxProb) * 100}%`,
                            background: s.probability > 0.01
                              ? 'linear-gradient(90deg,#00ffcc,#cc44ff)'
                              : '#374151',
                          }}
                        />
                        {s.probability > 0.05 && (
                          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-black">
                            {(s.probability * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">
                        {(s.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-quantum-700">
                  <p className="text-gray-600 text-xs leading-relaxed">
                    <strong className="text-gray-400">Amplitudes:</strong>{' '}
                    {result.states.filter(s => s.probability > 0.001).map(s =>
                      `${s.label}: ${s.amplitude_re.toFixed(3)}${s.amplitude_im >= 0 ? '+' : ''}${s.amplitude_im.toFixed(3)}i`
                    ).join('  ·  ')}
                  </p>
                </div>
              </div>

              {/* Explanation */}
              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
                <h3 className="text-white font-bold text-sm mb-2">Circuit Interpretation</h3>
                <div className="space-y-1.5 text-sm text-gray-400 leading-relaxed">
                  {result.is_superposition && (
                    <p>⚡ <strong className="text-teal-400">Superposition detected</strong> — one or more qubits exist in a simultaneous 0/1 state. Measurement will collapse the wavefunction to a definite outcome with the probabilities shown above.</p>
                  )}
                  {result.is_entangled && (
                    <p>🔗 <strong className="text-purple-400">Entanglement detected</strong> — the qubits are in a non-separable state. Measuring one qubit instantly determines the state of the other, regardless of distance.</p>
                  )}
                  {!result.is_superposition && !result.is_entangled && (
                    <p>📐 The circuit is in a <strong className="text-white">definite classical state</strong> — all probability is concentrated in a single basis state. Try adding an H gate to create superposition.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
