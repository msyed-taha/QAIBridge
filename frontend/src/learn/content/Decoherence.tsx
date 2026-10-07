import { useId, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { Wind, Thermometer, Timer, Snowflake, Gauge, Check, X } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Pills, Tip } from '../components/ui';
import type { Option } from '../components/ui';
import { coherenceLeft, hThenHRight } from '../decoherence';
import type { Surroundings } from '../decoherence';
import { SPOT_NAMES, run, spotOf } from '../gates';
import type { GateName } from '../gates';
import { BRAND_FILL, GATE_COLORS, ZERO_COLOR } from '../colors';
import { replaceAt } from '../lists';

/** Lesson 7 — Decoherence. */
export default function Decoherence() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <TrimTheProgram />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Qubits are fragile" visual={<IconTile color="#ec4899"><Wind className="w-6 h-6" /></IconTile>}>
        A qubit's mix survives only while it's left <strong className="text-white">completely alone</strong>. The tiniest
        bump from the outside world can disturb it: a bit of heat, a stray particle of light, or a wobble in a
        magnetic field.
      </Point>

      <Point title="The world takes a peek" visual={<IconTile color="#f97316"><Thermometer className="w-6 h-6" /></IconTile>}>
        When something bumps into a qubit, a trace of its state leaks out into the surroundings. That works like a
        tiny measurement: the mix turns into a plain coin toss and can no longer interfere. This is called
        <strong className="text-white"> decoherence</strong>.
      </Point>

      <Point title="A ticking clock" visual={<IconTile color="#fbbf24"><Timer className="w-6 h-6" /></IconTile>}>
        Every qubit has a limited time before this happens, called its <strong className="text-white">coherence
        time</strong>. For the superconducting qubits in many quantum computers, it's around a tenth of a millisecond.
        Trapped-atom qubits can last seconds or more, but their gates are slower.
      </Point>

      <Point title="Colder than space" visual={<IconTile color="#22d3ee"><Snowflake className="w-6 h-6" /></IconTile>}>
        To keep noise out, many quantum computers sit inside special fridges at about
        <strong className="text-white"> −273°C</strong>, colder than outer space, shielded from light and magnetic fields.
      </Point>

      <Point title="Why it limits computers today" visual={<IconTile color="#a855f7"><Gauge className="w-6 h-6" /></IconTile>}>
        Each gate takes time and adds a small error, so a program has to finish before its qubits decohere. That's why
        today's machines can only run <strong className="text-white">short programs</strong>. The fix, quantum error
        correction, spreads each qubit's information over many qubits, but it needs hundreds of extra qubits for
        every reliable one.
      </Point>

      <GoodToKnow>
        decoherence is why you never see a coin or a cat in a mix. Big objects bump into air and light all the time,
        so their mix vanishes almost instantly.
      </GoodToKnow>
    </ReadList>
  );
}

// ── See: the noise race ───────────────────────────────────────────────────────

const pct = (x: number) => Math.round(x * 100);

const SURROUNDINGS: Option<Surroundings>[] = [
  { value: 'cold', label: 'Cold and shielded' },
  { value: 'some', label: 'A little noise' },
  { value: 'noisy', label: 'Noisy room' },
];

const MAX_GATES = 50;

function See() {
  const [where, setWhere] = useState<Surroundings>('some');
  const [gates, setGates] = useState(10);
  const sliderId = useId();
  const left = coherenceLeft(gates, where);

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">
        Choose where the qubit lives and how long the program is. Every gate takes a moment, and noise eats away at
        the mix while it runs.
      </p>

      <Panel className="space-y-5">
        <Pills label="Surroundings" options={SURROUNDINGS} value={where} onChange={setWhere} />
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor={sliderId} className="text-sm text-gray-200 font-medium">Program length</label>
            <span className="text-sm text-gray-300">{gates} {gates === 1 ? 'gate' : 'gates'}</span>
          </div>
          <input id={sliderId} type="range" min={0} max={MAX_GATES} step={1} value={gates}
            onChange={e => setGates(Number(e.target.value))} className="w-full accent-[#00ffcc] cursor-pointer" />
        </div>
      </Panel>

      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center">
        <NoiseBox surroundings={where} coherence={left} />
        <CoherenceChart surroundings={where} gates={gates} />
      </div>

      <div className="mt-6 rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3" aria-live="polite">
        <p className="text-white font-semibold">Coherence left after {gates} {gates === 1 ? 'gate' : 'gates'}: {pct(left)}%</p>
        <p className="mt-1 text-sm text-gray-300">
          The "H, then H" test from Lesson 5 now gives its right answer {pct(hThenHRight(left))}% of the time
          (100% with no noise).
        </p>
      </div>

      <Tip>
        Cold, shielded qubits keep their mix ten times longer here than in a little noise. That's why quantum
        computers live inside fridges, and why their programs must stay short.
      </Tip>
    </div>
  );
}

