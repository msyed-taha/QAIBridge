import { Link } from 'react-router-dom';
import {
  Search, Hash, Shuffle, Database,
  Cpu, BarChart2, Zap, ChevronRight, ArrowRight,
  BookOpen, Atom, TrendingUp, Star, Brain, Code2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Problem type cards ────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    key: 'search',
    icon: Search,
    color: 'from-teal-500 to-cyan-400',
    glow: 'rgba(20,184,166,0.2)',
    label: 'Search',
    tagline: 'Find a target in unsorted data',
    classical: 'O(N)',
    quantum: 'O(√N)',
    algo: "Grover's",
    speedup: 'Quadratic',
    speedupColor: '#00ffcc',
  },
  {
    key: 'factoring',
    icon: Hash,
    color: 'from-purple-500 to-pink-400',
    glow: 'rgba(168,85,247,0.2)',
    label: 'Factoring',
    tagline: 'Decompose a number into primes',
    classical: 'O(√N)',
    quantum: 'O((log N)³)',
    algo: "Shor's",
    speedup: 'Exponential',
    speedupColor: '#cc44ff',
  },
  {
    key: 'optimization',
    icon: Shuffle,
    color: 'from-orange-500 to-yellow-400',
    glow: 'rgba(249,115,22,0.2)',
    label: 'Optimization',
    tagline: 'Find the shortest route through cities',
    classical: 'O(N²)',
    quantum: 'O(p·N)',
    algo: 'QAOA',
    speedup: 'Polynomial',
    speedupColor: '#f97316',
  },
  {
    key: 'database',
    icon: Database,
    color: 'from-blue-500 to-indigo-400',
    glow: 'rgba(59,130,246,0.2)',
    label: 'Database',
    tagline: 'Query records in unstructured data',
    classical: 'O(N)',
    quantum: 'O(√N)',
    algo: 'Amplitude Amp.',
    speedup: 'Quadratic',
    speedupColor: '#3b82f6',
  },
];


// ── Quantum advantage stats ───────────────────────────────────────────────────

const STATS = [
  { label: 'Quantum Algorithms', value: '6+', icon: Atom,      color: '#00ffcc' },
  { label: 'Max Speedup (Shor\'s)', value: '10⁹×', icon: TrendingUp, color: '#cc44ff' },
  { label: 'Qubits Supported',   value: '1–20',  icon: Cpu,       color: '#3b82f6' },
  { label: 'Problem Types',      value: '4',     icon: Star,      color: '#f97316' },
];

// ── How it works steps ────────────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    icon: BookOpen,
    color: 'from-teal-500 to-cyan-400',
    title: 'Choose a Problem',
    desc: 'Select from Search, Factoring, Optimization, or Database. Enter your own real-world data.',
  },
  {
    num: '02',
    icon: Zap,
    color: 'from-purple-500 to-pink-400',
    title: 'Run Both Algorithms',
    desc: 'Click "Run Both & Compare" to execute Classical and Quantum algorithms simultaneously.',
  },
  {
    num: '03',
    icon: BarChart2,
    color: 'from-orange-500 to-yellow-400',
    title: 'Analyse the Speedup',
    desc: 'See step counts, complexity, and a full side-by-side breakdown of why quantum wins at scale.',
  },
];

// ── Quantum facts ─────────────────────────────────────────────────────────────

