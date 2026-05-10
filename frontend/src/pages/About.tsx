import { Cpu, Zap, BarChart2, Brain, BookOpen, Shield, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const MODULES = [
  { id: '01', title: 'Custom Simulation Kernel',     icon: Cpu,      color: 'from-teal-500 to-cyan-400',    status: 'live',  desc: 'Proprietary 15–20 qubit state-vector engine built with NumPy. No Qiskit. No QPU hardware.' },
  { id: '02', title: 'SFOD Benchmark Suite',         icon: Zap,      color: 'from-purple-500 to-pink-400',  status: 'soon',  desc: 'Unified runner for Search, Factoring, Optimization, and Database problem types.' },
  { id: '03', title: 'Circuit Builder',              icon: BookOpen, color: 'from-green-500 to-emerald-400', status: 'soon', desc: 'Drag-and-drop visual circuit canvas for learning quantum gate logic without any physics background.' },
  { id: '04', title: 'AI Algorithm Advisor',         icon: Brain,    color: 'from-orange-500 to-yellow-400', status: 'live', desc: 'Random Forest Classifier that recommends the best quantum algorithm for any problem type with confidence scores.' },
  { id: '05', title: 'ML Performance Predictor',     icon: Brain,    color: 'from-blue-500 to-indigo-400',  status: 'live',  desc: 'Gradient Boosting Regressor that predicts speedup, qubit count, circuit depth, and success probability.' },
  { id: '06', title: 'Neural Optimizer',             icon: Zap,      color: 'from-red-500 to-rose-400',    status: 'soon',  desc: 'Deep RL agent that autonomously tunes quantum gate angles to escape the Barren Plateau problem.' },
  { id: '07', title: 'QNN Converter',                icon: Shield,   color: 'from-pink-500 to-fuchsia-400', status: 'soon', desc: 'Translates classical neural network architectures into equivalent quantum neural networks.' },
  { id: '08', title: 'Performance Dashboard',        icon: BarChart2, color: 'from-blue-500 to-cyan-400',  status: 'live',  desc: 'Real-time benchmarking dashboard comparing Quantum vs Classical algorithms with Plotly charts.' },
];

const TECH_STACK = [
  { layer: 'Simulation Engine', tech: 'Python · NumPy · SciPy' },
  { layer: 'Backend API',       tech: 'FastAPI · Uvicorn · WebSockets' },
  { layer: 'Frontend',          tech: 'React · TypeScript · Vite · Tailwind CSS' },
  { layer: 'Visualisation',     tech: 'Plotly.js · Recharts' },
  { layer: 'Infrastructure',    tech: 'Docker · Docker Compose' },
];

export function About() {
  return (
    <div className="min-h-screen">

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-16 pb-12 text-center overflow-hidden">
        <div className="absolute top-0 left-1/3 w-80 h-80 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-64 h-64 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
            About QAIbridge
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Bridging the Gap Between{' '}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}
            >
              Classical & Quantum
            </span>
          </h1>

          <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            QAIbridge is an AI-driven quantum simulation platform that automates circuit design,
            benchmarks performance, and makes quantum computing accessible — without requiring
            quantum physics expertise or expensive QPU hardware.
          </p>
        </div>
      </section>

      {/* ── WHAT IS IT ────────────────────────────────────────────────── */}
      <section className="py-14 px-6 bg-quantum-800/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6">What is QAIbridge?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400 leading-relaxed">
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center mb-3">
                <Cpu className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-white font-semibold mb-2">Simulate</h3>
              <p>Run quantum circuits on up to 20 qubits using a custom-built state-vector engine. No Qiskit. No cloud QPU. Everything runs on local CPU.</p>
            </div>
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center mb-3">
                <BarChart2 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-white font-semibold mb-2">Benchmark</h3>
              <p>Compare Quantum vs Classical algorithms head-to-head across Search, Factoring, Optimization, and Database problems with live complexity charts.</p>
            </div>
            <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-400 flex items-center justify-center mb-3">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-white font-semibold mb-2">Automate</h3>
              <p>AI modules handle circuit design, gate optimization, code transpilation, and neural architecture conversion — removing the need for quantum expertise.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8 MODULES ─────────────────────────────────────────────────── */}
      <section className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-2">Platform Modules</h2>
          <p className="text-gray-500 text-sm mb-8">Eight integrated modules covering simulation, AI optimization, education, and benchmarking.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODULES.map(m => {
              const Icon = m.icon;
              return (
                <div key={m.id} className="flex gap-4 bg-quantum-800 border border-quantum-700 rounded-2xl p-4 hover:border-quantum-600 transition-all">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-600">{m.id}</span>
                      <h3 className="text-white font-semibold text-sm truncate">{m.title}</h3>
                      {m.status === 'live' ? (
                        <span className="ml-auto flex-shrink-0 text-[10px] bg-teal-900/50 text-quantum-neon border border-teal-800 px-2 py-0.5 rounded-full">Live</span>
                      ) : (
                        <span className="ml-auto flex-shrink-0 text-[10px] bg-quantum-700 text-gray-500 px-2 py-0.5 rounded-full">Soon</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ────────────────────────────────────────────────── */}
      <section className="py-14 px-6 bg-quantum-800/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8">Technology Stack</h2>
          <div className="space-y-3">
            {TECH_STACK.map(t => (
              <div key={t.layer} className="flex items-center gap-4 bg-quantum-800 border border-quantum-700 rounded-xl px-5 py-3">
                <span className="text-gray-500 text-sm w-40 flex-shrink-0">{t.layer}</span>
                <div className="h-px flex-1 bg-quantum-700" />
                <span className="text-quantum-neon font-mono text-sm">{t.tech}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to explore quantum computing?</h2>
          <p className="text-gray-400 text-sm mb-8">Start with the Simulation Kernel or check the Performance Dashboard to see quantum advantage in action.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/simulator"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-black text-sm hover:scale-105 transition-all"
              style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
            >
              <Cpu className="w-4 h-4" />
              Launch Simulator
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-purple transition-all hover:scale-105"
            >
              <BarChart2 className="w-4 h-4" />
              View Dashboard
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
