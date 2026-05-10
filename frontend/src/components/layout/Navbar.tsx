import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Cpu, LogOut, User, LogIn } from 'lucide-react';
import { QAIBridgeLogo } from './QAIBridgeLogo';
import { useAuth } from '../../context/AuthContext';

// Public nav (not logged in)
const PUBLIC_NAV = [
  { path: '/',      label: 'Home',  active: true },
  { path: '/about', label: 'About', active: true },
];

// Authenticated nav (logged in)
const AUTH_NAV = [
  { path: '/app',       label: 'Home',        active: true },
  { path: '/solve',     label: 'Solve',       active: true },
  { path: '/simulator', label: 'Simulator',   active: true },
  { path: '/module4',   label: 'AI Advisor',  active: true },
];

export function Navbar() {
  const { pathname }               = useLocation();
  const navigate                   = useNavigate();
  const { user, isAuthed, logout } = useAuth();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const NAV_LINKS = isAuthed ? AUTH_NAV : PUBLIC_NAV;

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-quantum-700 bg-quantum-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">

        {/* ── Logo ── */}
        <Link to={isAuthed ? '/app' : '/'} className="flex-shrink-0">
          <QAIBridgeLogo size={34} showText={true} />
        </Link>

        {/* ── Desktop Nav ── */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ path, label, active }) => {
            const isActive = pathname === path;
            return (
              <Link
                key={path}
                to={active ? path : '#'}
                className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'text-white'
                    : active
                    ? 'text-gray-400 hover:text-white hover:bg-quantum-800'
                    : 'text-gray-600 cursor-default pointer-events-none'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-0 rounded-lg opacity-20"
                    style={{ background: 'linear-gradient(135deg, #00ffcc22, #cc44ff22)' }} />
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #00ffcc, #cc44ff)' }} />
                )}
                <span className={`relative ${isActive ? 'text-transparent bg-clip-text' : ''}`}
                  style={isActive ? { backgroundImage: 'linear-gradient(90deg, #00ffcc, #cc44ff)' } : {}}>
                  {label}
                </span>
                {!active && (
                  <span className="ml-1.5 text-[10px] bg-quantum-700 text-gray-500 px-1.5 py-0.5 rounded align-middle">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Right side ── */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthed ? (
            /* ── Logged in: avatar + dropdown ── */
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(p => !p)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-quantum-800 border border-quantum-700 hover:border-quantum-600 transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">
                    {user?.username?.[0]?.toUpperCase() ?? 'U'}
                  </span>
                </div>
                <span className="text-sm text-white font-medium">{user?.username}</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-quantum-800 border border-quantum-700 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-quantum-700">
                    <p className="text-white text-sm font-semibold truncate">{user?.username}</p>
                    <p className="text-gray-500 text-xs truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Not logged in: Login + Register ── */
            <>
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-quantum-800 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
              <Link
                to="/register"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black transition-all hover:scale-105 hover:brightness-110"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
              >
                <Cpu className="w-4 h-4" />
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-800 transition-colors"
          onClick={() => setMobileOpen(prev => !prev)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ── Mobile Dropdown ── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-quantum-700 bg-quantum-900 px-4 py-3 space-y-1">
          {NAV_LINKS.map(({ path, label, active }) => {
            const isActive = pathname === path;
            return (
              <Link
                key={path}
                to={active ? path : '#'}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-quantum-800 text-white'
                  : active  ? 'text-gray-400 hover:bg-quantum-800 hover:text-white'
                  : 'text-gray-600 pointer-events-none'
                }`}
              >
                <span>{label}</span>
                {!active && (
                  <span className="text-[10px] bg-quantum-700 text-gray-500 px-1.5 py-0.5 rounded">Soon</span>
                )}
              </Link>
            );
          })}

          <div className="pt-2 pb-1 space-y-2 border-t border-quantum-800 mt-2">
            {isAuthed ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{user?.username}</p>
                    <p className="text-gray-600 text-xs">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-950/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-quantum-800 border border-quantum-700">
                  <LogIn className="w-4 h-4" /> Sign In
                </Link>
                <Link to="/register" onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-black"
                  style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}>
                  <User className="w-4 h-4" /> Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
