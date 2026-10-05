import { useId, useState } from 'react';
import { Waves, VolumeX, Split, Target, Sparkles } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer } from '../components/GameLevels';
import type { CheckResult } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import { brightness, mixStrength, waveAt } from '../waves';

/** Lesson 5 — Interference. */
export default function Interference() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <WavePuzzles />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <div className="space-y-8 max-w-2xl">
      <Point title="Waves can add up" visual={<IconTile color="#22d3ee"><Waves className="w-6 h-6" /></IconTile>}>
        Drop two stones in a pond and their ripples meet. Where two crests meet, they make a
        <strong className="text-white"> bigger wave</strong>. This is called <em>interference</em>.
      </Point>

      <Point title="Waves can cancel out" visual={<IconTile color="#ec4899"><VolumeX className="w-6 h-6" /></IconTile>}>
        Where a crest meets a dip, they <strong className="text-white">cancel</strong> and the water goes flat.
        Noise-cancelling headphones use this trick. They play a flipped copy of the noise, so the two cancel and you
        hear silence.
      </Point>

      <Point title="Qubits behave like waves" visual={<IconTile color="#7777ee"><Split className="w-6 h-6" /></IconTile>}>
        The amounts in a qubit's mix act like waves, and the sign (+ or −) from Lesson 4 says whether a wave is the
        right way up or upside down. When two routes lead to the same answer, their waves meet. With the same sign
        they <strong className="text-white">add up</strong>; with opposite signs they <strong className="text-white">cancel</strong>.
      </Point>

      <Point title="Why H, then H gives 0" visual={<IconTile color="#a855f7"><span className="font-mono font-bold text-xl">H</span></IconTile>}>
        This solves Lesson 4's mystery. After H and then H again, the two routes to 1 have opposite signs and cancel,
        while the two routes to 0 add up. So the answer is <strong className="text-white">always 0</strong>.
      </Point>

      <Point title="How quantum computers use it" visual={<IconTile color="#fbbf24"><Target className="w-6 h-6" /></IconTile>}>
        A quantum algorithm is a clever plan of gates that makes the routes to wrong answers cancel and the routes to
        the right answer add up. When you finally measure, the right answer is the likely one. This is the
        <strong className="text-white"> real source of quantum speed</strong>, not "trying every answer at once".
      </Point>

      <GoodToKnow>
        interference is the proof that superposition is real (Lesson 2). If a qubit were secretly 0 or 1, its routes
        couldn't cancel, and H then H would give a random answer. Experiments show they do cancel.
      </GoodToKnow>
    </div>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

