import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Shared shell for every admin page: identity banner + title. Moving between
 * the admin pages is done from the top menu (Navbar's admin view).
 */
export function AdminLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen px-4 py-10 max-w-6xl mx-auto">
      <p className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl sm:rounded-full px-4 py-1.5 text-xs text-amber-300 mb-6 w-fit max-w-full">
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
        <span className="min-w-0 break-words">Admin area — signed in as <span className="font-semibold break-words">{user?.username}</span></span>
      </p>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white">{title}</h1>
        {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
      </div>

      {children}
    </div>
  );
}
