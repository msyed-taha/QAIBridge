import { Link } from 'react-router-dom';
import {
  Brain, Code2, BarChart2, BookOpen, Cpu, Activity, GraduationCap, FlaskConical, Briefcase,
  ShieldCheck, CheckCircle, Info, ArrowRight, Mail, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// What people can do — in plain words, no module numbers or internal names.
const FEATURES = [
  {
    icon: Brain, color: 'from-orange-500 to-pink-500', title: 'Ask the AI Advisor',
    desc: 'Describe your problem in plain English, or upload a PDF, Word or CSV file. It tells you whether quantum computing would help and which algorithm fits.',
  },
  {
    icon: Code2, color: 'from-blue-500 to-indigo-400', title: 'Turn code into a quantum circuit',
    desc: 'Paste a Python program. QAIbridge works out what it computes, rewrites it for a quantum computer, runs it and checks the result against your code.',
  },
  {
    icon: BarChart2, color: 'from-teal-500 to-cyan-400', title: 'Compare quantum and classical',
    desc: "Run Grover's search, Shor's factoring and QAOA next to the best classical method, on examples or on your own data.",
  },
  {
    icon: BookOpen, color: 'from-green-500 to-emerald-400', title: 'Learn by building circuits',
    desc: 'Drag gates onto a circuit, watch the qubits change on live Bloch spheres, and work through challenge levels.',
  },
  {
    icon: Cpu, color: 'from-purple-500 to-fuchsia-400', title: 'Simulate on an ordinary computer',
    desc: 'A built-in quantum simulator runs circuits of 20+ qubits on a normal CPU, with live progress as each gate runs.',
  },
  {
    icon: Activity, color: 'from-amber-500 to-yellow-400', title: 'Track performance',
    desc: 'Run live benchmarks, keep a history of your runs and export the numbers as CSV.',
  },
];

// Short facts under "What is QAIbridge?" (moved here from the home page).
const FACTS = [
  'No quantum physics background needed',
  'No quantum hardware needed',
  'Its own simulation kernel, not Qiskit',
  'Quantum answers checked against classical ones',
  'Spots when circuit training gets stuck, and restarts it',
  "Your code and files aren't kept after your run",
];

const AUDIENCE = [
  { icon: GraduationCap, title: 'Students', desc: 'Learn how quantum algorithms work by running them, not just reading about them.' },
  { icon: FlaskConical, title: 'Researchers', desc: 'Test ideas quickly and compare quantum methods against solid classical baselines.' },
  { icon: Code2, title: 'Developers', desc: 'See how everyday code maps onto quantum circuits, and export them to Qiskit.' },
  { icon: Briefcase, title: 'Businesses', desc: 'Find out whether quantum computing could help with your routing, finance or search problems before investing in it.' },
];

const TRUST = [
  {
    icon: ShieldCheck, title: 'Checked against IBM Qiskit',
    desc: "Our simulator gives the same results as IBM's Qiskit on more than 70 test circuits, including Grover, Shor, QFT and QAOA.",
  },
  {
    icon: CheckCircle, title: 'Every answer double-checked',
    desc: 'Each quantum result is compared with the classical answer, and the page tells you whether they match.',
  },
  {
    icon: Info, title: 'Honest about limits',
    desc: "If quantum computing won't help, QAIbridge says so. Because quantum computers are simulated on ordinary hardware, problems are kept small, and the charts show how each approach scales.",
  },
];

export function About() {
  const { isAuthed } = useAuth();

  return (
    <div className="min-h-screen">

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-16 pb-14 text-center overflow-hidden">
        <div className="absolute top-0 left-1/3 w-80 h-80 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-64 h-64 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-4">About QAIbridge</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-5 leading-tight">
            Quantum computing,{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
              made practical
            </span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
            QAIbridge helps you find out whether quantum computing can solve your problem,
            and shows you the answer with real runs, side by side with the classical one.
          </p>
        </div>
      </section>

      {/* ── WHAT IS IT ────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">What is QAIbridge?</h2>
          <p className="text-gray-300 text-base leading-relaxed max-w-3xl mx-auto">
            QAIbridge is a research and education platform that lets you <span className="text-white font-medium">simulate quantum algorithms</span>,
            compare them against classical solutions, and understand why quantum computing could transform fields
            like cryptography, database search and combinatorial optimisation. Its simulator is built from scratch:
            it doesn't rely on IBM Qiskit or a cloud quantum computer.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10 text-left max-w-2xl mx-auto">
            {FACTS.map(f => (
              <li key={f} className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-quantum-neon flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-gray-300 text-sm">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── WHY ───────────────────────────────────────────────────────── */}
      <section className="py-14 px-6 bg-quantum-800/30 border-y border-quantum-700">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div data-tilt="3" className="glass-card rounded-2xl p-6">
            <p className="text-red-300/80 text-xs font-semibold uppercase tracking-widest mb-3">The problem</p>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Quantum computing is in the news every week, but trying it usually means special
              hardware, a physics background and unfamiliar code. Most people can't tell whether
              it would help with their own problem at all.
            </p>
          </div>
          <div data-tilt="3" className="glass-card rounded-2xl p-6">
            <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-3">Our answer</p>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              Start from your own problem, written in plain English or as ordinary code.
              QAIbridge picks the right quantum method, runs it on a built-in simulator and
              compares it with the classical answer, so you can see the difference for yourself.
            </p>
          </div>
        </div>
      </section>

      {/* ── WHAT YOU CAN DO ───────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">What you can do</h2>
            <p className="text-gray-400 text-sm">Nothing to install, and no quantum hardware needed.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.title} data-tilt className="glass-card rounded-2xl p-5">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-white font-semibold text-base mb-2">{f.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>

          <p className="flex items-start sm:items-center justify-center gap-2 text-gray-400 text-sm mt-6 text-center">
            <Sparkles className="w-4 h-4 text-quantum-purple flex-shrink-0 mt-0.5 sm:mt-0" />
            <span>Plus research tools: AI that tunes quantum circuits, and a converter that turns classical neural networks into quantum ones.</span>
          </p>
        </div>
      </section>

      {/* ── WHO IT'S FOR ──────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-quantum-800/30 border-y border-quantum-700">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">Who it's for</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AUDIENCE.map(a => {
              const Icon = a.icon;
              return (
                <div key={a.title} data-tilt className="glass-card rounded-2xl p-5">
                  <Icon className="w-6 h-6 text-quantum-neon mb-3" />
                  <h3 className="text-white font-semibold text-base mb-1.5">{a.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{a.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TRUST ─────────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-10 text-center">Why you can trust the results</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TRUST.map(t => {
              const Icon = t.icon;
              return (
                <div key={t.title} data-tilt className="glass-card flex gap-4 rounded-2xl p-5">
                  <Icon className="w-5 h-5 text-quantum-neon flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-white font-semibold text-sm mb-1.5">{t.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 text-center border-t border-quantum-700">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">See what quantum can do for your problem</h2>
          <p className="text-gray-400 text-sm mb-8">Questions? We read every message.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-xs sm:max-w-none mx-auto">
            <Link
              to={isAuthed ? '/app' : '/register'}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 rounded-xl font-bold text-black text-sm hover:scale-105 hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
            >
              {isAuthed ? 'Open the app' : 'Get started'}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all"
            >
              <Mail className="w-4 h-4" />
              Contact us
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
