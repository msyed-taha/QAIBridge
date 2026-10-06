import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Scale, Search, Atom, Flag, Rocket, Star, Undo2, Play } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Pills, Tip } from '../components/ui';
import type { Option } from '../components/ui';
import { groverAmounts, groverChance, groverRounds, normalCrackSteps, normalSearchLooks, quantumCrackSteps } from '../advantage';
import { BRAND_FILL, ONE_COLOR, ZERO_COLOR } from '../colors';
import { replaceAt } from '../lists';

/** Lesson 9 — Quantum advantage. */
export default function QuantumAdvantage() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <YouVsGrover />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Not faster at everything" visual={<IconTile color="#7777ee"><Scale className="w-6 h-6" /></IconTile>}>
        A quantum computer isn't a faster normal computer. For emails, videos and games, your laptop will always do
        better. Quantum computers win only on <strong className="text-white">special problems</strong> where interference
        can be put to work.
      </Point>

      <Point title="Searching: a square-root speed-up" visual={<IconTile color="#22d3ee"><Search className="w-6 h-6" /></IconTile>}>
        To find one item in an unsorted list of a million, a normal computer checks about half a million on average.
        Grover's algorithm needs only <strong className="text-white">about 800 rounds</strong>, roughly the square root of
        the size. That helps, but it isn't magic.
      </Point>

      <Point title="Codes and molecules: a huge speed-up" visual={<IconTile color="#a855f7"><Atom className="w-6 h-6" /></IconTile>}>
        For a few problems the gap is enormous: splitting huge numbers (Lesson 8), and simulating molecules and
        materials, which follow nature's own quantum maths. Here a normal computer's work
        <strong className="text-white"> grows explosively</strong>, while a quantum computer's grows gently.
      </Point>

      <Point title="Quantum supremacy, so far" visual={<IconTile color="#ec4899"><Flag className="w-6 h-6" /></IconTile>}>
        In 2019, Google's 53-qubit machine finished a special test in about 3 minutes that it estimated would take a
        supercomputer 10,000 years. Better normal methods later closed much of that gap. Tests like this prove the
        machines are quantum, but they <strong className="text-white">don't solve useful problems yet</strong>.
      </Point>

      <Point title="What's next" visual={<IconTile color="#fbbf24"><Rocket className="w-6 h-6" /></IconTile>}>
        To win on useful problems, quantum computers need error correction (Lesson 7) and many more qubits. Experts
        expect <strong className="text-white">chemistry and materials</strong> to benefit first, perhaps within the next
        decade or two.
      </Point>

      <GoodToKnow>
        Grover's algorithm can overshoot. Running too many rounds makes the right answer less likely again, so a
        quantum program has to stop at just the right moment. You'll try it in the game.
      </GoodToKnow>
    </ReadList>
  );
}

// ── See: the race ─────────────────────────────────────────────────────────────

type Task = 'search' | 'crack' | 'add';

const TASKS: Option<Task>[] = [
  { value: 'search', label: 'Search a list' },
  { value: 'crack', label: 'Crack a code' },
  { value: 'add', label: 'Add up a list' },
];

const LIST_SIZES = [16, 1e3, 1e6, 1e9, 1e12];
const DIGITS = [20, 50, 100, 300, 617];

/** Each task's sizes, how it counts work, and the right end of its scale (in powers of 10). */
const RACES: Record<Task, {
  size: (i: number) => string;
  normal: (i: number) => number;
  quantum: (i: number) => number;
  units: [string, string];
  decades: number;
}> = {
  search: {
    size: i => `${friendly(LIST_SIZES[i])} items`,
    normal: i => normalSearchLooks(LIST_SIZES[i]),
    quantum: i => groverRounds(LIST_SIZES[i]),
    units: ['looks', 'rounds'],
    decades: 12,
  },
  crack: {
    size: i => `${DIGITS[i]} digits${DIGITS[i] === 617 ? ' (a 2048-bit code)' : ''}`,
    normal: i => normalCrackSteps(DIGITS[i]),
    quantum: i => quantumCrackSteps(DIGITS[i]),
    units: ['steps', 'steps'],
    decades: 36,
  },
  add: {
    size: i => `${friendly(LIST_SIZES[i])} numbers`,
    normal: i => LIST_SIZES[i],
    quantum: i => LIST_SIZES[i],
    units: ['steps', 'steps'],
    decades: 12,
  },
};

