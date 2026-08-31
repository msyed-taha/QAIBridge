import { useState, type ReactNode } from 'react';
import { HelpCircle, ChevronDown } from 'lucide-react';

interface Props {
  /** Short numbered actions the user should take, in order. */
  steps: ReactNode[];
  /** Optional one-line note about what appears after running. */
  outcome?: ReactNode;
  /** Start expanded (default) or collapsed. */
  defaultOpen?: boolean;
}

/**
 * "How to use this module" — a plain-language, step-by-step panel shown at the
 * top of a module page so a first-time user knows exactly what to click and
 * what they'll get back. Mirrors the existing glossary panel's look.
 */
export function HowToUse({ steps, outcome, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white border border-quantum-neon/30 bg-quantum-neon/5 rounded-full px-3 py-1.5 transition-colors mb-3"
      >
        <HelpCircle className="w-3.5 h-3.5 text-quantum-neon" />
        How to use this module
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="bg-quantum-800 rounded-lg p-5 border border-quantum-600">
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-quantum-neon/10 text-quantum-neon text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {outcome && (
            <p className="text-gray-500 text-xs mt-4 pt-3 border-t border-quantum-700 leading-relaxed">
              <span className="text-gray-400 font-semibold">What you'll see: </span>
              {outcome}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
