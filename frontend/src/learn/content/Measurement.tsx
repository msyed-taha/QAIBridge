import { useState } from 'react';
import { ScanEye, Shuffle, Lock, BarChart3, RotateCcw } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Pills } from '../components/ui';
import type { Option } from '../components/ui';
import { EMPTY_TALLY, measure, tallyPercentages } from '../shots';
import type { Tally } from '../shots';
import { BRAND_FILL, ZERO_COLOR, ONE_COLOR } from '../colors';

/** Lesson 3 — Measurement. */
export default function Measurement() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <MysteryQubit />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Looking makes it pick" visual={<IconTile color="#3b82f6"><ScanEye className="w-6 h-6" /></IconTile>}>
        To read a qubit, a quantum computer <strong className="text-white">measures</strong> it. Measuring forces the
        qubit to pick, so you always get a plain 0 or 1, never a mix. Which one you get comes down to chance.
      </Point>

      <Point title="Truly random" visual={<IconTile color="#fbbf24"><Shuffle className="w-6 h-6" /></IconTile>}>
        This chance isn't like rolling a dice. In theory, a dice roll could be worked out from how hard you throw it.
        A qubit is different: as far as science can tell, <strong className="text-white">nobody can predict a single
        result</strong>. Only the odds can be known.
      </Point>

      <Point title="Looking changes it" visual={<IconTile color="#cc44ff"><Lock className="w-6 h-6" /></IconTile>}>
        After you measure, the mix is gone. The qubit now really is the 0 or 1 you saw, and measuring it again gives
        the <strong className="text-white">same answer</strong>. It's like a coin that has landed: it stays landed.
      </Point>

      <Point title="One look isn't enough" visual={<IconTile color="#00ffcc"><BarChart3 className="w-6 h-6" /></IconTile>}>
        A single answer can't tell you the odds. A 1 could come from a qubit with a 99% chance of 1, or one with a 1%
        chance. So real quantum computers run the same program <strong className="text-white">thousands of
        times</strong> and count the answers. Each run is called a <em>shot</em>.
      </Point>

      <GoodToKnow>
        you can't get around this by copying the qubit first and measuring the copies. The laws of physics forbid
        making a perfect copy of an unknown qubit. This is called the "no-cloning" rule.
      </GoodToKnow>
    </ReadList>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