const TEAL = '#00ffcc';
const PURPLE = '#cc44ff';
const AMBER = '#fbbf24';
const picked = { background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' };

const VIEW_W = 300;

/** A wave drawn across the picture. `f` gives its height (in units) at x from 0 to 1. */
function WavePicture({ f, color, height = 56, unit = 11 }: {
  f: (x: number) => number; color: string; height?: number; unit?: number;
}) {
  const mid = height / 2;
  let d = '';
  for (let px = 0; px <= VIEW_W; px += 3) d += `${px ? 'L' : 'M'}${px},${(mid - unit * f(px / VIEW_W)).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" className="w-full block" style={{ height }} aria-hidden="true">
      <line x1="0" y1={mid} x2={VIEW_W} y2={mid} stroke="#7777ee" strokeOpacity="0.3" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A glowing light: dark at 0, full glow at 1. */
function Bulb({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="w-12 h-12 flex-shrink-0 rounded-full transition-all duration-500"
      style={{
        background: `radial-gradient(circle, rgba(255,245,200,${0.1 + 0.9 * value}) 0%, rgba(251,191,36,${0.85 * value}) 45%, rgba(251,191,36,${0.15 * value}) 72%)`,
        boxShadow: value > 0.01 ? `0 0 ${8 + 28 * value}px rgba(251,191,36,${0.65 * value})` : 'none',
        border: '1px solid rgba(251,191,36,0.4)',
      }} />
  );
}

// ── See: the wave mixer ───────────────────────────────────────────────────────

/** How far wave B is shifted, in words. `part` is 0 to 100 (% of one wave). */
function shiftWords(part: number) {
  if (part === 0 || part === 100) return 'In step';
  if (part === 50) return 'Half a wave: opposite';
  if (part === 25) return 'A quarter wave';
  if (part === 75) return 'Three quarters of a wave';
  return `${part}% of a wave`;
}

function See() {
  const [part, setPart] = useState(20);                 // shift of wave B, in % of one wave
  const shift = part * 3.6;
  const pct = Math.round(mixStrength(shift) * 100);
  const verdict = pct >= 95 ? 'They add up' : pct <= 5 ? 'They cancel' : 'They partly cancel';
  const sliderId = useId();

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Two waves meet at the same spot. Slide wave B along and watch what they make together.</p>

      <div className="rounded-xl border border-quantum-700 bg-quantum-900/40 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <label htmlFor={sliderId} className="text-sm text-gray-200 font-medium">Shift wave B</label>
          <span className="text-sm text-gray-300">{shiftWords(part)}</span>
        </div>
        <input id={sliderId} type="range" min={0} max={100} step={1} value={part}
          onChange={e => setPart(Number(e.target.value))} className="w-full accent-[#00ffcc] cursor-pointer" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[{ v: 0, label: 'In step' }, { v: 50, label: 'Opposite' }].map(b => (
            <button key={b.v} type="button" onClick={() => setPart(b.v)} aria-pressed={part === b.v}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                part === b.v ? 'text-black border-transparent' : 'text-white bg-quantum-900/60 border-quantum-600 hover:border-quantum-neon/50'}`}
              style={part === b.v ? picked : undefined}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-2">
        {[
          { name: 'Wave A', color: TEAL, f: (x: number) => waveAt(x) },
          { name: 'Wave B', color: PURPLE, f: (x: number) => waveAt(x, shift) },
          { name: 'Together', color: '#ffffff', f: (x: number) => waveAt(x) + waveAt(x, shift) },
        ].map((w, i) => (
          <div key={w.name} className={`grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 ${i === 2 ? 'pt-2 border-t border-quantum-700/60' : ''}`}>
            <span className="text-sm font-medium" style={{ color: w.color }}>{w.name}</span>
            <WavePicture f={w.f} color={w.color} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3" aria-live="polite">
        <Bulb value={pct / 100} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold">{verdict}</p>
          <div className="mt-1.5 h-2 rounded-full bg-quantum-900/80 overflow-hidden" role="img" aria-label={`Strength together: ${pct}%`}>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: AMBER }} />
          </div>
          <p className="mt-1 text-sm text-gray-300" aria-hidden="true">Strength together: {pct}%</p>
        </div>
      </div>

      <p className="mt-5 flex items-start gap-2 text-sm text-gray-400">
        <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-quantum-purple" />
        <span>For a qubit, <strong className="text-gray-200">the same sign</strong> means in step and
          <strong className="text-gray-200"> opposite signs</strong> mean opposite. That is how the Z gate from Lesson 4 can make an answer vanish completely.</span>
      </p>
    </div>
  );
}

// ── Play: Wave puzzles ────────────────────────────────────────────────────────

type Goal = 'dark' | 'bright';

interface Light { name: string; goal: Goal; arrivesFlipped?: boolean[]; note?: string }

const WAVE_NAMES = ['A', 'B', 'C'];

const LEVELS: { sizes: number[]; lights: Light[]; goal: string; lesson: string }[] = [
  { sizes: [1, 1], lights: [{ name: 'The light', goal: 'dark' }],
    goal: 'Make it dark: flip waves so the light goes out completely.',
    lesson: 'Correct! A crest met a dip, so the two waves cancelled completely. Noise-cancelling headphones work the same way.' },
  { sizes: [1, 1, 2], lights: [{ name: 'The light', goal: 'dark' }],
    goal: 'Make it dark again, this time with three waves of different sizes.',
    lesson: 'Correct! The flipped side and the other side are the same size, so they cancel exactly. Size matters as well as direction.' },
  { sizes: [1, 1],
    lights: [
      { name: 'Answer 0', goal: 'dark' },
      { name: 'Answer 1', goal: 'bright', arrivesFlipped: [false, true], note: 'Wave B arrives here flipped.' },
    ],
    goal: 'Pick the winner: both waves reach both answers, but at answer 1, wave B arrives flipped. Make answer 1 bright and answer 0 dark.',
    lesson: 'Correct! At answer 0 the waves cancel, and at answer 1 they add up. That is exactly what H does, and quantum algorithms use the same trick to cancel wrong answers.' },
];

const isMet = (goal: Goal, value: number) => (goal === 'dark' ? value < 1e-9 : value > 1 - 1e-9);
const pctOf = (value: number) => Math.round(value * 100);

