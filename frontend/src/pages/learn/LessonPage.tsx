import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Eye, Gamepad2, CheckCircle2, Clock, Lock, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LESSONS, FREE_LESSON_COUNT, lessonBySlug, lessonPath } from '../../learn/lessons';
import type { Lesson } from '../../learn/lessons';

// The four parts every lesson has, in order.
const PARTS = [
  { id: 'read',  label: 'Read',  icon: BookOpen,     hint: 'A short, plain explanation.' },
  { id: 'see',   label: 'See',   icon: Eye,          hint: 'An interactive picture you can drag and click.' },
  { id: 'play',  label: 'Play',  icon: Gamepad2,     hint: 'A small game with three levels.' },
  { id: 'check', label: 'Check', icon: CheckCircle2, hint: 'One quick question to check you got it.' },
];

/** One lesson: header, the four parts, and previous / next. Signed-out
 *  visitors see a sign-in prompt instead of the parts on non-free lessons. */
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
  const prev = LESSONS[lesson.n - 2];
  const next = LESSONS[lesson.n];

  return (
    <div className="min-h-screen px-6 pt-8 pb-16">
      <div className="max-w-4xl mx-auto">
        <Link to="/learn" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> All lessons
        </Link>

        <LessonStrip current={lesson} isAuthed={isAuthed} />

        {/* Header */}
        <header className="mt-8 mb-8">
          <p className="flex items-center gap-3 text-xs font-semibold text-gray-400 tracking-widest mb-3">
            LESSON {lesson.n} OF {LESSONS.length}
            <span className="inline-flex items-center gap-1 font-normal tracking-normal"><Clock className="w-3.5 h-3.5" />{lesson.minutes} min</span>
          </p>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${lesson.color}1f`, border: `1px solid ${lesson.color}55` }}>
              <lesson.icon className="w-6 h-6" style={{ color: lesson.color }} />
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{lesson.title}</h1>
          </div>
          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mt-4">{lesson.summary}</p>
        </header>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-8 h-8 border-2 border-quantum-neon border-t-transparent rounded-full animate-spin" />
          </div>
        ) : locked ? (
          <LockedLesson lesson={lesson} />
        ) : (
          <div className="space-y-4">
            {PARTS.map((part, i) => (
              <section key={part.id} id={part.id} className="glass-card rounded-2xl p-6 scroll-mt-20">
                <h2 className="flex items-center gap-3 text-white font-bold text-lg mb-2">
                  <span className="w-8 h-8 rounded-lg bg-quantum-900/70 border border-quantum-600 flex items-center justify-center text-sm text-quantum-neon">
                    {i + 1}
                  </span>
                  <part.icon className="w-5 h-5 text-gray-400" />
                  {part.label}
                </h2>
                <p className="text-gray-400 text-sm">{part.hint} <span className="text-gray-500">Coming soon.</span></p>
              </section>
            ))}
          </div>
        )}

        {/* Previous / next */}
        <nav className="mt-10 grid grid-cols-2 gap-3" aria-label="Lessons">
          {prev ? <NeighbourLink lesson={prev} dir="prev" /> : <span />}
          {next ? <NeighbourLink lesson={next} dir="next" /> : (
            <Link to="/learn" className="glass-card rounded-xl p-4 text-right hover:brightness-110">
              <span className="block text-xs text-gray-400 mb-0.5">Finished</span>
              <span className="text-white font-semibold text-sm">Back to all lessons</span>
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

/** Numbered dots for all lessons; the current one is highlighted. */
function LessonStrip({ current, isAuthed }: { current: Lesson; isAuthed: boolean }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="All lessons">
      {LESSONS.map(l => {
        const isCurrent = l.slug === current.slug;
        const locked = !isAuthed && !l.free;
        return (
          <li key={l.slug}>
            <Link to={lessonPath(l)} title={`Lesson ${l.n}: ${l.title}${locked ? ' (sign in to open)' : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCurrent ? 'text-black' : 'text-gray-300 bg-quantum-800/80 border border-quantum-600 hover:border-quantum-neon/50'}`}
              style={isCurrent ? { background: 'linear-gradient(135deg, #00ffcc, #cc44ff)' } : undefined}>
              {l.n}
              {locked && <Lock className="absolute -bottom-1 -right-1 w-3.5 h-3.5 p-0.5 rounded-full bg-quantum-900 text-gray-400" />}
            </Link>
          </li>
        );
      })}
    </ol>
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

function NeighbourLink({ lesson, dir }: { lesson: Lesson; dir: 'prev' | 'next' }) {
  const next = dir === 'next';
  return (
    <Link to={lessonPath(lesson)}
      className={`glass-card rounded-xl p-4 group hover:brightness-110 ${next ? 'text-right col-start-2' : ''}`}>
      <span className={`flex items-center gap-1 text-xs text-gray-400 mb-0.5 ${next ? 'justify-end' : ''}`}>
        {!next && <ArrowLeft className="w-3.5 h-3.5" />}
        {next ? 'Next' : 'Previous'}
        {next && <ArrowRight className="w-3.5 h-3.5" />}
      </span>
      <span className="text-white font-semibold text-sm">{lesson.n}. {lesson.title}</span>
    </Link>
  );
}
