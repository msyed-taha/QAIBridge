import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
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

// Closes an open menu once the person is done with it: a click or tap outside
// it, Tab moving out of it, or Esc (which also puts focus back on its button).
function useDismiss(open: boolean, setOpen: (open: boolean) => void,
                    area: RefObject<HTMLElement>, button: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = area.current;
    if (!open || !el) return;
    const outside = (target: EventTarget | null) => !el.contains(target as Node);
    const onPointerDown = (e: PointerEvent) => { if (outside(e.target)) setOpen(false); };
    const onFocusOut    = (e: FocusEvent)   => { if (e.relatedTarget && outside(e.relatedTarget)) setOpen(false); };
    const onKeyDown     = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [open, setOpen, area, button]);
}

export function Navbar() {
  const { pathname, key }          = useLocation();
  const navigate                   = useNavigate();
  const { user, isAuthed, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const headerRef        = useRef<HTMLElement>(null);
  const burgerRef        = useRef<HTMLButtonElement>(null);
  const toolsRef         = useRef<HTMLDivElement>(null);
  const toolsButtonRef   = useRef<HTMLButtonElement>(null);
  const accountRef       = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const onToolPage = TOOLS.some(t => isToolAt(t, pathname));

  // Opening any page, even the one already open, closes the menus.
  useEffect(() => { setMobileOpen(false); setToolsOpen(false); setUserMenuOpen(false); }, [key]);
  useDismiss(mobileOpen,   setMobileOpen,   headerRef,  burgerRef);
  useDismiss(toolsOpen,    setToolsOpen,    toolsRef,   toolsButtonRef);
  useDismiss(userMenuOpen, setUserMenuOpen, accountRef, accountButtonRef);

  // Admins see the portal nav only inside /admin; everywhere else they get the normal app.
  const inAdminView = isAdmin && pathname.startsWith('/admin');
  const NAV_LINKS = !isAuthed ? PUBLIC_NAV : inAdminView ? ADMIN_NAV : AUTH_NAV;
  const viewSwitch = inAdminView
    ? { to: '/app',   label: 'Open the app', Icon: Cpu }
    : { to: '/admin', label: 'Admin portal', Icon: ShieldCheck };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full border-b border-quantum-700 bg-quantum-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4 xl:gap-8">

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
                aria-current={isActive ? 'page' : undefined}
                className={`relative whitespace-nowrap px-3 xl:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
                ref={toolsButtonRef}
                onClick={() => setToolsOpen(o => !o)}
                aria-expanded={toolsOpen}
                className={`flex items-center gap-1 px-3 xl:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
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
                            <Link key={t.path} to={t.path} aria-current={isToolAt(t, pathname) ? 'page' : undefined}
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
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
          {isAdmin && (
            <Link
              to={viewSwitch.to}
              title={viewSwitch.label}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-amber-300/80 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
            >
              <viewSwitch.Icon className="w-4 h-4" />
              {/* Just the icon on tablets, where the bar is short of room */}
              <span className="sr-only lg:not-sr-only">{viewSwitch.label}</span>
            </Link>
          )}
          {isAuthed ? (
            /* ── Logged in: avatar + dropdown ── */
            <div className="relative" ref={accountRef}>
              <button
                ref={accountButtonRef}
                onClick={() => setUserMenuOpen(p => !p)}
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-quantum-800 border border-quantum-700 hover:border-quantum-600 transition-all"
              >
                <div aria-hidden="true" className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">
                    {user?.username?.[0]?.toUpperCase() ?? 'U'}
                  </span>
                </div>
                <span className="sr-only">Account menu: </span>
                {/* Just the initial on tablets; a long name is cut short with "…" */}
                <span className="sr-only lg:not-sr-only lg:max-w-[10rem] xl:max-w-[12rem] lg:truncate text-sm text-white font-medium">{user?.username}</span>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-quantum-800 border border-quantum-700 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-quantum-700">
                    <p className="text-white text-sm font-semibold truncate">{user?.username}</p>
                    <p className="text-gray-400 text-xs truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/account"
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
                className="flex items-center gap-1.5 px-3 xl:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-gray-400 hover:text-white hover:bg-quantum-800 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
              <Link
                to="/register"
                className="flex items-center gap-2 px-3 xl:px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap text-black transition-all hover:scale-105 hover:brightness-110"
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
          ref={burgerRef}
          className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-quantum-800 transition-colors"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label="Menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ── Mobile Dropdown ── (scrolls inside itself when taller than the screen,
           so Sign Out stays reachable on small phones) */}
      {mobileOpen && (
        <div className="md:hidden max-h-[calc(100dvh_-_4rem_-_1px)] overflow-y-auto overscroll-contain border-t border-quantum-700 bg-quantum-900 px-4 py-3 space-y-1">
          {NAV_LINKS.map(link => {
            const { path, label, active } = link;
            const isActive = isNavActive(link, pathname);
            return (
              <Link
                key={path}
                to={active ? path : '#'}
                aria-current={isActive ? 'page' : undefined}
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
                    <Link key={t.path} to={t.path} aria-current={isToolAt(t, pathname) ? 'page' : undefined}
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
                  <div aria-hidden="true" className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{user?.username?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{user?.username}</p>
                    <p className="text-gray-400 text-xs">{user?.email}</p>
                  </div>
                </div>
                {isAdmin && (
                  <Link
                    to={viewSwitch.to}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
                  >
                    <viewSwitch.Icon className="w-4 h-4" /> {viewSwitch.label}
                  </Link>
                )}
                <Link
                  to="/account"
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
                <Link to="/login"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-quantum-800 border border-quantum-700">
                  <LogIn className="w-4 h-4" /> Sign In
                </Link>
                <Link to="/register"
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
