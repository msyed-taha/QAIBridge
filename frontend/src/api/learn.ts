import apiClient from './client';
import type { Progress } from '../learn/progress';

// The server speaks snake_case; the app uses camelCase.
interface LessonProgressWire {
  stars:      number;
  quiz_score: number | null;
  completed:  boolean;
}

const fromWire = (lessons: Record<string, LessonProgressWire>): Progress =>
  Object.fromEntries(Object.entries(lessons).map(([slug, p]) => [slug, { stars: p.stars, quizScore: p.quiz_score, completed: p.completed }]));

const toWire = (progress: Progress): Record<string, LessonProgressWire> =>
  Object.fromEntries(Object.entries(progress).map(([slug, p]) => [slug, { stars: p.stars, quiz_score: p.quizScore, completed: p.completed }]));

/** The signed-in user's Learn progress. Saving only ever raises it; both calls return everything saved. */
export const learnApi = {
  get: async (): Promise<Progress> => {
    const { data } = await apiClient.get<{ lessons: Record<string, LessonProgressWire> }>('/api/learn/progress');
    return fromWire(data.lessons);
  },

  save: async (progress: Progress): Promise<Progress> => {
    const { data } = await apiClient.post<{ lessons: Record<string, LessonProgressWire> }>('/api/learn/progress', { lessons: toWire(progress) });
    return fromWire(data.lessons);
  },
};
