import { useState } from 'react';
import { Layers, Coins, LayoutGrid, Eye } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Segmented, Tip } from '../components/ui';
import type { Option } from '../components/ui';
import { allPatterns, patternsInMix, settingsFor, shareLabel } from '../patterns';
import type { Setting } from '../patterns';
import { ZERO_COLOR, ONE_COLOR } from '../colors';
import { joinWithAnd, replaceAt } from '../lists';

/** Lesson 2 — Superposition. */
export default function Superposition() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <LightUpTheBoard />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="A mix of 0 and 1" visual={<IconTile color="#22d3ee"><Layers className="w-6 h-6" /></IconTile>}>
        In Lesson 1 you saw that a qubit's arrow can point in between 0 and 1. That in-between state is called
        a <strong className="text-white">superposition</strong>: the qubit is a mix of 0 and 1 at the same time. Any mix
        counts, 50/50 or 90/10. Only pointing exactly at 0 or exactly at 1 is not a superposition.
      </Point>

      <Point title="Not secretly one or the other" visual={<IconTile color="#fbbf24"><Coins className="w-6 h-6" /></IconTile>}>
        A coin hidden under a cup is already heads or tails; you just don't know which. A qubit in a mix is
        different: it <strong className="text-white">hasn't picked yet</strong>. Scientists have proved this with
        experiments, because the two parts of the mix can add up or cancel each other out. You'll see that in Lesson 5.
      </Point>

      <Point title="More qubits, more patterns" visual={<IconTile color="#3b82f6"><LayoutGrid className="w-6 h-6" /></IconTile>}>
        Two bits hold one pattern at a time: <span className="font-mono">00</span>, <span className="font-mono">01</span>,{' '}
        <span className="font-mono">10</span> or <span className="font-mono">11</span>. Two qubits can hold a mix
        of <strong className="text-white">all four at once</strong>. Each qubit you add doubles the count: 3 qubits can
        mix 8 patterns, 10 qubits 1,024, and 300 qubits more patterns than there are atoms in the universe.
      </Point>

      <Point title="But you only see one" visual={<IconTile color="#cc44ff"><Eye className="w-6 h-6" /></IconTile>}>
        When you look, the mix is gone and you get <strong className="text-white">just one pattern</strong>, picked by
        chance. 3 qubits give you 3 bits, not 8 answers. So quantum computers don't "try every answer at once".
        Their trick is shaping the mix so the right answer becomes the likely one.
      </Point>

      <GoodToKnow>
        everyday things like coins never seem to be in a mix. That's because their mix is lost almost instantly when
        they bump into the air and light around them. Lesson 7 explains why.
      </GoodToKnow>
    </ReadList>
  );
}

// ── The pattern board ─────────────────────────────────────────────────────────

const SETTINGS: Option<Setting>[] = [
  { value: '0', label: '0', fill: ZERO_COLOR },
  { value: 'mix', label: 'Mix', fill: `linear-gradient(90deg, ${ZERO_COLOR}, ${ONE_COLOR})` },
  { value: '1', label: '1', fill: ONE_COLOR },
];

const COUNTS: Option<number>[] = [1, 2, 3].map(n => ({ value: n, label: String(n) }));

/** One switch per qubit: 0, Mix or 1. */
function QubitSwitches({ settings, onChange, disabled }: {
  settings: Setting[];
  onChange: (i: number, s: Setting) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {settings.map((s, i) => (
        <Segmented key={i} label={`Qubit ${i + 1}`} options={SETTINGS} value={s} onChange={v => onChange(i, v)} disabled={disabled} />
      ))}
    </>
  );
}

