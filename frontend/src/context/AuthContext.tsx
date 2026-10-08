import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { onSessionEnded } from '../api/client';

export type Role = 'user' | 'admin';

interface User {
  id:       number;
  username: string;
  email:    string;
  role:     Role;
  created_at?: string | null;
}

interface AuthContextType {
  user:       User | null;
  token:      string | null;
  loading:    boolean;
  login:      (token: string, user: User) => void;
  logout:     () => void;
  updateUser: (patch: Partial<User>) => void;
  isAuthed:   boolean;
  isAdmin:    boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restore session from localStorage on first load
  useEffect(() => {
    const savedToken = localStorage.getItem('qai_token');
    const savedUser  = localStorage.getItem('qai_user');
    let restored = false;
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        restored = true;
      } catch {
        localStorage.removeItem('qai_token');
        localStorage.removeItem('qai_user');
      }
    }
    setLoading(false);

    // Then check the saved login with the server: it may have expired, or its
    // account been closed, since the last visit (that 401 signs out, below).
    // If it's still good, take the account's current details, like a new
    // username. If the server can't be reached, keep the saved login.
    if (restored) {
      apiClient.get<User>('/api/auth/me')
        .then(({ data }) => {
          if (localStorage.getItem('qai_token') !== savedToken) return;   // signed out or in again meanwhile
          setUser(data);
          localStorage.setItem('qai_user', JSON.stringify(data));
        })
        .catch(() => { /* a 401 is handled by onSessionEnded; anything else keeps the saved login */ });
    }
  }, []);

  const login = (token: string, user: User) => {
    setToken(token);
    setUser(user);
    localStorage.setItem('qai_token', token);
    localStorage.setItem('qai_user', JSON.stringify(user));
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('qai_token');
    localStorage.removeItem('qai_user');
  }, []);

  // The server turned the saved login away: sign out, and ask to sign in again
  // on the sign-in page (the admin one for admin pages), coming back here after.
  useEffect(() => onSessionEnded(() => {
    logout();
    const from = window.location.pathname + window.location.search;
    navigate('/login', { replace: true, state: { from, as: from.startsWith('/admin') ? 'admin' : undefined, sessionEnded: true } });
  }), [logout, navigate]);

  // Merge fresh fields (e.g. a changed username) into the session without a re-login.
  const updateUser = (patch: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem('qai_user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser,
      isAuthed: !!user,
      isAdmin: user?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
