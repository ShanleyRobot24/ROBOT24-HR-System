'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/AuthProvider';
import { useTab } from '@/lib/useTab';
import { useSticky } from '@/lib/sticky';
import { useMonth } from '@/lib/monthStore';
import { fmtDate, money } from '@/lib/format';
import { STAFF_STATUS, visaLabel, daysTo } from '@/lib/staff';
import Skeleton from '@/components/Skeleton';
import AddStaff from '@/components/AddStaff';
import StaffDrawer from '@/components/StaffDrawer';
import StaffPayroll from '@/components/StaffPayroll';
import StaffOverview from '@/components/StaffOverview';
import StaffReports from '@/components/StaffReports';
import { useSearchParams } from 'next/navigation';

function nextExpiry(s) {
  const list = [['Passport', s.passport_expiry], ['Emirates ID', s.emirates_id_expiry], ['Labour card', s.labour_card_expiry], ['Visa', s.visa_expiry]].filter(([, d]) => d);
  list.sort((a, b) => a[1].localeCompare(b[1]));
  return list[0] || null;
}

function StaffList({ staff, onOpen, onAdd }) {
  const [status, setStatus] = useState('current');
  const [q, setQ] = useState('');
  const list = staff
    .filter((s) => (status === 'current' ? s.status !== 'terminated' : status === 'all' ? true : s.status === status))
    .filter((s) => !q || `${s.full_name} ${s.job_title || ''} ${s.staff_no} ${s.nationality || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const active = staff.filter((s) => s.status === 'active');
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {[['current', 'Current'], ['active', 'Active'], ['offer', 'Offer sent'], ['terminated', 'Left'], ['all', 'All']].map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        <input className="search" placeholder="Search name, title, staff number" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <button className="btn primary" onClick={onAdd}>+ Add staff</button>
      </div>
      <p className="hint">{active.length} active, {staff.filter((s) => s.status === 'offer').length} with an offer out. Monthly salaries of active staff: {[...new Set(active.map((s) => s.currency))].map((c) => money(active.filter((s) => s.currency === c).reduce((t, s) => t + Number(s.monthly_salary || 0), 0), c)).join(' + ') || 'none'}.</p>
      {!list.length ? <p className="empty">{staff.length ? 'Nobody matches.' : 'No staff yet. Click + Add staff and upload a passport to start.'}</p> : (
        <div className="table-wrap">
          <table className="pay-table">
            <thead><tr><th>Name</th><th>Job</th><th className="r">Monthly salary</th><th>Start</th><th>Week</th><th>Visa</th><th>Next expiry</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const [l, tone] = STAFF_STATUS[s.status] || ['', 'neutral'];
                const ex = nextExpiry(s);
                const n = ex ? daysTo(ex[1]) : null;
                return (
                  <tr key={s.id} onClick={() => onOpen(s)}>
                    <td><strong>{s.full_name}</strong><span className="sub2">{s.staff_no}{s.nationality ? ` · ${s.nationality}` : ''}</span></td>
                    <td>{s.job_title || <span className="muted">Not set</span>}<span className="sub2">{s.department || ''}</span></td>
                    <td className="r num-cell">{s.monthly_salary ? money(s.monthly_salary, s.currency) : <span className="muted">·</span>}</td>
                    <td className="nowrap">{fmtDate(s.start_date) || <span className="muted">Not set</span>}</td>
                    <td>{s.work_week === 'mon_sat' ? 'Mon to Sat' : 'Mon to Fri'}</td>
                    <td className="sub-cell">{visaLabel(s.visa_status)}</td>
                    <td className="nowrap">{ex ? <><span className={n < 0 ? 'due-overdue' : n <= 60 ? 'warn-text' : ''}>{ex[0]}, {fmtDate(ex[1])}</span>{n !== null && n <= 60 && <span className="sub2">{n < 0 ? 'Expired' : `In ${n} days`}</span>}</> : <span className="muted">·</span>}</td>
                    <td><span className={`chip ${tone}`}>{l}</span>{s.status === 'terminated' && <span className="sub2">Left {fmtDate(s.termination_date)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Staff() {
  const [tab, setTab] = useTab(['overview', 'staff', 'payroll', 'reports'], 'overview');
  const { month, setMonth } = useMonth();
  const sp = useSearchParams();
  // Links to a particular month's payroll (e.g. from an approval card)
  useEffect(() => { const m = sp.get('month'); if (/^\d{4}-\d{2}-01$/.test(m || '') && m !== month) setMonth(m); }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [staff, setStaff, cached] = useSticky('staff:list', []);
  const [runs, setRuns] = useSticky('staff:runs', []);
  const [docs, setDocs] = useSticky('staff:docs', []);
  const [loaded, setLoaded] = useState(cached);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    const [st, r, d] = await Promise.all([
      supabase.from('staff').select('*').order('full_name'),
      supabase.from('payroll_runs').select('*').order('period', { ascending: false }),
      supabase.from('staff_documents').select('staff_id, doc_type'),
    ]);
    setError(st.error?.message || r.error?.message || '');
    setStaff(st.data || []);
    setRuns(r.data || []);
    setDocs(d.data || []);
    setLoaded(true);
  }, [setStaff, setRuns, setDocs]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_runs' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const waitingRuns = runs.filter((r) => r.status === 'pending_approval').length;
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p className="sub">Robot24's own team: contracts, documents, visas and salaries. For HR and finance; employees don't sign in here.</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button role="tab" className={tab === 'staff' ? 'on' : ''} onClick={() => setTab('staff')}>Staff</button>
          <button role="tab" className={tab === 'payroll' ? 'on' : ''} onClick={() => setTab('payroll')}>Payroll{waitingRuns > 0 && <span className="pill alert">{waitingRuns}</span>}</button>
          <button role="tab" className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>Reports</button>
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      {!loaded ? <Skeleton rows={6} cards={4} /> : <>
        {tab === 'overview' && <StaffOverview staff={staff} runs={runs} docs={docs} month={month} />}
        {tab === 'staff' && <StaffList staff={staff} onOpen={setOpen} onAdd={() => setAdding(true)} />}
        {tab === 'payroll' && <StaffPayroll staff={staff} month={month} run={runs.find((r) => r.period === month)} refresh={load} />}
        {tab === 'reports' && <StaffReports staff={staff} runs={runs} month={month} />}
      </>}
      {adding && <AddStaff onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); load(); setOpen(s); }} />}
      {open && <StaffDrawer key={open.id} staff={open} onClose={() => setOpen(null)} refresh={load} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="staff"><Staff /></RequireAuth></Suspense>;
}
