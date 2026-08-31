interface Props {
  value: number;
  onChange: (n: number) => void;
}

// Memory required = 2^n × 16 bytes (complex128 state vector)
const RAM_LABELS: Record<number, string> = {
  1:  '32 B',   2:  '64 B',   3:  '128 B',  4:  '256 B',
  5:  '512 B',  6:  '1 KB',   7:  '2 KB',   8:  '4 KB',
  9:  '8 KB',   10: '16 KB',  11: '32 KB',  12: '64 KB',
  13: '128 KB', 14: '256 KB', 15: '512 KB', 16: '1 MB',
  17: '2 MB',   18: '4 MB',   19: '8 MB',   20: '16 MB',
  21: '32 MB',  22: '64 MB',  23: '128 MB', 24: '256 MB',
  25: '512 MB', 26: '1 GB',   27: '2 GB',   28: '4.3 GB',
};

// Colour zones:  safe (1–20) → caution (21–25) → heavy (26–28)
function ramColour(n: number): string {
  if (n <= 20) return 'text-quantum-neon';
  if (n <= 25) return 'text-yellow-400';
  return 'text-orange-400';
}

function trackColour(n: number): string {
  if (n <= 20) return '#00ffcc';   // teal
  if (n <= 25) return '#facc15';   // yellow
  return '#fb923c';                 // orange
}

export function QubitSlider({ value, onChange }: Props) {
  const colour     = ramColour(value);
  const trackColor = trackColour(value);
  const pct        = ((value - 1) / (28 - 1)) * 100;

  return (
    <div>
      {/* Top labels */}
      <div className="flex justify-between text-xs text-gray-400 mb-2">
        <span>1 qubit</span>
        <span className={`font-bold text-sm ${colour}`}>{value} qubits</span>
        <span>28 qubits</span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={1}
          max={28}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${trackColor} ${pct}%, #374151 ${pct}%)`,
          }}
        />
      </div>

      {/* Zone markers */}
      <div className="flex justify-between mt-1.5 text-[10px] select-none">
        <span className="text-quantum-neon/60">─── Safe (≤20)</span>
        <span className="text-yellow-400/60">Caution (21–25)</span>
        <span className="text-orange-400/60">Heavy (26–28) ───</span>
      </div>

      {/* Stats row */}
      <div className="flex justify-between mt-3 text-xs">
        <span className="text-gray-400">
          State vector:{' '}
          <span className="text-white font-mono">
            2<sup>{value}</sup> = {(2 ** value).toLocaleString()}
          </span>{' '}
          amplitudes
        </span>
        <span className={`font-mono font-semibold ${colour}`}>
          {RAM_LABELS[value] ?? '?'}
        </span>
      </div>

      {/* Inline warning for heavy range */}
      {value >= 26 && (
        <p className="mt-2 text-[11px] text-orange-400/80 leading-relaxed">
          ⚠ {value} qubits requires ~{RAM_LABELS[value]} of RAM.
          Simulation may take several seconds and apply significant memory pressure.
        </p>
      )}
      {value >= 21 && value <= 25 && (
        <p className="mt-2 text-[11px] text-yellow-400/70 leading-relaxed">
          ⚡ {value} qubits requires ~{RAM_LABELS[value]} of RAM — expect slower simulation.
        </p>
      )}
    </div>
  );
}
