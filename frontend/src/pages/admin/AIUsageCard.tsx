import { useEffect, useId, useState, type FormEvent } from 'react';
import { Bot, Check, Loader2 } from 'lucide-react';
import { AI_FEATURE_NAMES, aiApi, type AIReport, type AIUsageTotals } from '../../api/ai';
import { getApiErrorMessage } from '../../api/client';

/** Dollars small enough for single AI requests: $0.0021, under $0.0001, $1.20. */
function usd(x: number): string {
  if (x === 0) return '$0.00';
  if (x < 0.0001) return 'under $0.0001';
  return x < 1 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`;
}

function Totals({ title, t }: { title: string; t: AIUsageTotals }) {
  return (
    <div className="bg-quantum-900/60 border border-quantum-700 rounded-xl p-4">
      <p className="text-gray-400 text-xs mb-1">{title}</p>
      <p className="text-2xl font-extrabold text-white font-mono">{usd(t.cost_usd)}</p>
      <p className="text-gray-300 text-xs mt-1">
        {t.answered} answered · {t.saved} from saved copies (free)
        {t.failed > 0 && <> · {t.failed} failed</>}
        {t.refused > 0 && <> · {t.refused} turned away</>}
      </p>
      <p className="text-gray-400 text-xs">{t.tokens.toLocaleString()} tokens</p>
    </div>
  );
}

/** AI usage today and this month, an on/off switch and the daily limits. */
export function AIUsageCard() {
  const [report, setReport] = useState<AIReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userLimit, setUserLimit] = useState('');
  const [appLimit, setAppLimit] = useState('');
  const [savedLimits, setSavedLimits] = useState(false);
  const ids = { title: useId(), user: useId(), app: useId() };

  const show = (r: AIReport) => {
    setReport(r);
    setUserLimit(String(r.user_daily_limit));
    setAppLimit(String(r.app_daily_limit));
  };

  useEffect(() => {
    aiApi.report().then(show).catch(e => setError(getApiErrorMessage(e, "Couldn't load AI usage.")));
  }, []);

  const change = async (changes: Parameters<typeof aiApi.update>[0]) => {
    setBusy(true); setError(null);
    try {
      show(await aiApi.update(changes));
      return true;
    } catch (e) {
      setError(getApiErrorMessage(e, "Couldn't save. Please try again."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const u = Number(userLimit), a = Number(appLimit);
  const limitsOk = userLimit !== '' && appLimit !== '' && Number.isInteger(u) && Number.isInteger(a)
    && u >= 0 && u <= 1000 && a >= 0 && a <= 100_000;

  const saveLimits = async (e: FormEvent) => {
    e.preventDefault();
    if (!limitsOk) return;
    setSavedLimits(false);
    if (await change({ user_daily_limit: u, app_daily_limit: a })) setSavedLimits(true);
  };

  return (
    <section aria-labelledby={ids.title} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-8">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Bot className="w-4 h-4 text-purple-300" aria-hidden="true" />
        <h2 id={ids.title} className="text-white font-bold text-sm">AI usage</h2>
        {report && (
          <button type="button" role="switch" aria-checked={report.enabled} disabled={busy || !report.configured}
            onClick={() => change({ enabled: !report.enabled })}
            className="ml-auto inline-flex items-center gap-2 text-sm text-gray-200 disabled:opacity-50">
            <span className={`relative w-10 h-6 rounded-full transition-colors ${report.enabled ? 'bg-emerald-500' : 'bg-quantum-600'}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${report.enabled ? 'left-5' : 'left-1'}`} />
            </span>
            AI {report.enabled ? 'on' : 'off'}
          </button>
        )}
      </div>

      {!report && !error && <p className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Loading…</p>}
      {error && <p role="alert" className="text-sm text-red-300 mb-3">{error}</p>}

      {report && (
        <>
          <p className="text-gray-300 text-xs mb-4">
            {report.configured
              ? <>Model <span className="font-mono">{report.model}</span>. {report.enabled ? 'The tools use the AI, and fall back to their built-in versions when it can\'t answer.' : 'Switched off: every tool uses its built-in version.'}</>
              : <>No key yet: add <span className="font-mono">LLM_API_KEY</span> to backend/.env and restart the backend. Until then every tool uses its built-in version.</>}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Totals title="Today (since midnight UTC)" t={report.today} />
            <Totals title="This month" t={report.month} />
          </div>
          {!report.prices_known && (
            <p className="text-amber-200 text-xs mb-4">Costs aren't known for this model, so they show as $0.00. Check your Anthropic console.</p>
          )}

          {report.features.length > 0 && (
            <div className="mb-4">
              <h3 className="text-gray-300 text-xs font-semibold mb-2">By tool, this month</h3>
              <ul className="divide-y divide-quantum-700/60">
                {report.features.map(f => (
                  <li key={f.feature} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-white">{AI_FEATURE_NAMES[f.feature] ?? f.feature}</span>
                    <span className="text-gray-300 text-xs font-mono">{f.requests} request{f.requests !== 1 ? 's' : ''} · {usd(f.cost_usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={saveLimits} noValidate className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={ids.user} className="block text-xs text-gray-300 mb-1">Requests per user per day</label>
              <input id={ids.user} type="number" inputMode="numeric" min={0} max={1000} value={userLimit}
                onChange={e => { setUserLimit(e.target.value); setSavedLimits(false); }}
                className="w-32 bg-quantum-900 border border-quantum-600 rounded-lg px-3 py-2 text-sm text-gray-100" />
            </div>
            <div>
              <label htmlFor={ids.app} className="block text-xs text-gray-300 mb-1">Requests per day, whole app</label>
              <input id={ids.app} type="number" inputMode="numeric" min={0} max={100000} value={appLimit}
                onChange={e => { setAppLimit(e.target.value); setSavedLimits(false); }}
                className="w-32 bg-quantum-900 border border-quantum-600 rounded-lg px-3 py-2 text-sm text-gray-100" />
            </div>
            <button type="submit" disabled={busy || !limitsOk}
              className="px-4 py-2 rounded-lg bg-quantum-neon text-black text-sm font-semibold hover:bg-teal-300 disabled:opacity-50">
              Save limits
            </button>
            {savedLimits && <span role="status" className="inline-flex items-center gap-1 text-xs text-gray-300 pb-2.5"><Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />Saved</span>}
            {!limitsOk && <p className="basis-full text-xs text-amber-200">Use whole numbers: up to 1,000 per user and 100,000 for the app.</p>}
          </form>
          <p className="text-gray-400 text-xs mt-3">Answers from saved copies are free and don't count towards the limits. Your monthly limit in the Anthropic console is the final safety net.</p>
        </>
      )}
    </section>
  );
}
