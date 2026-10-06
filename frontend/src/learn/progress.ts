import { LESSONS } from './lessons';

// A learner's progress in each lesson. It only ever goes up: the best stars
// from the game, the best quiz score, and whether the lesson was finished
// (finishing the Test finishes the lesson).

export interface LessonProgress {
  stars: number;              // 0–3, one per game level won
  quizScore: number | null;   // 0–3 right first time, or null before the Test is done
  completed: boolean;
}

/** Progress by lesson slug. Lessons not started yet are missing. */
export type Progress = Record<string, LessonProgress>;

export const NO_PROGRESS: LessonProgress = { stars: 0, quizScore: null, completed: false };

const MAX_STARS = 3;
const MAX_QUIZ = 3;

/** `saved` with `update` added, keeping the best of each. */
export function mergeLesson(saved: LessonProgress = NO_PROGRESS, update: Partial<LessonProgress>): LessonProgress {
  const quiz = update.quizScore ?? null;
  return {
    stars: Math.max(saved.stars, update.stars ?? 0),
    quizScore: quiz === null ? saved.quizScore : saved.quizScore === null ? quiz : Math.max(saved.quizScore, quiz),
    completed: saved.completed || !!update.completed,
  };
}

export const sameLesson = (a: LessonProgress, b: LessonProgress) =>
  a.stars === b.stars && a.quizScore === b.quizScore && a.completed === b.completed;

/** Two whole progress records combined, lesson by lesson. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = { ...a };
  for (const [slug, p] of Object.entries(b)) out[slug] = mergeLesson(out[slug], p);
  return out;
}

// ── Visitors: kept in this browser ────────────────────────────────────────────

const STORAGE_KEY = 'qai_learn_progress';
const SLUGS = new Set(LESSONS.map(l => l.slug));
const whole = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

/** Keeps only known lessons and sensible values, whatever the stored text holds. */
function clean(raw: unknown): Progress {
  if (!raw || typeof raw !== 'object') return {};
  const out: Progress = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!SLUGS.has(slug) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    out[slug] = { stars: whole(v.stars, MAX_STARS) ?? 0, quizScore: whole(v.quizScore, MAX_QUIZ), completed: v.completed === true };
  }
  return out;
}

// Storage can be missing or blocked (private windows, strict settings), so every use is guarded.
export function readLocalProgress(): Progress {
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

export function writeLocalProgress(progress: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

export function clearLocalProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}
