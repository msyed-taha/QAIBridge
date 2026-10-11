import { useId, useState } from 'react';
import type { SimulationResult } from '../../types';
import { formatChance, ket } from './format';

const MAX_ROWS = 16;

/** A turn drawn like a clock hand: 0° points right, 90° points up. */
function TurnDial({ deg }: { deg: number }) {
  const rad = deg * Math.PI / 180;
  return (
    <svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true" className="shrink-0">
      <circle r="8.5" fill="none" stroke="#3a3a7a" strokeWidth="1.5" />
      <line x1="0" y1="0" x2={7.5 * Math.cos(rad)} y2={-7.5 * Math.sin(rad)} stroke="#00ffcc" strokeWidth="2" strokeLinecap="round" />
      <circle r="1.5" fill="#00ffcc" />
    </svg>
  );
}

const size = (m: number) => (m >= 0.001 ? m.toFixed(3) : m.toPrecision(2));
const turn = (deg: number) => {
  const d = Math.round(deg * 10) / 10;
  return `${Object.is(d, -0) || d === -180 ? Math.abs(d) : d}°`;
};

/**
 * What sits behind each chance: an amplitude with a size and a turn (phase).
 * The turns are what make outcomes cancel or add up when gates mix them.
 */
export function AmplitudesView({ result }: { result: SimulationResult }) {
  const [find, setFind] = useState('');
  const inputId = useId();
  const hintId = useId();
  const n = result.n_qubits;
  const all = [...result.amplitudes].sort((a, b) => b.probability - a.probability);
  const wanted = find.trim();
  const valid = /^[01]*$/.test(wanted) && wanted.length <= n;
  const matches = wanted && valid ? all.filter(a => a.state.slice(1).startsWith(wanted)) : all;
  const rows = matches.slice(0, MAX_ROWS);
  const listedAll = !result.truncated && all.length === Object.keys(result.probabilities).length;
  const smallest = all[all.length - 1]?.probability ?? 0;

  let note: string | null = null;
  if (!valid) note = wanted.length > n ? `Outcomes of this circuit have ${n} digits.` : 'Use only the digits 0 and 1.';
  else if (wanted && !matches.length) {
    note = wanted.length < n
      ? `No outcome starting with ${wanted} has a real chance.`
      : listedAll
        ? `${ket(`|${wanted}>`)} has no real chance (less than 1 in a billion).`
        : `${ket(`|${wanted}>`)} isn't among the ${all.length.toLocaleString()} likeliest outcomes, so its chance is at most ${formatChance(smallest)}.`;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-300 leading-relaxed">
        Behind every chance is an <strong className="text-white">amplitude</strong>, which has a size and a turn. The chance
        is the size squared (0.707 × 0.707 = 50%). A turn never changes a chance on its own, but when gates mix outcomes,
        outcomes turned opposite ways cancel out. That is interference, and quantum algorithms are built on it.
      </p>

      <div>
        <label htmlFor={inputId} className="block text-xs text-gray-400 mb-1">Find an outcome</label>
        <input id={inputId} value={find} onChange={e => setFind(e.target.value)} inputMode="numeric" autoComplete="off"
          spellCheck={false} placeholder={`e.g. ${'01'.repeat(n).slice(0, Math.min(n, 6))}`} aria-describedby={hintId}
          aria-invalid={!valid || undefined}
          className={`w-full sm:w-64 bg-quantum-700 border rounded-lg px-3 py-2 text-sm font-mono text-gray-100 placeholder:text-gray-400 ${
            valid ? 'border-quantum-600' : 'border-red-700'}`} />
        <p id={hintId} className={`text-xs mt-1 ${note ? (valid ? 'text-amber-300' : 'text-red-300') : 'text-gray-400'}`}>
          {note ?? 'Type the first digits (q[0] first), or the whole outcome.'}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Amplitude of each outcome: its size, its turn and the chance it gives</caption>
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-quantum-600">
                <th scope="col" className="py-2 pr-3 font-medium">Outcome</th>
                <th scope="col" className="py-2 pr-3 font-medium text-right">Size</th>
                <th scope="col" className="py-2 pr-3 font-medium">Turn</th>
                <th scope="col" className="py-2 font-medium text-right">Chance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.state} className="border-b border-quantum-700/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 font-mono font-normal text-quantum-neon text-left text-xs sm:text-sm break-all">{ket(a.state)}</th>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-200">{size(a.magnitude)}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 tabular-nums text-gray-200">
                      <TurnDial deg={a.phase_deg} />{turn(a.phase_deg)}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-white whitespace-nowrap">{formatChance(a.probability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 leading-relaxed">
        {matches.length > rows.length && <>Showing the {rows.length} likeliest of {matches.length.toLocaleString()}{wanted ? ' matching' : ''} outcomes. </>}
        A turn is drawn like a clock hand: 0° points right and 90° points up. Only differences between turns matter;
        turning every outcome by the same amount changes nothing you could measure.
      </p>
    </div>
  );
}
