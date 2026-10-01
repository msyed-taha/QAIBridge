import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon, Mail, KeyRound, Loader2, Check, ShieldCheck,
  Trash2, LogOut, AlertTriangle, X, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accountApi, type AccountProfile } from '../api/account';
import { getApiErrorMessage } from '../api/client';
import { LEGAL } from '../legal';

const PW_RULES = [
  { test: (p: string) => p.length >= 8, label: '8+ characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'uppercase' },
  { test: (p: string) => /[a-z]/.test(p), label: 'lowercase' },
  { test: (p: string) => /\d/.test(p), label: 'a digit' },
];

function Card({ title, icon: Icon, children }: { title: string; icon: typeof UserIcon; children: React.ReactNode }) {
  return (
    <section className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
      <h2 className="flex items-center gap-2 text-white font-bold text-sm mb-5">
        <Icon className="w-4 h-4 text-quantum-neon" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Banner({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  const cls = kind === 'ok'
    ? 'bg-green-950/40 border-green-800 text-green-400'
    : 'bg-red-950/40 border-red-800 text-red-400';
  return <div className={`border rounded-xl px-4 py-2.5 text-xs mb-4 ${cls}`}>{text}</div>;
}

export function AccountPage() {
  const { user, isAdmin, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<AccountProfile | null>(null);

  // ── Profile / username ──
  const [username, setUsername] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── Change password ──
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ── Delete account modal ──
  const [showDelete, setShowDelete] = useState(false);
  const [delStep, setDelStep] = useState<'confirm' | 'otp'>('confirm');
  const [delOtp, setDelOtp] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delInfo, setDelInfo] = useState<string | null>(null);

  useEffect(() => {
    accountApi.me()
      .then(p => { setProfile(p); setUsername(p.username); })
      .catch(() => { /* stale token etc. — the route guard handles auth */ });
  }, []);

  const pwValid = PW_RULES.every(r => r.test(newPw));
  const pwMatch = newPw.length > 0 && newPw === confirmPw;
  const nameChanged = username.trim().length >= 3 && username.trim() !== (profile?.username ?? '');

  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameMsg(null);
    setSavingName(true);
    try {
      const updated = await accountApi.updateProfile(username.trim());
      setProfile(updated);
      updateUser({ username: updated.username });
      setNameMsg({ kind: 'ok', text: 'Username updated.' });
    } catch (err) {
      setNameMsg({ kind: 'err', text: getApiErrorMessage(err, 'Could not update username') });
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (!pwValid) return setPwMsg({ kind: 'err', text: 'New password does not meet the requirements.' });
    if (!pwMatch) return setPwMsg({ kind: 'err', text: 'New passwords do not match.' });
    setSavingPw(true);
    try {
      await accountApi.changePassword({
        current_password: curPw, new_password: newPw, confirm_new_password: confirmPw,
      });
      setCurPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ kind: 'ok', text: 'Password changed.' });
    } catch (err) {
      setPwMsg({ kind: 'err', text: getApiErrorMessage(err, 'Could not change password') });
    } finally {
      setSavingPw(false);
    }
  };

  const startDelete = () => {
    setShowDelete(true);
    setDelStep('confirm');
    setDelOtp(''); setDelErr(null); setDelInfo(null);
  };

  const sendDeleteOtp = async () => {
    setDelErr(null);
    setDelBusy(true);
    try {
      const { message } = await accountApi.deleteSendOtp();
      setDelInfo(message);
      setDelStep('otp');
    } catch (err) {
      setDelErr(getApiErrorMessage(err, 'Could not send the verification code'));
    } finally {
      setDelBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDelErr(null);
    setDelBusy(true);
    try {
      await accountApi.deleteVerify(delOtp);
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDelErr(getApiErrorMessage(err, 'Could not delete the account'));
      setDelBusy(false);
    }
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div className="min-h-screen px-4 py-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Account settings</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your profile, password and account.</p>
        </div>
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 bg-quantum-800 border border-quantum-700 hover:border-quantum-600 hover:text-white transition-all flex-shrink-0"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <div className="space-y-5">
        {/* Identity summary */}
        <div className="flex items-center gap-4 bg-quantum-800 border border-quantum-700 rounded-2xl p-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-white">{(profile?.username ?? user?.username ?? 'U')[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{profile?.username ?? user?.username}</p>
            <p className="text-gray-500 text-xs truncate">{profile?.email ?? user?.email}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-500/10 text-amber-300' : 'bg-teal-500/10 text-teal-300'}`}>
                <ShieldCheck className="w-3 h-3" /> {isAdmin ? 'Administrator' : 'User'}
              </span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Member since {memberSince}</span>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <Card title="Profile" icon={UserIcon}>
          {nameMsg && <Banner kind={nameMsg.kind} text={nameMsg.text} />}
          <form onSubmit={saveUsername} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  minLength={3}
                  maxLength={50}
                  required
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  value={profile?.email ?? user?.email ?? ''}
                  disabled
                  className="w-full bg-quantum-900/60 border border-quantum-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
              <p className="text-[11px] text-gray-600 mt-1">Email can't be changed — it's your account identity.</p>
            </div>
            <button
              type="submit"
              disabled={savingName || !nameChanged}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
            >
              {savingName ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save changes</>}
            </button>
          </form>
        </Card>

        {/* Change password */}
        <Card title="Change password" icon={KeyRound}>
          {pwMsg && <Banner kind={pwMsg.kind} text={pwMsg.text} />}
          <form onSubmit={savePassword} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Current password</label>
              <input
                type="password"
                value={curPw}
                onChange={e => setCurPw(e.target.value)}
                required
                className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">New password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-quantum-neon/50"
              />
              {newPw && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
                  {PW_RULES.map(r => (
                    <span key={r.label} className={r.test(newPw) ? 'text-green-400' : 'text-gray-500'}>
                      {r.test(newPw) ? '✓' : '○'} {r.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                className={`w-full bg-quantum-900 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none ${
                  confirmPw && !pwMatch ? 'border-red-600' : 'border-quantum-700 focus:border-quantum-neon/50'
                }`}
              />
              {confirmPw && !pwMatch && <p className="text-red-400 text-[11px] mt-1">Passwords do not match</p>}
            </div>
            <button
              type="submit"
              disabled={savingPw || !curPw || !pwValid || !pwMatch}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(90deg,#00ffcc,#00ccaa)' }}
            >
              {savingPw ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : <><KeyRound className="w-4 h-4" /> Change password</>}
            </button>
          </form>
        </Card>

        {/* Danger zone */}
        <section className="bg-red-950/20 border border-red-900/50 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> Delete account
          </h2>
          <p className="text-gray-400 text-xs mb-4 leading-relaxed">
            {profile?.is_owner ? (
              <>This is the owner account, so it can't be deleted.</>
            ) : (
              <>
                Closes your account and signs you out. We'll email a verification code
                to <span className="text-gray-300">{profile?.email ?? user?.email}</span> first.
                You can restore it within {LEGAL.deletedAccountDays} days by signing up again with the same
                email; after that, your account and its run history are permanently erased.
              </>
            )}
          </p>
          <button
            onClick={startDelete}
            disabled={profile?.is_owner}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-red-300 bg-red-950/40 border border-red-800 hover:bg-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
        </section>
      </div>

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-white font-bold">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Delete account
              </h3>
              <button onClick={() => setShowDelete(false)} className="text-gray-500 hover:text-white" disabled={delBusy}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {delErr && <Banner kind="err" text={delErr} />}

            {delStep === 'confirm' && (
              <>
                <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                  This closes <span className="text-white">{profile?.email ?? user?.email}</span> and signs you
                  out. To continue, we'll send a 5-digit code to that email address. Signing up again
                  with it within {LEGAL.deletedAccountDays} days restores the account; after that it is
                  permanently erased.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDelete(false)}
                    disabled={delBusy}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-300 bg-quantum-900 border border-quantum-700 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendDeleteOtp}
                    disabled={delBusy}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-60"
                  >
                    {delBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send code</>}
                  </button>
                </div>
              </>
            )}

            {delStep === 'otp' && (
              <>
                {delInfo && <Banner kind="ok" text={delInfo} />}
                <label className="block text-xs text-gray-400 font-medium mb-1.5">Verification code</label>
                <input
                  value={delOtp}
                  onChange={e => setDelOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="00000"
                  inputMode="numeric"
                  maxLength={5}
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-white focus:outline-none focus:border-red-600 mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={sendDeleteOtp}
                    disabled={delBusy}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-300 bg-quantum-900 border border-quantum-700 hover:text-white transition-colors disabled:opacity-60"
                  >
                    Resend code
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={delBusy || delOtp.length !== 5}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {delBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : <><Trash2 className="w-4 h-4" /> Delete account</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
