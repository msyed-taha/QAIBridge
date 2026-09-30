import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award, Check, ChevronRight, Code2, Gamepad2, Hammer, Lightbulb, Link2, Loader2, Minus, Plus, Redo2,
  RotateCcw, Sparkles, Star, Trash2, Undo2, Zap,
} from 'lucide-react';
import apiClient, { getApiErrorMessage } from '../api/client';
import { BlochSphere } from '../components/module3/BlochSphere';
import { BADGES, LEVELS, starsFor, type SimResult } from '../components/module3/challenges';
import { CodeBlock } from '../components/shared/CodeBlock';
import { HowToUse } from '../components/shared/HowToUse';

// ── Gates ─────────────────────────────────────────────────────────────────────

type GateName = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T' | 'SDG' | 'TDG' | 'SX' | 'RX' | 'RY' | 'RZ' | 'P'
  | 'CNOT' | 'CZ' | 'SWAP' | 'CCX';

interface GateMeta { name: GateName; label: string; color: string; desc: string; arity: 1 | 2 | 3; param?: boolean; group: string }

const GATES: GateMeta[] = [
  { name: 'H', label: 'H', color: '#00ffcc', arity: 1, group: 'Basics', desc: 'Hadamard — creates an equal superposition (a quantum coin flip).' },
  { name: 'X', label: 'X', color: '#f97316', arity: 1, group: 'Basics', desc: 'Pauli-X — the quantum NOT: swaps |0⟩ and |1⟩.' },
  { name: 'Y', label: 'Y', color: '#a855f7', arity: 1, group: 'Basics', desc: 'Pauli-Y — bit flip plus phase flip.' },
  { name: 'Z', label: 'Z', color: '#3b82f6', arity: 1, group: 'Basics', desc: 'Pauli-Z — flips the sign (phase) of |1⟩.' },
  { name: 'S', label: 'S', color: '#ec4899', arity: 1, group: 'Phase', desc: 'S — quarter-turn phase on |1⟩.' },
  { name: 'T', label: 'T', color: '#eab308', arity: 1, group: 'Phase', desc: 'T — eighth-turn phase on |1⟩.' },
  { name: 'SDG', label: 'S†', color: '#ec4899', arity: 1, group: 'Phase', desc: 'S-dagger — undoes an S gate.' },
  { name: 'TDG', label: 'T†', color: '#eab308', arity: 1, group: 'Phase', desc: 'T-dagger — undoes a T gate.' },
  { name: 'SX', label: '√X', color: '#fb923c', arity: 1, group: 'Phase', desc: 'Square root of NOT — two in a row equal X.' },
  { name: 'RX', label: 'RX', color: '#34d399', arity: 1, param: true, group: 'Rotations', desc: 'Rotate around the X axis by θ.' },
  { name: 'RY', label: 'RY', color: '#34d399', arity: 1, param: true, group: 'Rotations', desc: 'Rotate around Y by θ — P(1) = sin²(θ/2).' },
  { name: 'RZ', label: 'RZ', color: '#34d399', arity: 1, param: true, group: 'Rotations', desc: 'Rotate around Z by θ — changes the phase only.' },
  { name: 'P', label: 'P', color: '#34d399', arity: 1, param: true, group: 'Rotations', desc: 'Phase gate P(φ) — adds e^{iφ} to |1⟩.' },
  { name: 'CNOT', label: 'CNOT', color: '#00ffcc', arity: 2, group: 'Multi-qubit', desc: 'Controlled-NOT — flips the target when the control is 1. Creates entanglement.' },
  { name: 'CZ', label: 'CZ', color: '#a855f7', arity: 2, group: 'Multi-qubit', desc: 'Controlled-Z — phase flip when both qubits are 1.' },
  { name: 'SWAP', label: 'SWAP', color: '#60a5fa', arity: 2, group: 'Multi-qubit', desc: 'SWAP — exchanges two qubits.' },
  { name: 'CCX', label: 'Toffoli', color: '#f472b6', arity: 3, group: 'Multi-qubit', desc: 'Toffoli (CCX) — flips the target only if both controls are 1: a reversible AND.' },
];
const META = Object.fromEntries(GATES.map(g => [g.name, g])) as Record<GateName, GateMeta>;
const GROUPS = ['Basics', 'Phase', 'Rotations', 'Multi-qubit'];

interface PlacedGate { id: string; gate: GateName; col: number; target: number; controls: number[]; angle?: number }

// ── Geometry & helpers ────────────────────────────────────────────────────────

