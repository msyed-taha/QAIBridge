import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Loader2, Zap, CheckCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { detailToMessage, friendlyError } from '../api/client';

type Step = 'email' | 'otp' | 'password' | 'success';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isAdmin  = params.get('as') === 'admin';
  const loginPath = isAdmin ? '/login?as=admin' : '/login';
  const accent = isAdmin
    ? 'linear-gradient(90deg,#f59e0b,#f97316)'
    : 'linear-gradient(90deg, #00ffcc, #00ccaa)';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    digit: boolean;
  }>({ length: false, uppercase: false, lowercase: false, digit: false });

  const checkPasswordStrength = (pwd: string) => {
    setNewPassword(pwd);
    setPasswordStrength({
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      digit: /\d/.test(pwd),
    });
  };

  const isPasswordValid = Object.values(passwordStrength).every((v) => v);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleSendOtp = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Failed to send OTP'));
      setStep('otp');
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Failed to verify OTP'));
      setStep('password');
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);

    if (!isPasswordValid) {
      setError('Password does not meet requirements');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp,
          new_password: newPassword,
          confirm_new_password: confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Failed to reset password'));
      setStep('success');
    } catch (e: unknown) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Background glows */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-quantum-800 border border-quantum-700 rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br ${isAdmin ? 'from-amber-500 to-orange-400' : 'from-teal-500 to-cyan-400'}`}>
              {isAdmin ? <ShieldCheck className="w-6 h-6 text-white" /> : <Zap className="w-6 h-6 text-white" />}
            </div>
            {step !== 'success' && (
              <>
                <h1 className="text-2xl font-extrabold text-white mb-1">
                  {isAdmin ? 'Reset administrator password' : 'Reset Password'}
                </h1>
                <p className="text-gray-500 text-sm">
                  {step === 'email' && (isAdmin ? "Enter the admin account's email to receive an OTP" : 'Enter your email to receive an OTP')}
                  {step === 'otp' && 'Enter the 5-digit OTP sent to your email'}
                  {step === 'password' && 'Create a new password'}
                </p>
              </>
            )}
            {step === 'success' && (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold text-white mb-1">Password Reset</h1>
                <p className="text-gray-500 text-sm">Your password has been successfully changed</p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step: Email */}
          {step === 'email' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendOtp();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: accent }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Send OTP
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step: OTP */}
          {step === 'otp' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyOtp();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">5-Digit OTP</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  required
                  placeholder="00000"
                  maxLength={5}
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors text-center font-mono text-lg tracking-widest"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 5}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: accent }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>Verify OTP</>
                )}
              </button>
            </form>
          )}

          {/* Step: Password */}
          {step === 'password' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResetPassword();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => checkPasswordStrength(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
                  />
                </div>

                {/* Password strength indicators */}
                {newPassword && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className={`flex items-center gap-2 ${passwordStrength.length ? 'text-green-400' : 'text-gray-500'}`}>
                      <div className={`w-2 h-2 rounded-full ${passwordStrength.length ? 'bg-green-400' : 'bg-gray-600'}`} />
                      At least 8 characters
                    </div>
                    <div className={`flex items-center gap-2 ${passwordStrength.uppercase ? 'text-green-400' : 'text-gray-500'}`}>
                      <div className={`w-2 h-2 rounded-full ${passwordStrength.uppercase ? 'bg-green-400' : 'bg-gray-600'}`} />
                      One uppercase letter
                    </div>
                    <div className={`flex items-center gap-2 ${passwordStrength.lowercase ? 'text-green-400' : 'text-gray-500'}`}>
                      <div className={`w-2 h-2 rounded-full ${passwordStrength.lowercase ? 'bg-green-400' : 'bg-gray-600'}`} />
                      One lowercase letter
                    </div>
                    <div className={`flex items-center gap-2 ${passwordStrength.digit ? 'text-green-400' : 'text-gray-500'}`}>
                      <div className={`w-2 h-2 rounded-full ${passwordStrength.digit ? 'bg-green-400' : 'bg-gray-600'}`} />
                      One digit
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`w-full bg-quantum-900 border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none transition-colors ${
                      confirmPassword && !passwordsMatch ? 'border-red-600 focus:border-red-500' : 'border-quantum-700 focus:border-quantum-neon/50'
                    }`}
                  />
                </div>
                {confirmPassword && !passwordsMatch && <p className="text-red-400 text-xs mt-1">Passwords do not match</p>}
                {confirmPassword && passwordsMatch && <p className="text-green-400 text-xs mt-1">Passwords match ✓</p>}
              </div>

              <button
                type="submit"
                disabled={loading || !isPasswordValid || !passwordsMatch}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: accent }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Resetting…
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Change Password
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="space-y-4">
              <p className="text-center text-gray-300 text-sm">
                Your password has been successfully updated. You can now log in with your new password.
              </p>
              <button
                onClick={() => navigate(loginPath)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01]"
                style={{ background: accent }}
              >
                Back to {isAdmin ? 'Admin ' : ''}Login
              </button>
            </div>
          )}

          {/* Back button (for non-success steps) */}
          {step !== 'success' && (
            <button
              onClick={() => {
                if (step === 'otp') setStep('email');
                else if (step === 'password') setStep('otp');
                else navigate(loginPath);
              }}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-quantum-700 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              {step === 'email' ? 'Back to Login' : 'Back'}
            </button>
          )}
        </div>

        {/* Footer link */}
        {step !== 'success' && (
          <p className="text-center text-gray-700 text-xs mt-4">
            <Link to={loginPath} className="hover:text-gray-500 transition-colors">
              ← Back to Login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
