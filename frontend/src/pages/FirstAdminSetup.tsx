import { useState } from 'react';
import { Loader2, ShieldCheck, Rocket } from 'lucide-react';
import { detailToMessage, friendlyError } from '../api/client';

interface Props {
  /** Called with the login token + user after the first admin is created. */
  onCreated: (token: string, user: { id: number; username: string; email: string; role: 'user' | 'admin' }) => void;
}

const PW_RULES = [
  { test: (p: string) => p.length >= 8, label: '8+ characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'uppercase' },
  { test: (p: string) => /[a-z]/.test(p), label: 'lowercase' },
  { test: (p: string) => /\d/.test(p), label: 'a digit' },
];

/**
 * One-time first-administrator creation. Shown on the Admin login tab only
 * while the backend reports zero admins (GET /api/auth/admin-setup-status).
 */
export function FirstAdminSetup({ onCreated }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const pwOk = PW_RULES.every(r => r.test(password));
  const canSubmit = username.trim().length >= 3 && email.includes('@') && pwOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Could not create the admin account'));
      onCreated(data.access_token, data.user);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-amber-500 to-orange-400">
          <Rocket className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">Create the first administrator</h1>
        <p className="text-gray-500 text-sm">
          No admin account exists yet. Set one up to manage the platform.
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            minLength={3}
            className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-quantum-neon/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
          />
          {password && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
              {PW_RULES.map(r => (
                <span key={r.label} className={r.test(password) ? 'text-green-400' : 'text-gray-500'}>
                  {r.test(password) ? '✓' : '○'} {r.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          style={{ background: 'linear-gradient(90deg,#f59e0b,#f97316)' }}
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            : <><ShieldCheck className="w-4 h-4" /> Create admin &amp; sign in</>}
        </button>
      </form>
    </>
  );
}
