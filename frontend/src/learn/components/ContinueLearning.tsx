import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock, Star } from 'lucide-react';
import { LESSONS, TOTAL_MINUTES, lessonPath } from '../lessons';
import { useLearnProgress } from '../useLearnProgress';
import { BRAND_FILL } from '../colors';

const MAX_STARS = LESSONS.length * 3;

/**
 * The signed-in home's way into the Learn course: the next lesson to do, how
 * far along you are, and every lesson one tap away. Reads the saved progress.
 */
export function ContinueLearning() {
  const { progress, ready } = useLearnProgress();

  if (!ready) {
    return (
      <div className="glass-card rounded-2xl p-6 sm:p-8 min-h-[12rem] flex items-center justify-center" aria-busy="true">
        <p className="text-sm text-gray-400">Loading your progress…</p>
      </div>
    );
  }

  const done = LESSONS.filter(l => progress[l.slug]?.completed).length;
  const stars = LESSONS.reduce((sum, l) => sum + (progress[l.slug]?.stars ?? 0), 0);
  const started = Object.keys(progress).length > 0;
  const next = LESSONS.find(l => !progress[l.slug]?.completed);

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center">
      {/* The next step */}
      <div>
        {next ? (
          <>
            <p className="text-xs font-semibold text-quantum-neon uppercase tracking-widest mb-3">
              {started ? 'Up next' : 'Free quantum course'}
            </p>
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${next.color}1f`, border: `1px solid ${next.color}55` }}>
                <next.icon className="w-6 h-6" style={{ color: next.color }} />
              </span>
              <div>
                <p className="flex items-center gap-2 text-sm text-gray-400 mb-0.5">
                  Lesson {next.n} of {LESSONS.length}
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{next.minutes} min</span>
                </p>
                <h3 className="text-xl font-bold text-white">{next.title}</h3>
                <p className="mt-1 text-sm text-gray-400 leading-relaxed">{next.summary}</p>
              </div>
            </div>
            {!started && (
              <p className="mt-4 text-sm text-gray-300">
                {LESSONS.length} short lessons, about {TOTAL_MINUTES} minutes in all, with a game in every one.
              </p>
            )}
            <Link to={lessonPath(next)}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all"
              style={{ background: BRAND_FILL }}>
              {started ? `Continue with lesson ${next.n}` : 'Start lesson 1'} <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-quantum-neon uppercase tracking-widest mb-3">Course complete</p>
            <h3 className="text-xl font-bold text-white">You've finished all {LESSONS.length} lessons</h3>
            <p className="mt-1 text-sm text-gray-400 leading-relaxed">
              {stars < MAX_STARS
                ? `You have ${stars} of ${MAX_STARS} stars. Replay any game to collect the rest.`
                : 'Every star collected. Replay any lesson whenever you like.'}
            </p>
            <Link to="/learn"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all"
              style={{ background: BRAND_FILL }}>
              Review the lessons <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </div>

      {/* How far along */}
      <div>
        <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
          <span className="text-gray-300">Your progress</span>
          <span className="text-white font-semibold">{done} of {LESSONS.length} lessons done</span>
        </div>
        <div className="h-2 rounded-full bg-quantum-900/80 ring-1 ring-quantum-700 overflow-hidden" role="img"
          aria-label={`${done} of ${LESSONS.length} lessons done`}>
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / LESSONS.length) * 100}%`, background: BRAND_FILL }} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-400">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {stars} of {MAX_STARS} stars
        </p>

        <ol className="mt-5 grid grid-cols-9 gap-1.5 max-w-[22rem]" aria-label="All lessons">
          {LESSONS.map(l => {
            const p = progress[l.slug];
            const state = p?.completed ? 'done' : p ? 'started' : 'new';
            return (
              <li key={l.slug}>
                <Link to={lessonPath(l)} title={`${l.n}. ${l.title}`}
                  aria-label={`Lesson ${l.n}: ${l.title}, ${state === 'done' ? 'done' : state === 'started' ? 'started' : 'not started'}`}
                  className={`aspect-square rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 ${
                    state === 'done' ? 'text-black' : state === 'started' ? 'text-white ring-2 ring-quantum-neon/70' : 'text-gray-400 ring-1 ring-quantum-600'}`}
                  style={state === 'done' ? { background: BRAND_FILL } : undefined}>
                  {state === 'done' ? <Check className="w-3.5 h-3.5" /> : l.n}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
