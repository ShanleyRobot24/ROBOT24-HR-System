'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const AuthCtx = createContext({ session: null, profile: null, loading: true, isFinance: false, isAdmin: false, isApprover: false, isAssignments: false });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) { setProfile(null); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data }) => {
      setProfile(data);
      setLoading(false);
    });
  }, [uid]);

  const isAdmin = profile?.role === 'admin';
  const isFinance = profile?.role === 'hr_finance' || isAdmin;
  const isApprover = !!profile?.is_approver;
  // Production and the assignment team share one level: directory, assignments and travel
  // The Staff portal is HR and finance's tool; the Staff access tick adds anyone else
  // The Staff portal is HR and finance's (and admins'). Production never has it.
  const isStaff = isFinance;
  const isPayrollApprover = isStaff && isApprover;
  // My Robot24: anyone whose login is linked to their own staff record. Employees only ever see that.
  const hasMe = !!profile?.staff_id;
  const isEmployee = profile?.role === 'employee';
  const isAssignments = profile?.role === 'production' || profile?.role === 'assignments' || isFinance;
  return (
    <AuthCtx.Provider value={{ session, profile, loading, isFinance, isAdmin, isApprover, isAssignments, isStaff, isPayrollApprover, hasMe, isEmployee }}>
      {children}
      {session?.user?.user_metadata?.must_change_password && <ChooseOwnPassword email={session.user.email} />}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

function GoHome({ to = '/home' }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [router, to]);
  return null;
}

// need: 'finance' | 'admin' | 'approver' | 'assignments'
export function RequireAuth({ need, children }) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.session) router.replace('/login');
  }, [auth.loading, auth.session, router]);
  if (auth.loading || !auth.session) return <div className="page-msg">Loading</div>;
  const ok = !need || (need === 'finance' && auth.isFinance) || (need === 'admin' && auth.isAdmin) || (need === 'approver' && auth.isApprover) || (need === 'assignments' && auth.isAssignments) || (need === 'money' && (auth.isFinance || auth.isApprover)) || (need === 'staff' && auth.isStaff);
  if (auth.isEmployee && need !== 'me') return <GoHome to="/me" />; // employees only have My Robot24
  if (need === 'me') return auth.hasMe ? children : <GoHome />;
  if (!ok && need === 'staff') return <GoHome />; // production never sees the Staff portal, not even a 'no access' page
  if (!ok) return <div className="page-msg">You don't have access to this page. Ask an admin if you need it.</div>;
  return children;
}


// Signed in with a temporary password (new login or reset by HR): choose your own before going on.
function ChooseOwnPassword({ email }) {
  const path = usePathname();
  const [pw, setPw] = useState({ a: '', b: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (path === '/reset-password' || path === '/login') return null;
  async function save(e) {
    e.preventDefault();
    if (pw.a.length < 8) return setMsg('Use at least 8 characters.');
    if (pw.a !== pw.b) return setMsg('The two passwords do not match.');
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password: pw.a, data: { must_change_password: false } });
    setBusy(false);
    if (error) return setMsg(/same|different/i.test(error.message) ? 'Choose a new password, not the temporary one.' : error.message);
    await supabase.auth.refreshSession();
  }
  return (
    <div className="force-pw" role="dialog" aria-label="Choose your own password">
      <form className="login-card" onSubmit={save}>
        <h2 className="login-h">Choose your own password</h2>
        <p className="hint">You signed in as {email} with a temporary password. Choose your own to carry on; only you will know it.</p>
        <label>New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoFocus /></label>
        <label>Type it again<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></label>
        {msg && <p className="err">{msg}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving' : 'Save my password'}</button>
        <button type="button" className="link-btn login-switch" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </form>
    </div>
  );
}
