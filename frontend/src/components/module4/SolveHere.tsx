import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Cpu, Database, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { advisorApi, type AdvisorMode, type ClassicalOnly, type ReadData, type SolvePlan, type Solved } from '../../api/advisor';
import type { AIStatus } from '../../api/ai';
import type { SolveResult } from '../../api/solve';
import type { ProblemSpec, TransformResult } from '../../api/transformer';
import { getApiErrorMessage } from '../../api/client';
import { WrittenByAI } from '../ai/AIStatus';
import { usePageDetails } from '../ai/pageDetails';
import { TransformResultViews } from '../module5/TransformResultViews';

// "Solve it here" (the Advisor's FE-3): the data in the user's problem, read, shown for checking and editing,
// then solved two ways with the SFOD suite on QAIbridge's simulator.

const field = 'w-full bg-quantum-900 border border-quantum-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-quantum-neon/60';
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';
const lines = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);
const MAX_QUANTUM_CITIES = 5;

/** The editable form of the data: simple fields for the four SFOD problems, the parameters as JSON for the rest. */
interface Fields { list: string; one: string; json: string }

function fieldsOf(spec: ProblemSpec): Fields {
  const p = spec.parameters as Record<string, unknown>;
  const asLines = (v: unknown) => (Array.isArray(v) ? v.map(String).join('\n') : '');
  switch (spec.problem_type) {
    case 'search': return { list: asLines(p.items), one: String(p.target ?? ''), json: '' };
    case 'database': return { list: asLines(p.records), one: String(p.query ?? ''), json: '' };
    case 'factoring': return { list: '', one: String(p.N ?? ''), json: '' };
    case 'tsp': if (Array.isArray(p.cities)) return { list: asLines(p.cities), one: '', json: '' };
  }
  return { list: '', one: '', json: JSON.stringify(p, null, 2) };
}

/** The spec to solve from the edited fields, or what is missing. */
function specOf(spec: ProblemSpec, f: Fields): { spec: ProblemSpec } | { problem: string } {
  const p = spec.parameters as Record<string, unknown>;
  switch (spec.problem_type) {
    case 'search':
      if (!lines(f.list).length) return { problem: 'Enter at least one item.' };
      if (!f.one.trim()) return { problem: 'Enter the item to find.' };
      return { spec: { ...spec, parameters: { items: lines(f.list), target: f.one.trim() } } };
    case 'database':
      if (!lines(f.list).length) return { problem: 'Enter at least one record.' };
      if (!f.one.trim()) return { problem: 'Enter what to look for: a keyword, or a comparison such as age > 40.' };
      return { spec: { ...spec, parameters: { records: lines(f.list), query: f.one.trim() } } };
    case 'factoring': {
      const n = Number(f.one);
      if (!Number.isInteger(n) || n < 2 || n > 1e12) return { problem: 'Enter a whole number from 2 to 10¹².' };
      return { spec: { ...spec, parameters: { N: n } } };
    }
    case 'tsp':
      if (Array.isArray(p.cities)) {
        if (lines(f.list).length < 3) return { problem: 'Enter at least 3 cities.' };
        return { spec: { ...spec, parameters: { cities: lines(f.list) } } };
      }
  }
  try {
    return { spec: { ...spec, parameters: JSON.parse(f.json) } };
  } catch {
    return { problem: 'The data is not valid JSON.' };
  }
}

const isClassicalOnly = (s: Solved): s is ClassicalOnly => 'classical_only' in s;

/** The classical method each kind of problem is checked with. */
const CLASSICAL_FOR: Record<string, string> = {
  search: 'linear search', database: 'a sequential scan', factoring: 'trial division', tsp: 'exhaustive search',
  knapsack: 'exhaustive search', maxcut: 'exhaustive search', partition: 'exhaustive search', portfolio: 'exhaustive search',
  boolean: 'a truth table',
};

function classicalAnswer(r: SolveResult): string {
  switch (r.problem_type) {
    case 'search': return r.result.found ? `Found "${r.result.value}" at position ${(r.result.index ?? 0) + 1}` : `"${r.result.target}" isn't in the list`;
    case 'factoring': return r.result.is_prime ? `${r.result.number.toLocaleString()} is prime` : `${r.result.number.toLocaleString()} = ${r.result.factored_form}`;
    case 'optimization': return `${r.result.tour.join(' → ')} (${Math.round(r.result.total_distance ?? 0).toLocaleString()} km)`;
    case 'database': return `${r.result.matches_found.toLocaleString()} ${r.result.query_meaning}`;
  }
}