const BIG_WORDS: [number, string][] = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
const HUGE = 1e15;            // from here on, numbers are written as 10 to a power

/** A number in plain words: "8.5", "785", "500,000", "2.1 million", or "10 to the power 35" once it gets huge. */
function friendly(n: number): string {
  if (n < 100 && !Number.isInteger(n)) return n.toFixed(1);
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return Number(n.toPrecision(3)).toLocaleString('en-US');
  if (n < HUGE) {
    const [unit, word] = BIG_WORDS.find(([v]) => n >= v)!;
    return `${Number((n / unit).toPrecision(2))} ${word}`;
  }
  return `10 to the power ${Math.round(Math.log10(n))}`;
}

/** A number on screen: like `friendly`, but huge ones get a real superscript power (10³⁵). */
function Amount({ n }: { n: number }) {
  if (n < HUGE) return <>{friendly(n)}</>;
  return (
    <>
      <span className="sr-only">{friendly(n)}</span>
      <span aria-hidden="true">10<sup className="ml-px">{Math.round(Math.log10(n))}</sup></span>
    </>
  );
}

function See() {
  const [task, setTask] = useState<Task>('search');
  const [size, setSize] = useState(2);
  const sliderId = useId();
  const race = RACES[task];
  const normal = race.normal(size);
  const quantum = race.quantum(size);
  const ratio = normal / quantum;

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Pick a task and a size, and see how much work each computer needs.</p>

      <Panel className="space-y-5">
        <Pills label="Task" options={TASKS} value={task} onChange={setTask} />
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label htmlFor={sliderId} className="text-sm text-gray-200 font-medium">Problem size</label>
            <span className="text-sm text-gray-300 text-right">{race.size(size)}</span>
          </div>
          <input id={sliderId} type="range" min={0} max={LIST_SIZES.length - 1} step={1} value={size}
            onChange={e => setSize(Number(e.target.value))} className="w-full accent-[#00ffcc] cursor-pointer" />
        </div>
      </Panel>

      <div className="mt-8 space-y-4">
        <Track name="Normal computer" steps={normal} unit={race.units[0]} decades={race.decades} color={ONE_COLOR} />
        <Track name="Quantum computer" steps={quantum} unit={race.units[1]} decades={race.decades} color={ZERO_COLOR} />
        <p className="text-xs text-gray-400">
          A stretched scale: each faint line is 1,000 times more work than the one before.
          {task === 'crack' && ' Code-cracking numbers are rough estimates for the best known methods.'}
        </p>
      </div>

      <p className="mt-5 text-gray-200" aria-live="polite">
        {task === 'add'
          ? <>No speed-up: <strong className="text-white">both have to read every number</strong>, so a quantum computer is no faster.</>
          : <>The quantum computer needs about <strong className="text-white"><Amount n={ratio} /> times fewer</strong> steps.</>}
      </p>

      <Tip>
        Each quantum step is slower than a normal one today, so for small problems the normal computer still wins. The
        quantum lead only shows once the problem is big.
      </Tip>
    </div>
  );
}

