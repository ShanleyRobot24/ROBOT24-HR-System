'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import Wordmark from '@/components/Wordmark';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => { if (session) router.replace('/'); }, [session, router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (!error) return;
    const m = error.message || '';
    if (!process.env.R24_SUPABASE_URL || !process.env.R24_SUPABASE_KEY) setError('The app is missing its Supabase settings. Add them in Vercel for this environment, then redeploy.');
    else if (/invalid login credentials/i.test(m)) setError('Email or password is wrong. An admin can reset your password.');
    else if (/email not confirmed/i.test(m)) setError('This account is not confirmed yet. An admin needs to confirm it in Supabase.');
    else if (/fetch|network/i.test(m)) setError('Cannot reach Supabase. Check the Supabase URL in Vercel, then redeploy.');
    else if (/api key|apikey/i.test(m)) setError('The Supabase publishable key in Vercel is wrong. Re-copy it, then redeploy.');
    else setError(`Sign in failed: ${m}`);
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <Wordmark big sub="Field Team portal" />
        <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="err">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
      </form>
    </div>
  );
}
