import { useId, useState } from 'react';
import { angleLabel, angleText, parseAngle } from './qasm';

const QUICK = [Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
const STEPS = 24;                        // the slider moves in 15° steps, from 0 to 2π

interface Props {
  value: number;
  onChange: (angle: number) => void;
}

/** A rotation gate's angle: typed (pi/8, 3*pi/4, 0.5), slid, or picked in one tap. */
export function AngleField({ value, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(() => angleText(value));
  const [shown, setShown] = useState(value);
  const [bad, setBad] = useState(false);

  // Changed from outside (the slider, a quick pick, undo): show the new angle.
  if (value !== shown) {
    setShown(value);
    setText(angleText(value));
    setBad(false);
  }

  const apply = () => {
    const v = parseAngle(text);
    if (v === null) { setBad(true); return; }
    if (v !== value) onChange(v);
    else setText(angleText(v));
  };

  const step = Math.min(STEPS, Math.max(0, Math.round((value / (2 * Math.PI)) * STEPS)));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label htmlFor={id} className="text-sm text-gray-300">Angle θ</label>
      <input id={id} value={text} onChange={e => { setText(e.target.value); setBad(false); }}
        onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
        spellCheck={false} autoComplete="off" autoCapitalize="off"
        aria-invalid={bad || undefined} aria-describedby={`${id}-help`}
        className={`w-28 bg-quantum-900 border rounded-lg px-2.5 py-1.5 text-sm font-mono text-white ${bad ? 'border-red-700' : 'border-quantum-600'}`} />
      <input type="range" min={0} max={STEPS} value={step} aria-label="Angle θ, in steps of π/12"
        aria-valuetext={angleLabel(value)}
        onChange={e => onChange((Number(e.target.value) / STEPS) * 2 * Math.PI)} className="w-32 accent-emerald-400" />
      <div className="flex gap-1.5">
        {QUICK.map(v => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={Math.abs(v - value) < 1e-9}
            className={`text-xs font-mono px-2 py-1 rounded-md border ${Math.abs(v - value) < 1e-9 ? 'border-emerald-400 text-emerald-200' : 'border-quantum-600 text-gray-300 hover:border-quantum-400'}`}>
            {angleLabel(v)}
          </button>
        ))}
      </div>
      <p id={`${id}-help`} className={`basis-full text-xs ${bad ? 'text-red-300' : 'text-gray-400'}`}>
        {bad
          ? "Couldn't read that. Type an angle like pi/8, 3*pi/4 or 0.5."
          : 'Type it like pi/8, 3*pi/4 or 0.5 (in radians), then press Enter.'}
      </p>
    </div>
  );
}
