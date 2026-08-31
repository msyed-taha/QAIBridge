import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { path: '/admin',       label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/admin/users', label: 'Users',     icon: Users,           exact: false },
];

/** Shared shell for every admin page: identity banner + section tabs. */
export function AdminLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const { user }     = useAuth();

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 text-xs text-amber-300 mb-6 w-fit">
        <ShieldCheck className="w-3.5 h-3.5" />
        Admin area — signed in as <span className="font-semibold">{user?.username}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
      </div>

      <div className="flex gap-1 border-b border-quantum-700 mb-8">
        {TABS.map(({ path, label, icon: Icon, exact }) => {
          const active = exact ? pathname === path : pathname.startsWith(path);
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-quantum-neon text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
