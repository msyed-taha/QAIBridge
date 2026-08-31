import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Pause, Play, Info, BookOpen } from 'lucide-react';
import axios from 'axios';
import { AlgorithmBoxDemo } from './AlgorithmBoxDemo';

// Each algorithm gets its own target position so the four demos don't feel
// like copies of each other — the box count (10) stays constant for a fair
// classical-vs-quantum comparison, but where the answer sits differs.
const DEMO_CONFIG: Record<string, {
  items: string[]; targetIndex: number; itemLabel: string; queryLabel: string; classicalDesc: string; quantumDesc: string;
}> = {
  search: {
    items: ['Aisha', 'Bilal', 'Chen', 'Diana', 'Emeka', 'Fatima', 'George', 'Hana', 'Iqbal', 'Jade'],
    targetIndex: 5, // "Fatima" — 6th box
    itemLabel: 'name',
    queryLabel: 'Looking for',
    classicalDesc: 'checks one name at a time',
    quantumDesc: 'considers every name at once',
  },
  database: {
    items: ['Rec #1', 'Rec #2', 'Rec #3', 'Rec #4', 'Rec #5', 'Rec #6', 'Rec #7', 'Rec #8', 'Rec #9', 'Rec #10'],
    targetIndex: 8, // "Rec #9"
    itemLabel: 'record',
    queryLabel: 'Matching query for',
    classicalDesc: 'scans one record at a time',
    quantumDesc: 'queries every record at once',
  },
  factoring: {
    items: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
    targetIndex: 5, // "7" — 91 = 7 x 13, so 7 is the real divisor being found
    itemLabel: 'divisor',
    queryLabel: 'Finding a factor of 91 — the divisor',
    classicalDesc: 'tests divisors one by one',
    quantumDesc: 'tests every divisor at once (period-finding)',
  },
  optimization: {
    items: ['Route A', 'Route B', 'Route C', 'Route D', 'Route E', 'Route F', 'Route G', 'Route H', 'Route I', 'Route J'],
    targetIndex: 3, // "Route D"
    itemLabel: 'route',
    queryLabel: 'Finding the shortest route —',
    classicalDesc: 'tries routes one by one (greedy)',
    quantumDesc: 'explores every route at once (QAOA)',
  },
};

interface AlgorithmStep {
  step_number: number;
  phase: string;
  classical_action: string;
  classical_state: string;
  classical_explanation: string;
  quantum_action: string;
  quantum_state: string;
  quantum_explanation: string;
  tooltip: string;
  visual_hint: string;
  metrics: Record<string, number>;
}

interface TutorialSession {
  algorithm: string;
  input_size: number;
  problem_description: string;
  total_steps: number;
  steps: AlgorithmStep[];
  classical_final_steps: number;
  quantum_final_steps: number;
  speedup: number;
  key_insight: string;
}

interface TutorialWalkthroughProps {
  algorithm: string;
  inputSize: number;
  onClose?: () => void;
}

const PHASE_COLORS: Record<string, string> = {
  initialization: 'from-blue-600 to-blue-400',
  processing: 'from-purple-600 to-purple-400',
  measurement: 'from-green-600 to-green-400',
  verification: 'from-cyan-600 to-cyan-400',
};

const PHASE_LABELS: Record<string, string> = {
  initialization: '🔧 Initialization',
  processing: '⚙️ Processing',
  measurement: '📏 Measurement',
  verification: '✅ Verification',
};

