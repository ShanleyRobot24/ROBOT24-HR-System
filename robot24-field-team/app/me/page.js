'use client';
import { useHandOff, useSticky, useTab } from '@/lib/sticky';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth, useAuth } from '@/components/AuthProvider';
import { fmtDate } from '@/lib/format';
import { WORK_WEEK } from '@/lib/payroll';
import { balances, leaveLabel, LEAVE_STATUS } from '@/lib/leave';
import { docLabel, visaTypeLabel, visaLabel, daysTo } from '@/lib/staff';
import LeaveForm from '@/components/LeaveForm';
import { Skeleton, EmptyState } from '@/components/ui';

// My Robot24: an employee's own details, documents and leave. Never salaries or anyone else's data.
function Me() {
  const { profile } = useAuth();
  const [tab, setTab] = useTab(['overview', 'leave', 'documents', 'team'], 'overview');
  const [d, setD, cached] = useSticky('me:data', null);
  const [loaded, setLoaded] = useState(cached);
  const [asking, setAsking] = useState(null);
  const load = useCallback(async () => {
    const [me, docs, lv, adj, hol, team] = await Promise.all([
      supabase.rpc('my_staff'), supabase.rpc('my_documents'),
      supabase.from('leave_requests').select('*').order('start_date', { ascending: false }),
      supabase.from('leave_adjustments').select('*'),
      supabase.from('public_holidays').select('*').order('day'),
      supabase.rpc('my_team'),
    ]);
    const mine = (me.data || [])[0] || null;
    // Leave visible to me is my own plus my team's (if I manage anyone)
    const all = lv.data || [], adjAll = adj.data || [];
    setD({ me: mine, docs: docs.data || [], leaves: all.filter((l) => l.staff_id === mine?.id), adjustments: adjAll.filter((a) => a.staff_id === mine?.id), holidays: hol.data || [],
      team: team.data || [], teamLeaves: all.filter((l) => l.staff_id !== mine?.id), teamAdjustments: adjAll.filter((a) => a.staff_id !== mine?.id) });
    setLoaded(true);
  }, [setD]);
  useEffect(() => { load(); }, [load]);
  // A leave request Robbie filled in
  useEffect(() => {
    const take = () => { const raw = sessionStorage.getItem('r24-me-leave'); if (!raw) return; sessionStorage.removeItem('r24-me-leave'); try { setAsking(JSON.parse(raw)); setTab('leave'); } catch { /* ignore */ } };
    take(); window.addEventListener('r24-me-prefill', take); return () => window.removeEventListener('r24-me-prefill', take);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const ch = supabase.channel('me-live').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load]);

  useHandOff('me:leavefile', (h) => { setAsking({ leave_type: h.leave_type || 'sick', start_date: h.start_date || '', end_date: h.end_date || h.start_date || '', file: h.file, _note: 'Filled in by Robbie with your certificate attached. Check the dates, then click Send request.' }); setTab('leave'); }, loaded);
  useHandOff('me:cancel', async (h) => {
    const mine = (d?.leaves || []).filter((l) => ['pending', 'approved'].includes(l.status) && (!h.start_date || l.start_date === h.start_date) && (!h.leave_type || l.leave_type === h.leave_type));
    if (!mine.length) return alert('Robbie couldn\'t find a request like that to cancel.');
    const l = mine[0];
    if (l.status === 'approved') return alert('That leave is already approved: ask HR to cancel it.');
    if (!confirm(`Cancel your ${l.leave_type} leave request from ${l.start_date}?`)) return;
    const { error } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', l.id);
    if (error) return alert(error.message);
    load();
  }, loaded);
  if (!loaded || !d) return <div className="wrap"><Skeleton rows={4} cards={3} /></div>;
  if (!d.me) return <div className="wrap"><div className="page-head"><h1>My Robot24</h1></div><p className="empty">Your login isn't linked to your staff record yet. Ask HR to link it in Admin &gt; Users.</p></div>;
  const me = d.me;
  const b = balances(me, d.leaves, d.adjustments);
  const today = new Date().toISOString().slice(0, 10);
  const first = (me.full_name || profile?.full_name || '').split(' ')[0];
  const coming = d.leaves.filter((l) => ['pending', 'approved'].includes(l.status) && l.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const holidays = d.holidays.filter((h) => h.day >= today).slice(0, 6);
  async function cancel(l) {
    if (!confirm('Cancel this leave request?')) return;
    const { error } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', l.id);
    if (error) return alert(error.message);
    load();
  }
  const expiring = [['Passport', me.passport_expiry], ['Emirates ID', me.emirates_id_expiry], ['Labour card', me.labour_card_expiry], ['Work permit', me.work_permit_expiry], ['Visa', me.visa_expiry]].filter(([, x]) => x);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>{tab === 'overview' ? `Hi ${first}` : tab === 'leave' ? 'My leave' : tab === 'team' ? 'My team' : 'My documents'}</h1>
          <p className="sub">{me.job_title || ''}{me.department ? ` · ${me.department}` : ''} · {me.staff_no}</p>
        </div>
        <button className="btn primary" data-tour="me-request" onClick={() => setAsking({})}>+ Request leave</button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="leave-cards" data-tour="me-balances">
            <div className="proj-card total"><h3>Annual leave</h3><p className="kpi-num">{b.annualAfterBooked} days</p><p className="kpi-sub">available{b.booked ? `, after ${b.booked} booked` : ''}{b.pending ? ` · ${b.pending} waiting` : ''}</p></div>
            <div className="proj-card"><h3>Sick leave this year</h3><p className="kpi-num">{b.sick.used} days</p><p className="kpi-sub">{b.inProbation ? `Probation until ${fmtDate(b.probationEnd)}` : `${b.sick.fullLeft} days left at full pay`}</p></div>
            {b.toil > 0 && <div className="proj-card planned"><h3>Time off in lieu</h3><p className="kpi-num">{b.toil} days</p><p className="kpi-sub">earned, not yet taken</p></div>}
          </div>
          <div className="week-grid">
            <section className="chart-card">
              <h3>Coming up</h3>
              {!coming.length ? <p className="empty">No leave booked. Click Request leave to ask for time off.</p> : (
                <ul className="week-list">{coming.map((l) => { const [t, tone] = LEAVE_STATUS[l.status]; return <li key={l.id}><span className="week-flag">🗓</span><span><strong>{leaveLabel(l.leave_type)}</strong><span className="sub2">{fmtDate(l.start_date)}{l.end_date !== l.start_date ? ` to ${fmtDate(l.end_date)}` : ''} · {l.days} day{l.days === 1 ? '' : 's'}</span></span><span className={`chip ${tone}`}>{t}</span></li>; })}</ul>
              )}
            </section>
            <section className="chart-card">
              <h3>Public holidays</h3>
              {!holidays.length ? <p className="empty">None announced yet.</p> : <ul className="week-list">{holidays.map((h) => <li key={h.day}><span className="week-flag">🎉</span><span><strong>{h.name}</strong><span className="sub2">{fmtDate(h.day)}</span></span></li>)}</ul>}
            </section>
          </div>
          <section className="chart-card">
            <h3>My details</h3>
            <dl className="me-details">
              <dt>Reports to</dt><dd>{me.manager_name ? `${me.manager_name}${me.manager_title ? `, ${me.manager_title}` : ''}` : 'Not set'}</dd>
              <dt>Started</dt><dd>{fmtDate(me.start_date) || 'Not set'}</dd>
              <dt>Working days</dt><dd>{WORK_WEEK[me.work_week] || 'Not set'}</dd>
              <dt>Visa</dt><dd>{visaTypeLabel(me.visa_sponsor)}{me.visa_sponsor === 'company' ? `, ${visaLabel(me.visa_status)}` : ''}</dd>
              <dt>Probation</dt><dd>{b.inProbation ? `Until ${fmtDate(b.probationEnd)}` : 'Completed'}</dd>
            </dl>
            <p className="hint">Something wrong? Tell HR and they will correct it.</p>
          </section>
        </>
      )}

      {tab === 'leave' && (
        !d.leaves.length ? <EmptyState title="No leave yet" text="Ask for annual leave, sick leave or any other time off. HR approves it and you can follow it here." action="+ Request leave" onClick={() => setAsking({})} /> : (
          <div className="table-wrap" data-tour="me-leave-list">
            <table className="pay-table">
              <thead><tr><th>Leave</th><th>Dates</th><th className="r">Days</th><th>Status</th><th /></tr></thead>
              <tbody>{d.leaves.map((l) => { const [t, tone] = LEAVE_STATUS[l.status]; return (
                <tr key={l.id}>
                  <td>{leaveLabel(l.leave_type)}{l.reason && <span className="sub2">{l.reason}</span>}</td>
                  <td className="nowrap">{fmtDate(l.start_date)}{l.end_date !== l.start_date && <> to {fmtDate(l.end_date)}</>}{l.half_day && <span className="sub2">Half day</span>}</td>
                  <td className="r num-cell">{l.days}</td>
                  <td><span className={`chip ${tone}`}>{t}</span>{l.decision_note && <span className="sub2">{l.decision_note}</span>}</td>
                  <td className="actions">{l.status === 'pending' && <button className="btn sm ghost" onClick={() => cancel(l)}>Cancel</button>}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        )
      )}

      {tab === 'team' && <MyTeam team={d.team || []} leaves={d.teamLeaves || []} adjustments={d.teamAdjustments || []} reload={load} />}

      {tab === 'documents' && (
        <>
          {expiring.length > 0 && (
            <div className="leave-cards" data-tour="me-expiry">
              {expiring.map(([what, date]) => { const n = daysTo(date); return <div key={what} className={`proj-card ${n < 0 ? 'committed' : n <= 60 ? 'planned' : ''}`}><h3>{what}</h3><p className="kpi-num" style={{ fontSize: 18 }}>{fmtDate(date)}</p><p className="kpi-sub">{n < 0 ? 'Expired: tell HR' : n <= 60 ? `Expires in ${n} days: tell HR` : 'Valid'}</p></div>; })}
            </div>
          )}
          {!d.docs.length ? <p className="empty">HR hasn't added any documents for you yet.</p> : (
            <ul className="files-list">{d.docs.map((x, i) => <li key={i}><span><strong>{docLabel(x.doc_type)}</strong>{x.is_signed && <span className="chip ok">Signed</span>}<span className="sub2">{x.expires_on ? `Expires ${fmtDate(x.expires_on)} · ` : ''}added {fmtDate(x.created_at?.slice(0, 10))}</span></span></li>)}</ul>
          )}
          <p className="hint">HR keeps your documents. To update one, send the new copy to HR.</p>
        </>
      )}

      {asking && <LeaveForm approverName={me.manager_name} me={me} leaves={d.leaves.map((l) => ({ ...l, staff_id: me.id }))} adjustments={d.adjustments.map((a) => ({ ...a, staff_id: me.id }))} holidays={d.holidays}
        initial={Object.keys(asking).length ? { ...asking, staff_id: me.id } : null} onClose={() => setAsking(null)} onSaved={() => { setAsking(null); setTab('leave'); load(); }} />}
    </div>
  );
}

function MyTeam({ team, leaves, adjustments, reload }) {
  const today = new Date().toISOString().slice(0, 10);
  const waiting = leaves.filter((l) => l.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const coming = leaves.filter((l) => l.status === 'approved' && l.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const name = (id) => team.find((t) => t.id === id)?.full_name || 'Someone';
  async function decide(l, status) {
    let decision_note = null;
    if (status === 'rejected') { decision_note = prompt(`Why is ${name(l.staff_id)}'s leave rejected? They will see this.`); if (decision_note === null) return; if (!decision_note.trim()) return alert('Please give a reason.'); }
    const { error } = await supabase.from('leave_requests').update({ status, decision_note }).eq('id', l.id);
    if (error) return alert(error.message);
    reload();
  }
  if (!team.length) return <p className="empty">Nobody reports to you on the org chart.</p>;
  return (
    <>
      <h2 className="home-h">Waiting for you ({waiting.length})</h2>
      {!waiting.length ? <p className="empty">No leave waiting for your approval.</p> : (
        <div className="table-wrap" data-tour="me-team">
          <table className="pay-table">
            <thead><tr><th>Who</th><th>Leave</th><th>Dates</th><th className="r">Days</th><th>Annual left</th><th /></tr></thead>
            <tbody>{waiting.map((l) => { const p = team.find((t) => t.id === l.staff_id); const b = p ? balances(p, leaves.filter((x) => x.staff_id === p.id && x.id !== l.id), adjustments.filter((a) => a.staff_id === p.id)) : null; return (
              <tr key={l.id}>
                <td><strong>{name(l.staff_id)}</strong><span className="sub2">{p?.job_title}</span></td>
                <td>{leaveLabel(l.leave_type)}{l.reason && <span className="sub2">{l.reason}</span>}</td>
                <td className="nowrap">{fmtDate(l.start_date)}{l.end_date !== l.start_date && <> to {fmtDate(l.end_date)}</>}{l.half_day && <span className="sub2">Half day</span>}</td>
                <td className="r num-cell">{l.days}</td>
                <td className="sub-cell">{b && l.leave_type === 'annual' ? `${b.annualAfterBooked} days` : ''}</td>
                <td className="actions nowrap"><button className="btn sm primary" onClick={() => decide(l, 'approved')}>Approve</button><button className="btn sm danger" onClick={() => decide(l, 'rejected')}>Reject</button></td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
      <div className="week-grid">
        <section className="chart-card">
          <h3>My team ({team.length})</h3>
          <ul className="week-list">{team.map((t) => { const b = balances(t, leaves.filter((l) => l.staff_id === t.id), adjustments.filter((a) => a.staff_id === t.id)); const off = leaves.some((l) => l.staff_id === t.id && l.status === 'approved' && l.leave_type !== 'wfh' && l.start_date <= today && l.end_date >= today); return <li key={t.id}><span className="week-flag">👤</span><span><strong>{t.full_name}</strong><span className="sub2">{t.job_title} · {b.annualAfterBooked} days annual leave left</span></span>{off && <span className="chip warn">Off today</span>}</li>; })}</ul>
        </section>
        <section className="chart-card">
          <h3>Coming up</h3>
          {!coming.length ? <p className="empty">No approved leave coming up.</p> : <ul className="week-list">{coming.map((l) => <li key={l.id}><span className="week-flag">🗓</span><span><strong>{name(l.staff_id)}</strong> · {leaveLabel(l.leave_type)}<span className="sub2">{fmtDate(l.start_date)}{l.end_date !== l.start_date ? ` to ${fmtDate(l.end_date)}` : ''}</span></span></li>)}</ul>}
        </section>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="me"><Me /></RequireAuth></Suspense>;
}
