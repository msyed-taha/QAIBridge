import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard for the admin area. Not signed in -> /login. Signed in as a
 * normal user -> a clear "no access" screen rather than a silent redirect,
 * so it's obvious the page exists but the account lacks the role.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-quantum-neon border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to="/login" state={{ from: location.pathname, as: 'admin' }} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Administrator access required</h1>
          <p className="text-gray-400 text-sm mb-6">
            You're signed in as a standard user. This area is limited to platform administrators.
          </p>
          <Link
            to="/app"
            className="inline-block px-4 py-2 rounded-lg bg-quantum-neon text-black font-semibold text-sm hover:brightness-110 transition-all"
          >
            Go to your dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
