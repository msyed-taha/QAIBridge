import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RotateCw, ArrowUpDown, Blend, EyeOff, Undo2, Lock, Delete, Trash2 } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Tip } from '../components/ui';
import { GATES, START, SPOT_NAMES, run, trace, dialAngle, chanceOf1, spotOf, undoGates } from '../gates';
import type { Amps, GateName, Spot } from '../gates';
import { GATE_COLORS, oddsRGB, rgba } from '../colors';

/** Lesson 4 — Quantum gates. */
export default function QuantumGates() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <GatePuzzles />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Gates are moves" visual={<IconTile color="#7777ee"><RotateCw className="w-6 h-6" /></IconTile>}>
        A quantum computer works by making small moves to its qubits, called <strong className="text-white">gates</strong>.
        Each gate turns the qubit's arrow in a fixed way. A quantum program is simply a list of gates, one after
        another, with a measurement at the end.
      </Point>

      <Point title="X: the flip" visual={<IconTile color={GATE_COLORS.X}><ArrowUpDown className="w-6 h-6" /></IconTile>}>
        The X gate <strong className="text-white">swaps 0 and 1</strong>. A qubit at 0 becomes 1, and 1 becomes 0,
        just like the NOT button in a normal computer.
      </Point>

      <Point title="H: the mixer" visual={<IconTile color={GATE_COLORS.H}><Blend className="w-6 h-6" /></IconTile>}>
        The H gate turns a plain 0 into an <strong className="text-white">even 50/50 mix</strong>. Do H again and you
        get exactly 0 back, not a random answer. A mix made by H remembers where it came from.
      </Point>

      <Point title="Z: the hidden flip" visual={<IconTile color={GATE_COLORS.Z}><EyeOff className="w-6 h-6" /></IconTile>}>
        The Z gate never changes the odds, so measuring can't see it. But it flips a hidden part of the mix, called
        its <strong className="text-white">"sign"</strong>, and that changes what the next gates do. Lesson 5 shows why
        this matters.
      </Point>

      <Point title="Every move can be undone" visual={<IconTile color="#00ffcc"><Undo2 className="w-6 h-6" /></IconTile>}>
        Each of these gates undoes itself: do it twice and you're back where you started. To undo a whole list, do
        the gates again <strong className="text-white">in reverse order</strong>, like retracing your steps. Quantum
        gates never throw information away.
      </Point>

      <GoodToKnow>
        AND and OR, the basic gates of normal computers, can't be quantum gates as they are. They take two inputs and
        give one output, so information is lost and you can't run them backwards. Quantum computers use undoable
        versions instead.
      </GoodToKnow>
    </ReadList>
  );
}

// ── The dial, gate chips and the wire ─────────────────────────────────────────

const GATE_WORDS: Record<GateName, string> = { X: 'flip', H: 'mix', Z: 'sign' };
const SPOT_TITLES: Record<Spot, string> = { '0': '0', '1': '1', '+': '+ mix (50/50)', '-': '− mix (50/50)' };

const percentOf1 = (s: Amps) => Math.round(chanceOf1(s) * 100);

/** `target` moved by whole turns to be as close as possible to `from`, so the arrow turns the short way round. */
const nearestTurn = (target: number, from: number) => target + 360 * Math.round((from - target) / 360);

