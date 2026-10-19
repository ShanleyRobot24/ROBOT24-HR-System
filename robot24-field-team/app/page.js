'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import { Icon } from '@/components/Brand';

// The gate: people with Staff access choose the Field team portal or the Staff portal.
// Everyone else goes straight to the field team.
export default function Gate() {
  const { session, loading, profile, isStaff, isFinance, isApprover, isPayrollApprover, hasMe, isEmployee } = useAuth();
  const portalCount = (isEmployee ? 0 : 1) + (isStaff ? 1 : 0) + (hasMe ? 1 : 0);
  const router = useRouter();
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile && portalCount < 2) router.replace(isEmployee ? '/me' : '/home');
  }, [loading, session, profile, portalCount, isEmployee, router]);

  useEffect(() => {
    if (portalCount < 2) return;
    const in60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      isFinance ? supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'draft') : null,
      isApprover ? supabase.rpc('approval_queue', { p_status: 'pending_approval', p_period: null }) : null,
      isStaff ? supabase.from('payroll_runs').select('status') : null,
      isStaff ? supabase.from('staff').select('status, passport_expiry, emirates_id_expiry, labour_card_expiry, work_permit_expiry, visa_expiry') : null,
      isStaff ? supabase.from('leave_requests').select('status').eq('status', 'pending') : null,
      hasMe ? supabase.from('leave_requests').select('status, staff_id').eq('status', 'pending') : null,
      hasMe ? supabase.rpc('my_team') : null,
    ]).then(([drafts, waiting, runs, staff, leaveWaiting, myLeave, myTeam]) => {
      const teamIds = new Set((myTeam?.data || []).map((x) => x.id));
      const live = (staff?.data || []).filter((s) => s.status !== 'terminated');
      setCounts({
        drafts: drafts?.count || 0,
        waiting: (waiting?.data || []).length,
        payroll: (runs?.data || []).filter((r) => r.status === (isPayrollApprover ? 'pending_approval' : 'rejected')).length,
        expiring: live.filter((s) => [s.passport_expiry, s.emirates_id_expiry, s.labour_card_expiry, s.work_permit_expiry, s.visa_expiry].some((d) => d && d <= in60)).length,
        offers: live.filter((s) => s.status === 'offer').length,
        active: live.filter((s) => s.status === 'active').length,
        leaveWaiting: (leaveWaiting?.data || []).length,
        myPending: (myLeave?.data || []).filter((l) => l.staff_id === profile?.staff_id).length,
        teamWaiting: (myLeave?.data || []).filter((l) => teamIds.has(l.staff_id)).length,
      });
    });
  }, [portalCount, isStaff, isFinance, isApprover, isPayrollApprover, hasMe, profile?.staff_id]);

  if (loading || !session || !profile || portalCount < 2) return null;
  const first = (profile.full_name || profile.email || '').split(/[\s@.]/)[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const tags = (list) => list.filter(([n]) => n > 0).map(([n, t, tone, one]) => <span key={t} className={`chip ${tone}`}>{n} {n === 1 && one ? one : t}</span>);

  return (
    <div className="wrap gate">
      <h1>{hello}{name ? `, ${name}` : ''}</h1>
      <p className="sub">Where would you like to work?</p>
      <div className="gate-grid" data-tour="gate">
        {!isEmployee && <Link href="/home" className="gate-card">
          <span className="gate-icon"><Icon name="jobs" size={34} /></span>
          <span className="gate-title">Field team</span>
          <span className="gate-text">Freelance journalists and videographers: people, jobs and travel{isFinance ? ', invoices and payments, and reports' : ''}.</span>
          <span className="gate-tags">{counts && tags([[counts.waiting, 'waiting for your approval', 'alert'], [counts.drafts, 'bills to check', 'info', 'bill to check']])}</span>
          <span className="gate-go">Open Field team →</span>
        </Link>}
        {isStaff && <Link href="/staff" className="gate-card">
          <span className="gate-icon"><Icon name="staff" size={34} /></span>
          <span className="gate-title">HR</span>
          <span className="gate-text">Robot24 employees: profiles, documents and visas, leave, payroll and approvals, and reports.</span>
          <span className="gate-tags">{counts && tags([[counts.payroll, isPayrollApprover ? 'payroll to approve' : 'payroll rejected', 'alert'], [counts.leaveWaiting, 'leave requests waiting', 'alert', 'leave request waiting'], [counts.expiring, 'documents expiring', 'warn', 'document expiring'], [counts.offers, 'offers out', 'info', 'offer out']])}</span>
          <span className="gate-go">Open HR →</span>
        </Link>}
        {hasMe && <Link href="/me" className="gate-card">
          <span className="gate-icon"><Icon name="people" size={34} /></span>
          <span className="gate-title">My Robot24</span>
          <span className="gate-text">Your own leave balances and requests, your documents and your details.</span>
          <span className="gate-tags">{counts && tags([[counts.teamWaiting, 'team requests to approve', 'alert', 'team request to approve'], [counts.myPending, 'of your requests waiting', 'warn', 'request waiting']])}</span>
          <span className="gate-go">Open My Robot24 →</span>
        </Link>}
      </div>
      <p className="hint">Switch any time with the buttons at the top of the page.</p>
    </div>
  );
}
