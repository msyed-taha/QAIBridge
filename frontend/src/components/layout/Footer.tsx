import { Link } from 'react-router-dom';
import { QAIBridgeLogo } from './QAIBridgeLogo';
import { Github, Mail, ExternalLink } from 'lucide-react';

const QUICK_LINKS = [
  { label: 'Home',        to: '/' },
  { label: 'Simulator',   to: '/simulator' },
  { label: 'Circuit Lab', to: '/circuit' },
  { label: 'About',       to: '/about' },
  { label: 'Contact',     to: '/contact' },
];

const PROBLEM_LINKS = [
  { label: "Search — Grover's Algorithm",       to: '/simulator?type=search' },
  { label: "Factoring — Shor's Algorithm",      to: '/simulator?type=factoring' },
  { label: 'Optimization — QAOA',               to: '/simulator?type=optimization' },
  { label: 'Database — Amplitude Amplification',to: '/simulator?type=database' },
];

export function Footer() {
  return (
    <footer className="bg-quantum-900 border-t border-quantum-700">

      {/* ── Main Footer Body ─────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">

        {/* ── Brand Column ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <Link to="/">
            <QAIBridgeLogo size={48} showText={true} />
          </Link>
          <p className="text-gray-500 text-sm leading-relaxed">
            An AI-driven quantum simulation platform that bridges classical computing and quantum mechanics —
            automating circuit design, benchmarking performance, and making quantum computing accessible to everyone.
          </p>
          <p className="text-gray-600 text-xs leading-relaxed">
            No quantum physics background required.<br />
            No expensive QPU hardware needed.<br />
            Runs entirely on local CPU.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Link
              to="/contact"
              className="w-9 h-9 rounded-lg bg-quantum-800 border border-quantum-700 flex items-center justify-center text-gray-500 hover:text-quantum-neon hover:border-quantum-neon/50 transition-all"
              title="Contact us"
            >
              <Mail className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 rounded-lg bg-quantum-800 border border-quantum-700 flex items-center justify-center text-gray-500 hover:text-quantum-neon hover:border-quantum-neon/50 transition-all"
              title="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* ── Quick Links ──────────────────────────────────────────── */}
        <div>
          <h4 className="text-white font-semibold text-sm mb-5 tracking-wide">Quick Links</h4>
          <ul className="space-y-3">
            {QUICK_LINKS.map(link => (
              <li key={link.label}>
                <Link
                  to={link.to}
                  className="text-gray-500 text-sm hover:text-quantum-neon transition-colors flex items-center gap-1.5 group"
                >
                  <span className="w-1 h-1 rounded-full bg-quantum-600 group-hover:bg-quantum-neon transition-colors flex-shrink-0" />
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Problem Types ────────────────────────────────────────── */}
        <div>
          <h4 className="text-white font-semibold text-sm mb-5 tracking-wide">Problem Types</h4>
          <ul className="space-y-3">
            {PROBLEM_LINKS.map(link => (
              <li key={link.label}>
                <Link
                  to={link.to}
                  className="text-gray-500 text-sm hover:text-quantum-neon transition-colors flex items-center gap-1.5 group"
                >
                  <span className="w-1 h-1 rounded-full bg-quantum-600 group-hover:bg-quantum-neon transition-colors flex-shrink-0" />
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 p-4 bg-quantum-800 border border-quantum-700 rounded-xl">
            <p className="text-xs text-gray-500 leading-relaxed">
              <span className="text-quantum-neon font-semibold">Open Platform</span><br />
              QAIbridge is built for researchers, students, and developers who want to explore quantum computing without barriers.
            </p>
            <Link
              to="/about"
              className="inline-flex items-center gap-1 text-xs text-quantum-purple hover:text-purple-400 transition-colors mt-3"
            >
              Learn more <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

      </div>

      {/* ── Bottom Bar ───────────────────────────────────────────────────── */}
      <div className="border-t border-quantum-800">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <p className="text-xs text-gray-700 text-center">
            © {new Date().getFullYear()} QAIbridge. All rights reserved.
          </p>
        </div>
      </div>

    </footer>
  );
}
