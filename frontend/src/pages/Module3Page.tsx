import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Check, ChevronRight, Gamepad2, Hammer, Lightbulb, Link2, Loader2,
  Minus, Plus, Redo2, RotateCcw, Sparkles, Star, Trash2, Undo2, Zap, ZoomIn, ZoomOut,
} from 'lucide-react';
import axios from 'axios';
import apiClient, { getApiErrorMessage } from '../api/client';
import { AngleField } from '../components/module3/AngleField';
import { BlochSphere } from '../components/module3/BlochSphere';
import { BADGES, LEVELS, starsFor, type SimResult } from '../components/module3/challenges';
import { CodeBlock } from '../components/shared/CodeBlock';
import { HowToUse } from '../components/shared/HowToUse';
import { angleLabel, builderQasm } from '../components/module3/qasm';
import { SaveBar, useSavedCircuit } from '../components/work/SaveBar';
import { workApi, type SavedCircuit } from '../api/work';

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
const MAX_QUBITS = 6;

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
    return { target: other, controls: [row] };            // the chosen wire = control (CNOT/CZ) or first qubit (SWAP)
  }
  if (n < 3) return null;
  const r0 = Math.min(Math.max(row, 0), n - 3);
  return { target: r0 + 2, controls: [r0, r0 + 1] };
}

/** The gate moved by `dc` steps and `dr` wires (sideways it hops over other gates), or null if it can't go there. */
function moved(gates: PlacedGate[], g: PlacedGate, dc: number, dr: number, n: number): PlacedGate | null {
  const qs = qubitsOf(g).map(q => q + dr);
  const a = Math.min(...qs), b = Math.max(...qs);
  if (a < 0 || b >= n) return null;
  let col = g.col + dc;
  if (dc) while (col >= 0 && !spanFree(gates, col, a, b, g.id)) col += dc;
  if (col < 0 || !spanFree(gates, col, a, b, g.id)) return null;
  return { ...g, col, target: g.target + dr, controls: g.controls.map(q => q + dr) };
}

/** "H on q0", "RY(π/8) on q1", "CNOT with control q0 and target q1" — for screen readers. */
function describeGate(g: PlacedGate): string {
  const m = META[g.gate];
  if (g.gate === 'SWAP') return `SWAP on q${g.controls[0]} and q${g.target}`;
  if (m.arity > 1) {
    return `${m.label} with control${g.controls.length > 1 ? 's' : ''} ${g.controls.map(q => `q${q}`).join(' and ')} and target q${g.target}`;
  }
  return `${m.label}${m.param ? `(${angleLabel(g.angle ?? Math.PI / 2)})` : ''} on q${g.target}`;
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

function focusVisible(el: Element) {
  try { return el.matches(':focus-visible'); } catch { return true; }
}

// ── Draft: the free-build circuit is kept in this browser, so a reload or a trip
//    to the Simulator doesn't lose it. ──────────────────────────────────────────

const DRAFT_KEY = 'qai_builder_draft';
const CHALLENGES_KEY = 'qai_m3_progress';      // stars from before they were saved to the account

interface Layout { n: number; gates: PlacedGate[] }
interface Draft extends Layout { savedId?: number }

/** A drawing we can trust: known gates, on wires that exist. */
function asLayout(d: unknown): Layout | null {
  const l = d as Layout | null;
  if (!l || !Number.isInteger(l.n) || l.n < 1 || l.n > MAX_QUBITS || !Array.isArray(l.gates)) return null;
  const ok = l.gates.every((g: PlacedGate) => g && META[g.gate] && Number.isInteger(g.col) && g.col >= 0
    && [g.target, ...(g.controls ?? [])].every(q => Number.isInteger(q) && q >= 0 && q < l.n)
    && (g.controls ?? []).length === META[g.gate].arity - 1);
  return ok ? { n: l.n, gates: l.gates } : null;
}

function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    const layout = asLayout(d);
    return layout ? { ...layout, savedId: Number.isInteger(d.savedId) ? d.savedId : undefined } : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
}

function localStars(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHALLENGES_KEY) ?? '{}'); } catch { return {}; }
}

