import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { BRAND_FILL } from '../colors';

// Small building blocks shared by the lessons' See and Play steps.

/** The box that groups a step's controls. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-quantum-700 bg-quantum-900/40 p-4 sm:p-5 ${className}`}>{children}</div>;
}

/** A short hint under a picture. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 flex items-start gap-2 text-sm text-gray-400">
      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-quantum-purple" />
      <span>{children}</span>
    </p>
  );
}

export interface Option<T> {
  value: T;
  label: string;
  /** Background when picked; the brand gradient if not set. */
  fill?: string;
}

interface ChoiceProps<T> {
  /** Names the group for screen readers, and is shown unless hidden. */
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** Joined buttons in one rounded bar, one of them picked: "Qubit 1  [0 | Mix | 1]". */
export function Segmented<T extends string | number | boolean>({ label, detail, options, value, onChange, disabled = false }:
  ChoiceProps<T> & { detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-200 font-medium">
        {label}{detail && <span className="text-gray-400 font-normal"> · {detail}</span>}
      </span>
      <div role="group" aria-label={label} className="inline-flex rounded-full border border-quantum-600 bg-quantum-900/60 p-1">
        {options.map(o => {
          const on = o.value === value;
          return (
            <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={on} disabled={disabled}
              className={`min-w-[3.25rem] px-3 py-1.5 rounded-full text-sm font-semibold transition-colors disabled:cursor-default ${
                on ? 'text-black' : 'text-gray-300 hover:text-white disabled:hover:text-gray-300'}`}
              style={on ? { background: o.fill ?? BRAND_FILL } : undefined}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Separate pill buttons, one of them picked. The label sits above, beside them, or is only read out. */
export function Pills<T extends string | number>({ label, labelAt = 'top', options, value, onChange, disabled = false }:
  ChoiceProps<T> & { labelAt?: 'top' | 'side' | 'hidden' }) {
  const buttons = options.map(o => {
    const on = o.value === value;
    return (
      <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={on} disabled={disabled}
        className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors disabled:cursor-default ${
          on ? 'text-black border-transparent' : 'text-white bg-quantum-900/60 border-quantum-600 hover:border-quantum-neon/50 disabled:hover:border-quantum-600'}`}
        style={on ? { background: o.fill ?? BRAND_FILL } : undefined}>
        {o.label}
      </button>
    );
  });
  return (
    <div>
      {labelAt === 'top' && <p className="text-sm text-gray-200 font-medium mb-2">{label}</p>}
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
        {labelAt === 'side' && <span className="text-sm text-gray-400 mr-1" aria-hidden="true">{label}:</span>}
        {buttons}
      </div>
    </div>
  );
}
