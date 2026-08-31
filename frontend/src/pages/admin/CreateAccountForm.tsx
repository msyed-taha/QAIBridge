import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import type { AdminUser, Role } from '../../types';

interface Props {
  onCreated: (user: AdminUser) => void;
  onClose: () => void;
}

const PW_RULES = [
  { test: (p: string) => p.length >= 8, label: '8+ characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'uppercase' },
  { test: (p: string) => /[a-z]/.test(p), label: 'lowercase' },
  { test: (p: string) => /\d/.test(p), label: 'a digit' },
];

/** Admin-only: create an account directly (no email OTP). Used to add more admins. */
export function CreateAccountForm({ onCreated, onClose }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole]         = useState<Role>('user');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const pwOk = PW_RULES.every(r => r.test(password));
  const canSubmit = username.trim().length >= 3 && email.includes('@') && pwOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await adminApi.createUser({ username: username.trim(), email: email.trim(), password, role, is_active: isActive });
      onCreated(created);
      setUsername(''); setEmail(''); setPassword(''); setRole('user'); setIsActive(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-quantum-neon" /> New account
        </h3>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-2.5 text-red-400 text-xs mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            minLength={3}
            className="w-full bg-quantum-900 border border-quantum-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="name@example.com"
            className="w-full bg-quantum-900 border border-quantum-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-quantum-900 border border-quantum-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
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
        <div>
          <label className="block text-xs text-gray-400 font-medium mb-1.5">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as Role)}
            className="w-full bg-quantum-900 border border-quantum-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer pb-2">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="accent-quantum-neon" />
            Active
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="mt-4 w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: role === 'admin' ? 'linear-gradient(90deg,#f59e0b,#f97316)' : 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><UserPlus className="w-4 h-4" /> Create {role === 'admin' ? 'admin' : 'user'}</>}
      </button>
    </form>
  );
}
