import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, UserX, ShieldCheck, UserPlus, Activity, Loader2, ArrowRight, Inbox } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { getApiErrorMessage } from '../../api/client';
import type { AdminStats } from '../../types';
import { AdminLayout } from './AdminLayout';

function StatCard({ icon: Icon, label, value, tint }: { icon: typeof Users; label: string; value: number; tint: string }) {
  return (
    <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-500 text-xs">{label}</span>
        <Icon className="w-4 h-4" style={{ color: tint }} />
      </div>
      <p className="text-2xl font-extrabold text-white font-mono">{value}</p>
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats]     = useState<AdminStats | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stats()
      .then(setStats)
      .catch(e => setError(getApiErrorMessage(e, 'Could not load stats')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Dashboard" subtitle="Platform health at a glance">
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard icon={Users}       label="Total users"        value={stats.total_users}    tint="#7777ee" />
            <StatCard icon={UserCheck}   label="Active"             value={stats.active_users}   tint="#00ffcc" />
            <StatCard icon={UserX}       label="Inactive"          value={stats.inactive_users} tint="#ff6b6b" />
            <StatCard icon={ShieldCheck} label="Admins"            value={stats.admins}         tint="#f59e0b" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard icon={UserPlus}    label="New (last 7 days)"      value={stats.new_last_7_days}       tint="#cc44ff" />
            <StatCard icon={Activity}    label="Signed in (last 7 days)" value={stats.logged_in_last_7_days} tint="#00ccaa" />
            <Link to="/admin/messages" className="block hover:brightness-110 transition-all">
              <StatCard icon={Inbox}     label="Unread messages"         value={stats.unread_messages}       tint="#38bdf8" />
            </Link>
          </div>

          <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-sm">Recent signups</h2>
              <Link to="/admin/users" className="text-quantum-neon text-xs font-medium flex items-center gap-1 hover:text-teal-300">
                Manage all users <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {stats.recent_signups.length === 0 ? (
              <p className="text-gray-600 text-sm">No users yet.</p>
            ) : (
              <ul className="divide-y divide-quantum-700/60">
                {stats.recent_signups.map(u => (
                  <li key={u.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-white text-sm font-medium">{u.username}</p>
                      <p className="text-gray-600 text-xs">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.role === 'admin' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">admin</span>
                      )}
                      {!u.is_active && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">inactive</span>
                      )}
                      <span className="text-gray-600 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
