import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The browser-tab title for every page ("Sign in · QAIbridge"). Shown in tabs,
// bookmarks, history and search results. Keep HOME_TITLE equal to <title> in index.html.
const HOME_TITLE = 'QAIbridge – See if quantum computing can solve your problem';

const TITLES: Record<string, string> = {
  '/about':           'About',
  '/contact':         'Contact us',
  '/privacy':         'Privacy Policy',
  '/terms':           'Terms of Use',
  '/login':           'Sign in',
  '/register':        'Create your account',
  '/forgot-password': 'Reset your password',
  '/app':             'Home',
  '/account':         'Account settings',
  '/solve':           'Problem Solver',
  '/dashboard':       'Performance Dashboard',
  '/simulator':       'Simulation Kernel',
  '/circuit':         'Circuit Builder',
  '/module1':         'Simulation Kernel',
  '/module2':         'Quantum vs Classical',
  '/module3':         'Circuit Builder',
  '/module4':         'AI Advisor',
  '/module5':         'Code Transformer',
  '/module6':         'Neural Optimizer',
  '/module7':         'QNN Converter',
  '/module8':         'Performance Dashboard',
  '/admin':           'Admin dashboard',
  '/admin/users':     'Users · Admin',
  '/admin/messages':  'Messages · Admin',
};

export function PageTitle() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    let name: string | undefined = TITLES[path];
    if (path === '/login' && new URLSearchParams(search).get('as') === 'admin') name = 'Admin sign in';
    document.title = path === '/' ? HOME_TITLE : `${name ?? 'Page not found'} · QAIbridge`;
  }, [pathname, search]);

  return null;
}
