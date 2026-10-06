import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Hash, Shuffle, Database,
  Cpu, BarChart2, Zap, ChevronRight, ArrowRight,
  BookOpen, Atom, TrendingUp, Star, Brain, Code2, Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TOOL_GROUPS, toolsIn } from '../tools';
import type { Tool, ToolGroup } from '../tools';
import { ContinueLearning } from '../learn/components/ContinueLearning';

// ── Ask the AI Advisor ────────────────────────────────────────────────────────

// One click fills the box. Each one is detailed enough for the Advisor to accept.
const EXAMPLES = [
  'Shortest route for a van visiting 8 shops',
  'Search 10 million unsorted records for a match',
  'Factor a 2048-bit number to test encryption',
];

/**
 * The first thing on the app home page: describe a problem in plain English
 * and the AI Advisor (Module 4) answers it straight away. The question is
 * passed as router state, not in the address, so it stays out of the history.
 */
function AskTheAdvisor() {
  const [problem, setProblem] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const ask = () => {
    const text = problem.trim();
    if (text) navigate('/module4', { state: { problem: text } });
  };

  return (
    <div>
      <form
        onSubmit={e => { e.preventDefault(); ask(); }}
        className="glass-card rounded-2xl p-3 sm:p-4"
      >
        <label htmlFor="ask-advisor" className="sr-only">Describe your problem</label>
        <textarea
          id="ask-advisor"
          ref={inputRef}
          value={problem}
          onChange={e => setProblem(e.target.value)}
          onKeyDown={e => {
            // Enter asks; Shift + Enter starts a new line (and typing with an
            // input method, e.g. Urdu or Chinese, isn't cut short).
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask();
            }
          }}
          rows={3}
          placeholder="e.g. I run a delivery company. Each morning a van visits 8 shops and comes back. Which route is shortest?"
          className="w-full bg-quantum-900/70 border border-quantum-600 rounded-xl px-4 py-3 text-sm sm:text-base text-white leading-relaxed placeholder-gray-500 resize-none focus:outline-none focus:border-quantum-neon/60 transition-colors"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="hidden sm:block text-xs text-gray-400">
            <kbd className="font-sans text-gray-300">Enter</kbd> to ask · <kbd className="font-sans text-gray-300">Shift + Enter</kbd> for a new line
          </p>
          <button
            type="submit"
            disabled={!problem.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
          >
            <Brain className="w-4 h-4" />
            Ask the AI Advisor
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Examples */}
      <p className="mt-5 mb-2 text-center text-xs text-gray-400">Or try an example</p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            type="button"
            onClick={() => { setProblem(ex); inputRef.current?.focus(); }}
            className="text-xs text-gray-300 bg-quantum-800/80 border border-quantum-600 rounded-full px-3 py-1.5 hover:border-quantum-neon/50 hover:text-white transition-colors text-left"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Other ways in */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link to="/module5" className="inline-flex items-center gap-1.5 text-gray-300 hover:text-quantum-neon transition-colors">
          <Code2 className="w-4 h-4 text-quantum-purple" />
          Have code? Turn it into a quantum circuit
        </Link>
        <Link to="/module4" className="inline-flex items-center gap-1.5 text-gray-300 hover:text-quantum-neon transition-colors">
          <Upload className="w-4 h-4 text-quantum-neon" />
          Or upload a file (PDF, Word, CSV)
        </Link>
      </div>
    </div>
  );
}

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
    classical: 'O(N!)',
    quantum: 'variational',
    algo: 'QAOA',
    speedup: 'Heuristic',
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
  { label: 'Algorithms that really run', value: '6',        icon: Atom,       color: '#00ffcc' },
  { label: 'Qubits (RAM-aware kernel)',  value: 'up to 28', icon: Cpu,        color: '#3b82f6' },
  { label: 'Problem types',              value: '4 + 4',    icon: Star,       color: '#f97316' },
  { label: 'Integrated modules',         value: '8',        icon: TrendingUp, color: '#cc44ff' },
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
    desc: 'See answers checked side by side, oracle queries vs comparisons, success probability and where quantum wins at scale.',
  },
];

// ── Tool cards (names and descriptions come from tools.ts) ─────────────────────

function ToolGroupCards({ group, columns = '' }: { group: ToolGroup; columns?: string }) {
  return (
    <div className="flex flex-col">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        {TOOL_GROUPS.find(g => g.id === group)?.label}
      </h2>
      <div className={`grid content-start gap-3 ${columns}`}>
        {toolsIn(group).map(t => <ToolCard key={t.path} tool={t} />)}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link to={tool.path}
      className="group flex flex-col glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${tool.color}1f`, border: `1px solid ${tool.color}55` }}>
          <tool.icon className="w-4 h-4" style={{ color: tool.color }} />
        </span>
        <h3 className="text-white font-bold text-sm">{tool.name}</h3>
      </div>
      <p className="flex-1 text-gray-400 text-xs leading-relaxed">{tool.desc}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-quantum-neon/70 group-hover:text-quantum-neon transition-colors">
        Open <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppHome() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-12 pb-12 overflow-hidden">
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-quantum-800 border border-quantum-600 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-5">
              <span className="w-2 h-2 rounded-full bg-quantum-neon animate-pulse" />
              Welcome back, <span className="text-white font-semibold">{user?.username}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight text-balance">
              <span className="text-white">What problem are you</span>{' '}
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
                trying to solve?
              </span>
            </h1>

            <p className="text-gray-300 text-base max-w-xl mx-auto leading-relaxed">
              Describe it in plain English. The AI Advisor tells you whether quantum
              computing can help, and which method to use.
            </p>
          </div>

          <AskTheAdvisor />
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
                  className="group relative glass-card rounded-2xl p-4 overflow-hidden"
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
                    <p className="text-gray-400 text-xs mb-3 leading-snug">{p.tagline}</p>

                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Classical</span>
                        <span className="text-xs text-red-400 font-mono font-semibold">{p.classical}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{p.algo}</span>
                        <span className="text-xs font-mono font-semibold" style={{ color: p.speedupColor }}>{p.quantum}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-quantum-900/60 border border-quantum-600" style={{ color: p.speedupColor }}>
                        {p.speedup}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-quantum-neon group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ALL TOOLS ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6 text-center">
            All tools
          </p>
          <div className="space-y-8">
            <ToolGroupCards group="solve" columns="sm:grid-cols-3" />
            {/* The rest side by side */}
            <div className="grid gap-8 md:gap-3 md:grid-cols-3">
              {(['build', 'research', 'results'] as const).map(g => <ToolGroupCards key={g} group={g} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <div className="max-w-5xl mx-auto">
          <div
            className="glass-card rounded-2xl grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-quantum-700 overflow-hidden"
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
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
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
                <div key={step.num} className="relative glass-card rounded-2xl p-6">
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-gray-500" />
                    </div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-400 tracking-widest">STEP {step.num}</span>
                      <h3 className="text-white font-bold text-sm mt-0.5 mb-1.5">{step.title}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CONTINUE LEARNING ────────────────────────────────────────────── */}
      <section className="px-6 pb-16 border-t border-quantum-700 pt-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6 text-center">
            Learn
          </p>
          <ContinueLearning />
        </div>
      </section>

    </div>
  );
}
