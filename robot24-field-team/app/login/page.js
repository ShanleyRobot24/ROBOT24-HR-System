'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import { Wordmark } from '@/components/Brand';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState(false);
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => { if (session) router.replace('/'); }, [session, router]);

  // Forgot password: Supabase emails a link to /reset-password. The same message shows whether or not the email has an account.
  async function sendReset(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error && /rate|seconds|too many/i.test(error.message || '')) return setError('Too many requests just now. Wait a few minutes, then try again.');
    setSent(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (!error) return;
    const m = error.message || '';
    if (!process.env.R24_SUPABASE_URL || !process.env.R24_SUPABASE_KEY) setError('The app is missing its Supabase settings. Add them in Vercel for this environment, then redeploy.');
    else if (/invalid login credentials/i.test(m)) setError('Email or password is wrong. Click Forgot your password? below to set a new one.');
    else if (/email not confirmed/i.test(m)) setError('This account is not confirmed yet. An admin needs to confirm it in Supabase.');
    else if (/fetch|network/i.test(m)) setError('Cannot reach Supabase. Check the Supabase URL in Vercel, then redeploy.');
    else if (/api key|apikey/i.test(m)) setError('The Supabase publishable key in Vercel is wrong. Re-copy it, then redeploy.');
    else setError(`Sign in failed: ${m}`);
  }

  return (
    <div className="login">
      {forgot ? (
        <form onSubmit={sendReset} className="login-card">
          <Wordmark big sub="Robot24 portal" />
          <h2 className="login-h">Reset your password</h2>
          {sent ? (
            <>
              <p>If <strong>{email}</strong> has an account, an email with a reset link is on its way. Open it on this device and choose a new password.</p>
              <p className="hint">Nothing arrived after a few minutes? Check your junk folder, or ask HR to reset it for you.</p>
            </>
          ) : (
            <>
              <p className="hint">Enter your work email and we'll send you a link to choose a new password.</p>
              <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus /></label>
              {error && <p className="err">{error}</p>}
              <button className="btn primary" disabled={busy}>{busy ? 'Sending' : 'Email me a reset link'}</button>
            </>
          )}
          <button type="button" className="link-btn login-switch" onClick={() => { setForgot(false); setSent(false); setError(''); }}>Back to sign in</button>
        </form>
      ) : (
        <form onSubmit={submit} className="login-card">
          <Wordmark big sub="Robot24 portal" />
          <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          {error && <p className="err">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
          <button type="button" className="link-btn login-switch" onClick={() => { setForgot(true); setError(''); }}>Forgot your password?</button>
        </form>
      )}
    </div>
  );
}
