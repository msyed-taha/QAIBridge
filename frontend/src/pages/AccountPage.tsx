import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User as UserIcon, Mail, KeyRound, Loader2, Check, ShieldCheck,
  Trash2, LogOut, AlertTriangle, X, CalendarDays,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accountApi, type AccountProfile } from '../api/account';
import { getApiErrorMessage } from '../api/client';
import { RevealPasswordButton } from '../components/shared/RevealPasswordButton';
import { PasswordChecklist, passwordOk } from '../components/shared/PasswordRules';
import { LEGAL } from '../legal';

const FIELD = 'w-full bg-quantum-900 border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-quantum-neon/50';

function Card({ title, icon: Icon, children }: { title: string; icon: typeof UserIcon; children: React.ReactNode }) {
  return (
    <section className="bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
      <h2 className="flex items-center gap-2 text-white font-bold text-sm mb-5">
        <Icon className="w-4 h-4 text-quantum-neon" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Banner({ kind, text }: { kind: 'ok' | 'err'; text: string }) {
  const cls = kind === 'ok'
    ? 'bg-green-950/40 border-green-800 text-green-400'
    : 'bg-red-950/40 border-red-800 text-red-400';
  return <div role={kind === 'err' ? 'alert' : 'status'} className={`border rounded-xl px-4 py-2.5 text-sm mb-4 ${cls}`}>{text}</div>;
}

/** A password box with a show/hide eye. */
function PasswordField({ id, label, value, onChange, autoComplete, problem, inputRef, describedBy }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string;
  problem?: string | null; inputRef?: React.RefObject<HTMLInputElement>; describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  const problemId = `${id}-problem`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-400 font-medium mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!problem}
          aria-describedby={[problem ? problemId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
          className={`${FIELD} pr-10 ${problem ? 'border-amber-500/70' : 'border-quantum-700'}`}
        />
        <RevealPasswordButton shown={shown} onToggle={() => setShown(s => !s)} />
      </div>
      {problem && <p id={problemId} className="text-amber-300 text-xs mt-1.5">{problem}</p>}
    </div>
  );
}

export function AccountPage() {
  const { user, isAdmin, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const id = useId();

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
  const [pwTried, setPwTried] = useState(false);   // "Change password" pressed with something missing
  const pwRefs = { current: useRef<HTMLInputElement>(null), next: useRef<HTMLInputElement>(null), confirm: useRef<HTMLInputElement>(null) };

  // ── Delete account dialog ──
  const [showDelete, setShowDelete] = useState(false);
  const [delStep, setDelStep] = useState<'confirm' | 'otp'>('confirm');
  const [delOtp, setDelOtp] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [delInfo, setDelInfo] = useState<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    accountApi.me()
      .then(p => { setProfile(p); setUsername(p.username); })
      .catch(() => { /* stale token etc. — the route guard handles auth */ });
  }, []);

  const trimmed = username.trim();
  const nameChanged = trimmed !== (profile?.username ?? '');
  const nameProblem = nameChanged && trimmed.length < 3 ? 'At least 3 characters.' : null;

  const pwProblems = {
    current: !curPw ? 'Enter your current password.' : null,
    next:    !passwordOk(newPw) ? 'A new password that meets all 4 rules below.' : null,
    confirm: !confirmPw ? 'Type the new password again.' : confirmPw !== newPw ? "This doesn't match the new password." : null,
  };
  const pwShown = (field: keyof typeof pwProblems) =>
    // A mismatch is worth saying straight away; the rest once "Change password" is pressed.
    field === 'confirm' && confirmPw && confirmPw !== newPw ? pwProblems.confirm : pwTried ? pwProblems[field] : null;

  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameMsg(null);
    if (nameProblem) return;
    setSavingName(true);
    try {
      const updated = await accountApi.updateProfile(trimmed);
      setProfile(updated);
      setUsername(updated.username);
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
    setPwTried(true);
    const firstMissing = (Object.keys(pwProblems) as (keyof typeof pwProblems)[]).find(f => pwProblems[f]);
    if (firstMissing) { pwRefs[firstMissing].current?.focus(); return; }
    setSavingPw(true);
    try {
      await accountApi.changePassword({
        current_password: curPw, new_password: newPw, confirm_new_password: confirmPw,
      });
      setCurPw(''); setNewPw(''); setConfirmPw(''); setPwTried(false);
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

  const closeDelete = useCallback(() => {
    if (delBusy) return;
    setShowDelete(false);
    deleteButtonRef.current?.focus();   // back to the button that opened it
  }, [delBusy]);

  // The dialog takes the focus (again on each step), keeps Tab inside it, and closes with Esc.
  useEffect(() => {
    if (showDelete) dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [showDelete, delStep]);
  useEffect(() => {
    if (!showDelete) return;
    const dialog = dialogRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDelete(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDelete, closeDelete]);

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
  const email = profile?.email ?? user?.email ?? '';

  return (
    <div className="min-h-screen px-4 py-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Account settings</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your profile, password and account.</p>
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
          <div aria-hidden="true" className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-white">{(profile?.username ?? user?.username ?? 'U')[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{profile?.username ?? user?.username}</p>
            <p className="text-gray-400 text-xs truncate">{email}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-500/10 text-amber-300' : 'bg-teal-500/10 text-teal-300'}`}>
                <ShieldCheck className="w-3 h-3" aria-hidden="true" /> {isAdmin ? 'Administrator' : 'User'}
              </span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" aria-hidden="true" /> Member since {memberSince}</span>
            </div>
          </div>
        </div>

        {/* Edit profile */}
        <Card title="Profile" icon={UserIcon}>
          {nameMsg && <Banner kind={nameMsg.kind} text={nameMsg.text} />}
          <form onSubmit={saveUsername} noValidate className="space-y-4">
            <div>
              <label htmlFor={`${id}-username`} className="block text-xs text-gray-400 font-medium mb-1.5">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                <input
                  id={`${id}-username`}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  maxLength={50}
                  autoComplete="username"
                  aria-invalid={!!nameProblem}
                  aria-describedby={nameProblem ? `${id}-username-problem` : undefined}
                  className={`${FIELD} pl-10 ${nameProblem ? 'border-amber-500/70' : 'border-quantum-700'}`}
                />
              </div>
              {nameProblem && <p id={`${id}-username-problem`} className="text-amber-300 text-xs mt-1.5">{nameProblem}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-email`} className="block text-xs text-gray-400 font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden="true" />
                <input
                  id={`${id}-email`}
                  value={email}
                  readOnly
                  aria-describedby={`${id}-email-note`}
                  className={`${FIELD} pl-10 border-quantum-700 bg-quantum-900/60 text-gray-300 cursor-default`}
                />
              </div>
              <p id={`${id}-email-note`} className="text-xs text-gray-400 mt-1.5">Email can't be changed: it's how you sign in.</p>
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
          <form onSubmit={savePassword} noValidate className="space-y-4">
            <PasswordField id={`${id}-current`} label="Current password" value={curPw} onChange={setCurPw}
              autoComplete="current-password" problem={pwShown('current')} inputRef={pwRefs.current} />
            <div>
              <PasswordField id={`${id}-new`} label="New password" value={newPw} onChange={setNewPw}
                autoComplete="new-password" problem={pwShown('next')} inputRef={pwRefs.next} describedBy={`${id}-rules`} />
              <PasswordChecklist password={newPw} id={`${id}-rules`} />
            </div>
            <PasswordField id={`${id}-confirm`} label="Confirm new password" value={confirmPw} onChange={setConfirmPw}
              autoComplete="new-password" problem={pwShown('confirm')} inputRef={pwRefs.confirm} />
            <button
              type="submit"
              disabled={savingPw}
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
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Delete account
          </h2>
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            {profile?.is_owner ? (
              <>This is the owner account, so it can't be deleted.</>
            ) : (
              <>
                Closes your account and signs you out. We'll email a verification code
                to <span className="text-gray-300">{email}</span> first.
                You can restore it within {LEGAL.deletedAccountDays} days by signing up again with the same
                email; after that, your account, its run history and your learning progress are permanently erased.
              </>
            )}
          </p>
          <button
            ref={deleteButtonRef}
            onClick={startDelete}
            disabled={profile?.is_owner}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-red-300 bg-red-950/40 border border-red-800 hover:bg-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
        </section>
      </div>

      {/* Delete dialog */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-delete-title`}
            className="w-full max-w-md bg-quantum-800 border border-quantum-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 id={`${id}-delete-title`} className="flex items-center gap-2 text-white font-bold">
                <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" /> Delete account
              </h2>
              <button onClick={closeDelete} aria-label="Close" className="text-gray-400 hover:text-white" disabled={delBusy}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {delErr && <Banner kind="err" text={delErr} />}

            {delStep === 'confirm' && (
              <>
                <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                  This closes <span className="text-white">{email}</span> and signs you
                  out. To continue, we'll send a 5-digit code to that email address. Signing up again
                  with it within {LEGAL.deletedAccountDays} days restores the account; after that it is
                  permanently erased, with its run history and learning progress.
                </p>
                <div className="flex gap-2">
                  <button
                    data-autofocus
                    onClick={closeDelete}
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
                <label htmlFor={`${id}-code`} className="block text-xs text-gray-400 font-medium mb-1.5">Verification code</label>
                <input
                  id={`${id}-code`}
                  data-autofocus
                  value={delOtp}
                  onChange={e => setDelOtp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="00000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={5}
                  className="w-full bg-quantum-900 border border-quantum-700 rounded-xl px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-white placeholder-gray-500 focus:outline-none focus:border-red-600 mb-4"
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
