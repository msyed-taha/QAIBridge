// The Circuit Builder's circuit written as OpenQASM 2.0, the text format the
// Quantum Simulator (and Qiskit, IBM Quantum, Cirq …) read.

export interface KernelOp { gate: string; qubits: number[]; params: number[] }

const NAMES: Record<string, string> = { CNOT: 'cx', CCX: 'ccx', SDG: 'sdg', TDG: 'tdg', SX: 'sx' };

/** Angles the way people write them: pi/2, 3*pi/4, -pi/3; anything else as a plain number. */
export function angleText(t: number): string {
  const f = t / Math.PI;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(f * q);
    if (Math.abs(f - p / q) > 1e-9) continue;
    if (p === 0) return '0';
    const g = gcd(Math.abs(p), q);
    const [num, den] = [p / g, q / g];
    const top = Math.abs(num) === 1 ? 'pi' : `${Math.abs(num)}*pi`;
    return `${num < 0 ? '-' : ''}${top}${den === 1 ? '' : `/${den}`}`;
  }
  return String(Number(t.toPrecision(12)));
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Gates in time order (as the kernel takes them) → an OpenQASM 2.0 file. */
export function builderQasm(ops: KernelOp[], nQubits: number): string {
  const lines = [
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
    '',
    '// Built in the QAIbridge Circuit Builder',
    `qreg q[${nQubits}];`,
    `creg c[${nQubits}];`,
    '',
  ];
  for (const op of ops) {
    const name = NAMES[op.gate] ?? op.gate.toLowerCase();
    const args = op.params.length ? `(${op.params.map(angleText).join(', ')})` : '';
    lines.push(`${name}${args} ${op.qubits.map(q => `q[${q}]`).join(', ')};`);
  }
  if (ops.length) lines.push('');
  lines.push('measure q -> c;', '');
  return lines.join('\n');
}
