import { useId, useRef, useState } from 'react';
import { Loader2, ShieldCheck, Rocket } from 'lucide-react';
import { detailToMessage, friendlyError } from '../api/client';
import { RevealPasswordButton } from '../components/shared/RevealPasswordButton';
import { PasswordChecklist, passwordOk } from '../components/shared/PasswordRules';

interface Props {
  /** Called with the login token + user after the first admin is created. */
  onCreated: (token: string, user: { id: number; username: string; email: string; role: 'user' | 'admin' }) => void;
}

const FIELD = 'w-full bg-quantum-900 border rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-quantum-neon/50 transition-colors';

/**
 * One-time first-administrator creation. Shown on the Admin login tab only
 * while the backend reports zero admins (GET /api/auth/admin-setup-status).
 */
export function FirstAdminSetup({ onCreated }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // The button was pressed with something missing: say what, beside the field.
  const [tried, setTried]       = useState(false);

  const id = useId();
  const refs = { username: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const problems = {
    username: username.trim().length < 3 ? 'At least 3 characters.' : null,
    email:    !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'A valid email address.' : null,
    password: !passwordOk(password) ? 'A password that meets all 4 rules below.' : null,
  };
  const shown = (field: keyof typeof problems) => (tried ? problems[field] : null);
  const fieldProps = (field: keyof typeof problems) => ({
    id: `${id}-${field}`,
    ref: refs[field],
    'aria-invalid': !!shown(field),
    'aria-describedby': shown(field) ? `${id}-${field}-problem` : undefined,
  });
  const problemNote = (field: keyof typeof problems) =>
    shown(field) && <p id={`${id}-${field}-problem`} className="text-amber-300 text-xs mt-1.5">{shown(field)}</p>;
  const border = (field: keyof typeof problems) => (shown(field) ? 'border-amber-500/70' : 'border-quantum-700');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTried(true);
    const firstMissing = (Object.keys(problems) as (keyof typeof problems)[]).find(f => problems[f]);
    if (firstMissing) { refs[firstMissing].current?.focus(); return; }
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
        <p className="text-gray-400 text-sm">
          No admin account exists yet. Set one up to manage the platform.
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${id}-username`} className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
          <input
            {...fieldProps('username')}
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={50}
            autoComplete="username"
            className={`${FIELD} ${border('username')}`}
          />
          {problemNote('username')}
        </div>
        <div>
          <label htmlFor={`${id}-email`} className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
          <input
            {...fieldProps('email')}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={`${FIELD} ${border('email')}`}
          />
          {problemNote('email')}
        </div>
        <div>
          <label htmlFor={`${id}-password`} className="block text-xs text-gray-400 font-medium mb-1.5">Password</label>
          <div className="relative">
            <input
              {...fieldProps('password')}
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              className={`${FIELD} ${border('password')} pr-10`}
            />
            <RevealPasswordButton shown={showPwd} onToggle={() => setShowPwd(s => !s)} />
          </div>
          {problemNote('password')}
          {(password || tried) && <PasswordChecklist password={password} />}
        </div>

        <button
          type="submit"
          disabled={loading}
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
