import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { CodeBlock } from '../shared/CodeBlock';
import { GroverViews, ShorViews, SideBySide, TspViews } from '../module2/SfodResultViews';
import { RunWalkthrough } from '../module2/RunWalkthrough';
import { LogicView, QaoaProblemView } from './TransformerViews';
import type { ComparisonResult } from '../../api/sfod';
import type { LogicDetails, QaoaProblemDetails, TransformResult } from '../../api/transformer';

/**
 * A solved problem (Code to Quantum, or the AI Advisor's "Solve it here"): the check of the quantum answer against
 * the classical one, the stages, the side-by-side comparison with its step-by-step walkthrough and charts, and the
 * circuit as Qiskit code.
 */
export function TransformResultViews({ result, exportTitle }: { result: TransformResult; exportTitle: string }) {
  const details = result.details;
  // search, database, factoring and city routes come back as a quantum-vs-classical comparison
  const comparison = details && ['search', 'database', 'factoring', 'optimization'].includes(String(details.algorithm))
    ? details as unknown as ComparisonResult : null;
  return (
    <>
      <div className={`rounded-2xl border p-5 mb-5 ${result.verification?.match ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-amber-600/40 bg-amber-500/5'}`}>
        <div className="flex items-center gap-2 mb-2">
          {result.verification?.match
            ? <CheckCircle2 className="w-5 h-5 text-emerald-300" aria-hidden="true" />
            : <XCircle className="w-5 h-5 text-amber-300" aria-hidden="true" />}
          <p className="text-white font-bold text-sm">
            {result.verification?.match ? 'Verified: the quantum answer matches the classical answer' : 'Check the result'}
          </p>
          {result.total_ms != null && <span className="ml-auto text-xs text-gray-400">{(result.total_ms / 1000).toFixed(2)} s in all</span>}
        </div>
        <p className="text-xs text-gray-300 mb-3">{result.verification?.detail}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {result.stages.map((s, i) => (
            <div key={i} className="bg-quantum-900/60 border border-quantum-700 rounded-xl p-3">
              <p className="text-xs font-bold text-quantum-neon mb-1 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" aria-hidden="true" /> {s.title}
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {comparison && (
        <>
          <SideBySide result={comparison} />
          <RunWalkthrough result={comparison} />
          {(comparison.algorithm === 'search' || comparison.algorithm === 'database') && <GroverViews result={comparison} />}
          {comparison.algorithm === 'factoring' && <ShorViews result={comparison} />}
          {comparison.algorithm === 'optimization' && <TspViews result={comparison} />}
        </>
      )}
      {details && !comparison && result.problem_type !== 'boolean' && (
        <QaoaProblemView kind={result.problem_type} details={details as unknown as QaoaProblemDetails} />
      )}
      {details && result.problem_type === 'boolean' && <LogicView details={details as unknown as LogicDetails} />}

      {result.qiskit && (
        <CodeBlock code={result.qiskit} title={exportTitle}
          subtitle="the exact circuit that ran here, ready for Qiskit Aer or IBM Quantum" />
      )}
    </>
  );
}
