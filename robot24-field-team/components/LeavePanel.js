'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';
import { fmtDate, monthLabel, toCSV, openFile } from '@/lib/format';
import { LEAVE_STATUS, leaveLabel, balances, countedDates } from '@/lib/leave';
import LeaveForm from './LeaveForm';
import { EmptyState } from './ui';
import { useHandOff } from '@/lib/sticky';

const iso = (t) => new Date(t).toISOString().slice(0, 10);

function Requests({ staff, leaves, adjustments, holidays, refresh, onRecord }) {
  const { isPayrollApprover } = useAuth();
  const [show, setShow] = useState('waiting');
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));
  const list = leaves
    .filter((l) => (show === 'waiting' ? l.status === 'pending' : show === 'upcoming' ? l.status === 'approved' && l.end_date >= iso(Date.now()) : true))
    .sort((a, b) => (show === 'all' ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)));
  async function decide(l, status) {
    let decision_note = null;
    if (status === 'rejected') { decision_note = prompt('Why is this leave rejected? The person will see this.'); if (decision_note === null) return; if (!decision_note.trim()) return alert('Please give a reason.'); }
    if (status === 'cancelled' && !confirm('Cancel this leave? The days go back on their balance.')) return;
    const { error } = await supabase.from('leave_requests').update({ status, decision_note }).eq('id', l.id);
    if (error) return alert(error.message);
    refresh();
  }
  return (
    <>
      <div className="toolbar">
        <div className="seg">{[['waiting', 'Waiting'], ['upcoming', 'Approved, coming up'], ['all', 'All']].map(([k, t]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{t}{k === 'waiting' && leaves.some((l) => l.status === 'pending') && <span className="pill alert">{leaves.filter((l) => l.status === 'pending').length}</span>}</button>)}</div>
        <span className="spacer" />
        <button className="btn primary" data-tour="record-leave" onClick={onRecord}>+ Record leave</button>
      </div>
      <p className="hint">Leave goes to the person's manager (set on the Org chart). HR approvers can approve or reject anything{isPayrollApprover ? ', so you can step in when a manager is away' : ''}.</p>
      {!list.length ? <EmptyState title={show === 'waiting' ? 'No leave waiting for approval' : 'No leave here'} text="Leave requested in My Robot24, or recorded here, appears in this list." action="+ Record leave" onClick={onRecord} /> : (
        <div className="table-wrap">
          <table className="pay-table">
            <thead><tr><th>Who</th><th>Leave</th><th>Dates</th><th className="r">Days</th><th>Balance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((l) => {
                const s = byId[l.staff_id];
                const b = s ? balances(s, leaves.filter((x) => x.staff_id === s.id && x.id !== l.id), adjustments.filter((a) => a.staff_id === s.id)) : null;
                const [st, tone] = LEAVE_STATUS[l.status];
                return (
                  <tr key={l.id}>
                    <td><strong>{s?.full_name || 'Unknown'}</strong><span className="sub2">{l.by_employee ? 'Requested in My Robot24' : `Recorded by ${l.requested_by_email || 'HR'}`}</span></td>
                    <td>{leaveLabel(l.leave_type)}{l.reason && <span className="sub2">{l.reason}</span>}{l.attachment_path && <button className="link-btn" onClick={() => openFile(supabase, 'staff', l.attachment_path)}>Open attachment</button>}</td>
                    <td className="nowrap">{fmtDate(l.start_date)}{l.end_date !== l.start_date && <> to {fmtDate(l.end_date)}</>}{l.half_day && <span className="sub2">Half day</span>}</td>
                    <td className="r num-cell">{l.days}</td>
                    <td className="sub-cell">{b && (l.leave_type === 'annual' ? `${b.annualAfterBooked} annual left` : l.leave_type === 'sick' ? `${b.sick.used} sick used this year${b.inProbation ? ', on probation' : ''}` : l.leave_type === 'toil' ? `${b.toil} in lieu` : '')}</td>
                    <td><span className={`chip ${tone}`}>{st}</span>{l.status === 'pending' && <span className="sub2">{s?.manager_id && byId[s.manager_id] ? `With ${byId[s.manager_id].full_name} (manager)` : 'With HR (no manager set)'}</span>}{l.decided_by_email && l.status !== 'pending' && <span className="sub2">by {l.decided_by_email}</span>}{l.decision_note && <span className="sub2">{l.decision_note}</span>}</td>
                    <td className="actions nowrap">
                      {l.status === 'pending' && isPayrollApprover && <><button className="btn sm primary" onClick={() => decide(l, 'approved')}>Approve</button><button className="btn sm danger" onClick={() => decide(l, 'rejected')}>Reject</button></>}
                      {['pending', 'approved'].includes(l.status) && <button className="btn sm ghost" onClick={() => decide(l, 'cancelled')}>Cancel</button>}
                    </td>
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

function LeaveCalendar({ staff, leaves, holidays, month }) {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const days = Array.from({ length: last }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, '0')}`);
  const hol = new Set(holidays.map((h) => h.day));
  const shown = leaves.filter((l) => ['approved', 'pending'].includes(l.status) && l.start_date <= days[days.length - 1] && l.end_date >= days[0]);
  const people = staff.filter((s) => shown.some((l) => l.staff_id === s.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const today = iso(Date.now());
  const offToday = staff.filter((s) => leaves.some((l) => l.staff_id === s.id && l.status === 'approved' && !['wfh'].includes(l.leave_type) && l.start_date <= today && l.end_date >= today));
  return (
    <>
      <p className="hint">{offToday.length ? `Off today: ${offToday.map((s) => s.full_name).join(', ')}.` : 'Nobody is off today.'} Solid is approved, striped is waiting for approval.</p>
      {!people.length ? <p className="empty">No leave in {monthLabel(month)}.</p> : (
        <div className="cal-wrap" data-tour="leave-calendar">
          <table className="leave-cal">
            <thead><tr><th>Who</th>{days.map((d) => <th key={d} className={hol.has(d) ? 'hol' : new Date(d + 'T00:00:00Z').getUTCDay() % 6 === 0 ? 'wkend' : ''}>{Number(d.slice(8))}</th>)}</tr></thead>
            <tbody>
              {people.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{s.full_name}</td>
                  {days.map((d) => {
                    const l = shown.find((x) => x.staff_id === s.id && x.start_date <= d && x.end_date >= d);
                    const counted = l && countedDates(l.leave_type, l.start_date, l.end_date, s.work_week, holidays).includes(d);
                    return <td key={d} className={`${hol.has(d) ? 'hol' : ''} ${l ? `lv ${l.leave_type} ${l.status}` : ''}`} title={l ? `${leaveLabel(l.leave_type)}${counted ? '' : ' (not counted)'}${l.status === 'pending' ? ', waiting for approval' : ''}` : hol.has(d) ? holidays.find((h) => h.day === d)?.name : ''}>{l ? (l.half_day ? '½' : '') : ''}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Balances({ staff, leaves, adjustments }) {
  const rows = staff.filter((s) => s.status === 'active').map((s) => ({ s, b: balances(s, leaves.filter((l) => l.staff_id === s.id), adjustments.filter((a) => a.staff_id === s.id)) })).sort((a, b) => a.s.full_name.localeCompare(b.s.full_name));
  function exportCSV() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(rows.map(({ s, b }) => ({ staff_no: s.staff_no, name: s.full_name, annual_available: b.annual, annual_booked: b.booked, annual_after_booked: b.annualAfterBooked, sick_used_this_year: b.sick.used, time_off_in_lieu: b.toil, probation_ends: b.probationEnd, on_probation: b.inProbation ? 'Yes' : 'No' })))], { type: 'text/csv' }));
    a.download = `robot24-leave-balances-${iso(Date.now())}.csv`;
    a.click();
  }
  return (
    <>
      <div className="toolbar"><p className="hint" style={{ margin: 0 }}>Annual leave: 2 days a month after 6 months, then 30 days a year. Set an opening balance on anyone's profile.</p><span className="spacer" /><button className="btn" onClick={exportCSV}>Export CSV</button></div>
      <div className="table-wrap">
        <table className="report-table">
          <thead><tr><th>Name</th><th className="r">Annual available</th><th className="r">Booked</th><th className="r">After booked</th><th className="r">Sick this year</th><th className="r">In lieu</th><th>Probation</th></tr></thead>
          <tbody>{rows.map(({ s, b }) => (
            <tr key={s.id}>
              <td><strong>{s.full_name}</strong><span className="sub2">{s.job_title}</span></td>
              <td className={`r num-cell ${b.annual > 30 ? 'warn-text' : ''}`}>{b.annual}</td>
              <td className="r num-cell">{b.booked || ''}</td>
              <td className="r num-cell strong">{b.annualAfterBooked}</td>
              <td className={`r num-cell ${b.sick.used > 15 ? 'warn-text' : ''}`}>{b.sick.used || ''}</td>
              <td className="r num-cell">{b.toil || ''}</td>
              <td className="nowrap">{b.inProbation ? <span className="chip warn">Until {fmtDate(b.probationEnd)}</span> : <span className="muted">Done</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Holidays({ holidays, refresh, proposed = [], clearProposed }) {
  const [f, setF] = useState({ day: '', name: '' });
  const [pick, setPick] = useState(() => proposed.map((h) => ({ ...h, add: true })));
  async function addProposed() {
    const rows = pick.filter((h) => h.add).map(({ day, name }) => ({ day, name }));
    if (!rows.length) return;
    const { error } = await supabase.from('public_holidays').upsert(rows);
    if (error) return alert(error.message);
    setPick([]); clearProposed?.(); refresh();
  }
  async function add() {
    if (!f.day || !f.name.trim()) return alert('Enter the date and the name.');
    const { error } = await supabase.from('public_holidays').upsert({ day: f.day, name: f.name.trim() });
    if (error) return alert(error.message);
    setF({ day: '', name: '' }); refresh();
  }
  async function remove(h) { if (!confirm(`Remove ${h.name} on ${fmtDate(h.day)}?`)) return; await supabase.from('public_holidays').delete().eq('day', h.day); refresh(); }
  const upcoming = holidays.filter((h) => h.day >= `${new Date().getFullYear()}-01-01`).sort((a, b) => a.day.localeCompare(b.day));
  return (
    <>
      {pick.length > 0 && (
        <div className="panel-box dc-form in-drawer">
          <h3>From Robbie: {pick.length} holiday{pick.length > 1 ? 's' : ''} to add</h3>
          <ul className="files-list">{pick.map((h, i) => <li key={h.day}><label className="check"><input type="checkbox" checked={h.add} onChange={(e) => setPick(pick.map((x, j) => (j === i ? { ...x, add: e.target.checked } : x)))} /> <strong>{fmtDate(h.day)}</strong> {h.name}</label></li>)}</ul>
          <p className="hint">Islamic holiday dates are estimates until they are announced: check them first.</p>
          <div className="drawer-actions"><button className="btn ghost" onClick={() => { setPick([]); clearProposed?.(); }}>Cancel</button><span className="spacer" /><button className="btn primary" onClick={addProposed}>Add {pick.filter((h) => h.add).length}</button></div>
        </div>
      )}
      <p className="hint">Public holidays are not counted as leave days. Islamic holidays move with the moon, so add them when they are announced.</p>
      <div className="toolbar">
        <input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
        <input className="search" placeholder="e.g. Eid Al Fitr" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <button className="btn primary" onClick={add}>Add holiday</button>
      </div>
      <ul className="files-list">{upcoming.map((h) => <li key={h.day}><span><strong>{fmtDate(h.day)}</strong> {h.name}</span><button className="btn sm ghost" onClick={() => remove(h)}>Remove</button></li>)}</ul>
    </>
  );
}

export default function LeavePanel({ staff, leaves, adjustments, holidays, month, refresh, robbieLeave, clearRobbie }) {
  const [view, setView] = useState('requests');
  const [proposed, setProposed] = useState([]);
  useHandOff('leave:holidays', (h) => { setProposed(h.holidays || []); setView('holidays'); });
  const [recording, setRecording] = useState(robbieLeave || null);
  const open = robbieLeave || recording;
  return (
    <>
      <div className="toolbar">
        <div className="seg">{[['requests', 'Requests'], ['calendar', 'Calendar'], ['balances', 'Balances'], ['holidays', 'Public holidays']].map(([k, t]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>)}</div>
      </div>
      {view === 'requests' && <Requests staff={staff} leaves={leaves} adjustments={adjustments} holidays={holidays} refresh={refresh} onRecord={() => setRecording({})} />}
      {view === 'calendar' && <LeaveCalendar staff={staff} leaves={leaves} holidays={holidays} month={month} />}
      {view === 'balances' && <Balances staff={staff} leaves={leaves} adjustments={adjustments} />}
      {view === 'holidays' && <Holidays key={proposed.length} holidays={holidays} refresh={refresh} proposed={proposed} clearProposed={() => setProposed([])} />}
      {open && <LeaveForm staff={staff} leaves={leaves} adjustments={adjustments} holidays={holidays} initial={open && Object.keys(open).length ? open : null}
        onClose={() => { setRecording(null); clearRobbie?.(); }} onSaved={() => { setRecording(null); clearRobbie?.(); refresh(); }} />}
    </>
  );
}