// Noise specks around the qubit, placed once with a fixed seed so they never jump between renders.
const SPECKS = (() => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 26 }, () => ({
    x: 15 + rand() * 270, y: 12 + rand() * 116,
    dx: (rand() - 0.5) * 90, dy: (rand() - 0.5) * 50,
    time: 2 + rand() * 3, delay: -rand() * 4,
  }));
})();
const SPECK_COUNT: Record<Surroundings, number> = { cold: 3, some: 10, noisy: 26 };

/** The qubit glowing in the middle, as bright as its coherence, with noise drifting around it. */
function NoiseBox({ surroundings, coherence }: { surroundings: Surroundings; coherence: number }) {
  return (
    <svg viewBox="0 0 300 150" className="w-full h-auto rounded-xl border border-quantum-700 bg-quantum-900/40" role="img"
      aria-label={`The qubit with ${SPECK_COUNT[surroundings]} specks of noise around it, glowing at ${pct(coherence)}%.`}>
      <defs>
        <radialGradient id="learn-qubit-glow">
          <stop offset="0" stopColor={ZERO_COLOR} stopOpacity="0.9" />
          <stop offset="1" stopColor={ZERO_COLOR} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="150" cy="70" r="38" fill="url(#learn-qubit-glow)" opacity={0.1 + 0.9 * coherence} className="transition-opacity duration-300" />
      <circle cx="150" cy="70" r="9" fill="#ffffff" opacity={0.3 + 0.7 * coherence} className="transition-opacity duration-300" />
      {SPECKS.slice(0, SPECK_COUNT[surroundings]).map((s, i) => (
        <circle key={i} className="learn-noise" cx={s.x} cy={s.y} r="2.5" fill="#fb7185" opacity="0.85"
          style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--t': `${s.time}s`, animationDelay: `${s.delay}s` } as CSSProperties} />
      ))}
      <text x="150" y="136" textAnchor="middle" fontSize="15" fill="#9ca3af">the qubit</text>
    </svg>
  );
}

const CHART = { w: 320, h: 184, left: 38, right: 14, top: 10, bottom: 28 };
const PLOT_W = CHART.w - CHART.left - CHART.right;
const PLOT_H = CHART.h - CHART.top - CHART.bottom;
const chartX = (gates: number) => CHART.left + (gates / MAX_GATES) * PLOT_W;
const chartY = (coherence: number) => CHART.top + (1 - coherence) * PLOT_H;

/** Coherence left against program length: one line, the program's length marked, and a hover readout. */
function CoherenceChart({ surroundings, gates }: { surroundings: Surroundings; gates: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const line = Array.from({ length: MAX_GATES + 1 }, (_, n) =>
    `${n ? 'L' : 'M'}${chartX(n).toFixed(1)},${chartY(coherenceLeft(n, surroundings)).toFixed(1)}`).join('');
  const at = coherenceLeft(gates, surroundings);
  const labelLeft = chartX(gates) > CHART.w - 60;

  const track = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * CHART.w;
    setHover(Math.max(0, Math.min(MAX_GATES, Math.round(((px - CHART.left) / PLOT_W) * MAX_GATES))));
  };

  return (
    <figure>
      <figcaption className="text-sm text-gray-300 mb-2">Coherence left (%), gate by gate</figcaption>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full h-auto select-none" onPointerMove={track} onPointerLeave={() => setHover(null)}
        role="img" aria-label={`Coherence falls from 100% as the gates go by. After ${gates} ${gates === 1 ? 'gate' : 'gates'}, ${pct(at)}% is left; after ${MAX_GATES}, ${pct(coherenceLeft(MAX_GATES, surroundings))}%.`}>
        {[0, 0.25, 0.5, 0.75, 1].map(c => (
          <line key={c} x1={CHART.left} x2={CHART.w - CHART.right} y1={chartY(c)} y2={chartY(c)} stroke="#7777ee" strokeOpacity="0.18" />
        ))}
        {[0, 0.5, 1].map(c => (
          <text key={c} x={CHART.left - 6} y={chartY(c)} textAnchor="end" dominantBaseline="central" fontSize="12" fill="#9ca3af">{pct(c)}%</text>
        ))}
        {[0, 10, 20, 30, 40, 50].map(n => (
          <text key={n} x={chartX(n)} y={CHART.h - 7} textAnchor="middle" fontSize="12" fill="#9ca3af">{n}</text>
        ))}

        <path d={line} fill="none" stroke={ZERO_COLOR} strokeWidth="2" strokeLinejoin="round" />

        {/* The program's length (its label steps aside while the hover readout is showing) */}
        <line x1={chartX(gates)} x2={chartX(gates)} y1={CHART.top} y2={CHART.h - CHART.bottom} stroke="#fbbf24" strokeOpacity="0.6" />
        <circle cx={chartX(gates)} cy={chartY(at)} r="4.5" fill="#fbbf24" stroke="#0a0a1e" strokeWidth="2" />
        {hover === null && <text x={chartX(gates) + (labelLeft ? -8 : 8)} y={chartY(at) - 8} textAnchor={labelLeft ? 'end' : 'start'} fontSize="13" fontWeight="600" fill="#f3f4f6">
          {pct(at)}%
        </text>}

        {hover !== null && <HoverReadout gates={hover} coherence={coherenceLeft(hover, surroundings)} />}
      </svg>
    </figure>
  );
}