/** Every pattern the qubits could show. Patterns in the mix glow; `target` ones get a dashed outline. */
function PatternBoard({ settings, target }: { settings: Setting[]; target?: string[] }) {
  const lit = new Set(patternsInMix(settings));
  const share = shareLabel(lit.size);
  return (
    <ul className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Pattern board">
      {allPatterns(settings.length).map(p => {
        const on = lit.has(p);
        const wanted = target?.includes(p);
        return (
          <li key={p} className={`rounded-xl border px-2 py-3 text-center transition-all duration-300 ${
            on ? 'border-quantum-neon/70 bg-quantum-neon/10 shadow-[0_0_18px_rgba(0,255,204,0.25)]' : 'border-quantum-700 bg-quantum-900/40'} ${
            wanted ? 'outline-dashed outline-2 outline-offset-2 outline-amber-400' : ''}`}>
            <span className={`block font-mono text-xl sm:text-2xl font-bold tracking-wider ${on ? '' : 'opacity-40'}`} aria-hidden="true">
              {[...p].map((d, i) => <span key={i} className={d === '0' ? 'text-quantum-neon' : 'text-quantum-purple'}>{d}</span>)}
            </span>
            <span className={`block mt-1 text-xs ${on ? 'text-gray-200' : 'text-gray-500'}`} aria-hidden="true">{on ? share : '0%'}</span>
            <span className="sr-only">
              Pattern {p}: {on ? `in the mix, ${share} chance` : 'not in the mix'}{wanted ? ', target' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "4 of 8 patterns in the mix…" under the board. */
function MixCaption({ settings }: { settings: Setting[] }) {
  const n = settings.length;
  const count = patternsInMix(settings).length;
  return (
    <p className="mt-4 text-gray-300" aria-live="polite">
      {count === 1
        ? `Just 1 pattern: no mix, the same as ${n === 1 ? 'a plain bit' : `${n} plain bits`}.`
        : `${count} of ${2 ** n} patterns in the mix, a ${shareLabel(count)} chance each when you look.`}
    </p>
  );
}

// ── See ───────────────────────────────────────────────────────────────────────

function See() {
  const [count, setCount] = useState(2);
  const [settings, setSettings] = useState<Setting[]>(['mix', '0', '0']);
  const used = settings.slice(0, count);
  const set = (i: number, s: Setting) => setSettings(all => replaceAt(all, i, s));
  const plural = count === 1 ? '' : 's';

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Set each qubit to 0, 1 or a mix. The board lights up every pattern in the mix.</p>

      <Panel className="space-y-4">
        <Segmented label="How many qubits?" options={COUNTS} value={count} onChange={setCount} />
        <div className="border-t border-quantum-700/60" />
        <QubitSwitches settings={used} onChange={set} />
      </Panel>

      <div className="mt-8">
        <PatternBoard settings={used} />
        <MixCaption settings={used} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3">
          <p className="text-gray-400">{count} bit{plural}</p>
          <p className="text-white font-semibold">1 pattern at a time</p>
        </div>
        <div className="rounded-xl border border-quantum-neon/40 bg-quantum-neon/5 px-4 py-3">
          <p className="text-gray-400">{count} qubit{plural}</p>
          <p className="text-white font-semibold">Up to {2 ** count} at once</p>
        </div>
      </div>

      <Tip>
        Every qubit set to <strong className="text-gray-200">Mix</strong> doubles the patterns. When you look, though,
        you get just one of them, picked by chance. Lesson 3 shows how.
      </Tip>
    </div>
  );
}

// ── Play: Light up the board ──────────────────────────────────────────────────

const LEVELS = [
  { qubits: 2, target: ['10', '11'],
    goal: 'Light up exactly the tiles with a dashed outline. The first digit of each tile belongs to Qubit 1, the second to Qubit 2.',
    lesson: 'Correct! Qubit 1 is set to 1 and Qubit 2 is a mix, so you get both endings: 10 and 11.' },
  { qubits: 2, target: ['00', '01', '10', '11'],
    goal: 'Light up all 4 tiles at once.',
    lesson: 'Correct! Two mixed qubits hold all 4 patterns at once, each with a 25% chance.' },
  { qubits: 3, target: ['010', '011', '110', '111'],
    goal: 'Now with 3 qubits: light up exactly the 4 dashed tiles.',
    lesson: 'Correct! Two mixes and one fixed qubit make 2 × 2 = 4 patterns. Every Mix doubles the count.' },
];

function LightUpTheBoard() {
  return (
    <GameLevels title="Light up the board" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [settings, setSettings] = useState<Setting[]>(() => Array<Setting>(level.qubits).fill('0'));
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const set = (i: number, s: Setting) => edit(() => setSettings(all => replaceAt(all, i, s)));

  const check = () => {
    const lit = patternsInMix(settings);
    const extra = lit.filter(p => !level.target.includes(p));
    const missing = level.target.filter(p => !lit.includes(p));
    if (!extra.length && !missing.length) {
      pass(level.lesson);
      return;
    }
    const answer = settingsFor(level.target, level.qubits);
    const off = answer ? settings.findIndex((s, i) => s !== answer[i]) : -1;
    fail([
      'Not yet.',
      extra.length ? `${joinWithAnd(extra)} ${extra.length === 1 ? 'is' : 'are'} lit but shouldn't be.` : '',
      missing.length ? `${joinWithAnd(missing)} should be lit but ${missing.length === 1 ? "isn't" : "aren't"}.` : '',
      off >= 0 ? `Look again at Qubit ${off + 1}.` : '',
    ].filter(Boolean).join(' '));
  };

  return (
    <div className="max-w-2xl">
      <Panel className="space-y-4">
        <QubitSwitches settings={settings} onChange={set} disabled={solved} />
      </Panel>

      <p className="mt-6 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded outline-dashed outline-2 outline-amber-400" /> Target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-quantum-neon/70 bg-quantum-neon/20" /> In your mix
        </span>
      </p>
      <PatternBoard settings={settings} target={level.target} />

      <CheckAnswer onCheck={check} result={result} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'What does it mean when a qubit is in superposition?',
    options: [
      { text: 'It is a mix of 0 and 1 until you look', correct: true,
        why: "Right! The qubit hasn't picked 0 or 1 yet. Looking makes it pick." },
      { text: "It is secretly 0 or 1, and we just don't know which",
        why: "Not quite. That's the coin under a cup. A qubit's mix is real: it hasn't picked yet." },
      { text: 'It is exactly 50/50', why: 'Not quite. Any mix counts, like 90/10. Only exactly 0 or exactly 1 is not a superposition.' },
      { text: 'It gives 0 and 1 at the same time when you look', why: 'Not quite. Looking always gives just one answer: 0 or 1.' },
    ],
  },
  {
    question: 'You set 3 qubits to Mix. How many patterns are in the mix?',
    options: [
      { text: '3', why: "Not quite. Each Mix doubles the count, it doesn't just add one: 2 × 2 × 2." },
      { text: '6', why: 'Not quite. Each Mix doubles the count: 2 × 2 × 2, not 2 + 2 + 2.' },
      { text: '8', correct: true, why: 'Right! 2 × 2 × 2 = 8 patterns, from 000 to 111.' },
      { text: '9', why: 'Not quite. Each qubit gives 2 choices, so it is 2 × 2 × 2, not 3 × 3.' },
    ],
  },
  {
    question: 'True or false? When you look at 3 mixed qubits, you see all 8 patterns.',
    options: [
      { text: 'True', why: 'Not quite. Looking ends the mix and shows just one pattern, picked by chance.' },
      { text: 'False', correct: true, why: 'Right! You see just one pattern, 3 bits, picked by chance. The mix is gone once you look.' },
    ],
  },
];
