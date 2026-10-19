'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Wordmark } from '@/components/Brand';

// Opened from the reset email: Supabase signs them in from the link, then they choose a new password.
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(null); // null checking, true link ok, false expired
  const [pw, setPw] = useState({ a: '', b: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => { if (session) setReady(true); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    const t = setTimeout(() => setReady((r) => (r === null ? false : r)), 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);
  async function save(e) {
    e.preventDefault();
    if (pw.a.length < 8) return setMsg('Use at least 8 characters.');
    if (pw.a !== pw.b) return setMsg('The two passwords do not match.');
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password: pw.a, data: { must_change_password: false } });
    setBusy(false);
    if (error) return setMsg(/same|different/i.test(error.message) ? 'Choose a password you have not used before.' : error.message);
    setDone(true);
    setTimeout(() => router.replace('/'), 1500);
  }
  return (
    <div className="login">
      <form onSubmit={save} className="login-card">
        <Wordmark big sub="Robot24 portal" />
        <h2 className="login-h">Choose a new password</h2>
        {ready === null && <p className="hint">Checking your link…</p>}
        {ready === false && (
          <>
            <p>This link has expired or was already used.</p>
            <a className="btn primary" href="/login">Back to sign in</a>
            <p className="hint">On the sign-in page, click Forgot your password? to get a new link.</p>
          </>
        )}
        {ready && !done && (
          <>
            <label>New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoFocus /></label>
            <label>Type it again<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></label>
            {msg && <p className="err">{msg}</p>}
            <p className="hint">At least 8 characters.</p>
            <button className="btn primary" disabled={busy}>{busy ? 'Saving' : 'Save new password'}</button>
          </>
        )}
        {done && <p className="cred-ok">Password changed. Taking you in…</p>}
      </form>
    </div>
  );
}
