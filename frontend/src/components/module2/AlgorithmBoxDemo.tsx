import { useEffect, useRef, useState } from 'react';
import { Check, Cpu, Zap, Play, RotateCcw } from 'lucide-react';

// ── Click-to-run visual demo: the learner presses "Run Classical" to watch a
// highlight step through the boxes one at a time, or "Run Quantum" to watch
// every box light up together (superposition) before collapsing straight onto
// the answer. Used for all four SFOD algorithms with different box content.

interface AlgorithmBoxDemoProps {
  items: string[];
  targetIndex: number;
  itemLabel: string;        // "name" | "record" | "divisor" | "route"
  queryLabel: string;       // caption prefix, e.g. "Looking for"
  classicalDesc: string;    // e.g. "checks one at a time"
  quantumDesc: string;      // e.g. "considers every option at once"
}

type RunState = 'idle' | 'running' | 'done';

const CLASSICAL_STEP_MS = 450;
const QUANTUM_COLLAPSE_MS = 900;
const TICK_MS = 80;

export function AlgorithmBoxDemo({
  items, targetIndex, itemLabel, queryLabel, classicalDesc, quantumDesc,
}: AlgorithmBoxDemoProps) {
  const [classicalState, setClassicalState] = useState<RunState>('idle');
  const [classicalElapsed, setClassicalElapsed] = useState(0);
  const [quantumState, setQuantumState] = useState<RunState>('idle');
  const [quantumElapsed, setQuantumElapsed] = useState(0);

  const classicalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const quantumTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const classicalScanMs = (targetIndex + 1) * CLASSICAL_STEP_MS;

  useEffect(() => () => {
    if (classicalTimer.current) clearInterval(classicalTimer.current);
    if (quantumTimer.current) clearInterval(quantumTimer.current);
  }, []);

  const runClassical = () => {
    if (classicalTimer.current) clearInterval(classicalTimer.current);
    setClassicalState('running');
    setClassicalElapsed(0);
    const start = Date.now();
    classicalTimer.current = setInterval(() => {
      const e = Date.now() - start;
      if (e >= classicalScanMs) {
        setClassicalElapsed(classicalScanMs);
        setClassicalState('done');
        if (classicalTimer.current) clearInterval(classicalTimer.current);
      } else {
        setClassicalElapsed(e);
      }
    }, TICK_MS);
  };

  const runQuantum = () => {
    if (quantumTimer.current) clearInterval(quantumTimer.current);
    setQuantumState('running');
    setQuantumElapsed(0);
    const start = Date.now();
    quantumTimer.current = setInterval(() => {
      const e = Date.now() - start;
      if (e >= QUANTUM_COLLAPSE_MS) {
        setQuantumElapsed(QUANTUM_COLLAPSE_MS);
        setQuantumState('done');
        if (quantumTimer.current) clearInterval(quantumTimer.current);
      } else {
        setQuantumElapsed(e);
      }
    }, TICK_MS);
  };

  const resetDemo = () => {
    if (classicalTimer.current) clearInterval(classicalTimer.current);
    if (quantumTimer.current) clearInterval(quantumTimer.current);
    setClassicalState('idle');
    setClassicalElapsed(0);
    setQuantumState('idle');
    setQuantumElapsed(0);
  };

  const classicalIndex = classicalState === 'idle' ? -1 : Math.min(targetIndex, Math.floor(classicalElapsed / CLASSICAL_STEP_MS));
  const classicalFound = classicalState === 'done';
  const classicalChecked = classicalState === 'idle' ? 0 : classicalFound ? targetIndex + 1 : classicalIndex + 1;

  const quantumRunning = quantumState === 'running';
  const quantumFound = quantumState === 'done';

  return (
    <div className="bg-quantum-800 rounded-lg p-5 border border-quantum-600">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-white mb-1">🔍 Live demo — run each approach yourself</p>
          <p className="text-gray-500 text-xs">
            {queryLabel}: <span className="text-quantum-neon font-semibold">{items[targetIndex]}</span>
            {' '}among {items.length} {itemLabel}s.
          </p>
        </div>
        <button
          onClick={resetDemo}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-quantum-600 rounded-full px-3 py-1.5 transition-colors self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Classical column */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Classical — {classicalDesc}
              </span>
            </div>
            <button
              onClick={runClassical}
              disabled={classicalState === 'running'}
              className="flex items-center gap-1 text-xs font-semibold text-black bg-gray-300 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed rounded-full px-3 py-1 transition-colors"
            >
              <Play className="w-3 h-3" />
              Run
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {items.map((name, i) => {
              const isCurrent = classicalState === 'running' && i === classicalIndex;
              const isFoundTarget = classicalFound && i === targetIndex;
              const alreadyPassed = classicalState === 'running' && i < classicalIndex;
              return (
                <div
                  key={i}
                  className={`relative rounded-lg border p-2 text-center transition-all duration-200 ${
                    isFoundTarget
                      ? 'bg-green-500/20 border-green-400 ring-2 ring-green-400/60'
                      : isCurrent
                        ? 'bg-blue-500/20 border-blue-400 ring-2 ring-blue-400/60 animate-pulse'
                        : alreadyPassed
                          ? 'bg-quantum-900 border-quantum-700 opacity-40'
                          : 'bg-quantum-900 border-quantum-700'
                  }`}
                >
                  {isFoundTarget && (
                    <Check className="w-3 h-3 text-green-400 absolute -top-1.5 -right-1.5 bg-quantum-900 rounded-full" />
                  )}
                  <span className={`text-[10px] font-medium truncate block ${
                    isFoundTarget ? 'text-green-200' : isCurrent ? 'text-blue-200' : 'text-gray-500'
                  }`}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {classicalState === 'idle'
              ? `Press "Run" to check ${itemLabel}s one by one`
              : `${classicalChecked} of ${items.length} checked${classicalFound ? ' — found it!' : '…'}`}
          </p>
        </div>

        {/* Quantum column */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-quantum-neon" />
              <span className="text-xs font-semibold text-quantum-neon uppercase tracking-wide">
                Quantum — {quantumDesc}
              </span>
            </div>
            <button
              onClick={runQuantum}
              disabled={quantumState === 'running'}
              className="flex items-center gap-1 text-xs font-semibold text-black rounded-full px-3 py-1 transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
            >
              <Play className="w-3 h-3" />
              Run
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {items.map((name, i) => {
              const isTarget = i === targetIndex;
              const collapsedTarget = quantumFound && isTarget;
              const collapsedOther = quantumFound && !isTarget;
              return (
                <div
                  key={i}
                  className={`relative rounded-lg border p-2 text-center transition-all duration-500 ${
                    collapsedTarget
                      ? 'bg-green-500/20 border-green-400 ring-2 ring-green-400/60'
                      : collapsedOther
                        ? 'bg-quantum-900 border-quantum-700 opacity-30'
                        : quantumRunning
                          ? 'bg-purple-500/20 border-purple-400 animate-pulse'
                          : 'bg-quantum-900 border-quantum-700'
                  }`}
                >
                  {collapsedTarget && (
                    <Check className="w-3 h-3 text-green-400 absolute -top-1.5 -right-1.5 bg-quantum-900 rounded-full" />
                  )}
                  <span className={`text-[10px] font-medium truncate block ${
                    collapsedTarget ? 'text-green-200' : quantumRunning ? 'text-purple-200' : 'text-gray-500'
                  }`}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {quantumState === 'idle'
              ? `Press "Run" to consider all ${items.length} ${itemLabel}s at once`
              : quantumFound
                ? 'Collapsed straight to the answer — no scanning needed!'
                : 'All boxes considered simultaneously (superposition)…'}
          </p>
        </div>
      </div>
    </div>
  );
}