const LEFT = 58, COL_W = 60, ROW_H = 58, TOP = 22, BOX = 38;
const colX = (c: number) => LEFT + COL_W / 2 + c * COL_W;
const rowY = (q: number) => TOP + ROW_H / 2 + q * ROW_H;
let _uid = 0;
const uid = () => `g${Date.now().toString(36)}${++_uid}`;

const qubitsOf = (g: PlacedGate) => [g.target, ...g.controls];
const spanOf = (g: PlacedGate): [number, number] => [Math.min(...qubitsOf(g)), Math.max(...qubitsOf(g))];

function spanFree(gates: PlacedGate[], col: number, a: number, b: number, ignore?: string) {
  return gates.every(g => {
    if (g.id === ignore || g.col !== col) return true;
    const [lo, hi] = spanOf(g);
    return hi < a || lo > b;
  });
}

function defaultQubits(meta: GateMeta, row: number, n: number): { target: number; controls: number[] } | null {
  if (meta.arity === 1) return { target: row, controls: [] };
  if (meta.arity === 2) {
    if (n < 2) return null;
    const other = row + 1 < n ? row + 1 : row - 1;
    return { target: other, controls: [row] };            // dropped row = control (CNOT/CZ) or first qubit (SWAP)
  }
  if (n < 3) return null;
  const r0 = Math.min(Math.max(row, 0), n - 3);
  return { target: r0 + 2, controls: [r0, r0 + 1] };
}

function fmtAngle(t = 0): string {
  const f = t / Math.PI;
  const known: [number, string][] = [[0, '0'], [0.25, 'π/4'], [0.5, 'π/2'], [1 / 3, 'π/3'], [2 / 3, '2π/3'], [0.75, '3π/4'],
    [1, 'π'], [1.5, '3π/2'], [2, '2π'], [1 / 6, 'π/6'], [5 / 6, '5π/6'], [1.25, '5π/4'], [7 / 4, '7π/4']];
  const hit = known.find(([v]) => Math.abs(v - f) < 1e-6);
  return hit ? hit[1] : `${(t).toFixed(2)}`;
}

function sortForSim(gates: PlacedGate[]) {
  return [...gates].sort((a, b) => a.col - b.col || spanOf(a)[0] - spanOf(b)[0]);
}

function toPayload(gates: PlacedGate[]) {
  return sortForSim(gates).map(g => ({
    gate: g.gate, qubit: g.target,
    control_qubit: g.controls[0] ?? null, control2: g.controls[1] ?? null,
    angle: META[g.gate].param ? (g.angle ?? Math.PI / 2) : null,
  }));
}

function toKernelOps(gates: PlacedGate[]) {
  return sortForSim(gates).map(g => {
    if (g.gate === 'CCX') return { gate: 'CCX', qubits: [g.controls[0], g.controls[1], g.target], params: [] };
    if (META[g.gate].arity === 2) return { gate: g.gate, qubits: [g.controls[0], g.target], params: [] };
    return { gate: g.gate, qubits: [g.target], params: META[g.gate].param ? [g.angle ?? Math.PI / 2] : [] };
  });
}

// ── Toasts ────────────────────────────────────────────────────────────────────

interface Toast { id: number; text: string; tone: 'info' | 'good' | 'warn' }

// ── Page ──────────────────────────────────────────────────────────────────────