/** "Measure: Once · 10 times · 100 times". */
function MeasureButtons({ counts, onMeasure, disabled = false }: {
  counts: number[];
  onMeasure: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-gray-200 font-medium mb-2">Measure</p>
      <div className="flex flex-wrap gap-2">
        {counts.map(n => (
          <button key={n} type="button" onClick={() => onMeasure(n)} disabled={disabled}
            className="px-4 py-2 rounded-xl text-sm font-bold text-black hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: BRAND_FILL }}>
            {n === 1 ? 'Once' : `${n} times`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Two jars that fill with the 0s and 1s measured so far. `chanceOf1`, when given, draws the real odds as dashed lines. */
function Jars({ tally, chanceOf1 }: { tally: Tally; chanceOf1?: number }) {
  const [p0, p1] = tallyPercentages(tally);
  const real = chanceOf1 === undefined ? undefined : Math.round(chanceOf1 * 100);
  return (
    <div className="grid grid-cols-2 gap-6 max-w-xs" role="img"
      aria-label={`0 came up ${tally.zeros} times (${p0}%), 1 came up ${tally.ones} times (${p1}%)`
        + (real === undefined ? '' : `. Real odds: ${100 - real}% chance of 0, ${real}% chance of 1`)}>
      <Jar digit="0" count={tally.zeros} pct={p0} color={ZERO_COLOR} real={real === undefined ? undefined : 100 - real} />
      <Jar digit="1" count={tally.ones} pct={p1} color={ONE_COLOR} real={real} />
    </div>
  );
}

function Jar({ digit, count, pct, color, real }: { digit: string; count: number; pct: number; color: string; real?: number }) {
  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className="relative w-full h-40 rounded-b-2xl rounded-t-sm border-2 border-t-0 border-quantum-600 bg-quantum-900/40 overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out"
          style={{ height: `${pct}%`, background: `linear-gradient(to top, ${color}cc, ${color}55)` }} />
        {real !== undefined && (
          <div className="absolute inset-x-0 border-t-2 border-dashed border-amber-400"
            style={{ bottom: `min(${real}%, calc(100% - 2px))` }} />
        )}
      </div>
      <span className="mt-2 font-mono text-3xl font-bold" style={{ color }}>{digit}</span>
      <span className="text-sm text-gray-300">{count} {count === 1 ? 'time' : 'times'} · {pct}%</span>
    </div>
  );
}

// ── See: the measuring machine ────────────────────────────────────────────────

const SEE_QUBITS = [
  { value: 'fair', label: 'Fair mix (50/50)', chance: 0.5 },
  { value: 'mostly-1', label: 'Mostly 1 (80%)', chance: 0.8 },
  { value: 'always-0', label: 'Always 0', chance: 0 },
];

function See() {
  const [which, setWhich] = useState('fair');
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [last, setLast] = useState<0 | 1 | null>(null);   // the latest single look
  const [lookedAgain, setLookedAgain] = useState(false);
  const qubit = SEE_QUBITS.find(q => q.value === which)!;
  const total = tally.zeros + tally.ones;

  const restart = () => { setTally(EMPTY_TALLY); setLast(null); setLookedAgain(false); };
  const pick = (v: string) => { setWhich(v); restart(); };
  const run = (n: number) => {
    const next = measure(tally, n, qubit.chance);
    setTally(next);
    setLast(n === 1 ? (next.ones > tally.ones ? 1 : 0) : null);
    setLookedAgain(false);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Pick a qubit and measure it. Each measurement uses a fresh qubit, set up the same way.</p>

      <Panel className="space-y-5">
        <Pills label="Qubit" options={SEE_QUBITS} value={which} onChange={pick} />
        <MeasureButtons counts={[1, 10, 100]} onMeasure={run} />
      </Panel>

      {last !== null && (
        <div className="mt-6 flex items-center gap-4 rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3" aria-live="polite">
          <span className="w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center font-mono text-2xl font-extrabold text-black"
            style={{ background: last ? ONE_COLOR : ZERO_COLOR }}>{last}</span>
          <div>
            <p className="text-gray-200">
              {lookedAgain ? `Still ${last}. Once measured, a qubit keeps its answer.` : `This qubit gave ${last}.`}
            </p>
            {!lookedAgain && (
              <button type="button" onClick={() => setLookedAgain(true)} className="text-sm text-quantum-neon hover:underline">
                Look at it again
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-8"><Jars tally={tally} chanceOf1={qubit.chance} /></div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-300">
          {total === 0
            ? 'Press a Measure button to start.'
            : `${total} ${total === 1 ? 'look' : 'looks'} so far. The dashed lines show the real odds: the more you measure, the closer the jars get.`}
        </p>
        {total > 0 && (
          <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <RotateCcw className="w-4 h-4" /> Start again
          </button>
        )}
      </div>
    </div>
  );
}

// ── Play: Mystery qubit ───────────────────────────────────────────────────────

/** "In your 12 looks, 1 came up 7 times (58%)." */
function looksSummary(tally: Tally) {
  const total = tally.zeros + tally.ones;
  return `In your ${total} ${total === 1 ? 'look' : 'looks'}, 1 came up ${tally.ones} ${tally.ones === 1 ? 'time' : 'times'} `
    + `(${tallyPercentages(tally)[1]}%).`;
}

/** "Your one look gave 1" or "All 3 of your looks gave 0", when only one digit has come up. */
function onlyOneDigit(tally: Tally) {
  const total = tally.zeros + tally.ones;
  return `${total === 1 ? 'Your one look' : `All ${total} of your looks`} gave ${tally.ones ? 1 : 0}`;
}

// `lesson` gets the player's own looks, so it never describes results they didn't see.
const LEVELS: { chance: number; question: string; options: Option<number>[]; goal: string; lesson: (looks: Tally) => string }[] = [
  { chance: 0.5, question: 'What is it?',
    options: [{ value: 0, label: 'Always 0' }, { value: 1, label: 'Always 1' }, { value: 0.5, label: 'A 50/50 mix' }],
    goal: "This qubit's odds are hidden. Measure it as often as you like, then pick what it is.",
    lesson: looks => looks.zeros && looks.ones
      ? `Correct! It is a 50/50 mix. ${looksSummary(looks)} Seeing both 0 and 1 come up rules out "always 0" and "always 1".`
      : looks.zeros || looks.ones
        ? `Correct! It is a 50/50 mix. ${onlyOneDigit(looks)}, which can't rule out "always ${looks.ones ? 1 : 0}". `
          + `More looks would show ${looks.ones ? 0 : 1} too.`
        : 'Correct! It is a 50/50 mix. You picked it without measuring, though: seeing both 0 and 1 come up is what proves it.' },
  { chance: 0.9, question: 'Its chance of giving 1',
    options: [{ value: 0.1, label: '10%' }, { value: 0.5, label: '50%' }, { value: 0.9, label: '90%' }],
    goal: 'Another hidden qubit. What is its chance of giving 1?',
    lesson: looks => looks.zeros + looks.ones
      ? `Correct! Its chance of giving 1 is 90%. ${looksSummary(looks)} Odds as different as 10%, 50% and 90% take only a handful of looks to tell apart.`
      : 'Correct! Its chance of giving 1 is 90%. You picked it without measuring, though: a handful of looks would have shown it.' },
  { chance: 0.25, question: 'Its chance of giving 1',
    options: [{ value: 0.25, label: '25%' }, { value: 0.5, label: '50%' }, { value: 0.75, label: '75%' }],
    goal: 'Harder: the options are closer together. What is its chance of giving 1?',
    lesson: () => "Correct! Close odds need lots of shots to tell apart. That's why real quantum computers run thousands." },
];

function MysteryQubit() {
  return (
    <GameLevels title="Mystery qubit" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [answer, setAnswer] = useState<number | null>(null);
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const total = tally.zeros + tally.ones;

  const check = () => {
    if (answer === level.chance) {
      pass(level.lesson(tally));
    } else if (total === 0) {
      fail('Not quite. Measure the qubit first to see what it gives.');
    } else {
      fail(`Not quite. ${looksSummary(tally)} Take more looks: the more you measure, the closer you get to the real odds.`);
    }
  };

  return (
    <div className="max-w-2xl">
      <Panel>
        <MeasureButtons counts={[1, 10]} onMeasure={n => edit(() => setTally(t => measure(t, n, level.chance)))} disabled={solved} />
      </Panel>

      <div className="mt-8"><Jars tally={tally} /></div>
      <p className="mt-4 text-gray-300">{total === 0 ? 'No looks yet.' : `${total} ${total === 1 ? 'look' : 'looks'} so far.`}</p>

      <div className="mt-6">
        <Pills label={level.question} options={level.options} value={answer} onChange={v => edit(() => setAnswer(v))} disabled={solved} />
      </div>

      <CheckAnswer onCheck={check} result={result} disabled={answer === null} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'A qubit has a 70% chance of giving 1. You measure it once. What do you get?',
    options: [
      { text: 'Either 0 or 1, with 1 more likely', correct: true,
        why: 'Right! You always get one plain answer, and 1 comes up about 7 times in 10.' },
      { text: '0.7', why: 'Not quite. A measurement never gives an in-between number, only 0 or 1.' },
      { text: 'Always 1', why: 'Not quite. 1 is more likely, but about 3 times in 10 you will get 0.' },
      { text: 'Both 0 and 1', why: 'Not quite. Measuring forces the qubit to pick just one.' },
    ],
  },
  {
    question: 'True or false? You measure a qubit and get 1. If you measure it again straight away, you will get 1 again.',
    options: [
      { text: 'True', correct: true, why: 'Right! Measuring ends the mix. The qubit now really is 1, so it stays 1.' },
      { text: 'False', why: 'Not quite. Once measured, a qubit keeps its answer, like a coin that has landed.' },
    ],
  },
  {
    question: 'Why do quantum computers run the same program thousands of times?',
    options: [
      { text: 'Each run gives one random answer, and many runs reveal the odds', correct: true,
        why: 'Right! One shot gives one answer. Thousands of shots show which answers are likely.' },
      { text: 'To warm the machine up', why: 'Not quite. Each run gives one random answer; repeating it reveals the odds.' },
      { text: 'The first runs are always wrong', why: 'Not quite. Every run is equally good, but each gives just one random answer.' },
      { text: 'To make the qubits stronger', why: "Not quite. Repeating doesn't change the qubits. It collects enough answers to see the odds." },
    ],
  },
];
