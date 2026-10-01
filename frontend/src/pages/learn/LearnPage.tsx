import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Gamepad2, Lock, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LESSONS, LESSON_PARTS, FREE_LESSON_COUNT, TOTAL_MINUTES, lessonPath } from '../../learn/lessons';
import type { Lesson } from '../../learn/lessons';

/** The Learn course overview: every lesson, grouped, open to everyone. */
export function LearnPage() {
  const { isAuthed } = useAuth();

  return (
    <div className="min-h-screen">

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-10 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-4">Free quantum course</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-5 leading-tight text-balance">
            Learn how{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
              quantum computers
            </span>{' '}
            work
          </h1>
          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-7">
            {LESSONS.length} short lessons. Read a little, watch it move, then play a quick game.
            No maths or physics background needed.
          </p>

          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400 mb-8">
            <li className="flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-quantum-neon" />{LESSONS.length} lessons</li>
            <li className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-quantum-neon" />About {TOTAL_MINUTES} minutes in all</li>
            <li className="flex items-center gap-1.5"><Gamepad2 className="w-4 h-4 text-quantum-neon" />A game in every lesson</li>
          </ul>

          <Link to={lessonPath(LESSONS[0])}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 hover:brightness-110"
            style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}>
            Start lesson 1 <ArrowRight className="w-4 h-4" />
          </Link>
          {!isAuthed && (
            <p className="text-gray-400 text-sm mt-4">
              Lessons 1–{FREE_LESSON_COUNT} are free, no account needed.
            </p>
          )}
        </div>
      </section>

      {/* ── LESSONS ───────────────────────────────────────────────────── */}
      <section className="px-6 pb-16">
        <div className="max-w-5xl mx-auto space-y-10">
          {LESSON_PARTS.map(part => (
            <div key={part.id}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{part.label}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {LESSONS.filter(l => l.part === part.id).map(l => (
                  <LessonCard key={l.slug} lesson={l} locked={!isAuthed && !l.free} showFree={!isAuthed && l.free} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SIGN-UP PROMPT (visitors) ─────────────────────────────────── */}
      {!isAuthed && (
        <section className="px-6 pb-20">
          <div className="glass-card rounded-2xl p-8 max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Want all {LESSONS.length} lessons?</h2>
            <p className="text-gray-400 text-sm mb-6">
              Create a free account to open lessons {FREE_LESSON_COUNT + 1}–{LESSONS.length}: gates, interference,
              entanglement and the algorithms that make quantum computers useful.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register" state={{ from: '/learn' }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}>
                <UserPlus className="w-4 h-4" /> Create a free account
              </Link>
              <Link to="/login" state={{ from: '/learn' }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function LessonCard({ lesson: l, locked, showFree }: { lesson: Lesson; locked: boolean; showFree: boolean }) {
  return (
    <Link to={lessonPath(l)} data-tilt className="group glass-card rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${l.color}1f`, border: `1px solid ${l.color}55` }}>
          <l.icon className="w-5 h-5" style={{ color: l.color }} />
        </span>
        <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{l.minutes} min</span>
      </div>
      <p className="text-xs font-semibold text-gray-400 tracking-widest mb-1">LESSON {l.n}</p>
      <h3 className="text-white font-bold text-base mb-1.5">{l.title}</h3>
      <p className="flex-1 text-gray-400 text-sm leading-relaxed">{l.summary}</p>
      <div className="mt-4 flex items-center justify-between">
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5" /> Sign in to open
          </span>
        ) : showFree ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-quantum-neon bg-quantum-neon/10 border border-quantum-neon/30">Free</span>
        ) : <span />}
        {!locked && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-quantum-neon/80 group-hover:text-quantum-neon transition-colors">
            Start <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        )}
      </div>
    </Link>
  );
}
