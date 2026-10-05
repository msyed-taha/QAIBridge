import { useState } from 'react';
import { Sparkles, Dices, Globe } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { BlochSphere } from '../components/BlochSphere';
import { TiltSlider, TurnSlider, OddsBar } from '../components/QubitControls';
import { GameLevels, CheckAnswer } from '../components/GameLevels';
import type { CheckResult } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import { ZERO, ONE, fromDegrees, percentages } from '../qubit';
import type { QubitState } from '../qubit';

/** Lesson 1 — Bit vs qubit. */
export default function BitVsQubit() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <BitOrQubit />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <div className="space-y-8 max-w-2xl">
      <Point title="Normal computers use bits" visual={<BitButton size="sm" />}>
        Everything on your phone or laptop, from photos to messages to songs, is stored as a huge number of tiny
        switches called <strong className="text-white">bits</strong>. Each bit is either <strong className="text-white">0</strong> (off)
        or <strong className="text-white">1</strong> (on), and there is nothing in between. Tap the switch to flip it.
      </Point>

      <Point title="Quantum computers use qubits" visual={<MiniSphere />}>
        A <strong className="text-white">qubit</strong> is the quantum version of a bit. It is a tiny physical thing,
        such as a single atom, a particle of light or a tiny electrical circuit. When you check a qubit, it also gives
        you 0 or 1. The difference is what it can be <em>before</em> you check it.
      </Point>

      <Point title="Picture a qubit as an arrow on a globe" visual={<IconTile color="#3b82f6"><Globe className="w-6 h-6" /></IconTile>}>
        Imagine a globe with an arrow pointing out from its centre. Pointing at the North Pole means 0, and pointing
        at the South Pole means 1. Unlike a bit, the arrow can also point <strong className="text-white">anywhere in
        between</strong>. Physicists write the two poles
        as <span className="font-mono text-quantum-neon">|0⟩</span> and <span className="font-mono text-quantum-purple">|1⟩</span>.
      </Point>

      <Point title="The direction sets the odds" visual={<IconTile color="#cc44ff"><Dices className="w-6 h-6" /></IconTile>}>
        When you check the qubit, where the arrow points decides how likely you are to get 0 or 1. Near the North
        Pole you will almost always get 0. On the equator it is like tossing a fair coin: 50/50. Near the South Pole
        you will almost always get 1.
      </Point>

      <GoodToKnow>
        checking a qubit always gives just one 0 or 1. The arrow
        tells you the odds, but a single check can't tell you exactly where the arrow was pointing.
      </GoodToKnow>
    </div>
  );
}

/** A small picture of the Bloch sphere with its arrow pointing up. */
function MiniSphere() {
  return (
    <IconTile color="#00ffcc">
      <svg viewBox="0 0 32 32" className="w-8 h-8" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#7777ee" strokeWidth="1.5" />
        <ellipse cx="16" cy="16" rx="12" ry="3.5" fill="none" stroke="#7777ee" strokeWidth="1" opacity=".7" />
        <line x1="16" y1="16" x2="16" y2="5" stroke="#00ffcc" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="16" cy="5" r="2.4" fill="#fff" />
      </svg>
    </IconTile>
  );
}

/** A bit you can tap to flip. Controlled when `value` is given. */
function BitButton({ size = 'lg', value, onFlip }: { size?: 'sm' | 'lg'; value?: 0 | 1; onFlip?: () => void }) {
  const [own, setOwn] = useState<0 | 1>(0);
  const bit = value ?? own;
  const flip = onFlip ?? (() => setOwn(b => (b ? 0 : 1)));
  return (
    <button type="button" onClick={flip} aria-label={`A bit showing ${bit}. Tap to flip it.`}
      className={`${size === 'sm' ? 'w-12 h-12 rounded-xl text-2xl' : 'w-24 h-24 rounded-2xl text-5xl'} font-mono font-extrabold text-black transition-transform active:scale-90`}
      style={{ background: bit ? 'linear-gradient(135deg,#cc44ff,#a855f7)' : 'linear-gradient(135deg,#00ffcc,#22d3ee)' }}>
      {bit}
    </button>
  );
}

// ── See: a bit and a qubit side by side ───────────────────────────────────────