/** The crosshair and value box shown where the pointer is over the chart. */
function HoverReadout({ gates, coherence }: { gates: number; coherence: number }) {
  const x = chartX(gates);
  const boxW = 136;
  const boxX = Math.min(Math.max(x - boxW / 2, CHART.left), CHART.w - CHART.right - boxW);
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={CHART.top} y2={CHART.h - CHART.bottom} stroke="#ffffff" strokeOpacity="0.35" />
      <circle cx={x} cy={chartY(coherence)} r="3.5" fill="#ffffff" />
      <rect x={boxX} y={CHART.top} width={boxW} height="22" rx="5" fill="#0a0a1e" stroke="#7777ee" strokeOpacity="0.5" />
      <text x={boxX + boxW / 2} y={CHART.top + 11} textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#f3f4f6">
        After {gates} {gates === 1 ? 'gate' : 'gates'}: {pct(coherence)}%
      </text>
    </g>
  );
}

// ── Play: Trim the program ────────────────────────────────────────────────────

// `lesson` gets which gates were removed, so it can match the player's own solution.
const LEVELS: { program: GateName[]; fewest: number; need: number; choose: boolean; goal: string; lesson: (removed: boolean[]) => string }[] = [
  { program: ['X', 'H', 'H', 'X', 'X'], fewest: 1, need: 0.8, choose: false,
    goal: 'This program runs in a little noise and needs at least 80% coherence left at the end. Remove gates that undo each other, without changing the answer.',
    lesson: () => 'Correct! X H H X X does exactly what a single X does, so the qubit is still almost fully coherent at the end.' },
  { program: ['H', 'Z', 'Z', 'H', 'X', 'Z'], fewest: 1, need: 0.8, choose: false,
    goal: 'Same again. Look closely: removing one pair can put another pair side by side.',
    lesson: removed => removed.slice(0, 4).every(Boolean)
      ? 'Correct! Z Z undid itself, which put H next to H, and they undid each other too.'
      : 'Correct! A Z on a plain 0 changes nothing you can measure, so your shorter program gives the same answer. '
        + 'Another way: remove Z Z, and then H H sit side by side and undo each other too.' },
  { program: ['H', 'X', 'X', 'Z', 'Z', 'H', 'H'], fewest: 1, need: 0.97, choose: true,
    goal: 'This one needs 97% coherence left. Trimming alone won\'t be enough: you can also move it somewhere quieter.',
    lesson: () => 'Correct! A shorter program in colder, quieter surroundings: that is how real quantum computers get the most out of their qubits.' },
];

const PLAY_SURROUNDINGS: Option<Surroundings>[] = [
  { value: 'some', label: 'A little noise' },
  { value: 'cold', label: 'Cold and shielded' },
];

