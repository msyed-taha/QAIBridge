import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, User as UserIcon, Send, Loader2, CheckCircle, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { contactApi } from '../api/contact';
import { getApiErrorMessage } from '../api/client';

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;

const inputCls =
  'w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 ' +
  'focus:outline-none focus:border-quantum-neon/50 transition-colors';

export function ContactPage() {
  const { user } = useAuth();

  const [name,    setName]    = useState(user?.username ?? '');
  const [email,   setEmail]   = useState(user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');   // honeypot
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState<string | null>(null);

  const tooShort = message.trim().length < MIN_MESSAGE;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      setDone(await contactApi.send({ name, email, subject, message, website }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Your message could not be sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative overflow-hidden min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg">
        <div className="glass-card rounded-2xl p-8">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-white mb-2">Message sent</h1>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">{done}</p>
              <Link to="/" className="text-quantum-neon text-sm font-medium hover:text-teal-300 transition-colors">
                ← Back to home
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-teal-500 to-cyan-400">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1">Contact us</h1>
                <p className="text-gray-500 text-sm">Questions, feedback or partnerships — we read every message.</p>
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5">{error}</div>
              )}

              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1.5">Your name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input value={name} onChange={e => setName(e.target.value)} required maxLength={100}
                        placeholder="Ayesha Khan" className={`${inputCls} pl-10`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1.5">Your email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                        placeholder="you@example.com" className={`${inputCls} pl-10`} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">
                    Subject <span className="text-gray-600">(optional)</span>
                  </label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={150}
                    placeholder="What is this about?" className={inputCls} />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">Message</label>
                  <textarea value={message} onChange={e => setMessage(e.target.value)} required
                    minLength={MIN_MESSAGE} maxLength={MAX_MESSAGE} rows={6}
                    placeholder="How can we help?" className={`${inputCls} resize-y`} />
                  <p className="text-right text-[11px] text-gray-600 mt-1">{message.length} / {MAX_MESSAGE}</p>
                </div>

                {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
                <input type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)}
                  tabIndex={-1} autoComplete="off" aria-hidden="true"
                  className="absolute -left-[9999px] w-px h-px opacity-0" />

                <button
                  type="submit"
                  disabled={sending || tooShort}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
                >
                  {sending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send message</>}
                </button>
                {tooShort && message.length > 0 && (
                  <p className="text-center text-xs text-gray-600">Please write at least {MIN_MESSAGE} characters.</p>
                )}
                <p className="text-center text-xs text-gray-600">
                  We use your details only to reply to you. See our{' '}
                  <Link to="/privacy" className="text-gray-400 underline underline-offset-2 hover:text-quantum-neon">Privacy Policy</Link>.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
