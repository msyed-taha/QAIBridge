import { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, Trash2, ShieldCheck, User as UserIcon, Check, X, UserPlus, Crown } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { AdminUser, Role } from '../../types';
import { AdminLayout } from './AdminLayout';
import { CreateAccountForm } from './CreateAccountForm';

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyId, setBusyId]   = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await adminApi.listUsers(term ? { search: term } : {}));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load users'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const patch = async (id: number, body: { is_active?: boolean; role?: Role }) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await adminApi.updateUser(id, body);
      setUsers(us => us.map(u => (u.id === id ? updated : u)));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Update failed'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`Delete ${u.username} (${u.email})? This cannot be undone.`)) return;
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

  return (
    <AdminLayout title="Users" subtitle="Every registered account. You can't change your own role or status, or the owner's.">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[16rem] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search username or email…"
            className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50"
          />
        </div>
        <button
          onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-black transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
        >
          <UserPlus className="w-4 h-4" />
          {showCreate ? 'Cancel' : 'New account'}
        </button>
      </div>

      {showCreate && (
        <CreateAccountForm
          onClose={() => setShowCreate(false)}
          onCreated={u => {
            setUsers(us => [u, ...us]);
            setShowCreate(false);
          }}
        />
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
      )}

      <div className="bg-quantum-800 border border-quantum-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[44rem]">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-quantum-700">
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Joined</th>
                <th className="text-left font-medium px-4 py-3">Last login</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…
                </td></tr>
              )}

              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600">No users match.</td></tr>
              )}

              {!loading && users.map(u => {
                const self = u.id === me?.id;
                const busy = busyId === u.id;
                const locked = self || u.is_owner;
                const ownerNote = "The owner account can't be changed";
                // A self-deleted account is frozen until the user signs up again.
                const deletedNote = u.deleted_at
                  ? `Deleted by the user on ${new Date(u.deleted_at).toLocaleDateString()}. Only they can restore it, by signing up again.`
                  : null;
                return (
                  <tr key={u.id} className="border-b border-quantum-700/50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium flex items-center gap-2">
                        <span>{u.username}{self && <span className="text-gray-600 font-normal"> (you)</span>}</span>
                        {u.is_owner && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Crown className="w-3 h-3" />owner
                          </span>
                        )}
                      </p>
                      <p className="text-gray-600 text-xs">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={locked || !!deletedNote || busy}
                        onClick={() => patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })}
                        title={u.is_owner ? ownerNote : self ? "You can't change your own role" : deletedNote ?? 'Toggle admin role'}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          u.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                            : 'bg-quantum-700 text-gray-300 border-quantum-600 hover:bg-quantum-600'
                        }`}
                      >
                        {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                        {u.role}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={locked || !!deletedNote || busy}
                        onClick={() => patch(u.id, { is_active: !u.is_active })}
                        title={u.is_owner ? ownerNote : self ? "You can't deactivate yourself" : deletedNote ?? 'Toggle active status'}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          u.is_active
                            ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
                            : u.deleted_at
                            ? 'bg-quantum-700 text-gray-400 border-quantum-600'
                            : 'bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25'
                        }`}
                      >
                        {u.is_active ? <Check className="w-3 h-3" /> : u.deleted_at ? <Trash2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {u.is_active ? 'active' : u.deleted_at ? 'deleted' : 'inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'never'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={locked || busy}
                        onClick={() => remove(u)}
                        title={u.is_owner ? ownerNote : self ? "You can't delete yourself" : 'Delete user'}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </td>
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
