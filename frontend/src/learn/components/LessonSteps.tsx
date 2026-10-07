import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Eye, Gamepad2, ListChecks, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { lessonPath } from '../lessons';
import { ACCENT_FILL, BRAND_FILL } from '../colors';
import type { Lesson } from '../lessons';

export type PartId = 'read' | 'see' | 'play' | 'test';

// The four steps every lesson has, in order.
export const PARTS: { id: PartId; label: string; icon: LucideIcon }[] = [
  { id: 'read', label: 'Read', icon: BookOpen },
  { id: 'see',  label: 'See',  icon: Eye },
  { id: 'play', label: 'Play', icon: Gamepad2 },
  { id: 'test', label: 'Test', icon: ListChecks },
];

/** The lesson after this one, for the button on the last step. Set by LessonPage. */
export const NextLessonContext = createContext<Lesson | null>(null);

/**
 * A lesson as a guided flow: one step on screen at a time, a progress bar on
 * top and a big "Next" button. Every step stays mounted (just hidden), so a
 * half-played game is still there when you come back to it.
 */
export function LessonSteps({ parts }: { parts: Record<PartId, ReactNode> }) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const next = useContext(NextLessonContext);
  const last = PARTS.length - 1;

  const go = (i: number) => {
    setStep(i);
    setReached(r => Math.max(r, i));
    // Bring the start of the new step into view if it is scrolled off the top:
    // a smooth glide, or a jump for people who ask their device for less motion.
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 80) {
      const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      top.scrollIntoView({ behavior: lessMotion ? 'instant' : 'smooth', block: 'start' });
    }
  };

  const primary = 'inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm hover:brightness-110 transition-all';
  const primaryStyle = { background: BRAND_FILL };

  return (
    <div ref={topRef} className="scroll-mt-24">
      {/* Progress: Read · See · Play · Test */}
      <nav aria-label="Lesson steps" className="mb-6">
        <ol className="grid grid-cols-4 gap-2 sm:gap-3">
          {PARTS.map((p, i) => {
            const current = i === step;
            const done = i < reached;
            return (
              <li key={p.id}>
                <button type="button" onClick={() => go(i)} aria-current={current ? 'step' : undefined}
                  className="w-full text-left focus-visible:outline-none group">
                  <span className="block h-1.5 rounded-full mb-2 transition-colors"
                    style={{ background: i <= step ? ACCENT_FILL : 'rgba(119,119,238,.25)' }} />
                  <span className={`flex items-center gap-1.5 text-sm transition-colors group-focus-visible:underline ${
                    current ? 'text-white font-semibold' : i <= reached ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    {done && !current ? <Check className="w-4 h-4 text-quantum-neon" /> : <p.icon className="w-4 h-4" />}
                    {p.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {PARTS.map((p, i) => (
        <section key={p.id} hidden={i !== step} aria-label={p.label} className="glass-card rounded-2xl p-6 sm:p-8">
          {parts[p.id]}
        </section>
      ))}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => go(step - 1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : <span />}
        {step < last ? (
          <button type="button" onClick={() => go(step + 1)} className={primary} style={primaryStyle}>
            Next: {PARTS[step + 1].label} <ArrowRight className="w-4 h-4" />
          </button>
        ) : next ? (
          <Link to={lessonPath(next)} className={primary} style={primaryStyle}>
            Next lesson <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <Link to="/learn" className={primary} style={primaryStyle}>
            Back to all lessons <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
