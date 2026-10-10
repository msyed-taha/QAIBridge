import { useId, useRef, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import { RevealPasswordButton } from '../../components/shared/RevealPasswordButton';
import { PasswordChecklist, passwordOk } from '../../components/shared/PasswordRules';
import type { AdminUser, Role } from '../../types';

interface Props {
  onCreated: (user: AdminUser) => void;
  onClose: () => void;
}

const FIELD = 'w-full bg-quantum-900 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-quantum-neon/50';

/** Admin-only: create an account directly (no email OTP). Used to add more admins. */
export function CreateAccountForm({ onCreated, onClose }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [role, setRole]         = useState<Role>('user');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // "Create" was pressed with something missing: say what, beside the field.
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
      const created = await adminApi.createUser({ username: username.trim(), email: email.trim(), password, role, is_active: isActive });
      onCreated(created);
      setUsername(''); setEmail(''); setPassword(''); setRole('user'); setIsActive(true); setTried(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-sm flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-quantum-neon" /> New account
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-2.5 text-red-400 text-sm mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-username`} className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
          <input
            {...fieldProps('username')}
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={50}
            autoComplete="off"
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
            autoComplete="off"
            placeholder="name@example.com"
            className={`${FIELD} ${border('email')}`}
          />
          {problemNote('email')}
        </div>
        <div className="sm:col-span-2">
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
        <div>
          <label htmlFor={`${id}-role`} className="block text-xs text-gray-400 font-medium mb-1.5">Role</label>
          <select
            id={`${id}-role`}
            value={role}
            onChange={e => setRole(e.target.value as Role)}
            className={`${FIELD} border-quantum-700`}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {role === 'admin' && (
            <p className="text-xs text-amber-300/90 mt-1.5 leading-snug">
              Only emails on the server's admin list (<span className="text-gray-300">ADMIN_EMAILS</span> in <span className="text-gray-300">backend/.env</span>) can be admins.
            </p>
          )}
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer pb-2">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-quantum-neon" />
            Active (can sign in)
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: role === 'admin' ? 'linear-gradient(90deg,#f59e0b,#f97316)' : 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><UserPlus className="w-4 h-4" /> Create {role === 'admin' ? 'admin' : 'user'}</>}
      </button>
    </form>
  );
}