const FACTS = [
  {
    color: 'from-teal-500 to-cyan-400',
    glow: 'rgba(20,184,166,0.12)',
    topBar: '#00ffcc',
    title: 'Superposition',
    tag: 'Fundamental',
    body: 'A qubit can be 0 and 1 simultaneously. 20 qubits represent 2²⁰ = 1,048,576 states at once — a classical computer needs all of them one at a time.',
  },
  {
    color: 'from-purple-500 to-pink-400',
    glow: 'rgba(168,85,247,0.12)',
    topBar: '#cc44ff',
    title: 'Entanglement',
    tag: 'Fundamental',
    body: 'Entangled qubits share quantum state instantly regardless of distance. Einstein called it "spooky action at a distance" — it powers quantum teleportation and superdense coding.',
  },
  {
    color: 'from-blue-500 to-indigo-400',
    glow: 'rgba(59,130,246,0.12)',
    topBar: '#3b82f6',
    title: 'Interference',
    tag: 'Core Principle',
    body: 'Quantum algorithms amplify correct answer paths and cancel wrong ones using wave-like interference — the same physics as light waves. Grover\'s and Shor\'s both rely on this.',
  },
  {
    color: 'from-green-500 to-emerald-400',
    glow: 'rgba(34,197,94,0.12)',
    topBar: '#22c55e',
    title: 'Measurement',
    tag: 'Quantum Mechanics',
    body: 'Measuring a qubit collapses its superposition into a definite 0 or 1 — permanently. Quantum algorithms are carefully designed to make the correct answer the most probable outcome before measurement.',
  },
  {
    color: 'from-orange-500 to-yellow-400',
    glow: 'rgba(249,115,22,0.12)',
    topBar: '#f97316',
    title: 'Quantum Gate',
    tag: 'Circuit Element',
    body: 'Quantum gates (H, X, Y, Z, CNOT) are reversible operations on qubits — the quantum equivalent of AND, OR, NOT. Unlike classical gates, they operate on probability amplitudes, not just 0s and 1s.',
  },
  {
    color: 'from-pink-500 to-rose-400',
    glow: 'rgba(236,72,153,0.12)',
    topBar: '#ec4899',
    title: 'Decoherence',
    tag: 'Key Challenge',
    body: 'Qubits lose their quantum state when they interact with the environment — called decoherence. It is the biggest engineering challenge in building real quantum computers and limits circuit depth.',
  },
  {
    color: 'from-cyan-500 to-sky-400',
    glow: 'rgba(6,182,212,0.12)',
    topBar: '#06b6d4',
    title: 'Quantum Fourier Transform',
    tag: 'Algorithm Core',
    body: 'The QFT is the quantum version of the Fast Fourier Transform and runs exponentially faster. It is the key subroutine inside Shor\'s Algorithm that enables period-finding and prime factorisation.',
  },
  {
    color: 'from-violet-500 to-purple-400',
    glow: 'rgba(139,92,246,0.12)',
    topBar: '#8b5cf6',
    title: 'Qubit vs Bit',
    tag: 'Fundamentals',
    body: 'A classical bit is always exactly 0 or 1. A qubit is a unit vector in a 2D complex space — represented as α|0⟩ + β|1⟩ where |α|² + |β|² = 1. This allows exponentially more information to be encoded.',
  },
  {
    color: 'from-red-500 to-orange-400',
    glow: 'rgba(239,68,68,0.12)',
    topBar: '#ef4444',
    title: 'Quantum Advantage',
    tag: 'Why It Matters',
    body: "Shor's algorithm can break RSA-2048 encryption in hours — a task that would take classical computers millions of years. Grover's algorithm searches a billion items in ~31,623 steps instead of 1,000,000,000.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function AppHome() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-12 pb-8 overflow-hidden">
        {/* subtle dot grid — keeps background pure dark */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-5">
            <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
            Welcome back, <span className="text-white font-semibold">{user?.username}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
            <span className="text-white">What would you like to</span>{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
              explore today?
            </span>
          </h1>

          <p className="text-gray-300 text-base max-w-xl mx-auto leading-relaxed">
            Run Classical vs Quantum algorithm comparisons, build quantum circuits,
            and explore the power of quantum computing — all in one platform.
          </p>
        </div>
      </section>

      {/* ── PROBLEM CARDS (compact) ───────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 text-center">
            Solve a Problem — Classical vs Quantum
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {PROBLEMS.map(p => {
              const Icon = p.icon;
              return (
                <Link
                  key={p.key}
                  to={`/solve?type=${p.key}`}
                  className="group relative bg-quantum-800 border border-quantum-700 rounded-2xl p-4 hover:border-quantum-600 transition-all hover:scale-[1.02] cursor-pointer overflow-hidden"
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl"
                    style={{ background: `radial-gradient(circle at top right, ${p.glow}, transparent 70%)` }}
                  />
                  <div className="relative z-10">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-3`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-white font-bold text-sm mb-0.5">{p.label}</h3>
                    <p className="text-gray-400 text-[11px] mb-3 leading-tight">{p.tagline}</p>

                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Classical</span>
                        <span className="text-[10px] text-red-400 font-mono font-semibold">{p.classical}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">{p.algo}</span>
                        <span className="text-[10px] font-mono font-semibold" style={{ color: p.speedupColor }}>{p.quantum}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-quantum-700 border border-quantum-600" style={{ color: p.speedupColor }}>
                        {p.speedup}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-quantum-neon group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-2xl border border-quantum-700 grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-quantum-700 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(0,255,204,0.04), rgba(204,68,255,0.04))' }}
          >
            {STATS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-3 px-6 py-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}18`, border: `1px solid ${s.color}30` }}>
                    <Icon className="w-4 h-4" style={{ color: s.color }} />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-white font-mono leading-none">{s.value}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6 text-center">
            How It Works
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="relative bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-quantum-600" />
                    </div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-600 tracking-widest">STEP {step.num}</span>
                      <h3 className="text-white font-bold text-sm mt-0.5 mb-1.5">{step.title}</h3>
                      <p className="text-gray-400 text-xs leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

{/* ── QUANTUM FACTS ────────────────────────────────────────────────── */}
      <section className="px-6 pb-16 border-t border-quantum-700 pt-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 text-center">
            Did You Know?
          </p>
          <p className="text-gray-400 text-xs text-center mb-8">
            Essential quantum computing concepts powering this platform
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FACTS.map(f => (
              <div
                key={f.title}
                className="relative rounded-2xl border border-quantum-700 p-5 overflow-hidden flex flex-col gap-3 hover:border-quantum-600 transition-all hover:scale-[1.01]"
                style={{ background: f.glow }}
              >
                {/* Coloured top accent bar */}
                <div
                  className="absolute top-0 left-0 w-full h-[3px] rounded-t-2xl"
                  style={{ background: `linear-gradient(90deg, transparent, ${f.topBar}, transparent)` }}
                />

                {/* Header row — title + tag badge */}
                <div className="flex items-start justify-between gap-2 pt-1">
                  <h3 className={`text-transparent bg-clip-text bg-gradient-to-r ${f.color} font-bold text-sm leading-tight`}>
                    {f.title}
                  </h3>
                  <span
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5"
                    style={{ color: f.topBar, borderColor: `${f.topBar}40`, background: `${f.topBar}12` }}
                  >
                    {f.tag}
                  </span>
                </div>

                {/* Body */}
                <p className="text-gray-300 text-[11px] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