export function Module3Page() {
  const [mode, setMode] = useState<'free' | 'challenge'>('free');
  const [numQubits, setNumQubits] = useState(2);
  const [gates, setGates] = useState<PlacedGate[]>([]);
  const [past, setPast] = useState<PlacedGate[][]>([]);
  const [future, setFuture] = useState<PlacedGate[][]>([]);
  const [armed, setArmed] = useState<GateName | null>(null);           // click-to-place
  const [paletteDrag, setPaletteDrag] = useState<GateName | null>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; grabRow: number; grabCol: number; sx: number; sy: number; x: number; y: number; moved: boolean; outside: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [qiskit, setQiskit] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);

  const [levelIdx, setLevelIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('qai_m3_progress') ?? '{}'); } catch { return {}; }
  });
  const [solved, setSolved] = useState<{ id: string; stars: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const level = LEVELS[levelIdx];
  const cols = Math.max(10, ...gates.map(g => g.col + 3));
  const width = LEFT + cols * COL_W + 16;
  const height = TOP + numQubits * ROW_H + 8;

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);

  // ── history ──
  const commit = useCallback((next: PlacedGate[]) => {
    setPast(p => [...p.slice(-80), gates]);
    setFuture([]);
    setGates(next);
    setQiskit(null);
  }, [gates]);

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture([gates, ...future]);
    setGates(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setQiskit(null);
  }, [past, future, gates]);

  const redo = useCallback(() => {
    if (!future.length) return;
    setPast([...past, gates]);
    setGates(future[0]);
    setFuture(future.slice(1));
    setQiskit(null);
  }, [past, future, gates]);

  // ── placing / moving ──
  const placeGate = useCallback((name: GateName, col: number, row: number) => {
    const meta = META[name];
    const qs = defaultQubits(meta, row, numQubits);
    if (!qs) {
      toast(`${meta.label} needs at least ${meta.arity} qubits — add more qubits first.`, 'warn');
      return;
    }
    const all = [qs.target, ...qs.controls];
    const a = Math.min(...all), b = Math.max(...all);
    let c = Math.max(0, col);
    while (!spanFree(gates, c, a, b)) c++;
    const g: PlacedGate = { id: uid(), gate: name, col: c, ...qs, ...(meta.param ? { angle: Math.PI / 2 } : {}) };
    commit([...gates, g]);
    if (meta.arity > 1 || meta.param) setSelectedId(g.id);
  }, [gates, numQubits, commit, toast]);

  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };
  const cellAt = (clientX: number, clientY: number) => {
    const p = svgPoint(clientX, clientY);
    if (!p) return null;
    const col = Math.floor((p.x - LEFT) / COL_W);
    const row = Math.floor((p.y - TOP) / ROW_H);
    if (col < 0 || row < 0 || row >= numQubits) return null;
    return { col, row, x: p.x, y: p.y };
  };

  // palette → canvas (HTML5 drag and drop)
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const c = cellAt(e.clientX, e.clientY);
    setHover(c ? { col: c.col, row: c.row } : null);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const name = (e.dataTransfer.getData('text/plain').replace('gate:', '') || paletteDrag) as GateName | null;
    const c = cellAt(e.clientX, e.clientY);
    setHover(null);
    setPaletteDrag(null);
    if (name && META[name] && c) placeGate(name, c.col, c.row);
  };

  // move placed gates with the pointer
  const startMove = (e: React.PointerEvent, g: PlacedGate) => {
    e.stopPropagation();
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    setMoving({ id: g.id, grabRow: c.row, grabCol: g.col, sx: c.x, sy: c.y, x: c.x, y: c.y, moved: false, outside: false });
  };

  useEffect(() => {
    if (!moving) return;
    const onMove = (e: PointerEvent) => {
      const p = svgPoint(e.clientX, e.clientY);
      if (!p) return;
      const outside = p.x < 0 || p.y < 0 || p.x > width || p.y > height;
      setMoving(m => m && { ...m, x: p.x, y: p.y, moved: m.moved || Math.abs(p.x - m.sx) + Math.abs(p.y - m.sy) > 4, outside });
    };
    const onUp = (e: PointerEvent) => {
      const m = moving;
      setMoving(null);
      if (!m) return;
      const g = gates.find(x => x.id === m.id);
      if (!g) return;
      const p = svgPoint(e.clientX, e.clientY);
      const moved = m.moved || (p && Math.abs(p.x - m.sx) + Math.abs(p.y - m.sy) > 4);
      if (!moved) { setSelectedId(g.id); return; }
      if (!p || p.x < 0 || p.y < 0 || p.x > width || p.y > height) {
        commit(gates.filter(x => x.id !== g.id));
        if (selectedId === g.id) setSelectedId(null);
        toast('Gate removed', 'info');
        return;
      }
      const col = Math.max(0, Math.floor((p.x - LEFT) / COL_W));
      const row = Math.floor((p.y - TOP) / ROW_H);
      const d = row - m.grabRow;
      const target = g.target + d;
      const controls = g.controls.map(q => q + d);
      const all = [target, ...controls];
      if (Math.min(...all) < 0 || Math.max(...all) >= numQubits) { toast('That would move the gate off the circuit', 'warn'); return; }
      if (!spanFree(gates, col, Math.min(...all), Math.max(...all), g.id)) { toast('That spot is taken', 'warn'); return; }
      commit(gates.map(x => (x.id === g.id ? { ...x, col, target, controls } : x)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [moving, gates, numQubits, width, height, commit, selectedId, toast]);

  const onCanvasClick = (e: React.MouseEvent) => {
    const c = cellAt(e.clientX, e.clientY);
    if (armed && c) {
      placeGate(armed, c.col, c.row);
      return;
    }
    setSelectedId(null);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        commit(gates.filter(g => g.id !== selectedId));
        setSelectedId(null);
      } else if (e.key === 'Escape') { setSelectedId(null); setArmed(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedId, gates, commit]);

  // ── live simulation ──
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSimLoading(true);
      try {
        const { data } = await apiClient.post('/api/module3/simulate',
          { num_qubits: numQubits, gates: toPayload(gates), shots: 1024 }, { signal: ctrl.signal });
        setResult(data);
        setSimError(null);
      } catch (e: any) {
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') setSimError(getApiErrorMessage(e, 'Simulation failed'));
      } finally {
        setSimLoading(false);
      }
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [gates, numQubits]);

  // ── challenge checking ──
  useEffect(() => {
    if (mode !== 'challenge' || !result || !gates.length || result.num_qubits !== level.qubits) return;
    const usedOk = !level.requiresAny || gates.some(g => level.requiresAny!.includes(g.gate));
    if (usedOk && level.check(result)) {
      const stars = starsFor(level, gates.length);
      if (solved?.id !== level.id || stars > solved.stars) {
        setSolved({ id: level.id, stars });
        setProgress(p => {
          const next = { ...p, [level.id]: Math.max(p[level.id] ?? 0, stars) };
          try { localStorage.setItem('qai_m3_progress', JSON.stringify(next)); } catch { /* private mode */ }
          return next;
        });
        toast(`Level complete — ${'★'.repeat(stars)}`, 'good');
      }
    }
  }, [result, mode, level, gates, solved, toast]);

  const startLevel = (idx: number) => {
    setLevelIdx(idx);
    setNumQubits(LEVELS[idx].qubits);
    setGates([]);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
    setSolved(null);
    setShowHint(false);
    setQiskit(null);
  };

  const switchMode = (m: 'free' | 'challenge') => {
    setMode(m);
    if (m === 'challenge') startLevel(Math.max(0, LEVELS.findIndex(l => !progress[l.id])));
    else { setSolved(null); }
  };

  const changeQubits = (n: number) => {
    const kept = gates.filter(g => Math.max(...qubitsOf(g)) < n);
    if (kept.length !== gates.length) toast(`${gates.length - kept.length} gate(s) on removed wires were deleted`, 'warn');
    setNumQubits(n);
    commit(kept);
  };

  const exportQiskit = async () => {
    try {
      const { data } = await apiClient.post('/api/kernel/export/qiskit', {
        n_qubits: numQubits, operations: toKernelOps(gates), name: 'Circuit Builder export',
      });
      setQiskit(data.code);
    } catch (e) {
      toast(getApiErrorMessage(e, 'Export failed'), 'warn');
    }
  };

  const selected = gates.find(g => g.id === selectedId) ?? null;
  const updateSelected = (patch: Partial<PlacedGate>) => {
    if (!selected) return;
    const next = { ...selected, ...patch };
    const qs = qubitsOf(next);
    if (new Set(qs).size !== qs.length) { toast('A gate cannot use the same qubit twice', 'warn'); return; }
    if (!spanFree(gates, next.col, Math.min(...qs), Math.max(...qs), next.id)) { toast('Another gate is in the way', 'warn'); return; }
    commit(gates.map(g => (g.id === next.id ? next : g)));
  };

  const earnedBadges = BADGES.filter(b => b.need.every(id => progress[id]));
  const totalStars = Object.values(progress).reduce((a, b) => a + b, 0);
  const maxProb = result ? Math.max(...result.states.map(s => s.probability), 0.01) : 1;

  // ── rendering helpers ──
  const renderGate = (g: PlacedGate, ghost = false, ox = 0, oy = 0) => {
    const m = META[g.gate];
    const x = colX(g.col) + ox;
    const isSel = g.id === selectedId && !ghost;
    const common = { opacity: ghost ? 0.45 : 1 };
    const [lo, hi] = spanOf(g);
    const box = (q: number, label: string, sub?: string) => (
      <g key={`b${q}`}>
        <rect x={x - BOX / 2} y={rowY(q) + oy - BOX / 2} width={BOX} height={BOX} rx={7}
          fill="#16163a" stroke={m.color} strokeWidth={isSel ? 3 : 1.8}
          style={isSel ? { filter: `drop-shadow(0 0 6px ${m.color})` } : undefined} />
        <text x={x} y={rowY(q) + oy + (sub ? 1 : 5)} textAnchor="middle" fill={m.color} fontSize={label.length > 2 ? 11 : 14}
          fontWeight="bold" fontFamily="monospace">{label}</text>
        {sub && <text x={x} y={rowY(q) + oy + 13} textAnchor="middle" fill="#cbd5e1" fontSize={8.5} fontFamily="monospace">{sub}</text>}
      </g>
    );
    const dot = (q: number) => <circle key={`c${q}`} cx={x} cy={rowY(q) + oy} r={6.5} fill={m.color} />;
    const oplus = (q: number) => (
      <g key={`t${q}`}>
        <circle cx={x} cy={rowY(q) + oy} r={13} fill="#16163a" stroke={m.color} strokeWidth={isSel ? 3 : 2} />
        <line x1={x - 13} y1={rowY(q) + oy} x2={x + 13} y2={rowY(q) + oy} stroke={m.color} strokeWidth={2} />
        <line x1={x} y1={rowY(q) + oy - 13} x2={x} y2={rowY(q) + oy + 13} stroke={m.color} strokeWidth={2} />
      </g>
    );
    const cross = (q: number) => (
      <g key={`s${q}`} stroke={m.color} strokeWidth={2.5}>
        <line x1={x - 8} y1={rowY(q) + oy - 8} x2={x + 8} y2={rowY(q) + oy + 8} />
        <line x1={x - 8} y1={rowY(q) + oy + 8} x2={x + 8} y2={rowY(q) + oy - 8} />
      </g>
    );
    return (
      <g key={g.id + (ghost ? '-ghost' : '')} {...common}
        onPointerDown={ghost ? undefined : (e) => startMove(e, g)}
        onClick={e => e.stopPropagation()}
        onMouseEnter={() => !ghost && setTooltip(m.desc)} onMouseLeave={() => setTooltip(null)}
        style={{ cursor: ghost ? 'grabbing' : 'grab' }}>
        {m.arity > 1 && <line x1={x} y1={rowY(lo) + oy} x2={x} y2={rowY(hi) + oy} stroke={m.color} strokeWidth={2} />}
        {g.gate === 'CNOT' && <>{dot(g.controls[0])}{oplus(g.target)}</>}
        {g.gate === 'CCX' && <>{dot(g.controls[0])}{dot(g.controls[1])}{oplus(g.target)}</>}
        {g.gate === 'CZ' && <>{dot(g.controls[0])}{dot(g.target)}</>}
        {g.gate === 'SWAP' && <>{cross(g.controls[0])}{cross(g.target)}</>}
        {m.arity === 1 && box(g.target, m.label, m.param ? fmtAngle(g.angle) : undefined)}
      </g>
    );
  };

  const hoverSpan = useMemo(() => {
    const name = paletteDrag ?? armed;
    if (!hover || !name) return null;
    const qs = defaultQubits(META[name], hover.row, numQubits);
    if (!qs) return null;
    const all = [qs.target, ...qs.controls];
    return { col: hover.col, a: Math.min(...all), b: Math.max(...all) };
  }, [hover, paletteDrag, armed, numQubits]);

  const movingGate = moving ? gates.find(g => g.id === moving.id) : null;

  return (
    <div className="min-h-screen px-4 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Module 3 — Educational Quantum Simulator
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum Circuit Builder</h1>
        <p className="text-gray-400 text-sm max-w-2xl mx-auto">
          Drag gates onto the wires — the circuit re-simulates instantly on QAIBridge's kernel, with a Bloch sphere per
          qubit showing superposition and entanglement as they happen.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <><strong>Drag</strong> a gate from the palette onto a wire (or click a gate, then click a cell).</>,
          <>Drag placed gates to move them; drag one <strong>off the canvas</strong> or press <kbd>Delete</kbd> to remove it. <kbd>Ctrl/⌘ Z</kbd> undoes.</>,
          <>Click a gate to edit it — rotation angle, or which qubits a CNOT / Toffoli uses.</>,
          <>Results update live. Switch to <strong>Challenges</strong> for guided levels with stars and badges.</>,
        ]}
        outcome={<>Probability bars, one Bloch sphere per qubit (dashed purple = entangled), measurement counts, and runnable Qiskit code for your circuit.</>}
      />

      {/* Mode switch */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex bg-quantum-800 border border-quantum-700 rounded-xl p-1">
          <button onClick={() => switchMode('free')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm ${mode === 'free' ? 'bg-quantum-neon text-black font-semibold' : 'text-gray-400'}`}>
            <Hammer className="w-4 h-4" /> Free build
          </button>
          <button onClick={() => switchMode('challenge')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm ${mode === 'challenge' ? 'bg-purple-400 text-black font-semibold' : 'text-gray-400'}`}>
            <Gamepad2 className="w-4 h-4" /> Challenges
          </button>
        </div>
        <span className="text-xs text-gray-500 flex items-center gap-1 ml-2">
          <Star className="w-3.5 h-3.5 text-amber-300" /> {totalStars} / {LEVELS.length * 3} stars
        </span>
        {earnedBadges.map(b => (
          <span key={b.id} className="text-[11px] flex items-center gap-1 text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
            <Award className="w-3 h-3" /> {b.title}
          </span>
        ))}
      </div>

      {/* Challenge panel */}
      {mode === 'challenge' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-3 max-h-72 overflow-y-auto">
            {LEVELS.map((l, i) => (
              <button key={l.id} onClick={() => startLevel(i)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${i === levelIdx ? 'bg-purple-500/15 text-white' : 'text-gray-400 hover:bg-quantum-700'}`}>
                <span className="w-5 text-gray-500 font-mono">{i + 1}</span>
                <span className="flex-1">{l.title}</span>
                <span className="text-amber-300 font-mono">{'★'.repeat(progress[l.id] ?? 0)}<span className="text-gray-700">{'★'.repeat(3 - (progress[l.id] ?? 0))}</span></span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-3 bg-gradient-to-br from-purple-500/10 to-teal-500/5 border border-purple-500/30 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs text-purple-300 font-semibold uppercase tracking-widest">Level {levelIdx + 1} · {level.concept}</span>
              <span className="text-xs text-gray-500">{level.qubits} qubit{level.qubits > 1 ? 's' : ''} · 3 stars in ≤ {level.par} gate{level.par > 1 ? 's' : ''}</span>
            </div>
            <h2 className="text-white text-xl font-bold mb-1">{level.title}</h2>
            <p className="text-gray-300 text-sm mb-2">{level.story}</p>
            <p className="text-sm text-white"><span className="text-quantum-neon font-semibold">Goal:</span> {level.goal}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => setShowHint(h => !h)} className="flex items-center gap-1 text-xs text-amber-200 border border-amber-500/40 rounded-lg px-3 py-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> {showHint ? level.hint : 'Show hint'}
              </button>
              <button onClick={() => startLevel(levelIdx)} className="flex items-center gap-1 text-xs text-gray-300 border border-quantum-600 rounded-lg px-3 py-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Restart level
              </button>
            </div>
            {solved?.id === level.id && (
              <div className="mt-4 flex flex-wrap items-center gap-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-4 py-3 animate-pulse">
                <Sparkles className="w-5 h-5 text-emerald-300" />
                <span className="text-emerald-200 font-semibold">Level complete!</span>
                <span className="text-amber-300 text-lg">{'★'.repeat(solved.stars)}<span className="text-gray-600">{'★'.repeat(3 - solved.stars)}</span></span>
                {solved.stars < 3 && <span className="text-xs text-gray-400">Try again with ≤ {level.par} gates for 3 stars.</span>}
                {levelIdx < LEVELS.length - 1 && (
                  <button onClick={() => startLevel(levelIdx + 1)} className="ml-auto flex items-center gap-1 text-sm font-semibold text-black bg-emerald-300 rounded-lg px-3 py-1.5">
                    Next level <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Palette */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-3">Qubits</h3>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => changeQubits(n)} disabled={mode === 'challenge'}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${numQubits === n ? 'text-black' : 'bg-quantum-700 text-gray-400 hover:text-white'} disabled:opacity-40`}
                  style={numQubits === n ? { background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' } : {}}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-1">Gate palette</h3>
            <p className="text-gray-500 text-[10px] mb-3">Drag onto a wire — or click, then click a cell.</p>
            {GROUPS.map(group => (
              <div key={group} className="mb-3">
                <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-1.5">{group}</p>
                <div className={`grid ${group === 'Multi-qubit' ? 'grid-cols-2' : 'grid-cols-4'} gap-1.5`}>
                  {GATES.filter(g => g.group === group).map(g => (
                    <button key={g.name}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', `gate:${g.name}`); e.dataTransfer.effectAllowed = 'copy'; setPaletteDrag(g.name); }}
                      onDragEnd={() => { setPaletteDrag(null); setHover(null); }}
                      onClick={() => setArmed(a => (a === g.name ? null : g.name))}
                      onMouseEnter={() => setTooltip(g.desc)} onMouseLeave={() => setTooltip(null)}
                      aria-label={`${g.label} gate`}
                      className={`py-2 rounded-lg text-xs font-bold border cursor-grab active:cursor-grabbing transition-all ${armed === g.name ? 'scale-105' : 'border-quantum-600 bg-quantum-900 hover:border-quantum-400'}`}
                      style={armed === g.name ? { borderColor: g.color, background: `${g.color}22`, color: g.color } : { color: g.color }}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="min-h-[48px] p-2 bg-quantum-900/60 rounded-lg border border-quantum-700">
              <p className="text-gray-400 text-[10px] leading-relaxed">{tooltip ?? 'Hover a gate to learn what it does.'}</p>
            </div>
          </div>
        </div>

        {/* Canvas + inspector + results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="text-white font-bold text-sm">Circuit canvas</h3>
              <span className="text-xs text-gray-500">{numQubits} qubit{numQubits > 1 ? 's' : ''} · {gates.length} gate{gates.length !== 1 ? 's' : ''}</span>
              {simLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-quantum-neon" />}
              {!simLoading && result && <span className="text-[10px] text-emerald-300 flex items-center gap-1"><Zap className="w-3 h-3" />live</span>}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={undo} disabled={!past.length} title="Undo (Ctrl/⌘ Z)" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-700 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
                <button onClick={redo} disabled={!future.length} title="Redo (Ctrl/⌘ Shift Z)" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-700 disabled:opacity-30"><Redo2 className="w-4 h-4" /></button>
                <button onClick={() => setZoom(z => Math.max(0.7, +(z - 0.1).toFixed(2)))} title="Zoom out" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-700"><Minus className="w-4 h-4" /></button>
                <span className="text-[10px] text-gray-500 w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))} title="Zoom in" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-700"><Plus className="w-4 h-4" /></button>
                <button onClick={() => { commit([]); setSelectedId(null); }} disabled={!gates.length} title="Clear canvas" className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-quantum-700 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            {armed && (
              <p className="text-xs text-quantum-neon mb-2">
                {META[armed].label} selected — click a cell to place it {META[armed].arity > 1 && '(the clicked wire becomes the control / first qubit)'} · <button className="underline" onClick={() => setArmed(null)}>cancel</button>
              </p>
            )}
            <div className="overflow-x-auto" onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setHover(null)}>
              <svg ref={svgRef} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}
                onClick={onCanvasClick} className="select-none touch-none" role="img" aria-label="Quantum circuit canvas">
                {Array.from({ length: cols }, (_, c) => (
                  <line key={`g${c}`} x1={colX(c)} y1={TOP} x2={colX(c)} y2={TOP + numQubits * ROW_H} stroke="#1c1c44" strokeDasharray="2 6" />
                ))}
                {Array.from({ length: numQubits }, (_, q) => (
                  <g key={`w${q}`}>
                    <text x={6} y={rowY(q) + 4} fill="#9ca3af" fontSize={12} fontFamily="monospace">q{q}</text>
                    <text x={26} y={rowY(q) + 4} fill="#4b5563" fontSize={10} fontFamily="monospace">|0⟩</text>
                    <line x1={LEFT - 2} y1={rowY(q)} x2={width - 8} y2={rowY(q)} stroke="#374151" strokeWidth={2} />
                  </g>
                ))}
                {hoverSpan && (
                  <rect x={colX(hoverSpan.col) - COL_W / 2 + 4} y={rowY(hoverSpan.a) - ROW_H / 2 + 4} width={COL_W - 8}
                    height={(hoverSpan.b - hoverSpan.a + 1) * ROW_H - 8} rx={8} fill="rgba(0,255,204,0.08)" stroke="#00ffcc" strokeDasharray="4 3" />
                )}
                {gates.map(g => (moving?.id === g.id && moving.moved ? null : renderGate(g)))}
                {movingGate && moving && moving.moved &&
                  renderGate(movingGate, true, moving.x - colX(movingGate.col), (Math.round((moving.y - TOP - ROW_H / 2) / ROW_H) - moving.grabRow) * ROW_H)}
              </svg>
            </div>
            {moving?.moved && (
              <p className={`text-xs mt-2 ${moving.outside ? 'text-red-400' : 'text-gray-500'}`}>
                {moving.outside ? 'Release to delete this gate' : 'Drag off the canvas to delete'}
              </p>
            )}
            {gates.length === 0 && !armed && (
              <p className="text-center py-3 text-gray-600 text-sm">Drag a gate from the palette onto a wire to start.</p>
            )}
          </div>

          {/* Inspector */}
          {selected && (
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              <span className="font-mono font-bold text-sm" style={{ color: META[selected.gate].color }}>{META[selected.gate].label}</span>
              <span className="text-xs text-gray-400 flex-1 min-w-[200px]">{META[selected.gate].desc}</span>
              {META[selected.gate].param && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">θ = <span className="text-white font-mono">{fmtAngle(selected.angle)}</span></span>
                  <input type="range" min={0} max={24} value={Math.round(((selected.angle ?? 0) / (2 * Math.PI)) * 24)}
                    onChange={e => updateSelected({ angle: (Number(e.target.value) / 24) * 2 * Math.PI })} className="accent-emerald-400" />
                  {[Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI].map(v => (
                    <button key={v} onClick={() => updateSelected({ angle: v })} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-quantum-600 text-gray-300">{fmtAngle(v)}</button>
                  ))}
                </div>
              )}
              {META[selected.gate].arity > 1 && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {selected.controls.map((c, i) => (
                    <label key={i} className="flex items-center gap-1">
                      {selected.gate === 'SWAP' ? 'qubit A' : `control${selected.controls.length > 1 ? ` ${i + 1}` : ''}`}
                      <select value={c} onChange={e => updateSelected({ controls: selected.controls.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                        className="bg-quantum-900 border border-quantum-600 rounded px-1 py-0.5 text-white">
                        {Array.from({ length: numQubits }, (_, q) => <option key={q} value={q}>q{q}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className="flex items-center gap-1">
                    {selected.gate === 'SWAP' ? 'qubit B' : 'target'}
                    <select value={selected.target} onChange={e => updateSelected({ target: Number(e.target.value) })}
                      className="bg-quantum-900 border border-quantum-600 rounded px-1 py-0.5 text-white">
                      {Array.from({ length: numQubits }, (_, q) => <option key={q} value={q}>q{q}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <button onClick={() => { commit(gates.filter(g => g.id !== selected.id)); setSelectedId(null); }}
                className="flex items-center gap-1 text-xs text-red-300 border border-red-800/60 rounded-lg px-2.5 py-1"><Trash2 className="w-3.5 h-3.5" />Delete</button>
            </div>
          )}

          {simError && <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{simError}</div>}

          {/* Results */}
          {result && (
            <>
              <div className="flex flex-wrap gap-2">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${result.is_superposition ? 'bg-teal-500/10 border-teal-500/30 text-teal-300' : 'bg-quantum-800 border-quantum-700 text-gray-500'}`}>
                  <Zap className="w-3.5 h-3.5" /> Superposition {result.is_superposition ? '✓' : '✗'}
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${result.is_entangled ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-quantum-800 border-quantum-700 text-gray-500'}`}>
                  <Link2 className="w-3.5 h-3.5" /> Entanglement {result.is_entangled ? `✓ (qubits ${result.entangled_qubits.map(q => `q${q}`).join(', ')})` : '✗'}
                </span>
                <span className="px-3 py-1.5 rounded-xl border bg-quantum-800 border-quantum-700 text-gray-400 text-xs">
                  {result.gate_count} gates · depth {result.circuit_depth} · {2 ** result.num_qubits} basis states
                </span>
                <button onClick={exportQiskit} disabled={!gates.length}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-quantum-600 text-gray-300 text-xs hover:text-white disabled:opacity-40">
                  <Code2 className="w-3.5 h-3.5" /> Export to Qiskit
                </button>
              </div>

              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
                <h3 className="text-white font-bold text-sm mb-2">Bloch spheres — one per qubit</h3>
                <div className="flex flex-wrap gap-2 justify-around">
                  {result.bloch.map(b => <BlochSphere key={b.qubit} {...b} />)}
                </div>
                <p className="text-gray-500 text-[11px] mt-1">
                  Up = |0⟩, down = |1⟩, the equator = superpositions. An entangled qubit has no state of its own, so its arrow shrinks toward the centre (dashed purple).
                </p>
              </div>

              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
                <h3 className="text-white font-bold text-sm mb-3">Probabilities (colour dot = phase)</h3>
                <div className="space-y-1.5">
                  {result.states.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-400 w-16 flex-shrink-0">{s.label}</span>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: s.probability > 1e-6 ? `hsl(${((Math.atan2(s.amplitude_im, s.amplitude_re) * 180) / Math.PI + 530) % 360}, 90%, 60%)` : '#1f2937' }}
                        title={`phase ${((Math.atan2(s.amplitude_im, s.amplitude_re) * 180) / Math.PI).toFixed(0)}°`} />
                      <div className="flex-1 h-5 bg-quantum-700 rounded-md overflow-hidden relative">
                        <div className="h-full rounded-md transition-all duration-300"
                          style={{ width: `${(s.probability / maxProb) * 100}%`, background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }} />
                      </div>
                      <span className="text-xs text-gray-300 w-14 text-right font-mono">{(s.probability * 100).toFixed(1)}%</span>
                      <span className="text-[10px] text-gray-500 w-14 text-right font-mono">{result.counts[s.label] ?? 0} shots</span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-600 text-[11px] mt-3">Shots = a real sampling of 1024 simulated measurements — close to, but not exactly, the probabilities.</p>
              </div>

              {qiskit && <CodeBlock code={qiskit} title="Your circuit in Qiskit" subtitle="copy and run with Qiskit Aer or on IBM Quantum" defaultOpen />}
            </>
          )}
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm border ${
            t.tone === 'good' ? 'bg-emerald-950 border-emerald-600 text-emerald-200'
              : t.tone === 'warn' ? 'bg-amber-950 border-amber-600 text-amber-200'
                : 'bg-quantum-800 border-quantum-600 text-gray-200'}`}>
            {t.tone === 'good' ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}{t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