function See() {
  const [bit, setBit] = useState<0 | 1>(0);
  const [qubit, setQubit] = useState<QubitState>(fromDegrees(45, 330));

  return (
    <div>
      <p className="text-gray-200 text-lg mb-8">Compare them side by side. Flip the bit, then move the qubit's arrow.</p>
      <div className="grid gap-10 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center text-center">
          <h3 className="text-white font-semibold mb-5">A bit</h3>
          <BitButton value={bit} onFlip={() => setBit(b => (b ? 0 : 1))} />
          <div className="w-full mt-6"><OddsBar state={bit ? ONE : ZERO} compact /></div>
          <p className="mt-4 text-sm text-gray-400">Only two choices: always 0 or always 1.</p>
        </div>

        <div className="md:border-l md:border-quantum-700 md:pl-10">
          <h3 className="text-white font-semibold mb-5 text-center md:text-left">A qubit</h3>
          <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center">
            <BlochSphere state={qubit} onChange={s => setQubit(s)} className="max-w-[15rem] mx-auto" />
            <div className="space-y-5">
              <TiltSlider state={qubit} onChange={s => setQubit(s)} />
              <TurnSlider state={qubit} onChange={s => setQubit(s)} />
              <OddsBar state={qubit} />
            </div>
          </div>
          <p className="mt-5 flex items-start gap-2 text-sm text-gray-400">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-quantum-purple" />
            <span>Any mix of odds is possible. Notice that <strong className="text-gray-200">Turn</strong> spins the arrow
              without changing the odds; that hidden direction matters later, in Lesson 5.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Play: Bit or qubit? ───────────────────────────────────────────────────────

// A checked answer is right when the chance of 1 is within this many
// percentage points of the goal.
const ODDS_TOLERANCE = 4;
const LEVELS = [
  { goal: 'Make something that always gives 1.', target: 100,
    lesson: 'Correct! Both can do this one: a bit set to 1, or a qubit pointing straight down.' },
  { goal: 'Make a fair coin: a 50% chance of 0 and a 50% chance of 1.', target: 50,
    lesson: 'Correct! Only a qubit can do that. A bit is always 100% one way or the other.' },
  { goal: 'Make something with a 75% chance of 1 (three times out of four).', target: 75,
    lesson: 'Correct! Only a qubit can. Tilting its arrow lets you choose any odds you like.' },
];

function BitOrQubit() {
  return (
    <GameLevels title="Bit or qubit?" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [tool, setTool] = useState<'bit' | 'qubit' | null>(null);
  const [bit, setBit] = useState<0 | 1>(0);
  const [qubit, setQubit] = useState<QubitState>(ZERO);
  const [result, setResult] = useState<CheckResult | null>(null);

  const hits = (oneChance: number) => Math.abs(oneChance - level.target) <= ODDS_TOLERANCE;
  const bitCannot = !hits(0) && !hits(100);
  // Once answered correctly the level stays as it is; before that, any change
  // makes an earlier "not yet" out of date.
  const solved = !!result?.ok;
  const choose = (t: 'bit' | 'qubit') => { if (!solved) { setTool(t); setResult(null); } };
  const flip = () => { if (!solved) { setBit(b => (b ? 0 : 1)); setResult(null); } };
  const move = (s: QubitState) => { if (!solved) { setQubit(s); setResult(null); } };

  const check = () => {
    const oneChance = tool === 'bit' ? bit * 100 : percentages(qubit)[1];
    if (hits(oneChance)) {
      setResult({ ok: true, text: level.lesson });
      onWin();
    } else if (tool === 'bit') {
      setResult({ ok: false, text: bitCannot
        ? 'Not quite. A bit can only be 0 or 1, so its chance of 1 is always 0% or 100%. Try the qubit.'
        : 'Not yet. The bit gives 0 right now. Tap it to flip it.' });
    } else {
      setResult({ ok: false, text: `Not yet. Your chance of 1 is ${oneChance}% and the goal is ${level.target}%. `
        + (oneChance < level.target ? 'Tilt the arrow further down, towards 1.' : 'Tilt the arrow back up, towards 0.') });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6" role="group" aria-label="Choose what to use">
        <span className="text-sm text-gray-400 mr-1">Use:</span>
        {(['bit', 'qubit'] as const).map(t => (
          <button key={t} type="button" onClick={() => choose(t)} aria-pressed={tool === t} disabled={solved}
            className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors disabled:cursor-default ${
              tool === t ? 'text-black border-transparent' : 'text-white bg-quantum-900/60 border-quantum-600 hover:border-quantum-neon/50 disabled:hover:border-quantum-600'}`}
            style={tool === t ? { background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' } : undefined}>
            a {t}
          </button>
        ))}
      </div>

      {tool === null && <p className="text-gray-400">Pick a bit or a qubit to try.</p>}

      {tool === 'bit' && (
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <BitButton value={bit} onFlip={flip} />
          <div className="w-full max-w-sm"><OddsBar state={bit ? ONE : ZERO} /></div>
        </div>
      )}

      {tool === 'qubit' && (
        <div className="grid gap-8 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] items-center">
          <BlochSphere state={qubit} onChange={move} className="max-w-[16rem] mx-auto" />
          <div className="space-y-5">
            <TiltSlider state={qubit} onChange={move} />
            <OddsBar state={qubit} />
          </div>
        </div>
      )}

      {tool && <CheckAnswer onCheck={check} result={result} />}
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    question: 'A bit in a normal computer can be…',
    options: [
      { text: 'Only 0 or 1', correct: true, why: 'Right! A bit is always exactly 0 or 1, like a switch that is off or on.' },
      { text: 'Any number between 0 and 1', why: 'Not quite. A bit has only two possible values: 0 or 1.' },
      { text: '0 and 1 at the same time', why: 'Not quite. A bit is always one or the other, never both.' },
      { text: 'Any number at all', why: 'Not quite. Bigger numbers are made from many bits, but each bit is just 0 or 1.' },
    ],
  },
  {
    question: "A qubit's arrow points at the equator of the sphere. You check the qubit. What do you get?",
    options: [
      { text: 'Always 0', why: 'Not quite. Only an arrow pointing at the North Pole always gives 0.' },
      { text: 'Always 1', why: 'Not quite. Only an arrow pointing at the South Pole always gives 1.' },
      { text: '0 or 1, with a 50% chance of each', correct: true,
        why: "Right! On the equator the odds are even, like a fair coin. You'll see exactly what checking does in Lesson 3." },
      { text: 'Both 0 and 1 at once', why: 'Not quite. Checking a qubit always gives a single answer: 0 or 1.' },
    ],
  },
  {
    question: 'You turn the arrow sideways, like spinning a globe, without tilting it up or down. What happens to the odds?',
    options: [
      { text: 'They stay the same', correct: true,
        why: 'Right! Only the tilt changes the odds. The spin is a hidden direction that matters in Lesson 5.' },
      { text: 'They become 50/50', why: 'Not quite. Spinning keeps the same tilt, so the odds do not change.' },
      { text: 'It always gives 0', why: 'Not quite. Spinning keeps the same tilt, so the odds do not change.' },
      { text: 'The qubit turns into a bit', why: 'Not quite. It is still a qubit; only the tilt sets its odds.' },
    ],
  },
];
