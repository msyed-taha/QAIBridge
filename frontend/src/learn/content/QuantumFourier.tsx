import { useId, useState } from 'react';
import { Repeat, SlidersHorizontal, Zap, LockOpen, Hourglass, ArrowRight } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Pills, Segmented, Tip } from '../components/ui';
import type { Option } from '../components/ui';
import { SIZE, gcd, litSteps, powerRemainders, qftChances } from '../qft';
import { ZERO_COLOR } from '../colors';
import { joinWithAnd, replaceAt } from '../lists';

/** Lesson 8 — Quantum Fourier Transform. */
export default function QuantumFourier() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <TuneIn />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Patterns that repeat" visual={<IconTile color="#f97316"><Repeat className="w-6 h-6" /></IconTile>}>
        Lots of things repeat: a heartbeat, the seasons, a song's beat. The number of steps before a pattern starts
        again is its <strong className="text-white">rhythm</strong>, also called its period. It's easy to spot when the
        pattern is short.
      </Point>

      <Point title="Splitting a pattern into rhythms" visual={<IconTile color="#22d3ee"><SlidersHorizontal className="w-6 h-6" /></IconTile>}>
        A <strong className="text-white">Fourier transform</strong> takes a pattern and shows which rhythms are inside
        it. It's like the bars jumping on a music player's equaliser, or a prism splitting light into colours. Your
        phone uses this kind of maths all the time to shrink music and photos.
      </Point>

      <Point title="The quantum version" visual={<IconTile color="#a855f7"><Zap className="w-6 h-6" /></IconTile>}>
        The <strong className="text-white">Quantum Fourier Transform</strong> (QFT) does this to all the patterns in a
        mix of qubits at once. Thanks to interference (Lesson 5), the wrong rhythms cancel out. So when you measure, you
        land on a number that reveals the hidden rhythm.
      </Point>

      <Point title="Cracking codes" visual={<IconTile color="#ec4899"><LockOpen className="w-6 h-6" /></IconTile>}>
        Much of today's internet security relies on one fact: multiplying two huge prime numbers is easy, but splitting
        the result back apart is incredibly hard. In 1994, Peter Shor showed that a quantum computer could do it by
        turning the problem into <strong className="text-white">finding a rhythm</strong>, using the QFT.
      </Point>

      <Point title="How far away is it?" visual={<IconTile color="#fbbf24"><Hourglass className="w-6 h-6" /></IconTile>}>
        A 2025 estimate says breaking today's 2048-bit codes would take about <strong className="text-white">a million
        qubits</strong> running for about a week. Today's machines have hundreds to around a thousand qubits, with too
        much noise (Lesson 7). Even so, new quantum-safe codes are already being rolled out.
      </Point>

      <GoodToKnow>
        the QFT is incredibly fast. On n qubits it needs only about n² gates, where a normal computer needs about
        n × 2ⁿ steps for the same job. But you can't read the whole result, only one measured number, so it pays off
        only inside clever algorithms like Shor's.
      </GoodToKnow>
    </ReadList>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

const LOUD = 0.01;            // a chance above this counts as "loud"
const pct = (x: number) => Math.round(x * 100);
const STEPS = Array.from({ length: SIZE }, (_, i) => i);

