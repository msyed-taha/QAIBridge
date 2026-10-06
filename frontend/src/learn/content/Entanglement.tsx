import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link2, ArrowLeftRight, Puzzle, MessageSquareOff, KeyRound, RotateCcw, Check, X } from 'lucide-react';
import { LessonSteps } from '../components/LessonSteps';
import { ReadList, Point, IconTile, GoodToKnow } from '../components/ReadPoints';
import { GameLevels, CheckAnswer, useLevelAnswer } from '../components/GameLevels';
import { Quiz } from '../components/Quiz';
import type { QuizQuestion } from '../components/Quiz';
import { Panel, Pills, Segmented, Tip } from '../components/ui';
import type { Option } from '../components/ui';
import { CARDS, measurePair, mustDiffer, planWins, qubitScore, qubitWinChance, randomBit, wins } from '../entanglement';
import type { Bit, Card, Dials, Plan } from '../entanglement';
import { BRAND_FILL, ZERO_COLOR, ONE_COLOR } from '../colors';

/** Lesson 6 — Entanglement. */
export default function Entanglement() {
  return (
    <LessonSteps parts={{
      read: <Read />,
      see: <See />,
      play: <NoTalkingGame />,
      test: <Quiz questions={QUESTIONS} />,
    }} />
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

function Read() {
  return (
    <ReadList>
      <Point title="Two qubits, one shared state" visual={<IconTile color="#cc44ff"><Link2 className="w-6 h-6" /></IconTile>}>
        Two qubits can be linked so that they share a single state. This is called
        <strong className="text-white"> entanglement</strong>. The pair can be a mix of "both 0" and "both 1", but
        never one 0 and one 1.
      </Point>

      <Point title="Look at one, know the other" visual={<IconTile color="#22d3ee"><ArrowLeftRight className="w-6 h-6" /></IconTile>}>
        Measure the first qubit and you get 0 or 1 at random. From that moment, the other one will give the
        <strong className="text-white"> same answer</strong>, even if it's on the other side of the world.
      </Point>

      <Point title="Not a hidden plan" visual={<IconTile color="#fbbf24"><Puzzle className="w-6 h-6" /></IconTile>}>
        It's tempting to think the pair agreed their answers in advance, like a pair of gloves split into two boxes.
        Experiments called <strong className="text-white">Bell tests</strong> prove that no hidden plan can explain the
        results. They won the 2022 Nobel Prize in Physics.
      </Point>

      <Point title="No messages faster than light" visual={<IconTile color="#ec4899"><MessageSquareOff className="w-6 h-6" /></IconTile>}>
        Entanglement <strong className="text-white">can't send a message</strong>. On their own, each side sees only
        random 0s and 1s, whatever the other side does. The match shows up only when Alice and Bob compare results,
        by phone or email, at normal speed.
      </Point>

      <Point title="What it's used for" visual={<IconTile color="#00ffcc"><KeyRound className="w-6 h-6" /></IconTile>}>
        Quantum computers link their qubits into one big shared state, which their speed-ups depend on. Entanglement
        also makes <strong className="text-white">secret keys</strong> possible that reveal any spy who listens in.
      </Point>

      <GoodToKnow>
        the "spooky action at a distance" that worried Einstein is real, but it's shared randomness, not a signal.
        No information travels between the two qubits.
      </GoodToKnow>
    </ReadList>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

const BITS: Option<Bit>[] = [{ value: 0, label: '0', fill: ZERO_COLOR }, { value: 1, label: '1', fill: ONE_COLOR }];
const CARD_COLORS: Record<Card, string> = { blue: '#3b82f6', red: '#ef4444' };
const CARD_NAMES: Record<Card, string> = { blue: 'Blue', red: 'Red' };

/** A result square: "?" before anyone looks, then a teal 0 or a purple 1. */
function BitTile({ bit }: { bit: Bit | null }) {
  return (
    <span className={`w-14 h-14 rounded-xl flex items-center justify-center font-mono text-2xl font-extrabold transition-colors ${
      bit === null ? 'border-2 border-dashed border-quantum-600 text-gray-500' : 'text-black'}`}
      style={bit === null ? undefined : { background: bit ? ONE_COLOR : ZERO_COLOR }}>
      {bit ?? '?'}
    </span>
  );
}

function CardChip({ card }: { card: Card }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold text-white align-middle"
      style={{ background: CARD_COLORS[card] }}>
      {CARD_NAMES[card]}
    </span>
  );
}

// ── See: two labs ─────────────────────────────────────────────────────────────

type PairKind = 'linked' | 'separate';
const PAIR_KINDS: Option<PairKind>[] = [{ value: 'linked', label: 'Linked pair' }, { value: 'separate', label: 'Two separate qubits' }];
const LOG_SHOWN = 20;
const UNSEEN = { alice: null, bob: null };

function See() {
  const [kind, setKind] = useState<PairKind>('linked');
  const [pair, setPair] = useState<{ alice: Bit | null; bob: Bit | null }>(UNSEEN);
  const [log, setLog] = useState<[Bit, Bit][]>([]);
  const linked = kind === 'linked';

  const pick = (k: PairKind) => { setKind(k); setPair(UNSEEN); setLog([]); };

  // Whoever looks first gets a random bit. With a linked pair the other one
  // then gives the same bit; separate qubits stay a coin flip.
  const look = (who: 'alice' | 'bob') => {
    if (pair[who] !== null) return;
    const other = who === 'alice' ? pair.bob : pair.alice;
    const next = { ...pair, [who]: linked && other !== null ? other : randomBit() };
    setPair(next);
    if (next.alice !== null && next.bob !== null) setLog(l => [...l, [next.alice, next.bob] as [Bit, Bit]]);
  };

  const measureMany = () => {
    const pairs = Array.from({ length: LOG_SHOWN }, () => measurePair(linked));
    const [a, b] = pairs[pairs.length - 1];
    setPair({ alice: a, bob: b });
    setLog(l => [...l, ...pairs]);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-gray-200 text-lg mb-8">Alice and Bob each take one qubit of a pair to labs far apart. Then they look.</p>

      <Panel className="space-y-4">
        <Pills label="The pair" options={PAIR_KINDS} value={kind} onChange={pick} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <button type="button" onClick={measureMany}
            className="px-4 py-2 rounded-xl font-bold text-black hover:brightness-110 transition-all" style={{ background: BRAND_FILL }}>
            Measure {LOG_SHOWN} more pairs
          </button>
          <button type="button" onClick={() => setPair(UNSEEN)} disabled={pair.alice === null && pair.bob === null}
            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-300">
            <RotateCcw className="w-4 h-4" /> New pair
          </button>
        </div>
      </Panel>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Lab name="Alice" bit={pair.alice} onLook={() => look('alice')} />
        <div className="flex flex-col items-center" aria-hidden="true">
          <span className={`block h-0.5 w-8 sm:w-20 ${linked
            ? 'bg-gradient-to-r from-quantum-neon to-quantum-purple motion-safe:animate-pulse'
            : 'border-t-2 border-dashed border-quantum-600'}`} />
          <span className="mt-1.5 text-[11px] text-gray-400">{linked ? 'linked' : 'separate'}</span>
        </div>
        <Lab name="Bob" bit={pair.bob} onLook={() => look('bob')} />
      </div>
      <p className="mt-4 text-center text-gray-300" aria-live="polite">{pairNote(pair, linked)}</p>

      <div className="mt-8"><PairLog log={log} /></div>

      <Tip>
        On his own, Bob just sees random 0s and 1s. He can only spot the match after Alice tells him her results,
        by phone, at normal speed. So <strong className="text-gray-200">no message travels faster than light</strong>.
      </Tip>
    </div>
  );
}

function pairNote({ alice, bob }: { alice: Bit | null; bob: Bit | null }, linked: boolean) {
  if (alice === null && bob === null) {
    return linked ? 'Nobody has looked yet. They will match, but nobody knows which way.' : 'Nobody has looked yet. Each qubit is a 50/50 mix.';
  }
  if (alice === null || bob === null) {
    const [first, seen, other] = alice !== null ? ['Alice', alice, 'Bob'] : ['Bob', bob, 'Alice'];
    return linked ? `${first} got ${seen}. ${other}'s qubit will now give ${seen} too.` : `${first} got ${seen}. ${other}'s qubit is still 50/50.`;
  }
  if (alice === bob) return linked ? `Both got ${alice}. They match, as always.` : `Both got ${alice}. A lucky match.`;
  return `Alice got ${alice}, Bob got ${bob}. No link, so no match.`;
}

function Lab({ name, bit, onLook }: { name: string; bit: Bit | null; onLook: () => void }) {
  return (
    <div className="rounded-xl border border-quantum-700 bg-quantum-900/40 p-4 flex flex-col items-center text-center">
      <p className="text-sm font-semibold text-white mb-3">{name}'s lab</p>
      <BitTile bit={bit} />
      <button type="button" onClick={onLook} disabled={bit !== null} aria-label={`${name} looks`}
        className="mt-3 px-4 py-1.5 rounded-full text-sm font-semibold border border-quantum-600 text-white bg-quantum-900/60 hover:border-quantum-neon/50 transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:border-quantum-600">
        Look
      </button>
    </div>
  );
}

/** The last pairs measured, Alice's above Bob's, and how often they matched. */
function PairLog({ log }: { log: [Bit, Bit][] }) {
  if (!log.length) return <p className="text-sm text-gray-400">No pairs yet. Let both look, or measure {LOG_SHOWN} pairs at once.</p>;
  const shown = log.slice(-LOG_SHOWN);
  const matches = log.filter(([a, b]) => a === b).length;
  const aliceZeros = log.filter(([a]) => a === 0).length;
  const row = (who: 0 | 1) => (
    <div className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5">
      {shown.map((p, i) => (
        <span key={i} className={`aspect-square rounded-sm flex items-center justify-center font-mono text-[10px] font-bold text-black ${
          p[0] === p[1] ? '' : 'ring-1 ring-red-400'}`}
          style={{ background: p[who] ? ONE_COLOR : ZERO_COLOR }}>
          <span className="hidden sm:inline">{p[who]}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div>
      <p className="text-sm text-gray-400 mb-2">Last {shown.length} {shown.length === 1 ? 'pair' : 'pairs'}</p>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-y-1.5" role="img"
        aria-label={`Alice's results: ${shown.map(p => p[0]).join(' ')}. Bob's results: ${shown.map(p => p[1]).join(' ')}.`}>
        <span className="text-xs text-gray-300">Alice</span>{row(0)}
        <span className="text-xs text-gray-300">Bob</span>{row(1)}
      </div>
      <p className="mt-4 text-gray-200">
        Matched <strong className="text-white">{matches} of {log.length}</strong> pairs.
        <span className="text-gray-400"> Alice got 0 in {aliceZeros} of {log.length}: on her own, her results look random.</span>
      </p>
    </div>
  );
}

// ── Play: The no-talking game ─────────────────────────────────────────────────

const LEVELS = [
  { goal: 'Learn the rule: both cards are shown below. Pick what Alice and Bob say so that they win.' },
  { goal: 'Make a plan: choose what each of them says for each card, so they win 3 of the 4 card pairs (75%).' },
  { goal: 'Use linked qubits: each now holds one qubit of a pair and turns a measuring dial before looking. Alice uses 0° for Blue and 45° for Red. Pick Bob\'s dials to beat 75%.' },
];

function NoTalkingGame() {
  return (
    <GameLevels title="The no-talking game" levels={LEVELS}>
      {(i, win) => (
        <div className="max-w-2xl">
          <Rules />
          {i === 0 ? <LearnTheRule onWin={win} /> : i === 1 ? <MakeAPlan onWin={win} /> : <UseLinkedQubits onWin={win} />}
        </div>
      )}
    </GameLevels>
  );
}

function Rules() {
  return (
    <p className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-gray-200 leading-relaxed">
      <strong className="text-white">The rule:</strong> Alice and Bob each get a card. They win if they say
      the <strong className="text-white">same</strong> number, unless both got <CardChip card="red" />. Then they must say
      <strong className="text-white"> different</strong> numbers. Once the cards are dealt, they can't talk.
    </p>
  );
}

/** The four card pairs: Alice's card down the side, Bob's across the top. */
function PairGrid({ cell }: { cell: (alice: Card, bob: Card) => ReactNode }) {
  return (
    <table className="w-full text-sm border-separate border-spacing-1.5">
      <thead>
        <tr>
          <th className="text-left text-xs font-normal text-gray-400">Alice ↓ · Bob →</th>
          {CARDS.map(cb => <th key={cb} scope="col"><CardChip card={cb} /></th>)}
        </tr>
      </thead>
      <tbody>
        {CARDS.map(ca => (
          <tr key={ca}>
            <th scope="row" className="text-left"><CardChip card={ca} /></th>
            {CARDS.map(cb => (
              <td key={cb} className="rounded-lg border border-quantum-700 bg-quantum-900/40 px-2 py-2 text-center">
                <span className="block text-[11px] text-gray-400 mb-0.5">{mustDiffer(ca, cb) ? 'must differ' : 'must match'}</span>
                {cell(ca, cb)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LearnTheRule({ onWin }: { onWin: () => void }) {
  const [said, setSaid] = useState<{ alice: Bit; bob: Bit }>({ alice: 0, bob: 0 });
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);

  const check = () => {
    if (wins('red', 'red', said.alice, said.bob)) {
      pass('Correct! Both got Red, so they must say different numbers. With any other pair of cards, they must say the same.');
    } else {
      fail('Not quite. Both got Red, so their numbers must be different.');
    }
  };

  return (
    <>
      <Panel className="space-y-4">
        <p className="text-sm text-gray-300">Alice's card: <CardChip card="red" /> &nbsp; Bob's card: <CardChip card="red" /></p>
        <Segmented label="Alice says" options={BITS} value={said.alice} disabled={solved}
          onChange={v => edit(() => setSaid(s => ({ ...s, alice: v })))} />
        <Segmented label="Bob says" options={BITS} value={said.bob} disabled={solved}
          onChange={v => edit(() => setSaid(s => ({ ...s, bob: v })))} />
      </Panel>
      <CheckAnswer onCheck={check} result={result} />
    </>
  );
}

const PLAYERS = ['alice', 'bob'] as const;

function MakeAPlan({ onWin }: { onWin: () => void }) {
  // Starts on a poor plan (it wins only 1 of the 4 card pairs).
  const [plans, setPlans] = useState<{ alice: Plan; bob: Plan }>({ alice: { blue: 0, red: 0 }, bob: { blue: 1, red: 1 } });
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const won = planWins(plans.alice, plans.bob);

  const check = () => {
    if (won === 3) {
      pass('Correct! 75% is the best any plan can do. Try changing it: whatever you pick, at least one card pair is always lost.');
    } else {
      fail(`Not yet. Your plan wins ${won} of the 4 card pairs. Look at the squares marked ✗. Hint: what happens if they always say the same number?`);
    }
  };

  return (
    <>
      <Panel className="space-y-3">
        {PLAYERS.flatMap(who => CARDS.map(card => (
          <Segmented key={`${who}-${card}`} label={`${who === 'alice' ? 'Alice' : 'Bob'}, if ${CARD_NAMES[card]}`}
            options={BITS} value={plans[who][card]} disabled={solved}
            onChange={v => edit(() => setPlans(p => ({ ...p, [who]: { ...p[who], [card]: v } })))} />
        )))}
      </Panel>

      <div className="mt-6" aria-live="polite">
        <PairGrid cell={(ca, cb) => {
          const a = plans.alice[ca], b = plans.bob[cb];
          const ok = wins(ca, cb, a, b);
          return (
            <span className={`inline-flex items-center gap-1 font-semibold ${ok ? 'text-green-300' : 'text-red-300'}`}>
              {ok ? <Check className="w-4 h-4" aria-hidden="true" /> : <X className="w-4 h-4" aria-hidden="true" />}
              <span className="sr-only">{ok ? 'wins' : 'loses'}</span>
              <span className="font-mono">{a} · {b}</span>
            </span>
          );
        }} />
        <p className="mt-2 text-gray-200">This plan wins <strong className="text-white">{won} of 4</strong> card pairs: {won * 25}%.</p>
      </div>
      <CheckAnswer onCheck={check} result={result} />
    </>
  );
}

const ALICE_DIALS: Dials = { blue: 0, red: 45 };
const BOB_DIAL_OPTIONS: Option<number>[] = [-22.5, 22.5, 67.5].map(d => ({ value: d, label: `${d < 0 ? '−' : ''}${Math.abs(d)}°` }));
const BEST_PLAN = 0.75;

function UseLinkedQubits({ onWin }: { onWin: () => void }) {
  const [bob, setBob] = useState<Dials>({ blue: 67.5, red: 67.5 });
  const { result, solved, edit, pass, fail } = useLevelAnswer(onWin);
  const score = qubitScore(ALICE_DIALS, bob);
  const pct = Math.round(score * 100);

  const check = () => {
    if (score > 0.85) {
      pass('Correct! About 85%, better than any plan could ever do. No hidden plan can explain this, which is how Bell tests proved entanglement is real.');
    } else {
      fail(`Not yet. This set-up wins ${pct}%${score <= BEST_PLAN ? ', no better than a plan' : ''}. Hint: when they must match, `
        + 'their dials should be close (22.5° apart); when both got Red, far apart (67.5°).');
    }
  };

  return (
    <>
      <Panel className="space-y-3">
        <p className="text-sm text-gray-300">Alice's dial: 0° for <CardChip card="blue" />, 45° for <CardChip card="red" /></p>
        {CARDS.map(card => (
          <Segmented key={card} label={`Bob's dial, if ${CARD_NAMES[card]}`} options={BOB_DIAL_OPTIONS} value={bob[card]} disabled={solved}
            onChange={v => edit(() => setBob(d => ({ ...d, [card]: v })))} />
        ))}
      </Panel>

      <div className="mt-6" aria-live="polite">
        <PairGrid cell={(ca, cb) => (
          <span className="font-semibold text-white">{Math.round(qubitWinChance(ca, cb, ALICE_DIALS, bob) * 100)}%</span>
        )} />
        <p className="mt-3 text-gray-200">They win <strong className="text-white">{pct}%</strong> of rounds.</p>
        <div className="relative mt-2 mb-7 h-3 rounded-full bg-quantum-900/80 ring-1 ring-quantum-700" role="img"
          aria-label={`Wins ${pct}% of rounds. The best plan without qubits wins 75%.`}>
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: BRAND_FILL }} />
          <span className="absolute -top-1 -bottom-1 w-0.5 bg-amber-400" style={{ left: `${BEST_PLAN * 100}%` }} />
          <span className="absolute top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs text-amber-300" style={{ left: `${BEST_PLAN * 100}%` }}>
            best plan: 75%
          </span>
        </div>
      </div>
      <CheckAnswer onCheck={check} result={result} />
    </>
  );
}

// ── Test ──────────────────────────────────────────────────────────────────────

const QUESTIONS: QuizQuestion[] = [
  {
    question: 'Alice measures her half of a linked pair and gets 1. What will Bob get?',
    options: [
      { text: '1', correct: true, why: 'Right! A linked pair always gives the same answer on both sides.' },
      { text: '0', why: 'Not quite. This pair is "both 0 or both 1", so Bob gets the same as Alice.' },
      { text: '50/50 random', why: 'Not quite. Before anyone looked it was 50/50, but now Alice got 1, Bob will get 1 too.' },
      { text: 'Nothing until Alice calls him', why: 'Not quite. Bob gets 1 straight away. He just can\'t know it matches until Alice tells him.' },
    ],
  },
  {
    question: 'True or false? Alice can use entanglement to send Bob a message faster than light.',
    options: [
      { text: 'True', why: 'Not quite. Bob only ever sees random 0s and 1s. The match appears only when they compare results at normal speed.' },
      { text: 'False', correct: true, why: 'Right! Each side alone sees random results, so no message can get through.' },
    ],
  },
  {
    question: 'What do Bell tests, like the game you played, prove?',
    options: [
      { text: "The pair didn't just agree their answers in advance", correct: true,
        why: 'Right! No plan can win more than 75%, but linked qubits win about 85%. So it is not a hidden plan.' },
      { text: 'Entangled qubits send messages', why: 'Not quite. Entanglement never sends a message. Bell tests show it is not a hidden plan.' },
      { text: 'Qubits are always 50/50', why: 'Not quite. Bell tests are about the pair, not one qubit: they rule out a hidden plan.' },
      { text: 'Measuring breaks the computer', why: 'Not quite. Bell tests show that linked qubits do better than any plan agreed in advance.' },
    ],
  },
];