/** One computer's work as a bar on a stretched (log) scale, with the number written beside it. */
function Track({ name, steps, unit, decades, color }: { name: string; steps: number; unit: string; decades: number; color: string }) {
  const width = Math.max(2, Math.min(100, (Math.log10(Math.max(steps, 1)) / decades) * 100));
  const gridStep = (3 / decades) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-sm text-gray-200 font-medium">{name}</span>
        <span className="text-sm font-semibold text-white">≈ <Amount n={steps} /> {unit}</span>
      </div>
      <div className="h-3 rounded-full ring-1 ring-quantum-700 bg-quantum-900/80" role="img" aria-label={`${name}: about ${friendly(steps)} ${unit}.`}
        style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(${gridStep}% - 1px), rgba(119,119,238,0.25) calc(${gridStep}% - 1px) ${gridStep}%)` }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Play: You vs Grover ───────────────────────────────────────────────────────

const pct = (x: number) => Math.round(x * 100);
/** A chance as a percentage; one decimal when rounding would wrongly show a sure 100%. */
const chanceText = (x: number) => (x < 1 && pct(x) === 100 ? `${(x * 100).toFixed(1)}%` : `${pct(x)}%`);

const LEVELS = [
  { goal: 'Search the normal way: a star hides in one of these 16 boxes. Open boxes one at a time until you find it, then check your answer.' },
  { goal: 'Find the sweet spot: run Grover rounds on 16 boxes and stop when the chance of finding the star is 95% or more.' },
  { goal: 'A bigger search: 64 boxes this time, and you need 99% or more. How many rounds does it take?' },
];

function YouVsGrover() {
  return (
    <GameLevels title="You vs Grover" levels={LEVELS}>
      {(i, win) => i === 0
        ? <NormalSearch onWin={win} />
        : <GroverSearch onWin={win} boxes={i === 1 ? 16 : 64} need={i === 1 ? 0.95 : 0.99} maxRounds={i === 1 ? 6 : 10}
            lesson={i === 1
              ? `Correct! 3 rounds give ${pct(groverChance(16, 3))}%, against 8.5 looks on average for a normal search. One more round would drop it to ${pct(groverChance(16, 4))}%.`
              : `Correct! 6 rounds give over 99%. That's 4 times the boxes of level 2 but only twice the rounds: the square-root rule. A normal search would need 32.5 looks on average.`} />}
    </GameLevels>
  );
}

/** A grid of `count` boxes; `children` draws each one. */
function BoxGrid({ count, label, children }: { count: number; label: string; children: (i: number) => ReactNode }) {
  return (
    <div className={`grid gap-1.5 sm:gap-2 ${count > 16 ? 'grid-cols-8 max-w-md' : 'grid-cols-4 max-w-xs'}`} role="group" aria-label={label}>
      {Array.from({ length: count }, (_, i) => children(i))}
    </div>
  );
}

function NormalSearch({ onWin }: { onWin: () => void }) {
  const [star] = useState(() => Math.floor(Math.random() * 16));
  const [opened, setOpened] = useState<boolean[]>(() => Array<boolean>(16).fill(false));
  const { result, solved, edit, pass } = useLevelAnswer(onWin);
  const looks = opened.filter(Boolean).length;
  const found = opened[star];

  return (
    <div className="max-w-2xl">
      <BoxGrid count={16} label="16 boxes">
        {i => (
          <button key={i} type="button" onClick={() => edit(() => setOpened(o => replaceAt(o, i, true)))}
            disabled={opened[i] || found || solved} aria-label={opened[i] ? (i === star ? `Box ${i + 1}: the star!` : `Box ${i + 1}: empty`) : `Open box ${i + 1}`}
            className={`aspect-square rounded-xl border flex items-center justify-center text-lg font-bold transition-all disabled:cursor-default ${
              !opened[i] ? 'border-quantum-600 bg-quantum-800/80 text-gray-400 hover:border-quantum-neon/60 hover:-translate-y-0.5'
                : i === star ? 'border-amber-400 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.45)]' : 'border-quantum-700 bg-quantum-900/30 text-gray-600'}`}>
            {!opened[i] ? '?' : i === star ? <Star className="w-6 h-6 text-amber-400 fill-amber-400" /> : '–'}
          </button>
        )}
      </BoxGrid>
      <p className="mt-4 text-gray-200" aria-live="polite">
        {found ? <>Found it after <strong className="text-white">{looks} {looks === 1 ? 'look' : 'looks'}</strong>.</> : `Looks so far: ${looks}`}
      </p>
      <CheckAnswer result={result} disabled={!found}
        onCheck={() => pass(`You needed ${looks} ${looks === 1 ? 'look' : 'looks'}. A normal search of 16 boxes needs 8.5 looks on average, and up to 16.`)} />
    </div>
  );
}