/** A flat dial with the qubit's arrow: up is 0, down is 1, right is the + mix, left is the − mix. */
function Dial({ amps, size = 44, labels = false }: { amps: Amps; size?: number; labels?: boolean }) {
  // Remember the angle shown last, so the arrow never spins a full lap
  // (React's pattern for keeping a value from the previous render).
  const [shown, setShown] = useState(() => dialAngle(amps));
  const angle = nearestTurn(dialAngle(amps), shown);
  if (angle !== shown) setShown(angle);

  const c = size / 2;
  const r = labels ? c - 16 : c - 3;
  const label = (text: string, x: number, y: number) => (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="font-mono" fontSize="13" fill="#d1d5db">{text}</text>
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="flex-shrink-0"
      role={labels ? 'img' : undefined} aria-hidden={labels ? undefined : true}
      aria-label={labels ? `The qubit points to ${SPOT_NAMES[spotOf(amps)]}` : undefined}>
      <circle cx={c} cy={c} r={r} fill="rgba(10,10,30,0.7)" stroke="#7777ee" strokeOpacity="0.6" strokeWidth="1.5" />
      <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="#7777ee" strokeOpacity="0.3" strokeDasharray="2 3" />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="#7777ee" strokeOpacity="0.3" strokeDasharray="2 3" />
      {labels && <>
        {label('0', c, 7)}{label('1', c, size - 7)}{label('+', size - 7, c)}{label('−', 7, c)}
      </>}
      <g className="transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${c}px ${c}px` }}>
        <line x1={c} y1={c} x2={c} y2={c - r + 3} stroke={rgba(oddsRGB(chanceOf1(amps)))} strokeWidth={labels ? 3.5 : 2.5} strokeLinecap="round" />
        <circle cx={c} cy={c - r + 3} r={labels ? 4.5 : 3} fill="#fff" />
      </g>
      <circle cx={c} cy={c} r={labels ? 3 : 2} fill="#7777ee" />
    </svg>
  );
}

type StepKind = 'gate' | 'back' | 'locked';

function GateChip({ gate, kind = 'gate' }: { gate: GateName; kind?: StepKind }) {
  const color = GATE_COLORS[gate];
  return (
    <span className={`relative w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-lg border-2 ${kind === 'back' ? 'border-dashed' : ''}`}
      style={{ color, borderColor: `${color}${kind === 'back' ? 'aa' : '88'}`, background: `${color}22` }}>
      {gate}
      {kind === 'locked' && (
        <Lock className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 p-0.5 rounded-full bg-quantum-800 text-gray-300" />
      )}
    </span>
  );
}

/** One column of the wire: a gate (or "Start") on top, the dial after it underneath, joined to the column before. */
function WireStep({ chip, amps, first, label }: { chip: ReactNode; amps: Amps; first: boolean; label: string }) {
  return (
    <li className="group relative w-12 flex flex-col items-center gap-1.5">
      {!first && <span aria-hidden="true" className="absolute top-[63px] right-[calc(100%-2px)] w-3 h-0.5 bg-quantum-600 group-data-[row-start]:hidden" />}
      <span aria-hidden="true" className="h-9 flex items-center">{chip}</span>
      <Dial amps={amps} />
      <span className="sr-only">{label}</span>
    </li>
  );
}

/** The machine: the qubit starts at 0 and goes through the gates left to right. */
function Wire({ steps }: { steps: { gate: GateName; kind: StepKind }[] }) {
  const after = trace(steps.map(s => s.gate));

  // On narrow screens the wire wraps onto more lines. Mark the first step of
  // each line so it doesn't draw a link back to the line above.
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const mark = () => {
      let top = -1;
      for (const li of Array.from(list.children) as HTMLElement[]) {
        li.toggleAttribute('data-row-start', li.offsetTop !== top);
        top = li.offsetTop;
      }
    };
    mark();
    const observer = new ResizeObserver(mark);
    observer.observe(list);
    return () => observer.disconnect();
  }, [steps.length]);

  return (
    <ol ref={listRef} className="flex flex-wrap gap-x-2 gap-y-4" aria-label="The machine, gate by gate">
      <WireStep first amps={START} label="Start: the qubit is 0."
        chip={<span className="text-xs font-semibold text-gray-400">Start</span>} />
      {steps.map((s, i) => (
        <WireStep key={i} first={false} amps={after[i]} chip={<GateChip gate={s.gate} kind={s.kind} />}
          label={`${s.kind === 'back' ? 'Undo gate' : 'Gate'} ${s.gate}: the qubit is now ${SPOT_NAMES[spotOf(after[i])]}.`} />
      ))}
    </ol>
  );
}

