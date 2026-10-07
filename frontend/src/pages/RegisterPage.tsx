import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Zap, Eye, EyeOff, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { detailToMessage } from '../api/client';

// ── Password helpers ──────────────────────────────────────────────────────────

const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER   = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS  = '23456789';
const SPECIAL = '!@#$%&*';

function generateStrongPassword(): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  let pwd = UPPER[Math.floor(Math.random() * UPPER.length)]
           + LOWER[Math.floor(Math.random() * LOWER.length)]
           + DIGITS[Math.floor(Math.random() * DIGITS.length)]
           + SPECIAL[Math.floor(Math.random() * SPECIAL.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

interface StrengthInfo {
  score: number;      // 0-5
  label: string;
  color: string;
  bg:    string;
}

function getStrength(pwd: string): StrengthInfo {
  let score = 0;
  if (pwd.length >= 8)                    score++;
  if (pwd.length >= 12)                   score++;
  if (/[A-Z]/.test(pwd))                  score++;
  if (/[a-z]/.test(pwd))                  score++;
  if (/\d/.test(pwd))                     score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) score++;

  if (score <= 2) return { score, label: 'Weak',      color: '#ef4444', bg: '#ef444430' };
  if (score === 3) return { score, label: 'Fair',      color: '#f97316', bg: '#f9731630' };
  if (score === 4) return { score, label: 'Good',      color: '#3b82f6', bg: '#3b82f630' };
  return             { score, label: 'Strong',    color: '#00ffcc', bg: '#00ffcc20' };
}

interface Requirement { label: string; met: boolean }

/** The step-3 fields that can still be missing when "Create Account" is pressed. */
type Step3Field = 'username' | 'password' | 'confirm' | 'agree';

function getRequirements(pwd: string): Requirement[] {
  return [
    { label: 'At least 8 characters',    met: pwd.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(pwd) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(pwd) },
    { label: 'One digit (0-9)',            met: /\d/.test(pwd)    },
  ];
}

// ── Step indicator ────────────────────────────────────────────────────────────

function Steps({ current }: { current: number }) {
  const steps = ['Email', 'Verify email', 'Set password'];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((label, i) => {
        const idx     = i + 1;
        const done    = idx < current;
        const active  = idx === current;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={
                  done   ? { background: '#00ffcc',  color: '#000' } :
                  active ? { background: '#cc44ff',  color: '#fff' } :
                           { background: '#1f2937', color: '#6b7280' }
                }
              >
                {done ? '✓' : idx}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? 'text-white' : done ? 'text-quantum-neon' : 'text-gray-600'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-8 h-px" style={{ background: done ? '#00ffcc40' : '#1f2937' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function RegisterPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const from       = (useLocation().state as { from?: string } | null)?.from;

  const [step,     setStep]     = useState<1 | 2 | 3>(1);
  const [email,    setEmail]    = useState('');
  const [otp,      setOtp]      = useState(['', '', '', '', '']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [showCfm,  setShowCfm]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [resendIn, setResendIn] = useState(0);   // countdown seconds
  const [agreed,   setAgreed]   = useState(false); // 13+ and accepts the Terms / Privacy Policy
  const [tried,    setTried]    = useState(false); // "Create Account" pressed at least once

  const fieldRefs: Record<Step3Field, React.RefObject<HTMLInputElement>> = {
    username: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm:  useRef<HTMLInputElement>(null),
    agree:    useRef<HTMLInputElement>(null),
  };

  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Countdown timer for resend OTP
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const strength = getStrength(password);
  const reqs     = getRequirements(password);
  const allReqsMet = reqs.every(r => r.met);

  // What step 3 still needs. "Create Account" can always be pressed: pressing it
  // with something missing lists what is left, right above the button.
  const missing: { field: Step3Field; text: string }[] = [];
  if (username.length < 3) missing.push({ field: 'username', text: 'A username of at least 3 characters' });
  if (!allReqsMet)         missing.push({ field: 'password', text: 'A password that meets all 4 rules under it' });
  if (!confirm)            missing.push({ field: 'confirm', text: 'Your password typed again under Confirm Password' });
  else if (confirm !== password) missing.push({ field: 'confirm', text: 'The same password in both password boxes' });
  if (!agreed)             missing.push({ field: 'agree', text: 'A tick in the box to agree to the Terms of Use and Privacy Policy' });
  const needs = (field: Step3Field) => tried && missing.some(m => m.field === field);

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────

  const sendOtp = async () => {
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Could not send the code');
      setStep(2);
      setResendIn(60);
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────────

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    setError('');
    if (value && index < 4) otpRefs[index + 1].current?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (pasted.length === 5) {
      setOtp(pasted.split(''));
      otpRefs[4].current?.focus();
    }
  };

  const verifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 5) { setError('Please enter all 5 digits.'); return; }
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'That code didn\'t work');
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setOtp(['', '', '', '', '']);
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? 'Could not resend the code');
      setResendIn(60);
      setTimeout(() => otpRefs[0].current?.focus(), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Register ────────────────────────────────────────────────────────

  const register = async () => {
    setTried(true);
    if (missing.length) {
      fieldRefs[missing[0].field].current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, accept_terms: agreed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(detailToMessage(data.detail, 'Registration failed'));
      login(data.access_token, data.user);
      navigate(from ?? '/app', { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const errorBox = error && (
    <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm mb-5 flex items-center gap-2">
      <XCircle className="w-4 h-4 flex-shrink-0" />
      {error}
    </div>
  );

  return (
    <div className="relative overflow-hidden min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-quantum-purple opacity-10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-teal-500 opacity-10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="glass-card rounded-2xl p-8">

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-400 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-1">Create your account</h1>
            <p className="text-gray-500 text-sm">Start exploring quantum computing today</p>
          </div>

          <Steps current={step} />

          {/* Error (on the last step it shows above "Create Account" instead) */}
          {step !== 3 && errorBox}

          {/* ── STEP 1: Email ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && email && sendOtp()}
                    placeholder="you@example.com"
                    autoFocus
                    className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors"
                  />
                </div>
                <p className="text-xs text-gray-600 mt-1.5">
                  A 5-digit verification code will be sent to this address.
                </p>
              </div>

              <button
                onClick={sendOtp}
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
              >
                {loading ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Sending code…</>
                ) : (
                  <><Mail className="w-4 h-4" /> Send Verification Code</>
                )}
              </button>
            </div>
          )}

          {/* ── STEP 2: OTP ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-gray-400 text-sm">
                  We sent a 5-digit code to
                </p>
                <p className="text-quantum-neon font-semibold text-sm mt-0.5">{email}</p>
              </div>

              {/* 5 OTP boxes */}
              <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold text-white bg-quantum-900 border-2 rounded-xl focus:outline-none transition-all"
                    style={{
                      borderColor: digit ? '#00ffcc' : '#374151',
                      boxShadow: digit ? '0 0 0 2px #00ffcc20' : 'none',
                    }}
                  />
                ))}
              </div>

              <button
                onClick={verifyOtp}
                disabled={loading || otp.join('').length < 5}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
              >
                {loading ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Verifying…</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Verify Code</>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-gray-600">
                <button onClick={() => { setStep(1); setOtp(['','','','','']); setError(''); }}
                  className="hover:text-gray-400 transition-colors">
                  ← Change email
                </button>
                <button
                  onClick={resendOtp}
                  disabled={resendIn > 0 || loading}
                  className="flex items-center gap-1 hover:text-gray-400 transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  <RefreshCw className="w-3 h-3" />
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Username + Password ── */}
          {step === 3 && (
            <div className="space-y-4">

              {/* Email verified badge */}
              <div className="flex items-center gap-2 bg-green-950/30 border border-green-800/50 rounded-xl px-3 py-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-green-400 text-xs font-medium">{email} — verified</span>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    ref={fieldRefs.username}
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError(''); }}
                    placeholder="e.g. syed_taha"
                    minLength={3}
                    maxLength={50}
                    autoFocus
                    className={`w-full bg-quantum-900 border ${needs('username') ? 'border-amber-500/70' : 'border-quantum-700'} rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors`}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-400 font-medium">Password</label>
                  <button
                    type="button"
                    onClick={() => { const p = generateStrongPassword(); setPassword(p); setConfirm(p); }}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-quantum-neon transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Suggest strong password
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    ref={fieldRefs.password}
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="Min. 8 chars with A-Z, a-z, 0-9"
                    className={`w-full bg-quantum-900 border ${needs('password') ? 'border-amber-500/70' : 'border-quantum-700'} rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors font-mono tracking-wider`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength bar and the password rules (the rules also show once "Create Account" is pressed) */}
                {(password || tried) && (
                  <div className="mt-2 space-y-1.5">
                    {password && <div className="flex items-center justify-between">
                      <div className="flex gap-1 flex-1 mr-3">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                            style={{ background: i <= strength.score ? strength.color : '#1f2937' }} />
                        ))}
                      </div>
                      <span className="text-xs font-semibold" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>}
                    <div className="grid grid-cols-2 gap-1">
                      {reqs.map(r => (
                        <div key={r.label} className="flex items-center gap-1.5">
                          {r.met
                            ? <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                            : <XCircle    className="w-3 h-3 text-gray-600 flex-shrink-0" />
                          }
                          <span className={`text-[10px] ${r.met ? 'text-green-400' : 'text-gray-600'}`}>
                            {r.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    ref={fieldRefs.confirm}
                    type={showCfm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setError(''); }}
                    placeholder="Re-enter your password"
                    className={`w-full bg-quantum-900 border ${needs('confirm') ? 'border-amber-500/70' : 'border-quantum-700'} rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-quantum-neon/50 transition-colors`}
                    style={{
                      borderColor: confirm
                        ? confirm === password ? '#22c55e60' : '#ef444460'
                        : undefined
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCfm(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showCfm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              {/* Consent — required, and recorded by the server with the Terms version */}
              <label className={`flex items-start gap-2.5 cursor-pointer select-none rounded-md ${needs('agree') ? 'outline outline-1 outline-offset-4 outline-amber-500/70' : ''}`}>
                <input
                  ref={fieldRefs.agree}
                  type="checkbox"
                  checked={agreed}
                  onChange={e => { setAgreed(e.target.checked); setError(''); }}
                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-teal-400 cursor-pointer"
                />
                <span className="text-xs text-gray-400 leading-relaxed">
                  I am 13 or older (under 18 with a parent's or guardian's permission) and I agree to
                  the{' '}
                  <Link to="/terms" target="_blank" className="text-quantum-neon hover:text-teal-300 underline underline-offset-2">Terms of Use</Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" className="text-quantum-neon hover:text-teal-300 underline underline-offset-2">Privacy Policy</Link>.
                </span>
              </label>

              {errorBox}
              {tried && missing.length > 0 && (
                <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  <p className="font-semibold">Almost there. Still needed:</p>
                  <ul className="mt-1 list-disc pl-5 space-y-0.5">
                    {missing.map(m => <li key={m.field}>{m.text}</li>)}
                  </ul>
                </div>
              )}

              <button
                onClick={register}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                style={{ background: 'linear-gradient(90deg, #00ffcc, #00ccaa)' }}
              >
                {loading ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Creating account…</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Create Account</>
                )}
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-gray-600 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" state={from ? { from } : undefined} className="text-quantum-neon hover:text-teal-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-gray-700 text-xs mt-4">
          <Link to="/" className="hover:text-gray-500 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
