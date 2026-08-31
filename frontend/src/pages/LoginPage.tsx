import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Mail, Lock, LogIn, Loader2, Zap, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { detailToMessage, friendlyError } from '../api/client';
import { FirstAdminSetup } from './FirstAdminSetup';

type Mode = 'user' | 'admin';

export function LoginPage() {
  const { login, logout } = useAuth();
  const navigate    = useNavigate();
  const location    = useLocation();
  const [params]    = useSearchParams();

  const state       = location.state as { from?: string; as?: Mode } | null;
  const initialMode: Mode = state?.as === 'admin' || params.get('as') === 'admin' ? 'admin' : 'user';
  const redirectTo  = state?.from ?? '/app';

  const [mode,     setMode]     = useState<Mode>(initialMode);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const isAdmin = mode === 'admin';

  // Does any admin exist yet? If not, the Admin tab offers a one-time setup form.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/admin-setup-status')
      .then(r => (r.ok ? r.json() : { needs_setup: false }))
      .then(d => { if (!cancelled) setNeedsSetup(Boolean(d.needs_setup)); })
      .catch(() => { /* backend down — normal login form still shows */ });
    return () => { cancelled = true; };
  }, []);

  const showSetup = isAdmin && needsSetup;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Login failed'));

      // The account's real role comes from the server, not the toggle. The
      // toggle only decides where you land — and blocks a non-admin who picked
      // the Admin tab, so the intent is explicit.
      if (isAdmin && data.user?.role !== 'admin') {
        throw new Error('This account does not have administrator access.');
      }

      login(data.access_token, data.user);
      navigate(data.user?.role === 'admin' ? '/admin' : redirectTo, { replace: true });
    } catch (e: unknown) {
      logout();
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-8">

          {/* Role toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-quantum-900 border border-quantum-700 rounded-xl mb-6">
            {(['user', 'admin'] as Mode[]).map(m => {
              const active = mode === m;
              const Icon = m === 'admin' ? ShieldCheck : UserIcon;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                    active ? 'bg-quantum-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m === 'admin' ? 'Admin' : 'User'}
                </button>
              );
            })}
          </div>

          {showSetup ? (
            <FirstAdminSetup
              onCreated={(token, user) => {
                login(token, user);
                navigate('/admin', { replace: true });
              }}
            />
          ) : (
          <>
          {/* Header */}
          <div className="text-center mb-6">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br ${isAdmin ? 'from-amber-500 to-orange-400' : 'from-teal-500 to-cyan-400'}`}>
              {isAdmin ? <ShieldCheck className="w-6 h-6 text-white" /> : <Zap className="w-6 h-6 text-white" />}
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-1">
              {isAdmin ? 'Administrator sign in' : 'Welcome back'}
            </h1>
            <p className="text-gray-500 text-sm">
              {isAdmin ? 'Manage users and monitor the platform' : 'Sign in to your QAIbridge account'}
            </p>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
                />
              </div>
              <div className="text-right mt-2">
                <Link
                  to={isAdmin ? '/forgot-password?as=admin' : '/forgot-password'}
                  className={`text-xs font-medium transition-colors ${isAdmin ? 'text-amber-300/90 hover:text-amber-300' : 'text-quantum-neon hover:text-teal-300'}`}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mt-2`}
              style={{ background: isAdmin ? 'linear-gradient(90deg,#f59e0b,#f97316)' : 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                : <><LogIn className="w-4 h-4" /> {isAdmin ? 'Sign in as Admin' : 'Sign In'}</>
              }
            </button>
          </form>

          {!isAdmin && (
            <p className="text-center text-gray-600 text-sm mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-quantum-neon hover:text-teal-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
          )}
          {isAdmin && (
            <p className="text-center text-gray-600 text-xs mt-6 leading-relaxed">
              Sign in with the admin account's <span className="text-gray-500">email address</span>.
              New admin accounts are created by an existing admin from <span className="text-gray-500">Admin → Users → New account</span>.
            </p>
          )}
          </>
          )}
        </div>

        <p className="text-center text-gray-700 text-xs mt-4">
          <Link to="/" className="hover:text-gray-500 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