function GroverSearch({ onWin, boxes, need, maxRounds, lesson }: {
  onWin: () => void; boxes: number; need: number; maxRounds: number; lesson: string;
}) {
  const [star] = useState(() => Math.floor(Math.random() * boxes));
  const [rounds, setRounds] = useState(0);
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const amounts = groverAmounts(boxes, star, rounds);
  const chance = amounts[star] ** 2;
  const best = groverRounds(boxes);
  const history = Array.from({ length: rounds + 1 }, (_, k) => groverChance(boxes, k));

  const check = () => {
    if (chance >= need) pass(lesson);
    else if (rounds > best) fail(`You went past the peak: after ${rounds} rounds the chance has dropped to ${pct(chance)}%. Undo a round or two.`);
    else fail(`Not yet: after ${rounds} ${rounds === 1 ? 'round' : 'rounds'} the chance is ${pct(chance)}%. You need ${pct(need)}%. Run another round.`);
  };

  return (
    <div className="max-w-2xl">
      <Panel className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => edit(() => setRounds(r => r + 1))} disabled={solved || rounds >= maxRounds}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: BRAND_FILL }}>
          <Play className="w-4 h-4" /> Run a Grover round
        </button>
        <button type="button" onClick={() => edit(() => setRounds(r => r - 1))} disabled={solved || rounds === 0}
          className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-300">
          <Undo2 className="w-4 h-4" /> Undo a round
        </button>
        {rounds >= maxRounds && !solved && <span className="text-xs text-gray-400">That's the most rounds for this level.</span>}
      </Panel>

      <div className="mt-6">
        <BoxGrid count={boxes} label={`${boxes} boxes`}>
          {i => {
            const glow = amounts[i] ** 2;
            return (
              <div key={i} aria-hidden="true"
                className={`aspect-square rounded-lg border flex items-center justify-center transition-all duration-500 ${i === star ? 'border-amber-400/70' : 'border-quantum-700'}`}
                style={{ background: `rgba(0,255,204,${Math.min(0.85, 0.06 + glow * 1.4)})`, boxShadow: i === star && glow > 0.3 ? `0 0 ${10 + 20 * glow}px rgba(0,255,204,${0.5 * glow})` : 'none' }}>
                {i === star && <Star className={`${boxes > 16 ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-amber-300 fill-amber-300`} />}
              </div>
            );
          }}
        </BoxGrid>
      </div>

      <div className="mt-5" aria-live="polite">
        <p className="text-gray-200">
          After <strong className="text-white">{rounds} {rounds === 1 ? 'round' : 'rounds'}</strong>: a
          <strong className="text-white"> {chanceText(chance)}</strong> chance of finding the star when you look. You need {pct(need)}%.
        </p>
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Chance after each round">
          {history.map((c, k) => (
            <li key={k} className={`px-2.5 py-1 rounded-full text-xs border ${k === rounds ? 'border-quantum-neon/60 text-white' : 'border-quantum-700 text-gray-400'}`}>
              {k}: {chanceText(c)}
            </li>
          ))}
        </ol>
      </div>

      <CheckAnswer onCheck={check} result={result} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: "A list has a million items in no order. About how many rounds does Grover's algorithm need to find one?",
    options: [
      { text: 'About 800', correct: true, why: 'Right! About the square root of a million (1,000), times π/4: roughly 785 rounds.' },
      { text: 'About 500,000', why: 'Not quite. That is what a normal search needs on average. Grover needs about the square root: roughly 800.' },
      { text: '1', why: 'Not quite. One round only nudges the right answer up a little. It takes about 800.' },
      { text: 'About 20', why: 'Not quite. That would be far better than Grover can do. It needs about the square root: roughly 800.' },
    ],
  },
  {
    question: 'True or false? Quantum computers will make everyday apps like video calls much faster.',
    options: [
      { text: 'True', why: 'Not quite. Everyday apps have no special structure to exploit, and normal computers do them better.' },
      { text: 'False', correct: true, why: 'Right! Quantum computers help only with special problems, like simulating molecules or cracking codes.' },
    ],
  },
  {
    question: 'Which problem are quantum computers expected to help with most?',
    options: [
      { text: 'Simulating molecules and materials', correct: true, why: 'Right! Molecules follow quantum rules, so a quantum computer is a natural fit.' },
      { text: 'Sending emails', why: 'Not quite. Emails need no quantum help: a normal computer already does it instantly.' },
      { text: 'Playing videos', why: 'Not quite. Playing videos is an everyday job where normal computers are better.' },
      { text: 'Storing photos', why: 'Not quite. Storing data is not something quantum computers are good at.' },
    ],
  },
];