function WavePuzzles() {
  return (
    <GameLevels title="Wave puzzles" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [flipped, setFlipped] = useState<boolean[]>(() => level.sizes.map(() => false));
  const [result, setResult] = useState<CheckResult | null>(null);
  const values = level.lights.map(l => brightness(level.sizes, flipped, l.arrivesFlipped));
  // The same scale for every wave in the level, so the biggest total still fits the picture.
  const unit = 20 / level.sizes.reduce((s, x) => s + x, 0);
  const sign = (i: number, arrives?: boolean[]) => (flipped[i] !== !!arrives?.[i] ? -1 : 1);

  // Locked once answered correctly; before that, any change clears an old "not yet".
  const solved = !!result?.ok;
  const toggle = (i: number, to: boolean) => {
    if (solved) return;
    setFlipped(f => f.map((x, j) => (j === i ? to : x)));
    setResult(null);
  };

  const check = () => {
    if (level.lights.every((l, i) => isMet(l.goal, values[i]))) {
      setResult({ ok: true, text: level.lesson });
      onWin();
      return;
    }
    if (level.lights.length === 1) {
      const down = level.sizes.reduce((s, x, i) => s + (flipped[i] ? x : 0), 0);
      const up = level.sizes.reduce((s, x, i) => s + (flipped[i] ? 0 : x), 0);
      setResult({ ok: false, text: `Not yet. The light is still ${pctOf(values[0])}% bright. ` + (down === 0
        ? 'All the waves are the right way up, so they add up. Flip one so a crest meets a dip.'
        : `The flipped waves add up to size ${down} and the others to size ${up}. To cancel, the two sides must be equal.`) });
    } else {
      setResult({ ok: false, text: `Not yet. ${level.lights.map((l, i) => `${l.name} is ${pctOf(values[i])}% bright`).join(' and ')}. `
        + 'Remember: at answer 1, wave B arrives flipped.' });
    }
  };

  return (
    <div className="max-w-2xl">
      <ul className="space-y-3">
        {level.sizes.map((size, i) => (
          <li key={i} className="rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-200 font-medium">
                Wave {WAVE_NAMES[i]} <span className="text-gray-400 font-normal">· size {size}</span>
              </span>
              <div role="group" aria-label={`Wave ${WAVE_NAMES[i]}`} className="inline-flex rounded-full border border-quantum-600 bg-quantum-900/60 p-1">
                {[{ to: false, label: 'Up' }, { to: true, label: 'Flipped' }].map(o => (
                  <button key={o.label} type="button" onClick={() => toggle(i, o.to)} aria-pressed={flipped[i] === o.to} disabled={solved}
                    className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors disabled:cursor-default ${
                      flipped[i] === o.to ? 'text-black' : 'text-gray-300 hover:text-white disabled:hover:text-gray-300'}`}
                    style={flipped[i] === o.to ? picked : undefined}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <WavePicture f={x => sign(i) * size * waveAt(x)} color={i === 0 ? TEAL : i === 1 ? PURPLE : '#22d3ee'} height={48} unit={unit} />
          </li>
        ))}
      </ul>

      <div className={`mt-6 grid gap-3 ${level.lights.length > 1 ? 'sm:grid-cols-2' : ''}`} aria-live="polite">
        {level.lights.map((l, li) => (
          <div key={l.name} className="rounded-xl border border-amber-400/30 bg-quantum-900/40 px-4 py-3">
            <div className="flex items-center gap-4">
              <Bulb value={values[li]} />
              <div>
                <p className="text-white font-semibold">{l.name}</p>
                <p className="text-sm text-gray-300">{pctOf(values[li])}% bright · goal: {l.goal}</p>
                {l.note && <p className="text-xs text-gray-400 mt-0.5">{l.note}</p>}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400" aria-hidden="true">Waves together</p>
            <WavePicture height={48} unit={unit} color="#ffffff"
              f={x => level.sizes.reduce((s, size, i) => s + sign(i, l.arrivesFlipped) * size * waveAt(x), 0)} />
          </div>
        ))}
      </div>

      <CheckAnswer onCheck={check} result={result} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    question: 'Two equal waves meet, and one of them is upside down. What happens?',
    options: [
      { text: 'They cancel out', correct: true, why: 'Right! Each crest meets a dip, so the water goes flat.' },
      { text: 'They make a wave twice as big', why: 'Not quite. That happens when both are the right way up. Upside down, they cancel.' },
      { text: 'The bigger one wins', why: 'Not quite. They are the same size, so neither wins: they cancel completely.' },
      { text: 'They bounce off each other', why: 'Not quite. Waves pass through each other and add up. Here they add up to nothing.' },
    ],
  },
  {
    question: 'True or false? Interference lets a quantum computer make wrong answers less likely and the right answer more likely.',
    options: [
      { text: 'True', correct: true, why: 'Right! Routes to wrong answers cancel and routes to the right answer add up.' },
      { text: 'False', why: 'Not quite. That is exactly what interference is used for in quantum algorithms.' },
    ],
  },
  {
    question: 'A qubit goes through H, then H. Why does it always end at 0?',
    options: [
      { text: 'The routes to 1 cancel and the routes to 0 add up', correct: true,
        why: 'Right! The two routes to 1 have opposite signs and cancel, so only 0 is left.' },
      { text: 'The second H measures it', why: 'Not quite. Gates never measure. The answer comes from the routes cancelling.' },
      { text: "It's luck", why: 'Not quite. It happens every single time, because the routes to 1 cancel exactly.' },
      { text: 'The qubit gets stuck', why: 'Not quite. Nothing gets stuck: the routes to 1 cancel and the routes to 0 add up.' },
    ],
  },
];
