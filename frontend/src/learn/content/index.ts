import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

// Each lesson's Read / See / Play / Check, by lesson slug. Downloaded only when
// that lesson is opened. Lessons not listed yet show "Coming soon".
export const LESSON_BODIES: Partial<Record<string, LazyExoticComponent<ComponentType>>> = {
  'bit-vs-qubit': lazy(() => import('./BitVsQubit')),
};
