import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

// Each lesson's Read / See / Play / Test, by lesson slug. Downloaded only when
// that lesson is opened. Lessons not listed yet show "Coming soon".
export const LESSON_BODIES: Partial<Record<string, LazyExoticComponent<ComponentType>>> = {
  'bit-vs-qubit': lazy(() => import('./BitVsQubit')),
  'superposition': lazy(() => import('./Superposition')),
  'measurement': lazy(() => import('./Measurement')),
  'quantum-gates': lazy(() => import('./QuantumGates')),
  'interference': lazy(() => import('./Interference')),
  'entanglement': lazy(() => import('./Entanglement')),
  'decoherence': lazy(() => import('./Decoherence')),
};
