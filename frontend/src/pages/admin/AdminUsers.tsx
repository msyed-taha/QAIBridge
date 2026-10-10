import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Trash2, ShieldCheck, User as UserIcon, Check, X, UserPlus, Crown } from 'lucide-react';
import { adminApi } from '../../api/admin';
import type { UserFilters } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import { LEGAL } from '../../legal';
import { useAuth } from '../../context/AuthContext';
import type { AdminUser, Role } from '../../types';
import { AdminLayout } from './AdminLayout';
import { CreateAccountForm } from './CreateAccountForm';

type Filter = 'all' | 'admins' | 'inactive';
const FILTERS: { id: Filter; label: string; params: UserFilters; matches: (u: AdminUser) => boolean }[] = [
  { id: 'all',      label: 'All',      params: {},                matches: () => true },
  { id: 'admins',   label: 'Admins',   params: { role: 'admin' }, matches: u => u.role === 'admin' },
  { id: 'inactive', label: 'Inactive', params: { active: false }, matches: u => !u.is_active },
];

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyId, setBusyId]   = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const current = FILTERS.find(f => f.id === filter)!;

  // Load the list for the search box and filter: at once when opened or
  // filtered, after a short pause while typing. Only the newest request's
  // answer is shown, so a slow older search can't replace a newer one.
  const latest = useRef(0);
  const lastSearch = useRef(search);
  useEffect(() => {
    const request = ++latest.current;
    const typing = search !== lastSearch.current;
    lastSearch.current = search;
    const term = search.trim();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await adminApi.listUsers({ ...current.params, ...(term ? { search: term } : {}) });
        if (request === latest.current) setUsers(list);
      } catch (e) {
        if (request === latest.current) setError(getApiErrorMessage(e, 'Could not load users'));
      } finally {
        if (request === latest.current) setLoading(false);
      }
    }, typing ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, current]);

  // A changed account leaves the list if it no longer fits the filter.
  const replace = (updated: AdminUser) =>
    setUsers(us => us.flatMap(u => (u.id !== updated.id ? [u] : current.matches(updated) ? [updated] : [])));

  const patch = async (u: AdminUser, body: { is_active?: boolean; role?: Role }) => {
    setBusyId(u.id);
    setError(null);
    try {
      replace(await adminApi.updateUser(u.id, body));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Update failed'));
    } finally {
      setBusyId(null);
    }
  };

  // Giving or taking admin rights and switching an account off are asked about first.
  const toggleRole = (u: AdminUser) => {
    const making = u.role !== 'admin';
    const question = making
      ? `Make ${u.username} an admin? They will be able to manage every account and read all messages.`
      : `Remove admin rights from ${u.username}?`;
    if (window.confirm(question)) patch(u, { role: making ? 'admin' : 'user' });
  };
  const toggleActive = (u: AdminUser) => {
    if (u.is_active && !window.confirm(`Switch off ${u.username}'s account? They are signed out and can't sign in until it is switched back on.`)) return;
    patch(u, { is_active: !u.is_active });
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`Delete ${u.username} (${u.email})? Their lesson progress and saved runs are deleted too. This cannot be undone.`)) return;
    setBusyId(u.id);
    setError(null);
    try {
      await adminApi.deleteUser(u.id);
      setUsers(us => us.filter(x => x.id !== u.id));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Delete failed'));
    } finally {
      setBusyId(null);
    }
  };

  // One account's parts, laid out as a table row on wider screens and a card on phones.
  const parts = (u: AdminUser) => {
    const self = u.id === me?.id;
    const busy = busyId === u.id;
    const locked = self || u.is_owner;
    const ownerNote = "The owner account can't be changed";
    // A self-deleted account is frozen until the user signs up again.
    const deletedNote = u.deleted_at
      ? `Deleted by the user on ${new Date(u.deleted_at).toLocaleDateString()}. Only they can restore it, by signing up again ` +
        `before ${new Date(new Date(u.deleted_at).getTime() + LEGAL.deletedAccountDays * 86_400_000).toLocaleDateString()}; ` +
        'after that it is erased permanently.'
      : null;
    const roleAction   = u.role === 'admin' ? 'Remove admin rights' : 'Make admin';
    const statusAction = u.is_active ? 'Switch off account' : 'Switch on account';
    const status       = u.is_active ? 'active' : u.deleted_at ? 'deleted' : 'inactive';
    return {
      who: (
        <>
          <p className="text-white font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-words">{u.username}{self && <span className="text-gray-400 font-normal"> (you)</span>}</span>
            {u.is_owner && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <Crown className="w-3 h-3" aria-hidden="true" />owner
              </span>
            )}
          </p>
          <p className="text-gray-400 text-xs break-words">{u.email}</p>
        </>
      ),
      role: (
        <button
          disabled={locked || !!deletedNote || busy}
          onClick={() => toggleRole(u)}
          aria-label={`Role: ${u.role}. ${roleAction}`}
          title={u.is_owner ? ownerNote : self ? "You can't change your own role" : deletedNote ?? roleAction}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            u.role === 'admin'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
              : 'bg-quantum-700 text-gray-300 border-quantum-600 hover:bg-quantum-600'
          }`}
        >
          {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
          {u.role}
        </button>
      ),
      status: (
        <button
          disabled={locked || !!deletedNote || busy}
          onClick={() => toggleActive(u)}
          aria-label={`Status: ${status}. ${statusAction}`}
          title={u.is_owner ? ownerNote : self ? "You can't switch off your own account" : deletedNote ?? statusAction}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            u.is_active
              ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
              : u.deleted_at
              ? 'bg-quantum-700 text-gray-400 border-quantum-600'
              : 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25'
          }`}
        >
          {u.is_active ? <Check className="w-3 h-3" /> : u.deleted_at ? <Trash2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
          {status}
        </button>
      ),
      joined: u.created_at ? new Date(u.created_at).toLocaleDateString() : '—',
      lastSignIn: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'never',
      remove: (
        <button
          disabled={locked || busy}
          onClick={() => remove(u)}
          aria-label={`Delete ${u.username}`}
          title={u.is_owner ? ownerNote : self ? "You can't delete yourself" : 'Delete account'}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      ),
    };
  };
  const empty = !loading && !error && users.length === 0
    ? (search.trim() || filter !== 'all' ? 'No accounts match.' : 'No accounts yet.')
    : null;

  return (
    <AdminLayout title="Users" subtitle="Every registered account. You can't change your own role or status, or the owner's.">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[16rem] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search users by username or email"
            placeholder="Search username or email…"
            className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-quantum-neon/50"
          />
        </div>
        <button
          onClick={() => setShowCreate(s => !s)}
          aria-expanded={showCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
        >
          {showCreate ? <><X className="w-4 h-4" /> Cancel</> : <><UserPlus className="w-4 h-4" /> New account</>}
        </button>
      </div>

      {showCreate && (
        <CreateAccountForm
          onClose={() => setShowCreate(false)}
          onCreated={u => {
            if (current.matches(u)) setUsers(us => [u, ...us]);
            setShowCreate(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-1 mb-5">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.id ? 'bg-quantum-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-gray-400 inline-flex items-center gap-1.5" role="status">
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
            : `${users.length} ${users.length === 1 ? 'account' : 'accounts'}`}
        </span>
      </div>

      {error && (
        <div role="alert" className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        {/* Phones: a card per account */}
        <ul className="sm:hidden divide-y divide-quantum-700/60">
          {empty && <li className="px-4 py-8 text-center text-gray-400 text-sm">{empty}</li>}
          {users.map(u => {
            const p = parts(u);
            return (
              <li key={u.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">{p.who}</div>
                  {p.remove}
                </div>
                <div className="flex flex-wrap items-center gap-2">{p.role}{p.status}</div>
                <p className="text-gray-400 text-xs">Joined {p.joined} · Last sign-in {p.lastSignIn}</p>
              </li>
            );
          })}
        </ul>

        {/* Wider screens: a table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm min-w-[44rem]">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wide border-b border-quantum-700">
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Joined</th>
                <th className="text-left font-medium px-4 py-3">Last sign-in</th>
                <th className="text-right font-medium px-4 py-3">Delete</th>
              </tr>
            </thead>
            <tbody>
              {empty && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{empty}</td></tr>}
              {users.map(u => {
                const p = parts(u);
                return (
                  <tr key={u.id} className="border-b border-quantum-700/50 last:border-0">
                    <td className="px-4 py-3">{p.who}</td>
                    <td className="px-4 py-3">{p.role}</td>
                    <td className="px-4 py-3">{p.status}</td>
                    <td className="px-4 py-3 text-gray-400">{p.joined}</td>
                    <td className="px-4 py-3 text-gray-400">{p.lastSignIn}</td>
                    <td className="px-4 py-3 text-right">{p.remove}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