/** The X / H / Z buttons, plus remove-last and clear. */
function GateButtons({ onAdd, onRemove, onClear, canAdd, canRemove, children }: {
  onAdd: (g: GateName) => void;
  onRemove: () => void;
  onClear: () => void;
  canAdd: boolean;
  canRemove: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-200 font-medium mb-2">Add a gate</p>
        <div className="flex flex-wrap gap-2">
          {(['X', 'H', 'Z'] as const).map(g => (
            <button key={g} type="button" onClick={() => onAdd(g)} disabled={!canAdd}
              aria-label={`Add gate ${g} (${GATE_WORDS[g]})`}
              className="w-16 py-2 rounded-xl border-2 flex flex-col items-center hover:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderColor: `${GATE_COLORS[g]}88`, background: `${GATE_COLORS[g]}1f` }}>
              <span className="font-mono font-bold text-xl leading-none" style={{ color: GATE_COLORS[g] }}>{g}</span>
              <span className="text-[11px] text-gray-300 mt-1">{GATE_WORDS[g]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <button type="button" onClick={onRemove} disabled={!canRemove}
          className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-300">
          <Delete className="w-4 h-4" /> Remove last
        </button>
        <button type="button" onClick={onClear} disabled={!canRemove}
          className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-300">
          <Trash2 className="w-4 h-4" /> Clear
        </button>
        {children}
      </div>
    </div>
  );
}

/** The big dial with the qubit's final spot and odds. */
function Result({ amps, note }: { amps: Amps; note?: string }) {
  const spot = spotOf(amps);
  return (
    <div className="flex items-center gap-5 rounded-xl border border-quantum-700 bg-quantum-900/40 p-4" aria-live="polite">
      <Dial amps={amps} size={112} labels />
      <div>
        <p className="text-sm text-gray-400">Result</p>
        <p className="text-white text-xl font-semibold">{SPOT_TITLES[spot]}</p>
        <p className="text-gray-300">Chance of 1: {percentOf1(amps)}%</p>
        {note && <p className="mt-2 text-sm text-quantum-neon">{note}</p>}
      </div>
    </div>
  );
}

// ── See: the gate machine ─────────────────────────────────────────────────────

const MAX_WIRE = 8;

function See() {
  const [steps, setSteps] = useState<{ gate: GateName; kind: StepKind }[]>([]);
  const gates = steps.map(s => s.gate);
  const final = run(gates);
  const undone = steps.some(s => s.kind === 'back');
  const canUndo = steps.length > 0 && !undone && steps.length * 2 <= MAX_WIRE;

  const backwards = () => setSteps(s => [...s, ...undoGates(s.map(x => x.gate)).map(gate => ({ gate, kind: 'back' as const }))]);

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Add gates to the machine. The qubit starts at 0 and goes through them from left to right.</p>

      <Panel>
        <GateButtons canAdd={steps.length < MAX_WIRE} canRemove={steps.length > 0}
          onAdd={g => setSteps(s => [...s, { gate: g, kind: 'gate' }])}
          onRemove={() => setSteps(s => s.slice(0, -1))}
          onClear={() => setSteps([])}>
          <button type="button" onClick={backwards} disabled={!canUndo}
            className="inline-flex items-center gap-1.5 text-quantum-neon hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline">
            <Undo2 className="w-4 h-4" /> Run it backwards
          </button>
        </GateButtons>
      </Panel>

      <div className="mt-8"><Wire steps={steps} /></div>
      <div className="mt-6">
        <Result amps={final}
          note={undone && spotOf(final) === '0' ? 'Back to 0. Doing the gates in reverse order undid every move.' : undefined} />
      </div>

      <Tip>
        Try <strong className="text-gray-200">H</strong>, then H again: the mix turns straight back into 0. Then try
        H, Z, H. Where does it end up?
      </Tip>
    </div>
  );
}

// ── Play: Gate puzzles ────────────────────────────────────────────────────────

const MAX_ADDED = 4;

const LEVELS: { locked: GateName[]; target: Spot; goal: string; lesson: (added: GateName[]) => string }[] = [
  { locked: [], target: '1',
    goal: 'Turn the qubit from 0 into 1.',
    lesson: () => 'Correct! X flips 0 into 1, just like NOT in a normal computer.' },
  { locked: [], target: '-',
    goal: 'Turn 0 into the − mix (the arrow pointing left). You need 2 gates.',
    lesson: () => 'Correct! There is more than one way: H then Z, or X then H. Either way the odds are 50/50, but the sign is −.' },
  { locked: ['H', 'Z'], target: '0',
    goal: 'Undo it: this machine already did H, then Z. Add gates to bring the qubit back to 0.',
    lesson: added => added.join() === 'Z,H'
      ? 'Correct! You retraced the steps: Z undid the Z, then H undid the H.'
      : 'Correct! Back to 0. The neat way is to do the gates in reverse order: Z, then H.' },
];

/** A hint naming what the gate that would finish the puzzle does, without saying which one to press. */
function hintFor(at: Amps, target: Spot) {
  const fix = (['X', 'H', 'Z'] as const).find(g => spotOf(GATES[g](at)) === target);
  if (fix === 'X') return 'Hint: X flips 0 and 1.';
  if (fix === 'H') return 'Hint: H turns a plain 0 or 1 into a mix, and a mix back into 0 or 1.';
  if (fix === 'Z') return 'Hint: Z flips the sign of a mix, + to − and back.';
  return 'Hint: X flips 0 and 1, H turns 0 or 1 into a mix and back, and Z flips the sign of a mix.';
}

function GatePuzzles() {
  return (
    <GameLevels title="Gate puzzles" levels={LEVELS}>
      {(i, win) => <Challenge level={LEVELS[i]} onWin={win} />}
    </GameLevels>
  );
}

function Challenge({ level, onWin }: { level: typeof LEVELS[number]; onWin: () => void }) {
  const [added, setAdded] = useState<GateName[]>([]);
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const final = run([...level.locked, ...added]);
  const change = (next: GateName[]) => edit(() => setAdded(next));

  const check = () => {
    const at = spotOf(final);
    if (added.length && at === level.target) {
      pass(level.lesson(added));
    } else if (!added.length) {
      fail('Not yet. Tap a gate to add it to the machine.');
    } else {
      fail(`Not yet. Your qubit ends at ${SPOT_NAMES[at]}, but the goal is ${SPOT_NAMES[level.target]}. ${hintFor(final, level.target)}`);
    }
  };

  return (
    <div className="max-w-2xl">
      <Panel>
        <GateButtons canAdd={!solved && added.length < MAX_ADDED} canRemove={!solved && added.length > 0}
          onAdd={g => change([...added, g])} onRemove={() => change(added.slice(0, -1))} onClear={() => change([])} />
      </Panel>

      <div className="mt-8">
        <Wire steps={[
          ...level.locked.map(gate => ({ gate, kind: 'locked' as const })),
          ...added.map(gate => ({ gate, kind: 'gate' as const })),
        ]} />
      </div>
      <div className="mt-6"><Result amps={final} /></div>

      <CheckAnswer onCheck={check} result={result} />
    </div>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'A qubit is 0. You apply the X gate. What is it now?',
    options: [
      { text: '1', correct: true, why: 'Right! X flips 0 into 1, like NOT in a normal computer.' },
      { text: 'Still 0', why: 'Not quite. X always changes 0 into 1. It is Z that leaves 0 alone.' },
      { text: 'A 50/50 mix', why: 'Not quite. That is what H does. X just flips 0 and 1.' },
      { text: 'Measured', why: 'Not quite. Gates never measure; they only turn the qubit.' },
    ],
  },
  {
    question: 'A qubit starts at 0. You apply H, then H again. What do you get?',
    options: [
      { text: '0', correct: true, why: 'Right! H undoes itself. The mix made by the first H turns straight back into 0.' },
      { text: '1', why: 'Not quite. The second H undoes the first, so you are back where you started: 0.' },
      { text: 'A 50/50 mix', why: 'Not quite. One H makes a mix, but a second H turns it back into 0.' },
      { text: 'A random answer', why: 'Not quite. Gates are exact, not random. Two H gates always bring 0 back to 0.' },
    ],
  },
  {
    question: 'True or false? An AND gate from a normal computer can be used as a quantum gate as it is.',
    options: [
      { text: 'True', why: 'Not quite. AND takes two inputs and gives one output, so it loses information and can\'t be undone.' },
      { text: 'False', correct: true, why: 'Right! AND loses information, so it can\'t be run backwards. Quantum gates must always be undoable.' },
    ],
  },
];
