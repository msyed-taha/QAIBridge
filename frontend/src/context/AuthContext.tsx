import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

  // Restore session from localStorage on first load
  useEffect(() => {
    const savedToken = localStorage.getItem('qai_token');
    const savedUser  = localStorage.getItem('qai_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('qai_token');
        localStorage.removeItem('qai_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string, user: User) => {
    setToken(token);
    setUser(user);
    localStorage.setItem('qai_token', token);
    localStorage.setItem('qai_user', JSON.stringify(user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('qai_token');
    localStorage.removeItem('qai_user');
  };

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