export function SolveHere({ plan, problemText, dataLines, mode, tryHere, onAIStatus }: {
  plan: SolvePlan | null;
  problemText: string;
  dataLines: string[];
  mode: AdvisorMode;
  tryHere: { label: string; path: string } | null;
  onAIStatus: (s: AIStatus) => void;
}) {
  const id = useId();
  const ids = { list: useId(), one: useId(), json: useId() };
  const [read, setRead] = useState<ReadData | null>(null);
  const [fields, setFields] = useState<Fields>({ list: '', one: '', json: '' });
  const [busy, setBusy] = useState<'reading' | 'solving' | null>(null);
  const [solved, setSolved] = useState<Solved | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);       // the user changed the data after it was read
  const change = (f: Fields) => { setFields(f); setEdited(true); };
  const [error, setError] = useState<string | null>(null);

  const kind = read?.spec.problem_type;
  usePageDetails('advisor-solve', read ? [
    `Solving their problem here: ${read.source === 'example' ? 'with example data (their problem gave none)' : 'with the data from their problem'}, `
      + `as a ${kind} problem with ${read.spec.quantum_algorithm}.`,
    solved ? (isClassicalOnly(solved) ? `Only the classical side could run: ${solved.reason} Classical answer: ${classicalAnswer(solved.classical)}.`
      : `Result: ${solved.verification?.detail ?? ''} ${solved.stages.map(s => `${s.title}: ${s.detail}`).join(' ')}`) : '',
  ].filter(Boolean).join('\n') : null);

  const solve = async (spec: ProblemSpec) => {
    setBusy('solving');
    setError(null);
    setSolved(null);
    try {
      setSolved(await advisorApi.solve(spec));
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't solve it. Check the data and try again."));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!plan) return;
    setBusy('reading');
    setError(null);
    setSolved(null);
    setProblem(null);
    try {
      const got = await advisorApi.readData(problemText, dataLines, plan.kind, mode);
      onAIStatus(got.ai_status);
      setRead(got);
      setEdited(false);
      const f = fieldsOf(got.spec);
      setFields(f);
      const ready = specOf(got.spec, f);
      if ('problem' in ready) {
        setProblem(ready.problem);
        setBusy(null);
      } else {
        await solve(ready.spec);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't read the data in your problem. Try again."));
      setBusy(null);
    }
  };

  const solveEdited = () => {
    if (!read) return;
    const ready = specOf(read.spec, fields);
    if ('problem' in ready) {
      setProblem(ready.problem);
      return;
    }
    setProblem(null);
    solve(ready.spec);
  };

  if (!plan) {
    return (
      <section aria-labelledby={id} className="rounded-2xl p-5 border border-quantum-600 bg-quantum-800">
        <h2 id={id} className="text-white font-bold text-base mb-1">Solve it here</h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          QAIbridge solves search, factoring, route and other optimisation problems, and database queries, with your own data. This
          problem is a different kind, so there is no data to solve here.
          {tryHere && <> You can still <Link to={tryHere.path} className="text-quantum-neon underline underline-offset-2">explore small circuits</Link> for it.</>}
        </p>
      </section>
    );
  }

  const classical = (kind && CLASSICAL_FOR[kind]) ?? plan.classical;
  const named = read?.spec.quantum_algorithm ?? plan.quantum;
  const quantum = /^(Amplitude|Reversible)/.test(named) ? named[0].toLowerCase() + named.slice(1) : named;
  const usesFields = kind === 'search' || kind === 'database' || kind === 'factoring' || (kind === 'tsp' && !fields.json);
  const solvedFull = solved && !isClassicalOnly(solved) ? solved as TransformResult : null;

  return (
    <section aria-labelledby={id} className="rounded-2xl p-5 border border-quantum-neon/30 bg-quantum-neon/5 space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <PlayCircle className="w-6 h-6 text-quantum-neon flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <h2 id={id} className="text-white font-bold text-base">Solve it here, with your data</h2>
          <p className="text-gray-300 text-sm leading-relaxed mt-1">
            QAIbridge reads the data in your {dataLines.length ? 'file' : 'problem'} and solves it two ways on its own simulator: classically,
            with {classical}, and with {quantum}. You can check and change the data, and each answer is checked against the other.
          </p>
        </div>
        {!read && (
          <button type="button" onClick={start} disabled={busy !== null}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-60 ${focusRing}`}
            style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="w-4 h-4" aria-hidden="true" />}
            {busy === 'reading' ? 'Reading your data…' : busy === 'solving' ? 'Solving…' : 'Solve my problem'}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {error && <p role="alert" className="text-sm text-red-300 bg-red-950/30 border border-red-800 rounded-xl px-3 py-2">{error}</p>}
      </div>

      {read && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-quantum-neon" aria-hidden="true" />
            <h3 className="text-white font-semibold text-sm">The data</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${read.source === 'example' && !edited
              ? 'text-amber-200 bg-amber-500/10 border-amber-500/40' : 'text-teal-200 bg-teal-500/10 border-teal-500/40'}`}>
              {edited ? 'Edited by you' : read.source === 'example' ? 'Example data' : `From your ${dataLines.length ? 'file' : 'problem'}`}
            </span>
            {read.spec.engine === 'llm' ? <WrittenByAI checked="read from your words" /> : <span className="text-xs text-gray-400">read by the built-in reader</span>}
            <span className="text-xs text-gray-400">→ {read.spec.quantum_algorithm}</span>
          </div>
          {read.notes.length > 0 && !edited && (
            <ul className="space-y-1 mb-3">
              {read.notes.map(n => (
                <li key={n} className="flex items-start gap-2 text-sm text-amber-200"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />{n}</li>
              ))}
            </ul>
          )}

          {usesFields ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kind !== 'factoring' && (
                <div className={kind === 'tsp' ? 'md:col-span-2' : ''}>
                  <label htmlFor={ids.list} className="block text-xs text-gray-300 font-medium mb-1.5">
                    {kind === 'search' ? 'List to search, one item per line' : kind === 'database' ? 'Records, one per line'
                      : `Cities, one per line: a known city or "Name, latitude, longitude" (the quantum side takes up to ${MAX_QUANTUM_CITIES})`}
                  </label>
                  <textarea id={ids.list} value={fields.list} onChange={e => change({ ...fields, list: e.target.value })} rows={6} spellCheck={false}
                    className={`${field} font-mono resize-y`} />
                  <p className="text-xs text-gray-400 mt-1">{lines(fields.list).length.toLocaleString()} lines</p>
                </div>
              )}
              {kind !== 'tsp' && (
                <div>
                  <label htmlFor={ids.one} className="block text-xs text-gray-300 font-medium mb-1.5">
                    {kind === 'search' ? 'Item to find' : kind === 'database' ? 'Query: a keyword, field = text, or field > number' : 'Number to factor'}
                  </label>
                  <input id={ids.one} value={fields.one} onChange={e => change({ ...fields, one: e.target.value })}
                    inputMode={kind === 'factoring' ? 'numeric' : undefined} className={`${field} font-mono`} />
                  {kind === 'factoring' && <p className="text-xs text-gray-400 mt-1">Shor's circuit runs for odd numbers up to 127; the classical side takes any number up to 10<sup>12</sup>.</p>}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor={ids.json} className="block text-xs text-gray-300 font-medium mb-1.5">The data (JSON): change any number to try your own</label>
              <textarea id={ids.json} value={fields.json} onChange={e => change({ ...fields, json: e.target.value })} rows={8} spellCheck={false}
                className={`${field} font-mono text-xs resize-y`} />
            </div>
          )}
          {problem && <p className="text-sm text-amber-200 mt-2">{problem}</p>}
          <button type="button" onClick={solveEdited} disabled={busy !== null}
            className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-quantum-neon border border-quantum-neon/50 hover:bg-quantum-neon/10 disabled:opacity-50 ${focusRing}`}>
            {busy === 'solving' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
            {busy === 'solving' ? 'Solving it both ways…' : solved ? 'Solve again with this data' : 'Solve with this data'}
          </button>
        </div>
      )}

      {solved && isClassicalOnly(solved) && (
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-4">
          <p className="flex items-start gap-2 text-sm text-amber-200 mb-3"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            The quantum side can't run this on the simulator: {solved.reason}</p>
          <h3 className="flex items-center gap-2 text-sm font-bold text-red-300 mb-1">
            <Cpu className="w-4 h-4" aria-hidden="true" /> Classical answer · {solved.classical.algorithm}
          </h3>
          <p className="text-white font-semibold text-sm font-mono mb-1">{classicalAnswer(solved.classical)}</p>
          <p className="text-gray-300 text-xs leading-relaxed">
            {solved.classical.steps.toLocaleString()} {solved.classical.steps_label}, {solved.classical.elapsed_ms.toFixed(2)} ms. {solved.classical.explanation}
          </p>
        </div>
      )}
      {solvedFull && !solvedFull.supported && (
        <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">{solvedFull.reason}</p>
      )}
      {solvedFull && solvedFull.supported && <TransformResultViews result={solvedFull} exportTitle="The circuit as Qiskit code" />}

      {tryHere && (
        <p className="text-xs text-gray-300">
          Or <Link to={tryHere.path} className="inline-flex items-center gap-1 text-quantum-neon underline underline-offset-2">
            {tryHere.label.charAt(0).toLowerCase() + tryHere.label.slice(1)} <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link> with a ready-made example.
        </p>
      )}
    </section>
  );
}
