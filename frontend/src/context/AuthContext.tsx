import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id:       number;
  username: string;
  email:    string;
}

interface AuthContextType {
  user:     User | null;
  token:    string | null;
  loading:  boolean;
  login:    (token: string, user: User) => void;
  logout:   () => void;
  isAuthed: boolean;
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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthed: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