// Plain-language glossary, tailored per algorithm so beginners aren't lost
// in jargon like "Oracle", "QFT" or "Hamiltonian" the moment the walkthrough starts.
const GLOSSARY: Record<string, { term: string; plain: string }[]> = {
  search: [
    { term: 'Qubit', plain: 'The quantum version of a bit. A normal bit is 0 or 1 — a qubit can be a mix of both at the same time.' },
    { term: 'Superposition', plain: 'A qubit exploring many values at once, instead of checking them one after another like a classical computer.' },
    { term: 'Oracle', plain: 'A step that quietly "tags" the correct answer among all the possibilities, without telling us which one it is yet.' },
    { term: 'Amplitude amplification (diffusion)', plain: 'A boosting step that makes the tagged answer more and more likely to show up when we finally look.' },
    { term: 'Measurement', plain: 'The moment we "look" at the qubits — all the possibilities collapse down to one final answer.' },
  ],
  factoring: [
    { term: 'Qubit', plain: 'The quantum version of a bit — it can represent 0, 1, or a blend of both until measured.' },
    { term: 'Superposition', plain: 'Trying out many candidate factors at the same time, instead of testing them one by one.' },
    { term: 'Quantum Fourier Transform (QFT)', plain: 'A mathematical trick for spotting hidden repeating patterns in numbers — those patterns reveal the factors.' },
    { term: 'Measurement', plain: 'Reading the qubits at the end, which locks in the factors the algorithm found.' },
  ],
  optimization: [
    { term: 'Qubit', plain: 'The quantum version of a bit — it can represent 0, 1, or a blend of both until measured.' },
    { term: 'Hamiltonian', plain: 'A fancy name for "the cost of a route", written in a form the quantum circuit can work with.' },
    { term: 'QAOA', plain: 'Quantum Approximate Optimization Algorithm — it alternates between a quantum step and a classical tuning step to home in on a good (not always perfect) route.' },
    { term: 'Measurement', plain: 'Reading the qubits to get the best route the algorithm found so far.' },
  ],
  database: [
    { term: 'Qubit', plain: 'The quantum version of a bit. A normal bit is 0 or 1 — a qubit can be a mix of both at the same time.' },
    { term: 'Superposition', plain: 'Every record in the database being "considered" at once, instead of read one row at a time.' },
    { term: 'Oracle', plain: 'A step that quietly tags every record matching the query, without reading them one by one.' },
    { term: 'Amplitude amplification', plain: 'A boosting step that makes matching records more likely to appear when we finally read the result.' },
    { term: 'Measurement', plain: 'The moment we "read" the qubits — the matching records become the final answer.' },
  ],
};

