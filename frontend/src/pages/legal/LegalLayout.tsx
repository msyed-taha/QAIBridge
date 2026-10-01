import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL } from '../../legal';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

// Readable long-form text without a typography plugin: style the plain
// elements used inside each section.
const PROSE =
  '[&_p]:text-gray-400 [&_p]:text-sm sm:[&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:mb-3 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-3 ' +
  '[&_li]:text-gray-400 [&_li]:text-sm sm:[&_li]:text-[15px] [&_li]:leading-relaxed ' +
  '[&_h3]:text-gray-200 [&_h3]:font-semibold [&_h3]:text-[15px] [&_h3]:mt-5 [&_h3]:mb-2 ' +
  '[&_strong]:text-gray-200 [&_strong]:font-semibold ' +
  '[&_a]:text-quantum-neon [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-teal-300';

/** Shared shell for the Privacy Policy and Terms of Use. */
export function LegalLayout({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-3">Legal</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">{title}</h1>
        <p className="text-gray-500 text-sm mb-8">
          Effective <time dateTime={LEGAL.effectiveDateIso}>{LEGAL.effectiveDate}</time>
        </p>

        <div className={`${PROSE} mb-8`}>{intro}</div>

        {/* Contents */}
        <nav aria-label="Contents" className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-10">
          <p className="text-white font-semibold text-sm mb-3">Contents</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-gray-400 hover:text-quantum-neon transition-colors">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className={`${PROSE} scroll-mt-20 mb-10`}>
            <h2 className="text-white text-xl font-bold mb-3">{i + 1}. {s.title}</h2>
            {s.body}
          </section>
        ))}

        <div className="border-t border-quantum-700 pt-6 mt-12 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/privacy" className="text-gray-400 hover:text-quantum-neon transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-gray-400 hover:text-quantum-neon transition-colors">Terms of Use</Link>
          <Link to="/contact" className="text-gray-400 hover:text-quantum-neon transition-colors">Contact us</Link>
        </div>
      </div>
    </div>
  );
}
