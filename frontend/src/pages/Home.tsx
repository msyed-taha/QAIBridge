import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, BarChart2, BookOpen, Brain, Users, GraduationCap, FlaskConical, Code2, CheckCircle } from 'lucide-react';
import { QAIBridgeLogo } from '../components/layout/QAIBridgeLogo';

const CAPABILITIES = [
  {
    icon: Cpu,
    color: 'from-teal-500 to-cyan-400',
    title: 'Quantum Simulation',
    desc: 'Run quantum circuits on up to 20 qubits using a custom-built state-vector engine — no Qiskit, no cloud QPU required.',
  },
  {
    icon: BarChart2,
    color: 'from-blue-500 to-indigo-400',
    title: 'Performance Benchmarking',
    desc: 'Compare Classical vs Quantum algorithms side by side across Search, Factoring, Optimization, and Database problems.',
  },
  {
    icon: Brain,
    color: 'from-purple-500 to-pink-400',
    title: 'AI-Powered Optimization',
    desc: 'A Deep Reinforcement Learning agent automatically tunes quantum gate angles and escapes the Barren Plateau problem.',
  },
  {
    icon: BookOpen,
    color: 'from-green-500 to-emerald-400',
    title: 'Visual Circuit Builder',
    desc: 'Drag-and-drop quantum circuit canvas for learning gate logic visually — no physics background needed.',
  },
];

const WHO_FOR = [
  {
    icon: GraduationCap,
    title: 'Students',
    desc: 'Learn quantum computing concepts through hands-on simulation without needing a physics degree.',
  },
  {
    icon: FlaskConical,
    title: 'Researchers',
    desc: 'Benchmark quantum algorithms against classical baselines and visualise theoretical speedups at scale.',
  },
  {
    icon: Code2,
    title: 'Developers',
    desc: 'Explore quantum circuit design, code transpilation, and AI-driven optimization in one platform.',
  },
];

const FEATURES = [
  'No quantum physics background required',
  'Runs entirely on local CPU — no QPU hardware',
  'Custom simulation kernel — no Qiskit dependency',
  'Classical & Quantum comparison for every problem',
  'AI agent solves the Barren Plateau automatically',
  'Full Docker support for easy deployment',
];

export function Home() {
  return (
    <div className="min-h-screen">

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 pt-20 pb-20 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Logo big */}
          <div className="flex justify-center mb-8">
            <QAIBridgeLogo size={64} showText={false} />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
            Quantum Simulation &nbsp;·&nbsp; AI-Driven &nbsp;·&nbsp; Open Platform
          </div>

          {/* Heading */}
          <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-6 leading-none">
            <span className="text-white">QAI</span>
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
              bridge
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-gray-300 font-medium mb-4">
            The AI-Driven Quantum Simulation Platform
          </p>

          <p className="text-gray-500 text-base max-w-2xl mx-auto leading-relaxed mb-10">
            QAIbridge bridges the gap between classical computing and quantum mechanics —
            making quantum simulation, benchmarking, and circuit design accessible to everyone,
            without expensive hardware or a physics degree.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 hover:brightness-110"
              style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
            >
              Create Free Account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all hover:scale-105"
            >
              Sign In
            </Link>
          </div>

          <p className="text-gray-700 text-xs mt-5">
            Free to use. No credit card required. No QPU hardware needed.
          </p>

          <p className="text-gray-600 text-xs mt-3">
            Platform administrator?{' '}
            <Link
              to="/login?as=admin"
              className="text-amber-300/90 hover:text-amber-300 font-medium transition-colors"
            >
              Sign in to the admin area →
            </Link>
          </p>
        </div>
      </section>

      {/* ── WHAT IS IT ──────────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-quantum-800/30 border-y border-quantum-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">What is QAIbridge?</h2>
          <p className="text-gray-400 text-base leading-relaxed max-w-3xl mx-auto">
            QAIbridge is a research and education platform that lets you <span className="text-white font-medium">simulate quantum algorithms</span>,
            compare them against classical solutions, and understand why quantum computing will
            revolutionise fields like cryptography, database search, and combinatorial optimisation.
            Built from scratch with a proprietary simulation kernel — no dependency on IBM Qiskit or any cloud QPU.
          </p>

          {/* Feature checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10 text-left max-w-2xl mx-auto">
            {FEATURES.map(f => (
              <div key={f} className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-quantum-neon flex-shrink-0 mt-0.5" />
                <span className="text-gray-400 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT CAN YOU DO ─────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">What can you do on QAIbridge?</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Once you create your account, you get full access to all platform modules.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {CAPABILITIES.map(c => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6 hover:border-quantum-600 transition-all">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-white font-bold text-base mb-2">{c.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{c.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── WHO IS IT FOR ───────────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-quantum-800/30 border-y border-quantum-700">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Who is QAIbridge for?</h2>
            <p className="text-gray-500 text-sm">Anyone curious about quantum computing — no prior experience needed.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHO_FOR.map(w => {
              const Icon = w.icon;
              return (
                <div key={w.title} className="text-center p-6 bg-quantum-800 border border-quantum-700 rounded-2xl hover:border-quantum-600 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-quantum-700 border border-quantum-600 flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-quantum-neon" />
                  </div>
                  <h3 className="text-white font-bold text-base mb-2">{w.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{w.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="absolute left-1/2 -translate-x-1/2 w-96 h-32 bg-teal-500 opacity-5 rounded-full blur-3xl pointer-events-none" />
          <Users className="w-10 h-10 text-quantum-neon mx-auto mb-5 opacity-80" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Ready to explore quantum computing?
          </h2>
          <p className="text-gray-500 text-base mb-8 leading-relaxed">
            Create your free account and get instant access to the simulation kernel,
            problem solver, and everything QAIbridge has to offer.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 hover:brightness-110"
              style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
            >
              Create Free Account
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all hover:scale-105"
            >
              Sign In to your account
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
