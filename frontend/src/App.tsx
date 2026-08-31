import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider }    from './context/AuthContext';
import { ProtectedRoute }  from './components/ProtectedRoute';
import { AdminRoute }      from './components/AdminRoute';
import { ErrorBoundary }   from './components/ErrorBoundary';
import { Navbar }          from './components/layout/Navbar';
import { Footer }          from './components/layout/Footer';
import { Home }            from './pages/Home';
import { About }           from './pages/About';
import { LoginPage }       from './pages/LoginPage';
import { RegisterPage }    from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { SolvePage }       from './pages/SolvePage';
import { Module1Page }     from './pages/Module1Page';
import { Module2Page }     from './pages/Module2Page';
import { Module3Page }     from './pages/Module3Page';
import { Module4Page }     from './pages/Module4Page';
import { Module5Page }     from './pages/Module5Page';
import { Module6Page }     from './pages/Module6Page';
import { Module7Page }     from './pages/Module7Page';
import { AppHome }         from './pages/AppHome';
import { AdminDashboard }  from './pages/admin/AdminDashboard';
import { AdminUsers }      from './pages/admin/AdminUsers';
import { useAuth }         from './context/AuthContext';

// Redirects logged-in users away from the public landing page to their home
function RootRoute() {
  const { isAuthed, isAdmin } = useAuth();
  if (!isAuthed) return <Home />;
  return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
}

// Redirects logged-in users away from login/register to their home
function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed, isAdmin } = useAuth();
  if (!isAuthed) return <>{children}</>;
  return <Navigate to={isAdmin ? '/admin' : '/app'} replace />;
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <p className="text-quantum-neon text-sm font-mono mb-2">404</p>
        <h1 className="text-2xl font-bold text-white mb-3">Page not found</h1>
        <p className="text-gray-400 text-sm mb-6">There's nothing at this address.</p>
        <Link to="/" className="px-4 py-2 rounded-lg bg-quantum-neon text-black font-semibold text-sm hover:brightness-110 transition-all inline-block">
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <div className="min-h-screen flex flex-col bg-quantum-900 text-white">
            <Navbar />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                {/* ── Public ── */}
                <Route path="/"          element={<RootRoute />} />
                <Route path="/about"     element={<About />} />
                <Route path="/login"     element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="/register"  element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                <Route path="/forgot-password" element={<GuestOnlyRoute><ForgotPasswordPage /></GuestOnlyRoute>} />

                {/* ── Admin (requires the admin role) ── */}
                <Route path="/admin"       element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />

                {/* ── Protected ── */}
                <Route path="/app"       element={<ProtectedRoute><AppHome /></ProtectedRoute>} />
                <Route path="/simulator" element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
                <Route path="/circuit"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
                <Route path="/solve"     element={<ProtectedRoute><SolvePage /></ProtectedRoute>} />

                {/* ── Legacy /moduleX routes ── */}
                <Route path="/module1"   element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
                <Route path="/module2"   element={<ProtectedRoute><Module2Page /></ProtectedRoute>} />
                <Route path="/module3"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
                <Route path="/module4"   element={<ProtectedRoute><Module4Page /></ProtectedRoute>} />
                <Route path="/module5"   element={<ProtectedRoute><Module5Page /></ProtectedRoute>} />
                <Route path="/module6"   element={<ProtectedRoute><Module6Page /></ProtectedRoute>} />
                <Route path="/module7"   element={<ProtectedRoute><Module7Page /></ProtectedRoute>} />

                {/* ── Fallback ── */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
