import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock, Lock, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LESSONS, FREE_LESSON_COUNT, lessonBySlug, lessonPath } from '../../learn/lessons';
import type { Lesson } from '../../learn/lessons';
import { LESSON_BODIES } from '../../learn/content';
import { LessonSteps, NextLessonContext, PARTS } from '../../learn/components/LessonSteps';
import type { PartId } from '../../learn/components/LessonSteps';

/** One lesson: a short header, the lesson's steps, and previous / next.
 *  Signed-out visitors see a sign-in prompt instead on non-free lessons. */
export function LessonPage() {
  const { slug } = useParams();
  const { isAuthed, loading } = useAuth();
  const lesson = lessonBySlug(slug);

  if (!lesson) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-white mb-3">Lesson not found</h1>
          <p className="text-gray-400 text-sm mb-6">There's no lesson at this address.</p>
          <Link to="/learn" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-quantum-neon text-black font-semibold text-sm">
            <ArrowLeft className="w-4 h-4" /> All lessons
          </Link>
        </div>
      </div>
    );
  }

  const locked = !isAuthed && !lesson.free;
  const Body = LESSON_BODIES[lesson.slug];
  const prev = LESSONS[lesson.n - 2];
  const next = LESSONS[lesson.n];

  return (
    <div className="min-h-screen px-6 pt-8 pb-16">
      <div className="max-w-4xl mx-auto">
        <Link to="/learn" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> All lessons
        </Link>

        {/* Header */}
        <header className="mt-6 mb-8 flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${lesson.color}1f`, border: `1px solid ${lesson.color}55` }}>
            <lesson.icon className="w-7 h-7" style={{ color: lesson.color }} />
          </span>
          <div>
            <p className="flex items-center gap-2 text-sm text-gray-400 mb-0.5">
              Lesson {lesson.n} of {LESSONS.length}
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{lesson.minutes} min</span>
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{lesson.title}</h1>
          </div>
        </header>

        {loading ? <Spinner /> : locked ? (
          <LockedLesson lesson={lesson} />
        ) : (
          // Keyed by lesson, so each lesson starts on its first step.
          <NextLessonContext.Provider value={next ?? null} key={lesson.slug}>
            {Body ? (
              <Suspense fallback={<Spinner />}><Body /></Suspense>
            ) : (
              <LessonSteps parts={Object.fromEntries(PARTS.map(p => [p.id, (
                <p className="text-gray-400">{p.hint} <span className="text-gray-500">Coming soon.</span></p>
              )])) as Record<PartId, React.ReactNode>} />
            )}
          </NextLessonContext.Provider>
        )}

        {/* Previous / next lesson */}
        <nav className="mt-12 pt-6 border-t border-quantum-700 flex items-center justify-between gap-4 text-sm" aria-label="Lessons">
          {prev ? (
            <Link to={lessonPath(prev)} className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> {prev.n}. {prev.title}
            </Link>
          ) : <span />}
          {next ? (
            <Link to={lessonPath(next)} className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-right">
              {next.n}. {next.title} <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link to="/learn" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              All lessons <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="py-16 flex justify-center">
      <div className="w-8 h-8 border-2 border-quantum-neon border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Shown instead of the lesson to signed-out visitors on non-free lessons. */
function LockedLesson({ lesson }: { lesson: Lesson }) {
  const from = { from: lessonPath(lesson) };
  return (
    <div className="glass-card rounded-2xl p-8 text-center">
      <span className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #00ffcc, #cc44ff)' }}>
        <Lock className="w-6 h-6 text-black" />
      </span>
      <h2 className="text-xl font-bold text-white mb-2">Sign in to open this lesson</h2>
      <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
        Lessons 1–{FREE_LESSON_COUNT} are free for everyone. Create a free account to open all {LESSONS.length}.
        You'll come straight back here.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/register" state={from}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all"
          style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}>
          <UserPlus className="w-4 h-4" /> Create a free account
        </Link>
        <Link to="/login" state={from}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all">
          Sign in
        </Link>
      </div>
      <Link to={lessonPath(LESSONS[0])} className="inline-block mt-5 text-sm text-quantum-neon hover:text-teal-300">
        Or start with lesson 1, free
      </Link>
    </div>
  );
}
