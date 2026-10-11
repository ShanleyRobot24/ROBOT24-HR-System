'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const isStaff = isFinance || !!profile?.staff_access;
  const isPayrollApprover = isStaff && isApprover;
  const isAssignments = profile?.role === 'production' || profile?.role === 'assignments' || isFinance;
  return <AuthCtx.Provider value={{ session, profile, loading, isFinance, isAdmin, isApprover, isAssignments, isStaff, isPayrollApprover }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

// need: 'finance' | 'admin' | 'approver' | 'assignments'
export function RequireAuth({ need, children }) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.session) router.replace('/login');
  }, [auth.loading, auth.session, router]);
  if (auth.loading || !auth.session) return <div className="page-msg">Loading</div>;
  const ok = !need || (need === 'finance' && auth.isFinance) || (need === 'admin' && auth.isAdmin) || (need === 'approver' && auth.isApprover) || (need === 'assignments' && auth.isAssignments) || (need === 'money' && (auth.isFinance || auth.isApprover)) || (need === 'staff' && auth.isStaff);
  if (!ok) return <div className="page-msg">You don't have access to this page. Ask an admin if you need it.</div>;
  return children;
}
