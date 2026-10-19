'use client';
import { useHandOff, useSticky, useTab } from '@/lib/sticky';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/AuthProvider';
import { useMonth } from '@/lib/monthStore';
import { fmtDate, money } from '@/lib/format';
import { STAFF_STATUS, visaLabel, visaTypeLabel, isOwnVisa, daysTo } from '@/lib/staff';
import { Skeleton } from '@/components/ui';
import AddStaff from '@/components/AddStaff';
import StaffDrawer from '@/components/StaffDrawer';
import StaffPayroll from '@/components/StaffPayroll';
import StaffOverview from '@/components/StaffOverview';
import StaffReports from '@/components/StaffReports';
import LeavePanel from '@/components/LeavePanel';
import OrgChart from '@/components/OrgChart';
import { EmptyState } from '@/components/ui';
import { useSearchParams } from 'next/navigation';

function nextExpiry(s) {
  const list = [['Passport', s.passport_expiry], ['Emirates ID', s.emirates_id_expiry], ['Labour card', s.labour_card_expiry], ['Work permit', s.work_permit_expiry], ['Visa', s.visa_expiry]].filter(([, d]) => d);
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
        <button className="btn primary" data-tour="add-staff" onClick={onAdd}>+ Add staff</button>
      </div>
      <p className="hint">{active.length} active, {staff.filter((s) => s.status === 'offer').length} with an offer out. Monthly salaries of active staff: {[...new Set(active.map((s) => s.currency))].map((c) => money(active.filter((s) => s.currency === c).reduce((t, s) => t + Number(s.monthly_salary || 0), 0), c)).join(' + ') || 'none'}.</p>
      {!list.length ? (staff.length ? <p className="empty">Nobody matches.</p> : <EmptyState title="No staff added yet" text="Start with their passport: the details fill themselves in." action="+ Add staff" onClick={onAdd} />) : (
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
                    <td>{s.job_title || <span className="muted">Not set</span>}<span className="sub2">{[s.department, s.manager_id && staff.find((x) => x.id === s.manager_id) && `Reports to ${staff.find((x) => x.id === s.manager_id).full_name}`].filter(Boolean).join(' · ')}</span></td>
                    <td className="r num-cell">{s.monthly_salary ? money(s.monthly_salary, s.currency) : <span className="muted">·</span>}</td>
                    <td className="nowrap">{fmtDate(s.start_date) || <span className="muted">Not set</span>}</td>
                    <td>{s.work_week === 'mon_sat' ? 'Mon to Sat' : 'Mon to Fri'}</td>
                    <td className="sub-cell">{isOwnVisa(s.visa_sponsor) ? visaTypeLabel(s.visa_sponsor) : s.visa_sponsor === 'company' ? `Company: ${visaLabel(s.visa_status)}` : visaLabel(s.visa_status)}{s.wps && <span className="sub2">WPS</span>}</td>
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
  const [tab, setTab] = useTab(['overview', 'staff', 'org', 'leave', 'payroll', 'reports'], 'overview');
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
  const [robbie, setRobbie] = useState(null); // a form Robbie filled in
  const [robbieLeave, setRobbieLeave] = useState(null);
  const [leaves, setLeaves] = useSticky('staff:leaves', []);
  const [adjustments, setAdjustments] = useSticky('staff:adjustments', []);
  const [holidays, setHolidays] = useSticky('staff:holidays', []);
  const [robbieNote, setRobbieNote] = useState('');
  useEffect(() => {
    const take = () => {
      const raw = sessionStorage.getItem('r24-staff-action');
      if (!raw) return;
      sessionStorage.removeItem('r24-staff-action');
      try { setRobbie(JSON.parse(raw)); } catch { /* ignore */ }
    };
    take();
    window.addEventListener('r24-staff-prefill', take);
    return () => window.removeEventListener('r24-staff-prefill', take);
  }, []);
  useEffect(() => {
    if (!robbie || !loaded) return;
    const a = robbie;
    setRobbie(null);
    if (a.type === 'open_payroll') return;
    if (a.type === 'record_leave' && !a.person) { setRobbieLeave({ leave_type: a.leave_type, start_date: a.start_date || '', end_date: a.end_date || a.start_date || '', reason: a.reason || '', _note: 'Filled in by Robbie. Choose the person, check it, then click Record leave.' }); return; }
    if (a.type === 'add_staff') { const { type, ...initial } = a; setAdding({ initial }); return; }
    const words = String(a.person || '').toLowerCase().split(/\s+/).filter(Boolean);
    const hits = staff.filter((s) => words.length && words.every((w) => s.full_name.toLowerCase().includes(w)));
    if (hits.length !== 1) { setRobbieNote(hits.length ? `More than one person matches "${a.person}". Open the right one from the list.` : `Robbie couldn't find "${a.person}" on the Staff list.`); return; }
    setRobbieNote('');
    if (a.type === 'edit_staff' && a.changes?.reports_to) {
      const { reports_to, ...rest } = a.changes;
      if (/^(nobody|none|no one)$/i.test(reports_to.trim())) a.changes = { ...rest, manager_id: null };
      else {
        const w = reports_to.toLowerCase().split(/\s+/).filter(Boolean);
        const m = staff.filter((x) => x.status !== 'terminated' && w.every((v) => x.full_name.toLowerCase().includes(v)));
        if (m.length !== 1) { setRobbieNote(`Robbie couldn't find one manager called "${reports_to}". Open ${hits[0].full_name} and choose Reports to yourself.`); a.changes = rest; }
        else a.changes = { ...rest, manager_id: m[0].id };
      }
      if (!Object.keys(a.changes).length) return;
    }
    if (a.type === 'record_leave') { setRobbieLeave({ staff_id: hits[0].id, leave_type: a.leave_type, start_date: a.start_date || '', end_date: a.end_date || a.start_date || '', half_day: !!a.half_day, reason: a.reason || '', _note: 'Filled in by Robbie. Check it, then click Record leave.' }); return; }
    setOpen({ ...hits[0], _prefill: a });
  }, [robbie, loaded, staff]);
  const load = useCallback(async () => {
    const [st, r, d, lv, adj, hol] = await Promise.all([
      supabase.from('staff').select('*').order('full_name'),
      supabase.from('payroll_runs').select('*').order('period', { ascending: false }),
      supabase.from('staff_documents').select('staff_id, doc_type'),
      supabase.from('leave_requests').select('*').order('start_date'),
      supabase.from('leave_adjustments').select('*'),
      supabase.from('public_holidays').select('*').order('day'),
    ]);
    setLeaves(lv.data || []);
    setAdjustments(adj.data || []);
    setHolidays(hol.data || []);
    setError(st.error?.message || r.error?.message || '');
    setStaff(st.data || []);
    setRuns(r.data || []);
    setDocs(d.data || []);
    setLoaded(true);
  }, [setStaff, setRuns, setDocs, setLeaves, setAdjustments, setHolidays]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('staff-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_runs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const findStaff = (name) => { const w = String(name || '').toLowerCase().split(/\s+/).filter(Boolean); const m = staff.filter((x) => x.status !== 'terminated' && w.length && w.every((v) => x.full_name.toLowerCase().includes(v))); return m.length === 1 ? m[0] : null; };
  useHandOff('staff:docfile', (h) => { const p = findStaff(h.person); if (!p) { setRobbieNote(`Robbie couldn't find "${h.person}" on the Staff list. Open their profile and upload it there.`); return; } setOpen({ ...p, _prefill: { type: 'doc_file', doc_type: h.doc_type, file: h.file } }); }, loaded);
  useHandOff('leave:record', (h) => { const p = findStaff(h.person); setRobbieLeave({ staff_id: p?.id || '', leave_type: h.leave_type, start_date: h.start_date || '', end_date: h.end_date || h.start_date || '', file: h.file, _note: `Filled in by Robbie with the certificate attached.${p ? '' : ` Choose the person (no one matched "${h.person}").`} Check it, then click Record leave.` }); }, loaded);
  const waitingRuns = runs.filter((r) => r.status === 'pending_approval').length;
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>{{ overview: 'HR overview', staff: 'Staff', org: 'Org chart', leave: 'Leave', payroll: 'Payroll', reports: 'HR reports' }[tab]}</h1>
          <p className="sub">Robot24's own team: contracts, documents, visas and salaries. For HR and finance; employees don't sign in here.</p>
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      {robbieNote && <p className="note-bar">{robbieNote}</p>}
      {!loaded ? <Skeleton rows={6} cards={4} /> : <>
        {tab === 'overview' && <StaffOverview staff={staff} runs={runs} docs={docs} month={month} leaves={leaves} adjustments={adjustments} />}
        {tab === 'org' && <OrgChart staff={staff} refresh={load} onOpen={setOpen} />}
        {tab === 'leave' && <LeavePanel staff={staff} leaves={leaves} adjustments={adjustments} holidays={holidays} month={month} refresh={load} robbieLeave={robbieLeave} clearRobbie={() => setRobbieLeave(null)} />}
        {tab === 'staff' && <StaffList staff={staff} onOpen={setOpen} onAdd={() => setAdding(true)} />}
        {tab === 'payroll' && <StaffPayroll staff={staff} month={month} run={runs.find((r) => r.period === month)} runs={runs} refresh={load} leaves={leaves} holidays={holidays} />}
        {tab === 'reports' && <StaffReports staff={staff} runs={runs} month={month} />}
      </>}
      {adding && <AddStaff existing={staff} initial={adding.initial} onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); load(); setOpen(s); }} />}
      {open && <StaffDrawer allStaff={staff} leaves={leaves.filter((l) => l.staff_id === open.id)} adjustments={adjustments.filter((a) => a.staff_id === open.id)} holidays={holidays} key={open.id + (open._prefill ? `${open._prefill.type}:${open._prefill.doc_type || ''}:${Date.now() % 100000}` : '')} staff={open} prefill={open._prefill} onClose={() => setOpen(null)} refresh={load} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="staff"><Staff /></RequireAuth></Suspense>;
}
