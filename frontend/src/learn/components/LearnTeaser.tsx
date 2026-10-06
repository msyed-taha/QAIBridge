import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { FREE_LESSON_COUNT, LESSONS, TOTAL_MINUTES, lessonPath } from '../lessons';
import { useLearnProgress } from '../useLearnProgress';
import { BRAND_FILL } from '../colors';

const FREE_LESSONS = LESSONS.filter(l => l.free);
const FIRST_LOCKED = LESSONS.find(l => !l.free);

/**
 * The public home page's invitation into the Learn course: the free lessons,
 * one tap away. A visitor who has already started (their progress is in this
 * browser) is offered the next lesson instead, or an account once the free
 * lessons are done.
 */
export function LearnTeaser() {
  const { progress } = useLearnProgress();
  const started = FREE_LESSONS.some(l => progress[l.slug]);
  const next = FREE_LESSONS.find(l => !progress[l.slug]?.completed);

  const primary = next
    ? { to: lessonPath(next), state: undefined, label: started ? `Continue with lesson ${next.n}` : 'Start lesson 1' }
    : { to: '/register', state: FIRST_LOCKED && { from: lessonPath(FIRST_LOCKED) }, label: 'Create a free account to keep going' };

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-10 grid gap-10 md:grid-cols-2 md:items-center">
      <div>
        <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-3">Free quantum course</p>
        <h2 className="text-3xl font-bold text-white mb-3">New to quantum? Start here.</h2>
        <p className="text-gray-400 text-base leading-relaxed">
          {LESSONS.length} short lessons, about {TOTAL_MINUTES} minutes in all. Read a little, watch it move, then play a
          quick game. The first {FREE_LESSON_COUNT} need no account.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link to={primary.to} state={primary.state}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 hover:brightness-110"
            style={{ background: BRAND_FILL }}>
            {primary.label} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/learn" className="inline-flex items-center gap-1.5 text-sm font-medium text-quantum-neon hover:text-teal-300 transition-colors">
            See all {LESSONS.length} lessons <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div>
        <ol className="space-y-3" aria-label="The free lessons">
          {FREE_LESSONS.map(l => {
            const done = !!progress[l.slug]?.completed;
            return (
              <li key={l.slug}>
                <Link to={lessonPath(l)}
                  className="group flex items-center gap-4 rounded-xl border border-quantum-700 bg-quantum-900/40 px-4 py-3 hover:border-quantum-neon/50 transition-colors">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${l.color}1f`, border: `1px solid ${l.color}55` }}>
                    <l.icon className="w-5 h-5" style={{ color: l.color }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      Lesson {l.n}
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{l.minutes} min</span>
                    </span>
                    <span className="block text-white font-semibold">{l.title}</span>
                  </span>
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-300">
                      <CheckCircle2 className="w-4 h-4" /> Done
                    </span>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-quantum-neon group-hover:translate-x-0.5 transition-all" />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 px-1 text-sm text-gray-500">
          + {LESSONS.length - FREE_LESSON_COUNT} more lessons, from gates to Shor's algorithm, with a free account.
        </p>
      </div>
    </div>
  );
}
