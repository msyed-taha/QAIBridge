import { useId } from 'react';
import { deg, rad, percentages } from '../qubit';
import type { QubitState } from '../qubit';
import { ZERO_COLOR, ONE_COLOR } from '../colors';

type Change = (s: QubitState, final: boolean) => void;

/** Tilt slider: 0° points at 0, 180° points at 1. Also the keyboard way to move the arrow. */
export function TiltSlider({ state, onChange }: { state: QubitState; onChange: Change }) {
  return (
    <Slider label="Tilt" value={Math.round(deg(state.theta))} max={180} ends={['0', '1']}
      onChange={v => onChange({ theta: rad(v), phi: state.phi }, true)} />
  );
}

/** Turn slider: spins the arrow around the middle. */
export function TurnSlider({ state, onChange }: { state: QubitState; onChange: Change }) {
  return (
    <Slider label="Turn" value={Math.round(deg(state.phi)) % 360} max={359}
      onChange={v => onChange({ theta: state.theta, phi: rad(v) }, true)} />
  );
}

function Slider({ label, value, max, ends, onChange }: {
  label: string; value: number; max: number; ends?: [string, string]; onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label htmlFor={id} className="text-sm text-gray-200 font-medium">{label}</label>
        <span className="font-mono text-sm text-gray-300">{value}°</span>
      </div>
      <input id={id} type="range" min={0} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#00ffcc] cursor-pointer" />
      {ends && (
        <div className="flex justify-between font-mono text-xs text-gray-400 mt-0.5" aria-hidden="true">
          <span>{ends[0]}</span><span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

/** The chance of reading 0 and of reading 1, as one split bar.
 *  `compact` shortens the labels for narrow spaces. */
export function OddsBar({ state, compact = false }: { state: QubitState; compact?: boolean }) {
  const [p0, p1] = percentages(state);
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-quantum-900/80" role="img"
        aria-label={`${p0}% chance of 0, ${p1}% chance of 1`}>
        <div style={{ width: `${p0}%`, background: ZERO_COLOR }} />
        <div style={{ width: `${p1}%`, background: ONE_COLOR }} />
      </div>
      <div className="mt-2 flex justify-between text-sm font-medium" aria-hidden="true">
        <span className="text-quantum-neon">{compact ? `0: ${p0}%` : `${p0}% chance of 0`}</span>
        <span className="text-quantum-purple">{compact ? `1: ${p1}%` : `${p1}% chance of 1`}</span>
      </div>
    </div>
  );
}
