import { useContext, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, Trophy } from 'lucide-react';
import { shuffled } from '../lists';
import { LessonProgressContext } from '../useLearnProgress';

export interface QuizOption {
  text: string;
  correct?: boolean;
  /** Shown after picking this answer: why it is right or wrong. */
  why: string;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

/**
 * The quiz at the end of a lesson: questions one at a time. Wrong answers
 * explain why and can be retried; the score counts right-first-time answers.
 * Multiple-choice answers are shuffled each time a question appears, so the
 * right one is never always in the same place. True/false keeps its order.
 */
export function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [round, setRound] = useState(0);             // restarts the whole quiz
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const last = questions.length - 1;
  const score = firstTry.filter(Boolean).length;
  const finished = solved && index === last;

  // Finishing the quiz finishes the lesson; the lesson keeps its best score.
  const lessonProgress = useContext(LessonProgressContext);
  const recordQuiz = lessonProgress?.recordQuiz;
  const bestScore = lessonProgress?.best.quizScore ?? null;
  useEffect(() => {
    if (finished) recordQuiz?.(score);
  }, [finished, score, recordQuiz]);

  const restart = () => { setRound(r => r + 1); setIndex(0); setSolved(false); setFirstTry([]); };

  return (
    <div>
      <p className="text-sm text-gray-400 mb-2">Question {index + 1} of {questions.length}</p>
      <Question key={`${round}-${index}`} {...questions[index]}
        onSolved={first => { setSolved(true); setFirstTry(f => [...f, first]); }} />

      {solved && index < last && (
        <button type="button" onClick={() => { setIndex(i => i + 1); setSolved(false); }}
          className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50">
          Next question <ArrowRight className="w-4 h-4" />
        </button>
      )}
      {finished && (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-quantum-neon/10 px-4 py-3">
          <span className="flex items-center gap-2 text-white font-semibold">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>
              {score === questions.length ? 'Perfect! ' : ''}You got {score} of {questions.length} right first time.
              {bestScore !== null && bestScore > score && (
                <span className="text-gray-300 font-normal"> Your best: {bestScore} of {questions.length}.</span>
              )}
            </span>
          </span>
          <button type="button" onClick={restart}
            className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white">
            <RotateCcw className="w-4 h-4" /> Try the quiz again
          </button>
        </div>
      )}
    </div>
  );
}

function Question({ question, options, onSolved }: QuizQuestion & { onSolved: (firstTry: boolean) => void }) {
  // Picked once per showing (a retry of the quiz mounts the question again).
  const [order] = useState(() => {
    const indexes = options.map((_, i) => i);
    return options.length > 2 ? shuffled(indexes) : indexes;
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const solved = picked !== null && !!options[picked].correct;

  const pick = (i: number) => {
    setPicked(i);
    setTries(t => t + 1);
    if (options[i].correct) onSolved(tries === 0);
  };

  return (
    <div>
      <p className="text-white font-semibold text-lg mb-5">{question}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {order.map(i => {
          const o = options[i];
          const isPicked = picked === i;
          const look = isPicked
            ? o.correct ? 'border-green-500/60 bg-green-500/10 text-white' : 'border-red-500/60 bg-red-500/10 text-white'
            : 'border-quantum-600 bg-quantum-900/50 text-gray-200 hover:border-quantum-neon/50 disabled:hover:border-quantum-600';
          return (
            <button key={o.text} type="button" onClick={() => pick(i)} disabled={solved} aria-pressed={isPicked}
              className={`text-left rounded-xl border px-4 py-3 text-sm transition-colors disabled:cursor-default ${look}`}>
              {o.text}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p role="status" className={`mt-4 flex items-start gap-2 text-sm ${solved ? 'text-green-300' : 'text-red-300'}`}>
          {solved ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <span>{options[picked].why}{!solved && ' Try another answer.'}</span>
        </p>
      )}
    </div>
  );
}