function TrimTheProgram() {
  return (
    <GameLevels title="Trim the program" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [removed, setRemoved] = useState<boolean[]>(() => level.program.map(() => false));
  const [where, setWhere] = useState<Surroundings>('some');
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);

  const kept = level.program.filter((_, i) => !removed[i]);
  const shouldEnd = spotOf(run(level.program));
  const ends = spotOf(run(kept));
  const left = coherenceLeft(kept.length, where);

  const check = () => {
    if (ends !== shouldEnd) {
      fail(`Careful: without those gates the program ends at ${SPOT_NAMES[ends]}, not ${SPOT_NAMES[shouldEnd]}. Only remove gates that undo each other.`);
    } else if (left < level.need) {
      const hints = [
        kept.length > level.fewest ? 'Look for more gates that undo each other.' : '',
        level.choose && where !== 'cold' ? 'Try quieter surroundings too.' : '',
      ].filter(Boolean).join(' ');
      fail(`The answer is still right, but after ${kept.length} ${kept.length === 1 ? 'gate' : 'gates'} only ${pct(left)}% coherence is left. You need ${pct(level.need)}%. ${hints}`);
    } else {
      pass(level.lesson(removed));
    }
  };

  return (
    <div className="max-w-2xl">
      {level.choose && (
        <Panel className="mb-6">
          <Pills label="Surroundings" options={PLAY_SURROUNDINGS} value={where} disabled={solved}
            onChange={v => edit(() => setWhere(v))} />
        </Panel>
      )}

      <p className="text-sm text-gray-400 mb-3">The program: tap a gate to remove it, and tap again to put it back.</p>
      <ol className="flex flex-wrap gap-2" aria-label="The program">
        {level.program.map((g, i) => (
          <li key={i}>
            <button type="button" onClick={() => edit(() => setRemoved(r => replaceAt(r, i, !r[i])))} disabled={solved}
              aria-pressed={removed[i]} aria-label={`Gate ${g}, step ${i + 1}${removed[i] ? ', removed' : ''}`}
              className={`w-12 h-12 rounded-lg border-2 font-mono font-bold text-lg transition-all disabled:cursor-default ${
                removed[i] ? 'border-dashed opacity-35 line-through' : 'hover:brightness-125'}`}
              style={{ color: GATE_COLORS[g], borderColor: `${GATE_COLORS[g]}88`, background: `${GATE_COLORS[g]}1f` }}>
              {g}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-live="polite">
        <div className="rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3">
          <p className="text-xs text-gray-400">The answer</p>
          <p className={`mt-1 flex items-center gap-1.5 font-semibold ${ends === shouldEnd ? 'text-green-300' : 'text-red-300'}`}>
            {ends === shouldEnd ? <Check className="w-4 h-4" aria-hidden="true" /> : <X className="w-4 h-4" aria-hidden="true" />}
            Ends at {SPOT_NAMES[ends]}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {ends === shouldEnd ? 'Same as the full program.' : `The full program ends at ${SPOT_NAMES[shouldEnd]}.`}
          </p>
        </div>
        <div className="rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3">
          <p className="text-xs text-gray-400">Coherence at the end ({kept.length} {kept.length === 1 ? 'gate' : 'gates'})</p>
          <p className="mt-1 font-semibold text-white">{pct(left)}%</p>
          <div className="relative mt-1.5 mb-5 h-2 rounded-full bg-quantum-900/80 ring-1 ring-quantum-700" role="img"
            aria-label={`${pct(left)}% coherence left; ${pct(level.need)}% needed.`}>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct(left)}%`, background: BRAND_FILL }} />
            <span className="absolute -top-1 -bottom-1 w-0.5 bg-amber-400" style={{ left: `${pct(level.need)}%` }} />
            <span className="absolute top-full mt-1 -translate-x-full whitespace-nowrap text-[11px] text-amber-300" style={{ left: `${pct(level.need)}%` }}>
              need {pct(level.need)}%
            </span>
          </div>
        </div>
      </div>

      <CheckAnswer onCheck={check} result={result} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'What is decoherence?',
    options: [
      { text: "The qubit's mix leaks into its surroundings and becomes a plain coin toss", correct: true,
        why: 'Right! Bumps from the outside world act like tiny measurements, and the mix stops being quantum.' },
      { text: 'The qubit is measured on purpose', why: 'Not quite. Decoherence happens by accident, when the surroundings disturb the qubit.' },
      { text: 'The qubit breaks', why: 'Not quite. The qubit still works; it just loses its mix and becomes a plain coin toss.' },
      { text: "The qubit's battery runs out", why: 'Not quite. Qubits have no battery. Noise from the surroundings slowly destroys the mix.' },
    ],
  },
  {
    question: 'True or false? Many quantum computers are kept colder than outer space to protect their qubits from noise.',
    options: [
      { text: 'True', correct: true, why: 'Right! Their fridges reach about −273°C, which keeps heat noise away from the qubits.' },
      { text: 'False', why: 'Not quite. Many really are kept at about −273°C, colder than outer space, to keep noise out.' },
    ],
  },
  {
    question: 'Why do shorter programs work better on today\'s quantum computers?',
    options: [
      { text: 'They finish before the qubits lose their quantum state', correct: true,
        why: 'Right! Every gate takes time, and the mix fades as time passes. Fewer gates leave more of it.' },
      { text: 'They use less electricity', why: 'Not quite. The problem is time: the mix fades while a long program is still running.' },
      { text: "Long programs aren't allowed", why: 'Not quite. They are allowed, but the qubits lose their mix before a long program can finish.' },
      { text: 'Short programs are more random', why: 'Not quite. It is the other way round: long programs end up more random, because the mix has faded.' },
    ],
  },
];
