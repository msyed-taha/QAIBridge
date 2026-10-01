import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Cpu, LogOut, User, LogIn, ShieldCheck, Settings, ChevronDown } from 'lucide-react';
import { QAIBridgeLogo } from './QAIBridgeLogo';
import { useAuth } from '../../context/AuthContext';
import { TOOLS, TOOL_GROUPS, isToolAt, toolsIn } from '../../tools';

// `section`: also highlighted on the pages under it (/learn/… for Learn).
type NavLink = { path: string; label: string; active: boolean; section?: boolean };
const isNavActive = (link: NavLink, pathname: string) =>
  pathname === link.path || (!!link.section && pathname.startsWith(link.path + '/'));

// Public nav (not logged in) — landing pages and the Learn course. The tools require login.
const PUBLIC_NAV: NavLink[] = [
  { path: '/',      label: 'Home',  active: true },
  { path: '/learn', label: 'Learn', active: true, section: true },
  { path: '/about', label: 'About', active: true },
];

// Authenticated nav (logged in as a normal user)
const AUTH_NAV: NavLink[] = [
  { path: '/app',       label: 'Home',        active: true },
  { path: '/learn',     label: 'Learn',       active: true, section: true },
  { path: '/solve',     label: 'Solve',       active: true },
  { path: '/dashboard', label: 'Dashboard',   active: true },
];

// The Tools menu: two columns of groups (the tools themselves live in tools.ts).
const MENU_COLUMNS = [['solve', 'results'], ['build', 'research']] as const;
const groupLabel = (id: string) => TOOL_GROUPS.find(g => g.id === id)?.label;

// Admin nav (logged in as an administrator) — a different view of the site
const ADMIN_NAV: NavLink[] = [
  { path: '/admin',       label: 'Dashboard', active: true },
  { path: '/admin/users', label: 'Users',     active: true },
  { path: '/admin/messages', label: 'Messages', active: true },
];

export function Navbar() {
  const { pathname }               = useLocation();
  const navigate                   = useNavigate();
  const { user, isAuthed, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const onToolPage = TOOLS.some(t => isToolAt(t, pathname));

  useEffect(() => { setToolsOpen(false); }, [pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Admins see the portal nav only inside /admin; everywhere else they get the normal app.
  const inAdminView = isAdmin && pathname.startsWith('/admin');
  const NAV_LINKS = !isAuthed ? PUBLIC_NAV : inAdminView ? ADMIN_NAV : AUTH_NAV;
  const viewSwitch = inAdminView
    ? { to: '/app',   label: 'Open the app', Icon: Cpu }
    : { to: '/admin', label: 'Admin portal', Icon: ShieldCheck };

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
        <Link to={!isAuthed ? '/' : inAdminView ? '/admin' : '/app'} className="flex-shrink-0">
          <QAIBridgeLogo size={34} showText={true} />
        </Link>

        {/* ── Desktop Nav ── */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => {
            const { path, label, active } = link;
            const isActive = isNavActive(link, pathname);
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
          {isAuthed && !inAdminView && (
            <div className="relative" ref={toolsRef}>
              <button
                onClick={() => setToolsOpen(o => !o)}
                aria-expanded={toolsOpen}
                className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  onToolPage ? 'text-white bg-quantum-800' : 'text-gray-400 hover:text-white hover:bg-quantum-800'}`}
              >
                Tools
                <ChevronDown className={`w-4 h-4 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {toolsOpen && (
                <div className="absolute right-0 top-full mt-2 w-[36rem] bg-quantum-800 border border-quantum-700 rounded-xl shadow-2xl p-3 grid grid-cols-2 gap-x-3 gap-y-1 z-50">
                  {MENU_COLUMNS.map(column => (
                    <div key={column.join()} className="space-y-3">
                      {column.map(group => (
                        <div key={group}>
                          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{groupLabel(group)}</p>
                          {toolsIn(group).map(t => (
                            <Link key={t.path} to={t.path}
                              className={`flex gap-2.5 p-2.5 rounded-lg transition-colors ${isToolAt(t, pathname) ? 'bg-quantum-700' : 'hover:bg-quantum-700/60'}`}>
                              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: `${t.color}1f`, border: `1px solid ${t.color}55` }}>
                                <t.icon className="w-3.5 h-3.5" style={{ color: t.color }} />
                              </span>
                              <span>
                                <span className="block text-sm text-white font-medium leading-tight">{t.name}</span>
                                <span className="block text-xs text-gray-400 leading-snug mt-0.5">{t.short}</span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* ── Right side ── */}
        <div className="hidden md:flex items-center gap-3">
          {isAdmin && (
            <Link
              to={viewSwitch.to}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-amber-300/80 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
            >
              <viewSwitch.Icon className="w-4 h-4" />
              {viewSwitch.label}
            </Link>
          )}
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
                  <Link
                    to="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-quantum-700 hover:text-white transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Account settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/30 transition-colors border-t border-quantum-700"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Not logged in: Login + Register (admins sign in the same way) ── */
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
          {NAV_LINKS.map(link => {
            const { path, label, active } = link;
            const isActive = isNavActive(link, pathname);
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

          {isAuthed && !inAdminView && (
            <div className="pt-2 mt-2 border-t border-quantum-800">
              {TOOL_GROUPS.map(g => (
                <div key={g.id}>
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{g.label}</p>
                  {toolsIn(g.id).map(t => (
                    <Link key={t.path} to={t.path} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm ${isToolAt(t, pathname) ? 'bg-quantum-800 text-white' : 'text-gray-300 hover:bg-quantum-800 hover:text-white'}`}>
                      <t.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.color }} />{t.name}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}

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
                {isAdmin && (
                  <Link
                    to={viewSwitch.to}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <viewSwitch.Icon className="w-4 h-4" /> {viewSwitch.label}
                  </Link>
                )}
                <Link
                  to="/account"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-quantum-800 hover:text-white transition-colors"
                >
                  <Settings className="w-4 h-4" /> Account settings
                </Link>
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