export function TutorialWalkthrough({ algorithm, inputSize, onClose }: TutorialWalkthroughProps) {
  const [tutorial, setTutorial] = useState<TutorialSession | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showGlossary, setShowGlossary] = useState(true);

  useEffect(() => {
    fetchTutorial();
  }, [algorithm, inputSize]);

  useEffect(() => {
    if (isPaused || !tutorial || currentStep >= tutorial.total_steps - 1) return;
    const timer = setTimeout(() => setCurrentStep(s => s + 1), 3000);
    return () => clearTimeout(timer);
  }, [isPaused, currentStep, tutorial]);

  const fetchTutorial = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.post('/api/module2/tutorial', {
        algorithm,
        input_size: inputSize,
      });
      setTutorial(response.data);
      setCurrentStep(0);
    } catch (err: any) {
      setError(err.message || 'Failed to load tutorial');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto p-6 bg-quantum-800 rounded-lg border border-quantum-700">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-quantum-neon border-t-transparent" />
          <span className="ml-3 text-gray-400">Loading tutorial...</span>
        </div>
      </div>
    );
  }

  if (error || !tutorial) {
    return (
      <div className="w-full max-w-6xl mx-auto p-6 bg-quantum-800 rounded-lg border border-quantum-700">
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error || 'Failed to load tutorial'}</p>
          <button
            onClick={fetchTutorial}
            className="px-4 py-2 bg-quantum-neon text-quantum-900 rounded font-semibold hover:bg-opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const step = tutorial.steps[currentStep];
  const progress = ((currentStep + 1) / tutorial.total_steps) * 100;

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-quantum-800 to-quantum-700 rounded-lg p-6 border border-quantum-600">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">{tutorial.problem_description}</h2>
            <p className="text-gray-400 text-sm">{PHASE_LABELS[step.phase]}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowGlossary(g => !g)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-quantum-600 rounded-full px-3 py-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {showGlossary ? 'Hide glossary' : 'New here? Show glossary'}
            </button>
            {onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-quantum-900 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">Step {currentStep + 1} of {tutorial.total_steps}</p>
      </div>

      {/* Beginner Glossary */}
      {showGlossary && (
        <div className="bg-quantum-800 rounded-lg p-5 border border-quantum-600">
          <p className="text-sm font-semibold text-white mb-3">📖 Quick glossary — plain-English terms used below</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(GLOSSARY[algorithm] ?? []).map(g => (
              <div key={g.term} className="bg-quantum-900/50 rounded-lg p-3">
                <p className="text-quantum-neon text-xs font-semibold mb-1">{g.term}</p>
                <p className="text-gray-400 text-xs leading-relaxed">{g.plain}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Demo — click-to-run example comparing the two approaches */}
      {DEMO_CONFIG[algorithm] && (
        <AlgorithmBoxDemo {...DEMO_CONFIG[algorithm]} />
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Classical Approach */}
        <div className="relative overflow-hidden rounded-lg p-5 border border-blue-500/30">
          <div className={`absolute inset-0 bg-gradient-to-br ${PHASE_COLORS[step.phase]} opacity-20 pointer-events-none`} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-400" />
              <h3 className="text-lg font-bold text-blue-300">Classical Approach</h3>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">ACTION</p>
                <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded">{step.classical_action}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">STATE</p>
                <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded break-words">{step.classical_state}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">EXPLANATION</p>
                <p className="text-gray-300 text-sm leading-relaxed">{step.classical_explanation}</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-blue-500/20">
              <p className="text-xs text-blue-300">
                <span className="font-semibold">Steps so far:</span> {step.metrics.classical_steps}
              </p>
            </div>
          </div>
        </div>

        {/* Quantum Approach */}
        <div className="relative overflow-hidden rounded-lg p-5 border border-purple-500/30">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600 opacity-20 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse" />
              <h3 className="text-lg font-bold text-purple-300">Quantum Approach</h3>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">ACTION</p>
                <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded">{step.quantum_action}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">STATE</p>
                <p className="text-white font-mono text-sm bg-quantum-900/50 p-2 rounded break-words">{step.quantum_state}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 mb-1">EXPLANATION</p>
                <p className="text-gray-300 text-sm leading-relaxed">{step.quantum_explanation}</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-purple-500/20">
              <p className="text-xs text-purple-300">
                <span className="font-semibold">Steps so far:</span> {step.metrics.quantum_steps}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Educational Tooltip */}
      <div className="relative overflow-hidden rounded-lg p-4 border border-cyan-500/30">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-teal-600 opacity-10 pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cyan-300 mb-1">💡 Key Insight</p>
            <p className="text-gray-300 text-sm">{step.tooltip}</p>
          </div>
        </div>
      </div>

      {/* Metrics Comparison */}
      <div className="bg-quantum-800 rounded-lg p-4 border border-quantum-600">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">CLASSICAL STEPS</p>
            <p className="text-2xl font-bold text-blue-400">{step.metrics.classical_steps}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">QUANTUM STEPS</p>
            <p className="text-2xl font-bold text-purple-400">{step.metrics.quantum_steps}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">ACCURACY</p>
            <p className="text-2xl font-bold text-green-400">{step.metrics.accuracy}%</p>
          </div>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 bg-quantum-700 hover:bg-quantum-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <button
          onClick={() => setIsPaused(!isPaused)}
          className="flex items-center gap-2 px-4 py-2 bg-quantum-neon text-quantum-900 font-semibold rounded-lg hover:bg-opacity-90 transition-all"
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4" />
              Resume
            </>
          ) : (
            <>
              <Pause className="w-4 h-4" />
              Pause
            </>
          )}
        </button>

        <button
          onClick={() => setCurrentStep(Math.min(tutorial.total_steps - 1, currentStep + 1))}
          disabled={currentStep === tutorial.total_steps - 1}
          className="flex items-center gap-2 px-4 py-2 bg-quantum-700 hover:bg-quantum-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Final Summary */}
      {currentStep === tutorial.total_steps - 1 && (
        <div className="relative overflow-hidden rounded-lg p-5 border border-green-500/30">
          <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 opacity-20 pointer-events-none" />
          <div className="relative">
            <h3 className="text-lg font-bold text-green-300 mb-3">🎉 Tutorial Complete!</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold text-gray-300">Final Result:</span>
                <span className="text-gray-400 ml-2">{tutorial.key_insight}</span>
              </p>
              <p>
                <span className="font-semibold text-gray-300">Speedup Factor:</span>
                <span className="text-green-300 ml-2 font-mono text-lg">{tutorial.speedup}×</span>
              </p>
              <p>
                <span className="font-semibold text-gray-300">Classical Steps:</span>
                <span className="text-blue-300 ml-2">{tutorial.classical_final_steps.toLocaleString()}</span>
              </p>
              <p>
                <span className="font-semibold text-gray-300">Quantum Steps:</span>
                <span className="text-purple-300 ml-2">{tutorial.quantum_final_steps.toLocaleString()}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
