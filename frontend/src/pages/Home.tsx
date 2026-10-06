import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, Cpu, BarChart2, BookOpen, Brain, Users, GraduationCap, FlaskConical, Code2, CheckCircle, MessageSquare, ShieldCheck } from 'lucide-react';
import { QubitSphere } from '../components/home/QubitSphere';
import { LearnTeaser } from '../learn/components/LearnTeaser';

const CAPABILITIES = [
  {
    icon: Cpu,
    color: 'from-teal-500 to-cyan-400',
    title: 'Quantum Simulation',
    desc: 'Run quantum circuits on 20+ qubits (up to 28, RAM permitting) using a custom-built state-vector engine — no Qiskit inside, no cloud QPU required.',
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
    desc: 'Neural networks learn quantum gate angles — including QAOA\'s γ and β — and a live monitor escapes barren plateaus.',
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

// Short, verifiable claims under the hero buttons.
const HERO_PROOF = [
  { icon: ShieldCheck, text: 'Simulator checked against IBM Qiskit' },
  { icon: CheckCircle, text: 'Quantum answers checked against classical ones' },
  { icon: Cpu,         text: 'No quantum hardware needed' },
];

// Real screenshots of the app (public/showcase/), captured from actual runs.
const SHOWCASE = [
  {
    icon: Brain,
    tint: 'from-orange-500 to-pink-500',
    label: 'AI Advisor',
    title: 'Describe your problem in plain English',
    body: 'Tell QAIbridge what you are trying to solve, or upload a PDF, Word or CSV file. It works out whether quantum computing would actually help, and which algorithm fits.',
    quote: 'I run a delivery company in Lahore. Each morning a van must visit 5 shops and come back. Which route is shortest?',
    code: null,
    points: [
      'Quantum or classical, with a confidence score',
      'Every quantum algorithm ranked for your problem',
      'One click to run it on your own data',
    ],
    image: {
      src: '/showcase/advisor.jpg', width: 1356, height: 766,
      alt: 'QAIbridge recommending the quantum approach with 99% confidence, and QAOA as the best algorithm, for a delivery-route question',
    },
  },
  {
    icon: Code2,
    tint: 'from-blue-500 to-indigo-400',
    label: 'Code to Quantum',
    title: 'Turn ordinary code into a quantum circuit',
    body: 'Paste a Python program. QAIbridge works out what it computes, rewrites it as a problem a quantum computer can solve, runs the circuit and checks the answer against your original code.',
    quote: null,
    code: 'stocks = ["ENGRO", "HBL", "LUCK",\n          "OGDC", "PSO", "SYS"]\nk = 3   # pick the best 3 of 6',
    points: [
      'Search, routing, budgeting, finance and logic problems',
      'Every quantum answer verified against the classical one',
      'Export the exact circuit as Qiskit code',
    ],
    image: {
      src: '/showcase/transformer.jpg', width: 1740, height: 1110,
      alt: 'QAIbridge confirming the quantum portfolio answer (ENGRO, LUCK, SYS) matches the classical one, with the QUBO matrix and QAOA training chart',
    },
  },
  {
    icon: BarChart2,
    tint: 'from-teal-500 to-cyan-400',
    label: 'Quantum vs Classical',
    title: 'Watch quantum and classical solve the same problem',
    body: "Run Grover's search, Shor's factoring and QAOA next to the best classical method on the same input. Both really run, both answers are checked, and the charts show how each one scales.",
    quote: null,
    code: null,
    points: [
      "Real quantum circuits on QAIbridge's own simulator",
      'Steps, timings and qubit counts for both sides',
      'Plain-language notes on what each result means',
    ],
    image: {
      src: '/showcase/factoring.jpg', width: 1740, height: 1179,
      alt: "Shor's algorithm and trial division both factoring 91 into 7 × 13, with the measured quantum distribution",
    },
  },
];

export function Home() {
  return (
    <div className="min-h-screen">

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-8 pb-16 sm:pt-12 lg:pt-14 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

        {/* Text on the left, the qubit sphere on the right (above the text on phones) */}
        <div className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] items-center gap-4 lg:gap-6">
          <QubitSphere className="mx-auto w-56 sm:w-72 lg:w-full lg:max-w-[460px] lg:order-2" />

          <div className="text-center lg:text-left">
            {/* Heading — what the product does for you, not its name */}
            <h1 className="text-4xl sm:text-6xl lg:text-[3.5rem] font-extrabold tracking-tight text-white leading-[1.08] mb-6">
              Find out if{' '}
              <span className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }}>
                quantum computing
              </span>{' '}
              can solve your problem
            </h1>

            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed mb-10">
              Describe your problem in plain English or paste your code. QAIbridge picks the right
              quantum algorithm, runs it on a built-in quantum simulator, and checks the answer
              against the classical one.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 max-w-xs sm:max-w-none mx-auto">
              <Link
                to="/register"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-black text-sm transition-all hover:scale-105 hover:brightness-110"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
              >
                Try it free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#see-it-in-action"
                onClick={e => {
                  e.preventDefault();
                  document.getElementById('see-it-in-action')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white text-sm bg-quantum-700 border border-quantum-500 hover:border-quantum-neon/50 transition-all hover:scale-105"
              >
                See how it works
                <ArrowDown className="w-4 h-4" />
              </a>
            </div>

            {/* Proof points */}
            <ul className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 mt-8 text-xs sm:text-sm text-gray-500">
              {HERO_PROOF.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 text-quantum-neon" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── SEE IT IN ACTION ────────────────────────────────────────────── */}
      <section id="see-it-in-action" className="py-20 px-6 border-t border-quantum-700 scroll-mt-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-quantum-neon text-xs font-semibold uppercase tracking-widest mb-3">See it in action</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Real results, straight from the app</h2>
            <p className="text-gray-500 text-sm max-w-xl mx-auto">
              Every screenshot below is a real run on QAIbridge. Nothing is mocked up.
            </p>
          </div>

          <div className="space-y-24">
            {SHOWCASE.map((s, i) => {
              const Icon = s.icon;
              const flip = i % 2 === 1;
              return (
                <div key={s.label} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                  <div className={`min-w-0 lg:col-span-5 ${flip ? 'lg:order-2' : ''}`}>
                    <div className="flex items-center gap-2.5 mb-4">
                      <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.tint} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </span>
                      <span className="text-gray-400 text-sm font-semibold">{s.label}</span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">{s.title}</h3>
                    <p className="text-gray-400 text-sm sm:text-base leading-relaxed mb-5">{s.body}</p>

                    {s.quote && (
                      <div className="flex gap-3 items-start bg-quantum-900 border border-quantum-700 rounded-xl p-4 mb-5">
                        <MessageSquare className="w-4 h-4 text-orange-300 mt-0.5 flex-shrink-0" />
                        <p className="text-gray-300 text-sm italic leading-relaxed">“{s.quote}”</p>
                      </div>
                    )}
                    {s.code && (
                      <pre className="bg-quantum-900 border border-quantum-700 rounded-xl p-4 mb-5 text-xs text-gray-300 font-mono leading-relaxed overflow-x-auto">{s.code}</pre>
                    )}

                    <ul className="space-y-2.5 mb-6">
                      {s.points.map(p => (
                        <li key={p} className="flex items-start gap-2.5">
                          <CheckCircle className="w-4 h-4 text-quantum-neon flex-shrink-0 mt-0.5" />
                          <span className="text-gray-300 text-sm">{p}</span>
                        </li>
                      ))}
                    </ul>

                    <Link to="/register" className="inline-flex items-center gap-1.5 text-quantum-neon text-sm font-semibold hover:text-teal-300 transition-colors">
                      Try it free <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>

                  <figure className={`min-w-0 lg:col-span-7 ${flip ? 'lg:order-1' : ''}`}>
                    <div data-tilt="2" className="glass-card rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-quantum-700 bg-quantum-900/60">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                        <span className="ml-3 text-[11px] text-gray-500 font-mono truncate">QAIbridge · {s.label}</span>
                      </div>
                      <a href={s.image.src} target="_blank" rel="noreferrer" title="Open full size">
                        <img
                          src={s.image.src}
                          width={s.image.width}
                          height={s.image.height}
                          alt={s.image.alt}
                          loading="lazy"
                          decoding="async"
                          className="block w-full h-auto"
                        />
                      </a>
                    </div>
                  </figure>
                </div>
              );
            })}
          </div>
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
                <div key={c.title} data-tilt className="glass-card rounded-2xl p-6">
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
                <div key={w.title} data-tilt className="glass-card text-center p-6 rounded-2xl">
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

      {/* ── LEARN (free lessons) ────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <LearnTeaser />
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
