import { useEffect, useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { aiApi, type AIStatus } from '../../api/ai';
import { builderApi, type BuiltCircuit, type Chance } from '../../api/builder';
import { getApiErrorMessage } from '../../api/client';
import { AIStatusLine, WrittenByAI } from '../ai/AIStatus';

const IDEAS = [
  'A Bell pair',
  'Three qubits that are all 0 or all 1',
  'A qubit that is 1 a quarter of the time',
  "Grover's search for 11 on two qubits",
];

/** "|00⟩ 50%, |11⟩ 50%", and how many more. */
function chances(list: Chance[], max = 4): string {
  const shown = list.slice(0, max).map(c => `|${c.outcome}⟩ ${+(c.chance * 100).toFixed(1)}%`).join(', ');
  return list.length > max ? `${shown} and ${list.length - max} more` : shown;
}

/**
 * Describe a circuit in words: the AI writes it with the Builder's gates, the page places it (Undo brings the
 * old one back), and the simulator's real chances are compared with the ones the AI expected.
 * `onBuild` places the circuit and returns its OpenQASM (null if it couldn't), so the check shows only while
 * the canvas still holds the AI's circuit.
 */
export function DescribeCircuit({ qasm, hasGates, onBuild }: {
  qasm: string;
  hasGates: boolean;
  onBuild: (layout: BuiltCircuit['layout']) => string | null;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [built, setBuilt] = useState<{ result: BuiltCircuit; qasm: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);             // off topic, or why the AI couldn't
  const ids = { title: useId(), input: useId() };

  useEffect(() => { aiApi.status().then(setStatus).catch(() => undefined); }, []);

  if (status?.reason === 'no_key') return null;                       // no AI on this server: the gates are the way to build
  const off = !!status && !status.available;
  const shown = built && built.qasm === qasm ? built.result : null;

  const send = async (words: string) => {
    const description = words.trim();
    if (!description || busy) return;
    setText(description);
    setBusy(true);
    setNote(null);
    setBuilt(null);                                                     // one answer at a time
    try {
      const r = await builderApi.describe(description, hasGates ? qasm : '');
      setStatus(r.ai_status);
      if (r.off_topic === false) {
        const placed = onBuild(r.layout);
        if (placed === null) setNote("The AI's circuit couldn't be placed. Try saying it another way.");
        else setBuilt({ result: r, qasm: placed });
      } else setNote(r.off_topic ? r.message : r.unavailable);
    } catch (e) {
      setNote(getApiErrorMessage(e, "Couldn't reach QAIbridge. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={ids.title} className="bg-gradient-to-br from-purple-500/10 to-teal-500/5 border border-purple-500/30 rounded-2xl p-4 mb-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <h2 id={ids.title} className="flex items-center gap-2 text-white font-bold text-sm">
          <Sparkles className="w-4 h-4 text-purple-300" aria-hidden="true" /> Describe a circuit
        </h2>
        <span className="text-xs text-gray-300">Say it in words. The AI builds it, and the simulator checks it.</span>
        <span className="sm:ml-auto"><AIStatusLine status={status} reads="your description" fallback="Place the gates yourself below." /></span>
      </div>

      <form onSubmit={e => { e.preventDefault(); send(text); }} className="flex flex-col sm:flex-row gap-2">
        <label htmlFor={ids.input} className="sr-only">Describe the circuit you want</label>
        <input id={ids.input} value={text} onChange={e => setText(e.target.value)} maxLength={500} disabled={off}
          placeholder={hasGates ? 'A new circuit, or a change to yours: "add a Hadamard on q1"' : 'For example: "three qubits that are all 0 or all 1"'}
          className="flex-1 min-w-0 bg-quantum-900 border border-quantum-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 disabled:opacity-50" />
        <button type="submit" disabled={busy || off || !text.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black bg-purple-400 hover:bg-purple-300 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Wand2 className="w-4 h-4" aria-hidden="true" />}
          {busy ? 'Building…' : 'Build it'}
        </button>
      </form>

      {busy && (
        <p role="status" className="text-xs text-gray-300 mt-2">The AI is working out the circuit and its chances. This can take up to half a minute.</p>
      )}

      {!busy && !off && !shown && !note && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-gray-400">Try:</span>
          {IDEAS.map(idea => (
            <button key={idea} type="button" onClick={() => send(idea)}
              className="text-xs text-purple-100 bg-purple-500/10 border border-purple-500/30 rounded-full px-3 py-1 hover:bg-purple-500/20">
              {idea}
            </button>
          ))}
        </div>
      )}

      {note && !busy && (
        <p role="status" className="mt-3 text-sm text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">{note}</p>
      )}

      {shown && !busy && (
        <div className="mt-3 space-y-2">
          {shown.check.matches === true ? (
            <p role="status" className="flex items-start gap-2 text-sm text-emerald-100 bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-300" aria-hidden="true" />
              <span><strong>The simulator agrees.</strong> It gives {chances(shown.check.got)}, as the AI expected.</span>
            </p>
          ) : shown.check.matches === false ? (
            <p role="status" className="flex items-start gap-2 text-sm text-amber-100 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-300" aria-hidden="true" />
              <span>
                <strong>The simulator gives something different.</strong> The AI expected {chances(shown.check.expected)},
                but this circuit gives {chances(shown.check.got)}. The simulator is right, so check the circuit before you use
                it, or ask again in other words. Undo removes it.
              </span>
            </p>
          ) : (
            <p role="status" className="flex items-start gap-2 text-sm text-gray-200 bg-quantum-800 border border-quantum-600 rounded-xl px-3 py-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-300" aria-hidden="true" />
              <span>The simulator gives {chances(shown.check.got)}. The AI didn't say what to expect, so there was nothing to compare.</span>
            </p>
          )}
          {shown.explanation && (
            <div className="space-y-1.5">
              <WrittenByAI />
              <p className="text-sm text-gray-200 leading-relaxed">{shown.explanation}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
