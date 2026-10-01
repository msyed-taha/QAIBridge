import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useSearchParams } from 'react-router-dom';
import { AuthProvider }    from './context/AuthContext';
import { ProtectedRoute }  from './components/ProtectedRoute';
import { AdminRoute }      from './components/AdminRoute';
import { ErrorBoundary }   from './components/ErrorBoundary';
import { PageTitle }       from './components/PageTitle';
import { Navbar }          from './components/layout/Navbar';
import { Footer }          from './components/layout/Footer';
// Public pages are small and load with the site, so visitors see them instantly.
import { Home }            from './pages/Home';
import { About }           from './pages/About';
import { LoginPage }       from './pages/LoginPage';
import { RegisterPage }    from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ContactPage }     from './pages/ContactPage';
import { PrivacyPage }     from './pages/legal/PrivacyPage';
import { TermsPage }       from './pages/legal/TermsPage';
import { useAuth }         from './context/AuthContext';

// Signed-in pages (and the charting library most of them use) are downloaded
// only when first opened, which keeps the first visit fast.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })));

const AppHome        = page(() => import('./pages/AppHome'), 'AppHome');
const AccountPage    = page(() => import('./pages/AccountPage'), 'AccountPage');
const SolvePage      = page(() => import('./pages/SolvePage'), 'SolvePage');
const DashboardPage  = page(() => import('./pages/DashboardPage'), 'DashboardPage');
const Module1Page    = page(() => import('./pages/Module1Page'), 'Module1Page');
const Module2Page    = page(() => import('./pages/Module2Page'), 'Module2Page');
const Module3Page    = page(() => import('./pages/Module3Page'), 'Module3Page');
const Module4Page    = page(() => import('./pages/Module4Page'), 'Module4Page');
const Module5Page    = page(() => import('./pages/Module5Page'), 'Module5Page');
const Module6Page    = page(() => import('./pages/Module6Page'), 'Module6Page');
const Module7Page    = page(() => import('./pages/Module7Page'), 'Module7Page');
const AdminDashboard = page(() => import('./pages/admin/AdminDashboard'), 'AdminDashboard');
const AdminUsers     = page(() => import('./pages/admin/AdminUsers'), 'AdminUsers');
const AdminMessages  = page(() => import('./pages/admin/AdminMessages'), 'AdminMessages');

function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
      <div className="w-8 h-8 border-2 border-quantum-neon border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Redirects logged-in users away from the public landing page to the app.
// Admins use the app like anyone else; the portal is one click away in the navbar.
function RootRoute() {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Home />;
  return <Navigate to="/app" replace />;
}

// Redirects logged-in users away from login/register (admin login → portal)
function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed, isAdmin } = useAuth();
  const [params] = useSearchParams();
  if (!isAuthed) return <>{children}</>;
  return <Navigate to={isAdmin && params.get('as') === 'admin' ? '/admin' : '/app'} replace />;
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
      <PageTitle />
      <AuthProvider>
        <ErrorBoundary>
          <div className="min-h-screen flex flex-col bg-quantum-900 text-white">
            <Navbar />
            <main className="flex-1 overflow-y-auto">
              <Suspense fallback={<PageLoading />}>
              <Routes>
                {/* ── Public ── */}
                <Route path="/"          element={<RootRoute />} />
                <Route path="/about"     element={<About />} />
                <Route path="/contact"   element={<ContactPage />} />
                <Route path="/privacy"   element={<PrivacyPage />} />
                <Route path="/terms"     element={<TermsPage />} />
                <Route path="/login"     element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
                <Route path="/register"  element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
                <Route path="/forgot-password" element={<GuestOnlyRoute><ForgotPasswordPage /></GuestOnlyRoute>} />

                {/* ── Admin (requires the admin role) ── */}
                <Route path="/admin"       element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                <Route path="/admin/messages" element={<AdminRoute><AdminMessages /></AdminRoute>} />

                {/* ── Protected ── */}
                <Route path="/app"       element={<ProtectedRoute><AppHome /></ProtectedRoute>} />
                <Route path="/account"   element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
                <Route path="/simulator" element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
                <Route path="/circuit"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
                <Route path="/solve"     element={<ProtectedRoute><SolvePage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

                {/* ── Legacy /moduleX routes ── */}
                <Route path="/module1"   element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
                <Route path="/module2"   element={<ProtectedRoute><Module2Page /></ProtectedRoute>} />
                <Route path="/module3"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
                <Route path="/module4"   element={<ProtectedRoute><Module4Page /></ProtectedRoute>} />
                <Route path="/module5"   element={<ProtectedRoute><Module5Page /></ProtectedRoute>} />
                <Route path="/module6"   element={<ProtectedRoute><Module6Page /></ProtectedRoute>} />
                <Route path="/module7"   element={<ProtectedRoute><Module7Page /></ProtectedRoute>} />
                <Route path="/module8"   element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

                {/* ── Fallback ── */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              </Suspense>
            </main>
            <Footer />
          </div>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
