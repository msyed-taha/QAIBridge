import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Star, ArrowRight, RotateCcw, Lightbulb, XCircle } from 'lucide-react';
import { BRAND_FILL } from '../colors';
import { LessonProgressContext } from '../useLearnProgress';

export interface GameLevel {
  goal: string;
}

interface CheckResult {
  ok: boolean;
  text: string;
}

/**
 * The answer state of one level. Every change the player makes goes through
 * `edit`: it is ignored once the level is solved (the level locks), and it
 * clears an old "not yet" message. `pass` wins the level; `fail` explains why not.
 */
export function useLevelAnswer(onWin: () => void) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const solved = !!result?.ok;
  return {
    result,
    solved,
    edit: (change: () => void) => {
      if (solved) return;
      change();
      setResult(null);
    },
    pass: (text: string) => {
      setResult({ ok: true, text });
      onWin();
    },
    fail: (text: string) => setResult({ ok: false, text }),
  };
}

/**
 * The "Check answer" button every game uses. Levels are never won on their own:
 * the player sets things up, then checks. A wrong answer says why and how to
 * fix it. `result` comes from useLevelAnswer.
 */
export function CheckAnswer({ onCheck, result, disabled = false }: {
  onCheck: () => void;
  result: CheckResult | null;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 space-y-4">
      {!result?.ok && (
        <button type="button" onClick={onCheck} disabled={disabled}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: BRAND_FILL }}>
          Check answer
        </button>
      )}
      {result && (
        <p aria-live="polite" className={`flex items-start gap-2 ${result.ok ? 'text-gray-200' : 'text-amber-200'}`}>
          {result.ok
            ? <Lightbulb className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" />
            : <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />}
          {result.text}
        </p>
      )}
    </div>
  );
}

/**
 * The frame every lesson game uses: "Level 1 of 3", the goal, one star per
 * level won, and "Next level" / "Play again". The lesson draws the level and
 * calls `win()` when a checked answer is right. Stars live only on this page for now.
 */
export function GameLevels({ title, levels, children }: {
  title: string;
  levels: GameLevel[];
  children: (level: number, win: () => void) => ReactNode;
}) {
  const [level, setLevel] = useState(0);
  const [attempt, setAttempt] = useState(0);         // restarts the level's own state
  const [cleared, setCleared] = useState(false);     // won in this attempt
  const [won, setWon] = useState(() => levels.map(() => false));

  const last = levels.length - 1;
  const stars = won.filter(Boolean).length;

  // Save the stars as they grow; the lesson keeps its best ever.
  const lessonProgress = useContext(LessonProgressContext);
  const recordStars = lessonProgress?.recordStars;
  const bestStars = lessonProgress?.best.stars ?? 0;
  useEffect(() => {
    if (stars > 0) recordStars?.(stars);
  }, [stars, recordStars]);
  const goTo = (i: number) => { setLevel(i); setAttempt(a => a + 1); setCleared(false); };
  const win = () => {
    setCleared(true);
    setWon(w => w.map((x, i) => x || i === level));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-white font-bold text-lg">{title}</h3>
        <p className="flex items-center gap-0.5" aria-label={`${stars} of ${levels.length} stars`}>
          {levels.map((_, i) => (
            <Star key={i} className={`w-5 h-5 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`} />
          ))}
        </p>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Level {level + 1} of {levels.length}
        {bestStars > 0 && <span className="text-gray-500"> · Your best: {bestStars} of {levels.length} stars</span>}
      </p>
      <p className="text-gray-200 mb-6">{levels[level].goal}</p>

      <div key={`${level}-${attempt}`}>{children(level, win)}</div>

      {cleared && (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-green-500/10 px-4 py-3">
          <span className="flex items-center gap-2 text-green-300 font-semibold">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            {level === last && stars === levels.length ? `All ${levels.length} stars. Well done!` : 'Nice! Level complete.'}
          </span>
          {level < last ? (
            <button type="button" onClick={() => goTo(level + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-black hover:brightness-110"
              style={{ background: BRAND_FILL }}>
              Next level <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={() => goTo(0)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50">
              <RotateCcw className="w-4 h-4" /> Play again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
