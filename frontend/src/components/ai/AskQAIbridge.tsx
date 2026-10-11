import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Brain, Cpu, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { aiApi, type AIStatus, type AskAction } from '../../api/ai';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PageDetailsContext } from './pageDetails';

interface Message { role: 'user' | 'assistant'; text: string; actions?: AskAction[]; problem?: boolean }

// The chat stays in this browser tab only (gone when the tab closes); the server never keeps it.
const STORE = 'qai_ask_chat';
const MAX_DETAILS = 5500;
const HIDDEN_ON = /^\/(admin|login|register|forgot-password)(\/|$)/;

function loadChat(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? '[]');
    return Array.isArray(saved) ? saved.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
}

const pageTitle = () => document.title.replace(/\s*·\s*QAIbridge$/, '');

/** Holds what the current page shows, and puts Ask QAIbridge on every signed-in page. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [parts, setParts] = useState<Record<string, string>>({});
  const setPart = useCallback((key: string, text: string | null) => {
    setParts(p => {
      if (text === null) {
        if (!(key in p)) return p;
        const rest = { ...p };
        delete rest[key];
        return rest;
      }
      return p[key] === text ? p : { ...p, [key]: text };
    });
  }, []);
  return (
    <PageDetailsContext.Provider value={setPart}>
      {children}
      <AskQAIbridge details={Object.values(parts).join('\n\n')} />
    </PageDetailsContext.Provider>
  );
}

function suggestionsFor(path: string, hasDetails: boolean): string[] {
  const list = ['What can I do on this page?'];
  if (path.startsWith('/learn/')) list.push('Explain this lesson more simply');
  else if (hasDetails) list.push('Explain what I am looking at');
  list.push('Build me a circuit that makes a Bell pair');
  return list;
}

function AskQAIbridge({ details }: { details: string }) {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const ids = { panel: useId(), title: useId(), input: useId() };

  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
      else sessionStorage.removeItem(STORE);
    } catch { /* private mode */ }
  }, [messages]);

  // Signing out ends the chat, so the next person on this browser doesn't see it.
  useEffect(() => {
    if (loading || isAuthed) return;
    setMessages([]);
    setOpen(false);
  }, [loading, isAuthed]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    aiApi.status().then(setStatus).catch(() => undefined);
  }, [open]);

  // Once signed in: a server without AI shows no Ask button at all.
  useEffect(() => {
    if (isAuthed) aiApi.status().then(setStatus).catch(() => undefined);
  }, [isAuthed]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, busy, open]);

  const close = useCallback(() => { setOpen(false); buttonRef.current?.focus(); }, []);

  if (!isAuthed || status?.reason === 'no_key' || HIDDEN_ON.test(location.pathname)) return null;

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.filter(m => !m.problem).slice(-6).map(m => ({ role: m.role, text: m.text }));
    setMessages(m => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    try {
      const r = await aiApi.ask({ message: question, history, page: location.pathname, page_title: pageTitle(),
        details: details.slice(0, MAX_DETAILS) });
      setStatus(r.ai_status);
      setMessages(m => [...m, r.reply
        ? { role: 'assistant', text: r.reply, actions: r.actions }
        : { role: 'assistant', text: r.unavailable ?? "The AI couldn't answer just now.", problem: true }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: getApiErrorMessage(e, "Couldn't reach QAIbridge. Please try again."), problem: true }]);
    } finally {
      setBusy(false);
    }
  };

  const act = (a: AskAction) => {
    if (a.type === 'open') navigate(a.to);
    else if (a.type === 'ask_advisor') navigate('/module4', { state: { problem: a.problem } });
    else navigate('/simulator', { state: { qasm: a.qasm, from: 'assistant' } });
    if (window.innerWidth < 640) setOpen(false);      // on a phone the panel covers the page
  };

  const submit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const icon = (a: AskAction) => (a.type === 'run_circuit' ? Cpu : a.type === 'ask_advisor' ? Brain : ArrowRight);

  return (
    <>
      {open && (
        <section id={ids.panel} role="dialog" aria-labelledby={ids.title}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
          className="fixed z-40 right-4 bottom-20 w-[min(26rem,calc(100vw-2rem))] h-[min(36rem,calc(100dvh-7rem))] flex flex-col bg-quantum-900 border border-quantum-600 rounded-2xl shadow-2xl">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-quantum-700">
            <Sparkles className="w-4 h-4 text-purple-300" aria-hidden="true" />
            <h2 id={ids.title} className="text-white font-bold text-sm">Ask QAIbridge</h2>
            {status && (
              <span className="text-xs text-gray-400">
                {status.available ? `${status.remaining_today} of ${status.daily_limit} left today` : 'AI off'}
              </span>
            )}
            <span className="ml-auto flex items-center">
              {messages.length > 0 && (
                <button type="button" onClick={() => setMessages([])} aria-label="Start a new chat" title="Start a new chat"
                  className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-quantum-700">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={close} aria-label="Close" className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-quantum-700">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </span>
          </header>

          <div ref={logRef} role="log" aria-live="polite" className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-gray-300">
                <p className="mb-3">Ask about quantum computing, this page or your result. I can also open a tool or build a circuit for you.</p>
                <div className="flex flex-col items-start gap-2">
                  {suggestionsFor(location.pathname, !!details).map(s => (
                    <button key={s} type="button" onClick={() => send(s)}
                      className="text-left text-sm text-purple-100 bg-purple-500/10 border border-purple-500/30 rounded-xl px-3 py-1.5 hover:bg-purple-500/20">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] bg-quantum-700 text-white rounded-2xl rounded-br-md px-3 py-2 text-sm whitespace-pre-wrap break-words'
                  : `max-w-[95%] rounded-2xl rounded-bl-md px-3 py-2 text-sm whitespace-pre-wrap break-words border ${m.problem ? 'bg-amber-500/10 border-amber-500/30 text-amber-100' : 'bg-quantum-800 border-quantum-700 text-gray-100'}`}>
                  <span className="sr-only">{m.role === 'user' ? 'You: ' : 'QAIbridge: '}</span>
                  {m.text}
                </div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.actions.map((a, j) => {
                      const Icon = icon(a);
                      return (
                        <button key={j} type="button" onClick={() => act(a)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-quantum-neon border border-quantum-neon/40 rounded-lg px-2.5 py-1.5 hover:bg-quantum-neon/10">
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />{a.label}
                          {a.type === 'run_circuit' && <span className="font-normal text-gray-300">· {a.summary}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="inline-flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Thinking…
              </p>
            )}
          </div>

          <form onSubmit={submit} className="border-t border-quantum-700 p-3">
            <div className="flex items-end gap-2">
              <label htmlFor={ids.input} className="sr-only">Your question</label>
              <textarea id={ids.input} ref={inputRef} value={input} rows={2} maxLength={2000}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
                }}
                placeholder="Ask a question…"
                className="flex-1 resize-none bg-quantum-800 border border-quantum-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-400" />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
                className="p-2.5 rounded-xl bg-purple-400 text-black hover:bg-purple-300 disabled:opacity-40">
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Written by AI, so it can be wrong. Circuits it builds are checked by the Simulator.</p>
          </form>
        </section>
      )}

      <button ref={buttonRef} type="button" onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open} aria-controls={open ? ids.panel : undefined}
        className="fixed z-40 right-4 bottom-4 inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-black shadow-xl hover:brightness-110"
        style={{ background: 'linear-gradient(90deg,#cc44ff,#00ffcc)' }}>
        {open ? <X className="w-4 h-4" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
        {open ? 'Close' : 'Ask'}
      </button>
    </>
  );
}
