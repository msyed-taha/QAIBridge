import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { QAIBridgeLogo } from './QAIBridgeLogo';
import { TOOLS } from '../../tools';

type FooterLink = { label: string; to: string };
type Column = { title: string; links: FooterLink[]; wide?: boolean };

// A tool's link, under the name it has everywhere else (tools.ts).
const tool = (path: string): FooterLink => {
  const t = TOOLS.find(t => t.path === path)!;
  return { label: t.name, to: t.path };
};

// Visitors see the same links: a tool asks them to sign in first, then opens.
const COLUMNS: Column[] = [
  { title: 'Product', links: [
    { label: 'Home',  to: '/' },
    { label: 'Learn', to: '/learn' },
    tool('/simulator'),
    tool('/circuit'),
  ] },
  // Each opens the Quantum vs Classical page (Module 2) on that problem's tab.
  { title: 'Problem types', wide: true, links: [
    { label: "Search — Grover's Algorithm",        to: '/module2?type=search' },
    { label: "Factoring — Shor's Algorithm",       to: '/module2?type=factoring' },
    { label: 'Optimization — QAOA',                to: '/module2?type=optimization' },
    { label: 'Database — Amplitude Amplification', to: '/module2?type=database' },
  ] },
  { title: 'Company', links: [
    { label: 'About',   to: '/about' },
    { label: 'Contact', to: '/contact' },
  ] },
];

export function Footer() {
  return (
    <footer className="bg-quantum-900 border-t border-quantum-700">

      {/* ── Main Footer Body ── (link columns sit two side by side on phones) */}
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16 grid grid-flow-row-dense grid-cols-2 md:grid-cols-[1fr_1.5fr_1fr] xl:grid-cols-[2fr_1fr_1.5fr_1fr] gap-x-8 gap-y-10">

        {/* ── Brand Column ── (on top until there's room beside it for every link column) */}
        <div className="col-span-full xl:col-span-1 flex flex-col gap-5">
          <Link to="/" className="self-start">
            <QAIBridgeLogo size={48} showText={true} />
          </Link>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xl">
            An AI-driven quantum simulation platform that bridges classical computing and quantum mechanics —
            automating circuit design, benchmarking performance, and making quantum computing accessible to everyone.
          </p>
          <p className="text-gray-400 text-xs leading-relaxed">
            No physics background needed.<br />
            No quantum computer needed.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Link
              to="/contact"
              className="w-9 h-9 rounded-lg bg-quantum-800 border border-quantum-700 flex items-center justify-center text-gray-400 hover:text-quantum-neon hover:border-quantum-neon/50 transition-all"
              title="Contact us"
              aria-label="Contact us"
            >
              <Mail className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* ── Link Columns ── */}
        {COLUMNS.map(column => (
          <div key={column.title} className={column.wide ? 'col-span-2 md:col-span-1' : undefined}>
            <h2 className="text-white font-semibold text-sm mb-5 tracking-wide">{column.title}</h2>
            <ul className="space-y-3">
              {column.links.map(link => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-gray-400 text-sm hover:text-quantum-neon transition-colors flex items-start gap-1.5 group"
                  >
                    <span className="w-1 h-1 mt-2 rounded-full bg-quantum-600 group-hover:bg-quantum-neon transition-colors flex-shrink-0" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

      </div>

      {/* ── Bottom Bar ───────────────────────────────────────────────────── */}
      <div className="border-t border-quantum-800">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-x-5 gap-y-2 text-xs">
            <p className="text-gray-400">© {new Date().getFullYear()} QAIbridge. All rights reserved.</p>
            <nav aria-label="Legal" className="flex items-center gap-4">
              <Link to="/privacy" className="text-gray-400 hover:text-quantum-neon transition-colors">Privacy Policy</Link>
              <Link to="/terms" className="text-gray-400 hover:text-quantum-neon transition-colors">Terms of Use</Link>
            </nav>
          </div>
        </div>
      </div>

    </footer>
  );
}
