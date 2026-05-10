import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Pause, Play, Info } from 'lucide-react';
import axios from 'axios';

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

export function TutorialWalkthrough({ algorithm, inputSize, onClose }: TutorialWalkthroughProps) {
  const [tutorial, setTutorial] = useState<TutorialSession | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    fetchTutorial();
  }, [algorithm, inputSize]);

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
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          )}
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

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Classical Approach */}
        <div className={`bg-gradient-to-br ${PHASE_COLORS[step.phase]} opacity-20 rounded-lg p-5 border border-blue-500/30`}>
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

        {/* Quantum Approach */}
        <div className={`bg-gradient-to-br from-purple-600 to-pink-600 opacity-20 rounded-lg p-5 border border-purple-500/30`}>
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

      {/* Educational Tooltip */}
      <div className="bg-gradient-to-r from-cyan-600 to-teal-600 opacity-10 rounded-lg p-4 border border-cyan-500/30">
        <div className="flex items-start gap-3">
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
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 opacity-20 rounded-lg p-5 border border-green-500/30">
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
      )}
    </div>
  );
}
