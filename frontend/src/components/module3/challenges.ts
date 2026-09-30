// Gamified levels for the Circuit Builder (Module 3, FE-1).
// Each level is checked automatically against the live simulation result.

export interface SimState { label: string; probability: number; amplitude_re: number; amplitude_im: number }
export interface SimBloch { qubit: number; x: number; y: number; z: number; entangled: boolean; length: number }
export interface SimResult {
  num_qubits: number;
  states: SimState[];
  is_superposition: boolean;
  is_entangled: boolean;
  gate_count: number;
  circuit_depth: number;
  bloch: SimBloch[];
  counts: Record<string, number>;
  entangled_qubits: number[];
}

export interface Level {
  id: string;
  title: string;
  concept: string;
  qubits: number;
  goal: string;
  story: string;
  hint: string;
  par: number;                      // gates needed for 3 stars
  requiresAny?: string[];           // at least one of these gates must be used
  check: (r: SimResult) => boolean;
}

const TOL = 0.02;
const p = (r: SimResult, bits: string) => r.states.find(s => s.label === `|${bits}⟩`)?.probability ?? 0;
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;
const only = (r: SimResult, target: Record<string, number>) =>
  r.states.every(s => near(s.probability, target[s.label.slice(1, -1)] ?? 0));

export const LEVELS: Level[] = [
  {
    id: 'flip', title: 'Flip the bit', concept: 'Pauli-X', qubits: 1, par: 1,
    story: 'Every qubit starts as |0⟩. Your first job: turn it into |1⟩ — the quantum version of NOT.',
    goal: 'Make the qubit read 1 with certainty.',
    hint: 'Drag the X gate onto the wire.',
    check: r => near(p(r, '1'), 1),
  },
  {
    id: 'coin', title: 'Quantum coin', concept: 'Superposition', qubits: 1, par: 1,
    story: 'A classical coin is either heads or tails. A qubit can be both at once until you look.',
    goal: 'Get a 50 / 50 chance of measuring 0 or 1.',
    hint: 'The Hadamard gate (H) makes an equal superposition.',
    check: r => near(p(r, '0'), 0.5) && near(p(r, '1'), 0.5),
  },
  {
    id: 'minus', title: 'The hidden minus sign', concept: 'Phase', qubits: 1, par: 2,
    story: 'Two states can have the same probabilities but a different phase. Point the Bloch arrow to −X.',
    goal: 'Prepare |−⟩ = (|0⟩ − |1⟩)/√2 — the arrow must point to the back (x = −1).',
    hint: 'X then H, or H then Z. Watch the Bloch sphere, not just the bars.',
    check: r => r.bloch[0] && r.bloch[0].x < -0.98,
  },
  {
    id: 'tilt', title: 'Loaded coin', concept: 'Rotations', qubits: 1, par: 1,
    story: 'Rotations let you set any probability you like — not just 50 / 50.',
    goal: 'Make P(1) = 25 % and P(0) = 75 %.',
    hint: 'Use RY(θ) with θ = π/3 (60°) — P(1) = sin²(θ/2).',
    check: r => near(p(r, '1'), 0.25),
  },
  {
    id: 'bell', title: 'Entangle two qubits', concept: 'Entanglement', qubits: 2, par: 2,
    story: 'Einstein called it "spooky action at a distance": measure one qubit and you instantly know the other.',
    goal: 'Create the Bell state: 00 or 11, each 50 %, and nothing else.',
    hint: 'H on q0, then a CNOT with q0 as the control and q1 as the target.',
    check: r => only(r, { '00': 0.5, '11': 0.5 }) && r.is_entangled,
  },
  {
    id: 'anti', title: 'Opposites attract', concept: 'Entanglement', qubits: 2, par: 3,
    story: 'Entangled qubits can also be perfectly anti-correlated: when one is 0 the other is 1.',
    goal: 'Make 01 and 10 each 50 % (the Ψ⁺ Bell state).',
    hint: 'Start from the Bell state and flip one of the qubits.',
    check: r => only(r, { '01': 0.5, '10': 0.5 }) && r.is_entangled,
  },
  {
    id: 'swap', title: 'Teleport a value (swap)', concept: 'Multi-qubit gates', qubits: 2, par: 2,
    story: 'Move information from one wire to another without copying it (the no-cloning theorem forbids copies!).',
    goal: 'Start by setting q0 to 1, then move that 1 onto q1 so the result is 01.',
    hint: 'X on q0, then SWAP — or three alternating CNOTs.',
    requiresAny: ['SWAP', 'CNOT'],
    check: r => near(p(r, '01'), 1),
  },
  {
    id: 'ghz', title: 'Three-way entanglement', concept: 'GHZ state', qubits: 3, par: 3,
    story: 'Entanglement is not limited to pairs. The GHZ state links three qubits at once.',
    goal: 'Only 000 and 111, each 50 %.',
    hint: 'H on q0, then CNOT q0→q1 and CNOT q1→q2.',
    check: r => only(r, { '000': 0.5, '111': 0.5 }),
  },
  {
    id: 'and', title: 'A quantum AND gate', concept: 'Toffoli / reversible logic', qubits: 3, par: 3,
    story: 'Classical logic runs on quantum computers too — as long as it is reversible.',
    goal: 'Set both inputs q0 and q1 to 1 and write their AND onto q2 (result 111).',
    hint: 'X on q0 and q1, then a Toffoli with q2 as the target.',
    requiresAny: ['CCX'],
    check: r => near(p(r, '111'), 1),
  },
  {
    id: 'uniform', title: 'All at once', concept: 'Quantum parallelism', qubits: 3, par: 3,
    story: 'n qubits can hold 2ⁿ values simultaneously — this is what quantum algorithms exploit.',
    goal: 'Put all 8 outcomes (000 … 111) at exactly 12.5 % each.',
    hint: 'One H on every qubit.',
    check: r => r.states.every(s => near(s.probability, 0.125)),
  },
];

export function starsFor(level: Level, gates: number): number {
  if (gates <= level.par) return 3;
  if (gates <= level.par + 2) return 2;
  return 1;
}

export const BADGES = [
  { id: 'superposition', title: 'Superposition Starter', need: ['coin', 'tilt'] },
  { id: 'phase', title: 'Phase Master', need: ['minus'] },
  { id: 'entangler', title: 'Entanglement Engineer', need: ['bell', 'anti', 'ghz'] },
  { id: 'logic', title: 'Reversible Logician', need: ['swap', 'and'] },
  { id: 'graduate', title: 'Quantum Graduate', need: LEVELS.map(l => l.id) },
];
