import { createContext, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { learnApi } from '../api/learn';
import { NO_PROGRESS, clearLocalProgress, mergeLesson, mergeProgress, readLocalProgress, sameLesson, writeLocalProgress } from './progress';
import type { LessonProgress, Progress } from './progress';

// One shared copy of the learner's progress, for every page that shows it.
// Visitors keep theirs in this browser; signed-in users keep theirs on their
// account. When a visitor signs in or signs up, their browser progress is
// merged into the account and removed from the browser.

type Owner = 'guest' | `user:${number}`;

interface State {
  owner: Owner | null;
  progress: Progress;
  ready: boolean;
}

let state: State = { owner: null, progress: {}, ready: false };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getState = () => state;
function setState(next: State) {
  state = next;
  listeners.forEach(listener => listener());
}

/** Loads `owner`'s progress: from this browser for a visitor, from the server for an account. */
async function switchTo(owner: Owner) {
  if (state.owner === owner) return;
  if (owner === 'guest') {
    setState({ owner, progress: readLocalProgress(), ready: true });
    return;
  }
  setState({ owner, progress: {}, ready: false });
  const carried = readLocalProgress();
  const carrying = Object.keys(carried).length > 0;
  try {
    const saved = carrying ? await learnApi.save(carried) : await learnApi.get();
    if (carrying) clearLocalProgress();
    // Keep anything recorded while the request was on its way.
    if (state.owner === owner) setState({ owner, progress: mergeProgress(saved, state.progress), ready: true });
  } catch {
    // Server unreachable: this visit's progress still shows, and browser progress stays to carry over next time.
    if (state.owner === owner) setState({ ...state, ready: true });
  }
}

/** Adds to the progress in one lesson, for whoever is learning now. */
function record(slug: string, update: Partial<LessonProgress>) {
  const { owner, progress } = state;
  if (!owner) return;
  const before = progress[slug] ?? NO_PROGRESS;
  const after = mergeLesson(before, update);
  if (sameLesson(before, after)) return;
  const all = { ...progress, [slug]: after };
  setState({ ...state, progress: all });
  if (owner === 'guest') writeLocalProgress(all);
  else learnApi.save({ [slug]: after }).catch(() => { /* kept on screen for this visit */ });
}

const NOTHING: Progress = {};

/** The learner's progress in every lesson, and `record` to add to it. */
export function useLearnProgress() {
  const { user, loading } = useAuth();
  const owner: Owner | null = loading ? null : user ? `user:${user.id}` : 'guest';
  const snapshot = useSyncExternalStore(subscribe, getState);

  useEffect(() => {
    if (owner) void switchTo(owner);
  }, [owner]);

  const current = owner !== null && snapshot.owner === owner;
  return { progress: current ? snapshot.progress : NOTHING, ready: current && snapshot.ready, record };
}

/** The open lesson's saved progress, and how to add to it. Set by LessonPage; used by its game and quiz. */
export interface LessonRecorder {
  best: LessonProgress;
  recordStars: (stars: number) => void;
  recordQuiz: (score: number) => void;
}

export const LessonProgressContext = createContext<LessonRecorder | null>(null);