/** ★★☆ with the count for screen readers. */
function Stars({ n, dim = 'text-gray-600' }: { n: number; dim?: string }) {
  return (
    <span className="font-mono">
      <span className="sr-only">{n} of 3 stars</span>
      <span aria-hidden="true">{'★'.repeat(n)}<span className={dim}>{'★'.repeat(3 - n)}</span></span>
    </span>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────────────

interface Toast { id: number; text: string; tone: 'info' | 'good' | 'warn' }

const MOVES = [
  { dc: -1, dr: 0, Icon: ArrowLeft, label: 'Move earlier' },
  { dc: 1, dr: 0, Icon: ArrowRight, label: 'Move later' },
  { dc: 0, dr: -1, Icon: ArrowUp, label: 'Move up a wire' },
  { dc: 0, dr: 1, Icon: ArrowDown, label: 'Move down a wire' },
];
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// ── Page ──────────────────────────────────────────────────────────────────────

export function Module3Page() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // "?new" (My work's "New circuit") starts a blank canvas instead of the draft.
  const [startNew] = useState(() => params.has('new'));
  const [draft] = useState(() => (startNew ? null : loadDraft()));
  // The saved circuit the draft belongs to; cleared once handled so it is never reopened by mistake.
  const [draftCircuit, setDraftCircuit] = useState(draft?.savedId ?? 0);
  const [mode, setMode] = useState<'free' | 'challenge'>('free');
  const [numQubits, setNumQubits] = useState(draft?.n ?? 2);
  const [gates, setGates] = useState<PlacedGate[]>(draft?.gates ?? []);
  const [past, setPast] = useState<Layout[]>([]);
  const [future, setFuture] = useState<Layout[]>([]);
  const [armed, setArmed] = useState<GateName | null>(null);           // chosen in the palette, placed with a click, tap or Enter
  const [paletteDrag, setPaletteDrag] = useState<GateName | null>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const [cursor, setCursor] = useState({ col: 0, row: 0 });              // the keyboard's spot on the canvas
  const [canvasFocus, setCanvasFocus] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ id: string; grabRow: number; grabCol: number; sx: number; sy: number; x: number; y: number; moved: boolean; outside: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [said, setSaid] = useState('');                                  // read out by screen readers

  const [levelIdx, setLevelIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>(localStars);
  const [solved, setSolved] = useState<{ id: string; stars: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);                                         // a drag just ended: ignore its click
  const ids = { hint: useId(), canvas: useId() };
  const level = LEVELS[levelIdx];
  const cols = Math.max(10, ...gates.map(g => g.col + 3));
  const width = LEFT + cols * COL_W + 16;
  const height = TOP + numQubits * ROW_H + 8;
  const cur = { col: Math.min(cursor.col, cols - 1), row: Math.min(cursor.row, numQubits - 1) };

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);

  // ── history (each step keeps the qubit count too, so undo brings back removed wires) ──
  const commit = useCallback((next: PlacedGate[], n?: number) => {
    setPast(p => [...p.slice(-80), { n: numQubits, gates }]);
    setFuture([]);
    setGates(next);
    if (n !== undefined) setNumQubits(n);
  }, [gates, numQubits]);

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture([{ n: numQubits, gates }, ...future]);
    setPast(past.slice(0, -1));
    setGates(prev.gates);
    setNumQubits(prev.n);
  }, [past, future, gates, numQubits]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setPast([...past, { n: numQubits, gates }]);
    setFuture(future.slice(1));
    setGates(next.gates);
    setNumQubits(next.n);
  }, [past, future, gates, numQubits]);

  // ── placing / moving ──
  const placeGate = useCallback((name: GateName, col: number, row: number) => {
    const meta = META[name];
    const qs = defaultQubits(meta, row, numQubits);
    if (!qs) {
      toast(`${meta.label} needs at least ${meta.arity} qubits. Add more qubits first.`, 'warn');
      return;
    }
    const all = [qs.target, ...qs.controls];
    const a = Math.min(...all), b = Math.max(...all);
    let c = Math.max(0, col);
    while (!spanFree(gates, c, a, b)) c++;
    const g: PlacedGate = { id: uid(), gate: name, col: c, ...qs, ...(meta.param ? { angle: Math.PI / 2 } : {}) };
    commit([...gates, g]);
    setCursor({ col: c, row });
    if (meta.arity > 1 || meta.param) setSelectedId(g.id);
    setSaid(`Placed ${describeGate(g)}, step ${c + 1}.`);
  }, [gates, numQubits, commit, toast]);

  const removeGate = (g: PlacedGate) => {
    commit(gates.filter(x => x.id !== g.id));
    if (selectedId === g.id) setSelectedId(null);
    setSaid(`Removed ${describeGate(g)}.`);
  };

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
  const gateAt = (col: number, row: number) =>
    gates.find(g => g.col === col && spanOf(g)[0] <= row && row <= spanOf(g)[1]) ?? null;

  // palette → canvas (HTML5 drag and drop, for a mouse)
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

  // move placed gates with a mouse or pen; on a touch screen a tap selects, so the page still scrolls
  const startMove = (e: React.PointerEvent, g: PlacedGate) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
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
      const didMove = m.moved || (p && Math.abs(p.x - m.sx) + Math.abs(p.y - m.sy) > 4);
      if (!didMove) return;                                      // a plain click: the gate's onClick selects it
      dragged.current = true;
      window.setTimeout(() => { dragged.current = false; }, 0);
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
    const onCancel = () => setMoving(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [moving, gates, numQubits, width, height, commit, selectedId, toast]);

  const selectGate = (g: PlacedGate) => {
    if (dragged.current) return;
    setSelectedId(g.id);
    setCursor({ col: g.col, row: g.target });
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (dragged.current) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c) setCursor({ col: c.col, row: c.row });
    if (armed && c) {
      placeGate(armed, c.col, c.row);
      return;
    }
    setSelectedId(null);
  };

  // a mouse shows where the chosen gate would go
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (!armed || e.pointerType !== 'mouse') return;
    const c = cellAt(e.clientX, e.clientY);
    setHover(h => (!c ? null : h && h.col === c.col && h.row === c.row ? h : { col: c.col, row: c.row }));
  };

  // Keep the keyboard's spot in view when the circuit is wider than the screen.
  const revealCol = (col: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const left = (colX(col) - COL_W / 2) * zoom, right = left + COL_W * zoom;
    if (col === 0) el.scrollLeft = 0;
    else if (left < el.scrollLeft) el.scrollLeft = left - 8;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
  };

  const selected = gates.find(g => g.id === selectedId) ?? null;

  const moveSelected = (dc: number, dr: number) => {
    if (!selected) return;
    const next = moved(gates, selected, dc, dr, numQubits);
    if (!next) { toast("It can't move that way", 'warn'); return; }
    commit(gates.map(g => (g.id === next.id ? next : g)));
    setCursor({ col: next.col, row: Math.min(numQubits - 1, Math.max(0, cur.row + dr)) });
    revealCol(next.col);
    setSaid(`Moved to step ${next.col + 1}: ${describeGate(next)}.`);
  };

  // Keyboard on the canvas: arrows pick a spot, Enter places or selects, Shift + arrows move, Delete removes.
  const onCanvasKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!canvasFocus) setCanvasFocus(true);
    const d = ARROWS[e.key];
    if (d) {
      e.preventDefault();
      if (e.shiftKey) {
        if (selected) moveSelected(d[0], d[1]);
        else setSaid('Select a gate first: press Enter on it.');
        return;
      }
      const next = { col: Math.min(cols - 1, Math.max(0, cur.col + d[0])), row: Math.min(numQubits - 1, Math.max(0, cur.row + d[1])) };
      setCursor(next);
      revealCol(next.col);
      const g = gateAt(next.col, next.row);
      setSaid(`q${next.row}, step ${next.col + 1}: ${g ? describeGate(g) : 'empty'}`);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (armed) { placeGate(armed, cur.col, cur.row); return; }
      const g = gateAt(cur.col, cur.row);
      if (!g) setSaid('Nothing here. Choose a gate first, then press Enter to place it.');
      else if (g.id === selectedId) { setSelectedId(null); setSaid('Unselected.'); }
      else { setSelectedId(g.id); setSaid(`Selected ${describeGate(g)}. Shift and the arrow keys move it.`); }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const g = selected ?? gateAt(cur.col, cur.row);
      if (g) { e.preventDefault(); removeGate(g); }
    }
  };

  // keyboard shortcuts for the whole page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
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
      } catch (e) {
        if (!axios.isCancel(e)) setSimError(getApiErrorMessage(e, "Couldn't work out the result. Please try again."));
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
        setProgress(p => ({ ...p, [level.id]: Math.max(p[level.id] ?? 0, stars) }));
        workApi.saveChallenges({ [level.id]: stars }).catch(() => {
          // keep it in this browser; it moves to the account next time
          try { localStorage.setItem(CHALLENGES_KEY, JSON.stringify({ ...localStars(), [level.id]: stars })); } catch { /* private mode */ }
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
  };

  const switchMode = (m: 'free' | 'challenge') => {
    if (m === mode) return;
    setMode(m);
    if (m === 'challenge') startLevel(Math.max(0, LEVELS.findIndex(l => !progress[l.id])));
    else {
      // back to your own circuit, as you left it
      const d = loadDraft();
      setSolved(null);
      setNumQubits(d?.n ?? 2);
      setGates(d?.gates ?? []);
      setPast([]);
      setFuture([]);
      setSelectedId(null);
    }
  };

  // The circuit as OpenQASM: shown live under the canvas, and what "Open in Simulator" takes along.
  const qasm = useMemo(() => builderQasm(toKernelOps(gates), numQubits), [gates, numQubits]);

  // Saving: once saved (or opened from My work), every change saves itself. Challenges are never saved as circuits.
  const content = useMemo(() => ({ qasm, layout: { n: numQubits, gates } }), [qasm, numQubits, gates]);
  const saved = useSavedCircuit(content, mode !== 'free');
  const savedId = saved.attached?.id;

  useEffect(() => { if (mode === 'free') saveDraft({ n: numQubits, gates, savedId }); }, [mode, numQubits, gates, savedId]);

  const showCircuit = useCallback((layout: Layout) => {
    setNumQubits(layout.n);
    setGates(layout.gates);
    setPast([]);
    setFuture([]);
    setSelectedId(null);
  }, []);

  // Open the circuit in the address (?c=<id>), or the saved circuit you were last working on.
  const wanted = Number(params.get('c')) || draftCircuit;
  const { attach, detach } = saved;
  useEffect(() => {
    if (startNew && params.has('new')) setParams({}, { replace: true });
  }, [startNew, params, setParams]);
  useEffect(() => {
    if (!wanted || wanted === savedId) return;
    let live = true;
    workApi.circuit(wanted)
      .then((c: SavedCircuit) => {
        if (!live) return;
        setDraftCircuit(0);
        if (!c.layout) { navigate(`/simulator?c=${c.id}`, { replace: true }); return; }
        const layout = asLayout(c.layout);
        if (!layout) return;
        showCircuit(layout);
        attach(c);
        setParams({ c: String(c.id) }, { replace: true });
      })
      .catch(() => {
        if (!live) return;
        // deleted, or not yours: carry on with what is on the canvas, unsaved
        setDraftCircuit(0);
        setParams({}, { replace: true });
      });
    return () => { live = false; };
  }, [wanted, savedId, attach, showCircuit, navigate, setParams]);

  const newCircuit = () => {
    detach();
    setDraftCircuit(0);
    showCircuit({ n: 2, gates: [] });
    setParams({}, { replace: true });
  };

  // Challenge stars live in the account; stars from before that move across once.
  useEffect(() => {
    let live = true;
    const local = localStars();
    workApi.challenges()
      .then(async server => {
        const better = Object.fromEntries(Object.entries(local).filter(([id, s]) => s > (server[id] ?? 0)));
        const all = Object.keys(better).length ? await workApi.saveChallenges(better) : server;
        try { localStorage.removeItem(CHALLENGES_KEY); } catch { /* private mode */ }
        if (live) setProgress(all);
      })
      .catch(() => { /* keep showing this browser's stars */ });
    return () => { live = false; };
  }, []);

  const changeQubits = (n: number) => {
    if (n < 1 || n > MAX_QUBITS) return;
    const kept = gates.filter(g => Math.max(...qubitsOf(g)) < n);
    const lost = gates.length - kept.length;
    if (lost) toast(`Removed ${lost} gate${lost > 1 ? 's' : ''} on the last wire. Undo brings ${lost > 1 ? 'them' : 'it'} back.`, 'warn');
    commit(kept, n);
  };

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
    const [lo, hi] = spanOf(g);
    const box = (q: number, label: string, sub?: string) => {
      const w = sub ? 50 : BOX, h = sub ? 44 : BOX;
      return (
        <g key={`b${q}`}>
          <rect x={x - w / 2} y={rowY(q) + oy - h / 2} width={w} height={h} rx={7}
            fill="#16163a" stroke={m.color} strokeWidth={isSel ? 3 : 1.8}
            style={isSel ? { filter: `drop-shadow(0 0 6px ${m.color})` } : undefined} />
          <text x={x} y={rowY(q) + oy + (sub ? -3 : 5)} textAnchor="middle" fill={m.color} fontSize={sub ? 13 : 14}
            fontWeight="bold" fontFamily="monospace">{label}</text>
          {sub && <text x={x} y={rowY(q) + oy + 14} textAnchor="middle" fill="#e5e7eb" fontSize={12} fontFamily="monospace">{sub}</text>}
        </g>
      );
    };
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
      <g key={g.id + (ghost ? '-ghost' : '')} opacity={ghost ? 0.45 : 1} data-gate={g.gate}
        onPointerDown={ghost ? undefined : e => startMove(e, g)}
        onClick={e => { e.stopPropagation(); if (!ghost) selectGate(g); }}
        onMouseEnter={() => !ghost && setTooltip(m.desc)} onMouseLeave={() => setTooltip(null)}
        style={{ cursor: ghost ? 'grabbing' : 'pointer' }}>
        {/* a wider, invisible target so a finger can hit thin controls and crosses */}
        {!ghost && <rect x={x - COL_W / 2 + 4} y={rowY(lo) - ROW_H / 2 + 4} width={COL_W - 8} height={(hi - lo + 1) * ROW_H - 8} fill="transparent" />}
        {m.arity > 1 && <line x1={x} y1={rowY(lo) + oy} x2={x} y2={rowY(hi) + oy} stroke={m.color} strokeWidth={isSel ? 3 : 2} />}
        {g.gate === 'CNOT' && <>{dot(g.controls[0])}{oplus(g.target)}</>}
        {g.gate === 'CCX' && <>{dot(g.controls[0])}{dot(g.controls[1])}{oplus(g.target)}</>}
        {g.gate === 'CZ' && <>{dot(g.controls[0])}{dot(g.target)}</>}
        {g.gate === 'SWAP' && <>{cross(g.controls[0])}{cross(g.target)}</>}
        {m.arity === 1 && box(g.target, m.label, m.param ? angleLabel(g.angle ?? Math.PI / 2) : undefined)}
      </g>
    );
  };

  // Where the chosen gate would land: under the mouse, or at the keyboard's spot.
  const previewName = paletteDrag ?? armed;
  const previewAt = hover ?? (canvasFocus && armed ? cur : null);
  const previewQubits = previewName && previewAt ? defaultQubits(META[previewName], previewAt.row, numQubits) : null;
  const preview = previewAt && previewQubits
    ? { col: previewAt.col, a: Math.min(previewQubits.target, ...previewQubits.controls), b: Math.max(previewQubits.target, ...previewQubits.controls) }
    : null;

  const movingGate = moving ? gates.find(g => g.id === moving.id) : null;
  const iconBtn = 'p-2 rounded-lg text-gray-300 hover:text-white hover:bg-quantum-700 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="min-h-screen px-4 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 text-center">
        <p className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
          Results update with every gate
        </p>
        <h1 className="text-3xl font-extrabold text-white mb-2">Quantum Circuit Builder</h1>
        <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
          Put gates on the wires and see the chances change straight away, with one Bloch sphere per qubit showing
          superposition and entanglement. Save your circuit, or open it in the Simulator.
        </p>
      </div>

      <HowToUse
        defaultOpen={false}
        steps={[
          <><strong>Choose a gate</strong>, then a spot on a wire. With a mouse you can also drag it there.</>,
          <>Select a placed gate to change it: type an angle like <code>pi/8</code>, pick its qubits, or move it with the arrows. <kbd>Delete</kbd> removes it and <kbd>Ctrl/⌘ Z</kbd> undoes.</>,
          <>With a keyboard: press <kbd>Enter</kbd> on a gate, pick a spot with the arrow keys, then press <kbd>Enter</kbd> again. <kbd>Shift</kbd> + arrows move the selected gate.</>,
          <>Press <strong>Save</strong> to keep your circuit, or switch to <strong>Challenges</strong> for {LEVELS.length} levels with stars.</>,
        ]}
        outcome={<>The chance of each outcome, one Bloch sphere per qubit (dashed purple = entangled), measurement counts, and your circuit as OpenQASM. Open it in the Simulator to replay it gate by gate, see its amplitudes or download it.</>}
      />

      {/* Mode switch */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="inline-flex bg-quantum-800 border border-quantum-700 rounded-xl p-1">
          <button type="button" onClick={() => switchMode('free')} aria-pressed={mode === 'free'}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm ${mode === 'free' ? 'bg-quantum-neon text-black font-semibold' : 'text-gray-300 hover:text-white'}`}>
            <Hammer className="w-4 h-4" aria-hidden="true" /> Free build
          </button>
          <button type="button" onClick={() => switchMode('challenge')} aria-pressed={mode === 'challenge'}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm ${mode === 'challenge' ? 'bg-purple-400 text-black font-semibold' : 'text-gray-300 hover:text-white'}`}>
            <Gamepad2 className="w-4 h-4" aria-hidden="true" /> Challenges
          </button>
        </div>
        <span className="text-xs text-gray-400 flex items-center gap-1 ml-2">
          <Star className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" /> {totalStars} / {LEVELS.length * 3} stars
        </span>
        {mode === 'free' && (
          <div className="w-full sm:w-auto sm:ml-auto">
            <SaveBar saved={saved} suggestName="My circuit" onNew={newCircuit}
              onSaved={c => setParams({ c: String(c.id) }, { replace: true })} />
          </div>
        )}
        {earnedBadges.map(b => (
          <span key={b.id} className="text-xs flex items-center gap-1 text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
            <Award className="w-3.5 h-3.5" aria-hidden="true" /> {b.title}
          </span>
        ))}
      </div>

      {/* Challenge panel */}
      {mode === 'challenge' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-3 max-h-72 overflow-y-auto">
            {LEVELS.map((l, i) => (
              <button key={l.id} type="button" onClick={() => startLevel(i)} aria-current={i === levelIdx ? 'step' : undefined}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${i === levelIdx ? 'bg-purple-500/15 text-white' : 'text-gray-300 hover:bg-quantum-700'}`}>
                <span className="w-5 text-gray-400 font-mono text-xs">{i + 1}</span>
                <span className="flex-1">{l.title}</span>
                <span className="text-amber-300 text-xs"><Stars n={progress[l.id] ?? 0} /></span>
              </button>
            ))}
          </div>
          <div className="lg:col-span-3 bg-gradient-to-br from-purple-500/10 to-teal-500/5 border border-purple-500/30 rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs text-purple-300 font-semibold uppercase tracking-widest">Level {levelIdx + 1} · {level.concept}</span>
              <span className="text-xs text-gray-400">{level.qubits} qubit{level.qubits > 1 ? 's' : ''} · 3 stars in {level.par} gate{level.par > 1 ? 's' : ''} or fewer</span>
            </div>
            <h2 className="text-white text-xl font-bold mb-1">{level.title}</h2>
            <p className="text-gray-300 text-sm mb-2">{level.story}</p>
            <p className="text-sm text-white"><span className="text-quantum-neon font-semibold">Goal:</span> {level.goal}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={() => setShowHint(h => !h)} aria-expanded={showHint}
                className="flex items-center gap-1 text-sm text-amber-200 border border-amber-500/40 rounded-lg px-3 py-1.5">
                <Lightbulb className="w-4 h-4" aria-hidden="true" /> {showHint ? level.hint : 'Show hint'}
              </button>
              <button type="button" onClick={() => startLevel(levelIdx)} className="flex items-center gap-1 text-sm text-gray-300 border border-quantum-600 rounded-lg px-3 py-1.5">
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> Restart level
              </button>
            </div>
            {solved?.id === level.id && (
              <div className="mt-4 flex flex-wrap items-center gap-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-4 py-3">
                <Sparkles className="w-5 h-5 text-emerald-300" aria-hidden="true" />
                <span className="text-emerald-200 font-semibold">Level complete!</span>
                <span className="text-amber-300 text-lg"><Stars n={solved.stars} /></span>
                {solved.stars < 3 && <span className="text-sm text-gray-300">Try again with {level.par} gate{level.par > 1 ? 's' : ''} or fewer for 3 stars.</span>}
                {levelIdx < LEVELS.length - 1 && (
                  <button type="button" onClick={() => startLevel(levelIdx + 1)} className="ml-auto flex items-center gap-1 text-sm font-semibold text-black bg-emerald-300 rounded-lg px-3 py-1.5">
                    Next level <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Palette: beside the canvas on a wide screen, right above it on a phone */}
        <div className="lg:col-span-1 min-w-0">
          <section aria-labelledby={`${ids.canvas}-gates`} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <h2 id={`${ids.canvas}-gates`} className="text-white font-bold text-sm mb-1">Gates</h2>
            <p className="text-gray-400 text-xs mb-3">
              Choose a gate, then a spot on a wire.<span className="hidden lg:inline"> You can also drag it there.</span>
            </p>
            <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 lg:block">
              {GROUPS.map(group => (
                <div key={group} className="contents lg:block lg:mb-3">
                  <p className="hidden lg:block text-gray-400 text-xs uppercase tracking-widest mb-1.5">{group}</p>
                  <div className={`contents lg:grid ${group === 'Multi-qubit' ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} lg:gap-1.5`}>
                    {GATES.filter(g => g.group === group).map(g => (
                      <button key={g.name} type="button"
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', `gate:${g.name}`); e.dataTransfer.effectAllowed = 'copy'; setPaletteDrag(g.name); }}
                        onDragEnd={() => { setPaletteDrag(null); setHover(null); }}
                        onClick={e => {
                          const on = armed !== g.name;
                          setArmed(on ? g.name : null);
                          // chosen with the keyboard: go straight to the canvas to place it
                          if (on && e.detail === 0) {
                            canvasRef.current?.focus();
                            setSaid(`${g.label} chosen. Pick a spot with the arrow keys, then press Enter.`);
                          }
                        }}
                        onMouseEnter={() => setTooltip(g.desc)} onMouseLeave={() => setTooltip(null)}
                        onFocus={() => setTooltip(g.desc)} onBlur={() => setTooltip(null)}
                        aria-label={`${g.label} gate`} aria-pressed={armed === g.name}
                        className={`py-2.5 lg:py-2 rounded-lg text-xs font-bold border cursor-grab active:cursor-grabbing transition-all ${armed === g.name ? 'scale-105' : 'border-quantum-600 bg-quantum-900 hover:border-quantum-400'}`}
                        style={armed === g.name ? { borderColor: g.color, background: `${g.color}22`, color: g.color } : { color: g.color }}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden lg:block min-h-[56px] p-2 bg-quantum-900/60 rounded-lg border border-quantum-700">
              <p className="text-gray-300 text-xs leading-relaxed">{tooltip ?? (armed ? META[armed].desc : 'Point at a gate to see what it does.')}</p>
            </div>
          </section>
        </div>

        {/* Canvas + inspector + results */}
        <div className="lg:col-span-3 space-y-4 min-w-0">
          <section aria-labelledby={ids.canvas} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
              <h2 id={ids.canvas} className="text-white font-bold text-sm">Your circuit</h2>
              <span className="text-xs text-gray-400">{gates.length} gate{gates.length !== 1 ? 's' : ''}</span>
              {simLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-quantum-neon" aria-label="Working out the result" />}
              {!simLoading && result && <span className="text-xs text-emerald-300 flex items-center gap-1"><Zap className="w-3.5 h-3.5" aria-hidden="true" />live</span>}
              <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                <div role="group" aria-label="Qubits" className="flex items-center gap-1">
                  <span className="text-xs text-gray-400 mr-1">Qubits</span>
                  <button type="button" onClick={() => changeQubits(numQubits - 1)} disabled={mode === 'challenge' || numQubits <= 1}
                    aria-label="Remove a qubit" className={`${iconBtn} border border-quantum-600`}><Minus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  <span className="w-5 text-center text-sm font-mono text-white" aria-live="polite">{numQubits}</span>
                  <button type="button" onClick={() => changeQubits(numQubits + 1)} disabled={mode === 'challenge' || numQubits >= MAX_QUBITS}
                    aria-label="Add a qubit" className={`${iconBtn} border border-quantum-600`}><Plus className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
                <div className="flex items-center">
                  <button type="button" onClick={undo} disabled={!past.length} title="Undo (Ctrl/⌘ Z)" aria-label="Undo" className={iconBtn}><Undo2 className="w-4 h-4" aria-hidden="true" /></button>
                  <button type="button" onClick={redo} disabled={!future.length} title="Redo (Ctrl/⌘ Shift Z)" aria-label="Redo" className={iconBtn}><Redo2 className="w-4 h-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => setZoom(z => Math.max(0.7, +(z - 0.1).toFixed(2)))} disabled={zoom <= 0.7} title="Zoom out" aria-label="Zoom out" className={iconBtn}><ZoomOut className="w-4 h-4" aria-hidden="true" /></button>
                  <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))} disabled={zoom >= 1.5} title="Zoom in" aria-label="Zoom in" className={iconBtn}><ZoomIn className="w-4 h-4" aria-hidden="true" /></button>
                  <button type="button" onClick={() => { commit([]); setSelectedId(null); }} disabled={!gates.length} title="Clear the circuit" aria-label="Clear the circuit"
                    className={`${iconBtn} hover:text-red-400`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              </div>
            </div>
            {armed && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-sm">
                <p className="text-gray-200">
                  <strong style={{ color: META[armed].color }}>{META[armed].label}</strong> chosen. Pick a spot on a wire to place it
                  {META[armed].arity > 1 ? '; you can change its qubits after.' : '.'}
                </p>
                <button type="button" onClick={() => setArmed(null)} className="text-quantum-neon underline hover:text-white">Done</button>
                <p className="basis-full text-xs text-gray-400 lg:hidden">{META[armed].desc}</p>
              </div>
            )}
            <div ref={canvasRef} id={`${ids.canvas}-area`} tabIndex={0} role="application"
              aria-label={`Circuit with ${numQubits} qubit${numQubits > 1 ? 's' : ''} and ${gates.length} gate${gates.length !== 1 ? 's' : ''}`}
              aria-describedby={ids.hint}
              onKeyDown={onCanvasKey}
              onFocus={e => { if (e.target === e.currentTarget) setCanvasFocus(focusVisible(e.currentTarget)); }}
              onBlur={() => setCanvasFocus(false)}
              className="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-quantum-neon"
              onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setHover(null)}>
              <svg ref={svgRef} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"
                onClick={onCanvasClick} onPointerMove={onCanvasPointerMove} onPointerLeave={() => setHover(null)} className="select-none">
                {Array.from({ length: cols }, (_, c) => (
                  <line key={`g${c}`} x1={colX(c)} y1={TOP} x2={colX(c)} y2={TOP + numQubits * ROW_H} stroke="#1c1c44" strokeDasharray="2 6" />
                ))}
                {Array.from({ length: numQubits }, (_, q) => (
                  <g key={`w${q}`}>
                    <text x={6} y={rowY(q) + 4} fill="#d1d5db" fontSize={12} fontFamily="monospace">q{q}</text>
                    <text x={25} y={rowY(q) + 4} fill="#9ca3af" fontSize={12} fontFamily="monospace">|0⟩</text>
                    <line x1={LEFT - 2} y1={rowY(q)} x2={width - 8} y2={rowY(q)} stroke="#374151" strokeWidth={2} />
                  </g>
                ))}
                {preview && (
                  <rect x={colX(preview.col) - COL_W / 2 + 4} y={rowY(preview.a) - ROW_H / 2 + 4} width={COL_W - 8}
                    height={(preview.b - preview.a + 1) * ROW_H - 8} rx={8} fill="rgba(0,255,204,0.08)" stroke="#00ffcc" strokeDasharray="4 3" />
                )}
                {gates.map(g => (moving?.id === g.id && moving.moved ? null : renderGate(g)))}
                {movingGate && moving && moving.moved &&
                  renderGate(movingGate, true, moving.x - colX(movingGate.col), (Math.round((moving.y - TOP - ROW_H / 2) / ROW_H) - moving.grabRow) * ROW_H)}
                {canvasFocus && (
                  <rect x={colX(cur.col) - COL_W / 2 + 1} y={rowY(cur.row) - ROW_H / 2 + 1} width={COL_W - 2} height={ROW_H - 2} rx={9}
                    fill="none" stroke="#f9fafb" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" data-cursor="" />
                )}
              </svg>
            </div>
            <p id={ids.hint} className={canvasFocus ? 'text-xs text-gray-300 mt-2' : 'sr-only'}>
              Arrow keys pick a spot. Enter places the chosen gate, or selects the gate there. Shift + arrows move the selected gate; Delete removes it.
            </p>
            <p className="sr-only" aria-live="polite">{said}</p>
            {moving?.moved && (
              <p className={`text-xs mt-2 ${moving.outside ? 'text-red-400' : 'text-gray-400'}`}>
                {moving.outside ? 'Release to delete this gate' : 'Drag off the canvas to delete'}
              </p>
            )}
            {gates.length === 0 && !armed && (
              <p className="text-center py-3 text-gray-400 text-sm">Choose a gate, then a spot on a wire, to start.</p>
            )}
          </section>

          {/* Inspector */}
          {selected && (
            <section aria-label={`Selected gate: ${describeGate(selected)}`} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono font-bold" style={{ color: META[selected.gate].color }}>{META[selected.gate].label}</span>
                <span className="text-sm text-gray-300 flex-1 min-w-[12rem]">{META[selected.gate].desc}</span>
                <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-quantum-neon underline hover:text-white">Done</button>
              </div>
              {META[selected.gate].param && (
                <AngleField key={selected.id} value={selected.angle ?? Math.PI / 2} onChange={angle => updateSelected({ angle })} />
              )}
              {META[selected.gate].arity > 1 && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                  {selected.controls.map((c, i) => (
                    <label key={i} className="flex items-center gap-1.5">
                      {selected.gate === 'SWAP' ? 'Qubit A' : `Control${selected.controls.length > 1 ? ` ${i + 1}` : ''}`}
                      <select value={c} onChange={e => updateSelected({ controls: selected.controls.map((x, j) => (j === i ? Number(e.target.value) : x)) })}
                        className="bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1.5 text-white">
                        {Array.from({ length: numQubits }, (_, q) => <option key={q} value={q}>q{q}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    {selected.gate === 'SWAP' ? 'Qubit B' : 'Target'}
                    <select value={selected.target} onChange={e => updateSelected({ target: Number(e.target.value) })}
                      className="bg-quantum-900 border border-quantum-600 rounded-lg px-2 py-1.5 text-white">
                      {Array.from({ length: numQubits }, (_, q) => <option key={q} value={q}>q{q}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-300 mr-1">Move</span>
                {MOVES.map(({ dc, dr, Icon, label }) => (
                  <button key={label} type="button" onClick={() => moveSelected(dc, dr)} disabled={!moved(gates, selected, dc, dr, numQubits)}
                    aria-label={label} title={label} className={`${iconBtn} border border-quantum-600`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={() => removeGate(selected)}
                  className="ml-auto flex items-center gap-1.5 text-sm text-red-300 border border-red-800/60 rounded-lg px-3 py-1.5 hover:border-red-600">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />Delete
                </button>
              </div>
            </section>
          )}

          <CodeBlock code={qasm} title="OpenQASM" subtitle="updates as you build" defaultOpen maxHeight={240} />

          {simError && <div role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">{simError}</div>}

          {/* Results */}
          {result && (
            <>
              <div className="flex flex-wrap gap-2">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${result.is_superposition ? 'bg-teal-500/10 border-teal-500/30 text-teal-300' : 'bg-quantum-800 border-quantum-700 text-gray-400'}`}>
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" /> Superposition {result.is_superposition ? '✓' : '✗'}
                </span>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${result.is_entangled ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-quantum-800 border-quantum-700 text-gray-400'}`}>
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Entanglement {result.is_entangled ? `✓ (qubits ${result.entangled_qubits.map(q => `q${q}`).join(', ')})` : '✗'}
                </span>
                <span className="px-3 py-1.5 rounded-xl border bg-quantum-800 border-quantum-700 text-gray-300 text-xs">
                  {result.gate_count} gates · depth {result.circuit_depth} · {2 ** result.num_qubits} possible outcomes
                </span>
                <button type="button" onClick={() => navigate('/simulator', { state: { qasm } })} disabled={!gates.length}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-quantum-neon/50 text-quantum-neon text-xs font-semibold hover:bg-quantum-neon/10 disabled:opacity-40">
                  Open in Simulator <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
                <h2 className="text-white font-bold text-sm mb-2">Bloch spheres — one per qubit</h2>
                <div className="flex flex-wrap gap-2 justify-around">
                  {result.bloch.map(b => <BlochSphere key={b.qubit} {...b} />)}
                </div>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  Up = |0⟩, down = |1⟩, the equator = superpositions. An entangled qubit has no state of its own, so its arrow shrinks toward the centre (dashed purple).
                </p>
              </div>

              <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
                <h2 className="text-white font-bold text-sm mb-3">Chances <span className="font-normal text-gray-400">(the dot's colour shows the phase)</span></h2>
                <div className="space-y-1.5">
                  {result.states.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-gray-300 w-16 flex-shrink-0">{s.label}</span>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: s.probability > 1e-6 ? `hsl(${((Math.atan2(s.amplitude_im, s.amplitude_re) * 180) / Math.PI + 530) % 360}, 90%, 60%)` : '#1f2937' }}
                        title={`phase ${((Math.atan2(s.amplitude_im, s.amplitude_re) * 180) / Math.PI).toFixed(0)}°`} />
                      <div className="flex-1 h-5 bg-quantum-700 rounded-md overflow-hidden relative">
                        <div className="h-full rounded-md transition-all duration-300"
                          style={{ width: `${(s.probability / maxProb) * 100}%`, background: 'linear-gradient(90deg,#00ffcc,#cc44ff)' }} />
                      </div>
                      <span className="text-xs text-gray-200 w-14 text-right font-mono">{(s.probability * 100).toFixed(1)}%</span>
                      <span className="text-xs text-gray-400 w-[4.75rem] flex-shrink-0 whitespace-nowrap text-right font-mono">{result.counts[s.label] ?? 0} times</span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400 text-xs mt-3">Measured 1024 times, so the counts are close to the chances but rarely exactly the same.</p>
              </div>

            </>
          )}
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-[calc(100vw-2rem)]" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm border ${
            t.tone === 'good' ? 'bg-emerald-950 border-emerald-600 text-emerald-200'
              : t.tone === 'warn' ? 'bg-amber-950 border-amber-600 text-amber-200'
                : 'bg-quantum-800 border-quantum-600 text-gray-200'}`}>
            {t.tone === 'good' ? <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> : <Zap className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}{t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