/** The 16 steps of a pattern. Lit steps glow; `hidden` shows "?" in every step; `labels` writes a value in each. */
function PatternStrip({ lit, hidden = false, labels }: { lit: number[]; hidden?: boolean; labels?: (number | string)[] }) {
  const on = new Set(lit);
  return (
    <div>
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5 sm:gap-1" role="img"
        aria-label={hidden ? 'A hidden pattern of 16 steps.' : `A pattern of 16 steps, lit at steps ${joinWithAnd(lit.map(String))}.`}>
        {STEPS.map(x => (
          <span key={x} className={`aspect-square rounded-md flex items-center justify-center font-mono text-[11px] font-bold transition-colors ${
            hidden ? 'border border-dashed border-quantum-600 text-gray-500'
              : on.has(x) ? 'text-black shadow-[0_0_12px_rgba(0,255,204,0.35)]' : 'border border-quantum-700 bg-quantum-900/40 text-gray-500'}`}
            style={!hidden && on.has(x) ? { background: ZERO_COLOR } : undefined}>
            {hidden ? '?' : labels?.[x]}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5 sm:gap-1" aria-hidden="true">
        {STEPS.map(x => <span key={x} className="text-center text-[11px] text-gray-500">{x}</span>)}
      </div>
    </div>
  );
}

const CHART = { w: 320, h: 176, left: 34, right: 6, top: 20, bottom: 24 };
const PLOT_W = CHART.w - CHART.left - CHART.right;
const PLOT_H = CHART.h - CHART.top - CHART.bottom;
const SLOT = PLOT_W / SIZE;
const Y_MAX = 0.5;            // no chance here is above 50%
const barX = (k: number) => CHART.left + k * SLOT + 1;          // a 2px gap between bars
const barTop = (chance: number) => CHART.top + (1 - chance / Y_MAX) * PLOT_H;
const BASE = CHART.top + PLOT_H;

/** A bar with rounded top corners, sitting on the baseline. */
function barPath(x: number, top: number, w: number) {
  const r = Math.min(4, (BASE - top) / 2, w / 2);
  return `M${x},${BASE}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${BASE}Z`;
}

/**
 * The chance of each number 0–15 after the QFT, as bars. In the game only the
 * `revealed` numbers are shown, and `marker` marks the number tuned to.
 */
function ChanceChart({ chances, revealed, marker }: { chances: number[]; revealed?: boolean[]; marker?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = (k: number) => !revealed || revealed[k];
  const loud = STEPS.filter(k => shown(k) && chances[k] > LOUD);
  const w = SLOT - 2;
  return (
    <figure className="max-w-[26rem]">
      <figcaption className="text-sm text-gray-300 mb-2">Chance the QFT gives each number</figcaption>
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full h-auto select-none" onPointerLeave={() => setHover(null)} role="img"
        aria-label={loud.length
          ? `Loud numbers: ${loud.map(k => `${k} at ${pct(chances[k])}%`).join(', ')}. ${revealed ? 'Other numbers are quiet or not tuned to yet.' : 'All the others are 0%.'}`
          : 'No loud numbers found yet.'}>
        {[0, 0.25, 0.5].map(c => (
          <g key={c}>
            <line x1={CHART.left} x2={CHART.w - CHART.right} y1={barTop(c)} y2={barTop(c)} stroke="#7777ee" strokeOpacity="0.18" />
            <text x={CHART.left - 6} y={barTop(c)} textAnchor="end" dominantBaseline="central" fontSize="12" fill="#9ca3af">{pct(c)}%</text>
          </g>
        ))}
        {marker !== undefined && <rect x={barX(marker) - 1} y={CHART.top} width={SLOT} height={PLOT_H} rx="3" fill="#fbbf24" fillOpacity="0.1" />}
        {STEPS.map(k => shown(k)
          ? chances[k] > LOUD && <path key={k} d={barPath(barX(k), barTop(chances[k]), w)} fill={ZERO_COLOR} fillOpacity={hover === null || hover === k ? 1 : 0.55} />
          : <text key={k} x={barX(k) + w / 2} y={BASE - 6} textAnchor="middle" fontSize="11" fill="#6b7280">?</text>)}
        {/* Selective labels: the number under each loud bar, and the % above the tall ones */}
        {loud.map(k => (
          <g key={k}>
            <text x={barX(k) + w / 2} y={CHART.h - 7} textAnchor="middle" fontSize="12" fill="#e5e7eb">{k}</text>
            {chances[k] >= 0.2 && (
              <text x={barX(k) + w / 2} y={barTop(chances[k]) - 5} textAnchor="middle" fontSize="11" fill="#e5e7eb">{pct(chances[k])}%</text>
            )}
          </g>
        ))}
        {marker !== undefined && !loud.includes(marker) && (
          <text x={barX(marker) + w / 2} y={CHART.h - 7} textAnchor="middle" fontSize="12" fill="#fbbf24">{marker}</text>
        )}
        {/* Hover: each column is its own target, taller and wider than its bar */}
        {STEPS.map(k => shown(k) && (
          <rect key={k} x={barX(k) - 1} y={CHART.top} width={SLOT} height={PLOT_H} fill="transparent" onPointerEnter={() => setHover(k)} />
        ))}
        {hover !== null && shown(hover) && <BarReadout k={hover} chance={chances[hover]} />}
      </svg>
    </figure>
  );
}

function BarReadout({ k, chance }: { k: number; chance: number }) {
  const boxW = 112;
  const cx = barX(k) + (SLOT - 2) / 2;
  const x = Math.min(Math.max(cx - boxW / 2, CHART.left), CHART.w - CHART.right - boxW);
  return (
    <g pointerEvents="none">
      <rect x={x} y={0} width={boxW} height="18" rx="5" fill="#0a0a1e" stroke="#7777ee" strokeOpacity="0.5" />
      <text x={x + boxW / 2} y={9} textAnchor="middle" dominantBaseline="central" fontSize="11.5" fill="#f3f4f6">
        Number {k}: {pct(chance)}%
      </text>
    </g>
  );
}

// ── See: the rhythm finder ────────────────────────────────────────────────────

const PERIODS: Option<number>[] = [2, 4, 8].map(p => ({ value: p, label: String(p) }));

function See() {
  const [period, setPeriod] = useState(4);
  const [start, setStart] = useState(0);
  const lit = litSteps(period, start);
  const gap = SIZE / period;

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">
        Four qubits hold the numbers 0 to 15. Light up a repeating pattern, and the QFT turns it into the chance of
        measuring each number.
      </p>

      <Panel className="space-y-4">
        <Segmented label="Repeats every (steps)" options={PERIODS} value={period} onChange={p => { setPeriod(p); setStart(0); }} />
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-200 font-medium">Starts at step {start}</span>
          <button type="button" onClick={() => setStart(s => (s + 1) % period)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold border border-quantum-600 text-white bg-quantum-900/60 hover:border-quantum-neon/50 transition-colors">
            Shift it <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Panel>

      <div className="mt-8">
        <p className="text-sm text-gray-300 mb-2">The pattern</p>
        <PatternStrip lit={lit} />
      </div>
      <div className="mt-8"><ChanceChart chances={qftChances(lit)} /></div>

      <p className="mt-3 text-gray-200" aria-live="polite">
        The peaks are <strong className="text-white">{gap} apart</strong>, so the rhythm is 16 ÷ {gap} = {period}.
      </p>

      <Tip>
        Press <strong className="text-gray-200">Shift it</strong> and watch the bars: they don't move. The QFT finds the
        rhythm wherever the pattern starts, which is exactly what Shor's algorithm needs.
      </Tip>
    </div>
  );
}

// ── Play: Tune in ─────────────────────────────────────────────────────────────

const SHOR_REMAINDERS = powerRemainders(7, 15);
const SHOR_HALF = 7 ** 2;     // 7 to the power (rhythm ÷ 2)

const LEVELS: { lit: number[]; period: number; labels?: number[]; goal: string; lesson: string }[] = [
  { lit: litSteps(2, 1), period: 2,
    goal: 'A pattern of 16 steps is hidden. Turn the dial to hear how loud each number is after the QFT, then pick the rhythm.',
    lesson: 'Correct! The loud numbers are 0 and 8, which are 8 apart, and 16 ÷ 8 = 2. The pattern repeats every 2 steps.' },
  { lit: litSteps(8, 3), period: 8,
    goal: 'Another hidden pattern. Tune to plenty of numbers before you decide.',
    lesson: 'Correct! Every even number is loud, so they are 2 apart, and 16 ÷ 2 = 8. If you had tuned to only 0 and 8, it would have looked like a rhythm of 2: more looks give a surer answer.' },
  { lit: STEPS.filter(x => SHOR_REMAINDERS[x] === 7), period: 4, labels: SHOR_REMAINDERS,
    goal: 'Crack 15, the way Shor\'s algorithm does. The hidden pattern comes from the remainders of 7, 7 × 7, 7 × 7 × 7 and so on, after dividing by 15. Find its rhythm.',
    lesson: `Correct! The rhythm is 4. Shor's last step: 7 × 7 = ${SHOR_HALF}, and the numbers either side of it, ${SHOR_HALF - 1} and `
      + `${SHOR_HALF + 1}, share the factors ${gcd(SHOR_HALF - 1, 15)} and ${gcd(SHOR_HALF + 1, 15)} with 15. So 15 = 3 × 5.` },
];

const RHYTHMS: Option<number>[] = [2, 4, 8].map(p => ({ value: p, label: `Every ${p} steps` }));

function TuneIn() {
  return (
    <GameLevels title="Tune in" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const chances = qftChances(level.lit);
  const [dial, setDial] = useState(0);
  const [tuned, setTuned] = useState<boolean[]>(() => STEPS.map(k => k === 0));
  const [answer, setAnswer] = useState<number | null>(null);
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const dialId = useId();

  // Tuning only listens, so it never clears the answer or its message.
  const tune = (k: number) => {
    setDial(k);
    setTuned(t => (t[k] ? t : replaceAt(t, k, true)));
  };
  const loudFound = STEPS.filter(k => tuned[k] && chances[k] > LOUD);
  const tunedCount = tuned.filter(Boolean).length;

  const check = () => {
    if (answer === level.period) {
      pass(level.lesson);
    } else {
      fail('Not quite. '
        + (loudFound.length >= 2 ? `The loud numbers you found are ${joinWithAnd(loudFound.map(String))}. ` : 'Tune to more numbers first. ')
        + 'The rhythm is 16 ÷ the gap between loud numbers.'
        + (tunedCount < SIZE ? ' There may be loud ones you haven\'t tuned to yet.' : ''));
    }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-300 mb-2">{solved ? 'The pattern was' : 'The hidden pattern'}</p>
      <PatternStrip lit={level.lit} hidden={!solved} labels={level.labels} />

      <Panel className="mt-6">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <label htmlFor={dialId} className="text-sm text-gray-200 font-medium">Tune to number</label>
          <span className="text-sm font-semibold text-white">{dial}</span>
        </div>
        <input id={dialId} type="range" min={0} max={SIZE - 1} step={1} value={dial}
          onChange={e => tune(Number(e.target.value))} className="w-full accent-[#fbbf24] cursor-pointer" />
        <p className="mt-2 text-sm" aria-live="polite">
          {chances[dial] > LOUD
            ? <span className="text-white font-semibold">{dial} is loud: the QFT gives it {pct(chances[dial])}% of the time.</span>
            : <span className="text-gray-400">{dial} is silent: the QFT never gives it.</span>}
        </p>
      </Panel>

      <div className="mt-6"><ChanceChart chances={chances} revealed={tuned} marker={dial} /></div>
      <p className="mt-2 text-sm text-gray-300">
        Loud so far: {loudFound.length ? <strong className="text-white">{joinWithAnd(loudFound.map(String))}</strong> : 'none yet'}
        <span className="text-gray-500"> · tuned to {tunedCount} of {SIZE}</span>
      </p>

      <div className="mt-6">
        <Pills label="The rhythm" options={RHYTHMS} value={answer} disabled={solved} onChange={v => edit(() => setAnswer(v))} />
      </div>
      <CheckAnswer onCheck={check} result={result} disabled={answer === null} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'What does a Fourier transform do?',
    options: [
      { text: 'Shows which rhythms are hidden inside a pattern', correct: true,
        why: 'Right! Like an equaliser on a music player, it splits a pattern into its rhythms.' },
      { text: 'Makes a pattern longer', why: 'Not quite. It doesn\'t change the pattern; it shows which rhythms are inside it.' },
      { text: 'Encrypts a message', why: 'Not quite. It finds rhythms. Shor\'s algorithm uses that to break codes, not to make them.' },
      { text: 'Measures a qubit', why: 'Not quite. The QFT is a set of gates. Measuring comes afterwards.' },
    ],
  },
  {
    question: "Why could Shor's algorithm break today's internet codes?",
    options: [
      { text: "It finds the hidden rhythm that reveals a big number's prime factors", correct: true,
        why: 'Right! Splitting a big number into its primes becomes a rhythm-finding problem, which the QFT solves fast.' },
      { text: 'It guesses passwords very fast', why: 'Not quite. It doesn\'t guess. It finds a rhythm that reveals the prime factors.' },
      { text: 'It reads every answer at once', why: 'Not quite. You only ever measure one answer. Interference makes it a useful one.' },
      { text: 'It sends messages through entanglement', why: 'Not quite. Entanglement can\'t send messages (Lesson 6). Shor\'s algorithm finds a rhythm.' },
    ],
  },
  {
    question: 'True or false? Today\'s quantum computers can already break the codes that protect online banking.',
    options: [
      { text: 'True', why: 'Not quite. It would take about a million qubits for about a week. Today\'s machines are far smaller and noisier.' },
      { text: 'False', correct: true, why: 'Right! Today\'s machines are far too small and noisy. It would take about a million qubits for about a week.' },
    ],
  },
];
