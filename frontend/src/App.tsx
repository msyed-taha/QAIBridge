import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }    from './context/AuthContext';
import { ProtectedRoute }  from './components/ProtectedRoute';
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
import { Module8Page }     from './pages/Module8Page';
import { AppHome }         from './pages/AppHome';
import { useAuth }         from './context/AuthContext';

// Redirects logged-in users away from the public landing page to /app
function RootRoute() {
  const { isAuthed } = useAuth();
  return isAuthed ? <Navigate to="/app" replace /> : <Home />;
}

// Redirects logged-in users away from login/register to /app
function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  return isAuthed ? <Navigate to="/app" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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

              {/* ── Protected ── */}
              <Route path="/app"       element={<ProtectedRoute><AppHome /></ProtectedRoute>} />
              <Route path="/simulator" element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
              <Route path="/circuit"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Module8Page /></ProtectedRoute>} />
              <Route path="/solve"     element={<ProtectedRoute><SolvePage /></ProtectedRoute>} />

              {/* ── Legacy /moduleX routes ── */}
              <Route path="/module1"   element={<ProtectedRoute><Module1Page /></ProtectedRoute>} />
              <Route path="/module2"   element={<ProtectedRoute><Module2Page /></ProtectedRoute>} />
              <Route path="/module3"   element={<ProtectedRoute><Module3Page /></ProtectedRoute>} />
              <Route path="/module4"   element={<ProtectedRoute><Module4Page /></ProtectedRoute>} />
              <Route path="/module5"   element={<ProtectedRoute><Module5Page /></ProtectedRoute>} />
              <Route path="/module6"   element={<ProtectedRoute><Module6Page /></ProtectedRoute>} />
              <Route path="/module7"   element={<ProtectedRoute><Module7Page /></ProtectedRoute>} />
              <Route path="/module8"   element={<ProtectedRoute><Module8Page /></ProtectedRoute>} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
