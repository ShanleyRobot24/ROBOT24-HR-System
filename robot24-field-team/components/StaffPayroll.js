'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';
import { fmtDate, money, monthLabel, toCSV } from '@/lib/format';
import { buildRun, runChanges, WORK_WEEK } from '@/lib/payroll';
import { payrollChecks } from '@/lib/sanity';
import { dateWarnings, okToSave } from '@/lib/sanity';
import { CheckList } from './ui';

const STATE = {
  none: ['Not sent for approval', 'neutral'],
  pending_approval: ['Waiting for approval', 'warn'],
  approved: ['Approved, ready to pay', 'ok'],
  rejected: ['Rejected', 'alert'],
  paid: ['Paid', 'ok'],
};
const sum = (t) => Object.entries(t || {}).map(([c, v]) => money(v, c)).join(' + ') || money(0, 'AED');

export default function StaffPayroll({ leaves = [], holidays = [], staff, month, run, refresh, runs = [] }) {
  const { isPayrollApprover } = useAuth();
  const [busy, setBusy] = useState(false);
  const live = buildRun(staff, month, { leaves, holidays });
  const shown = run ? { lines: run.lines, totals: run.totals, headcount: run.headcount } : live;
  const changes = run && ['pending_approval', 'rejected'].includes(run.status) ? runChanges(run.lines, live.lines) : [];
  const skipped = staff.filter((s) => s.status === 'offer' && s.start_date && s.start_date.slice(0, 7) <= month.slice(0, 7));
  const noSalary = staff.filter((s) => s.status === 'active' && !Number(s.monthly_salary) && s.start_date && s.start_date.slice(0, 7) <= month.slice(0, 7));
  const [label, tone] = STATE[run?.status || 'none'];

  async function act(fn) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return alert(error.message);
    refresh();
  }
  const send = () => {
    if (!live.lines.length) return alert(`Nobody is paid in ${monthLabel(month)}.`);
    const thisMonth = new Date().toISOString().slice(0, 7) + '-01';
    if (month > thisMonth && !okToSave([`${monthLabel(month)} hasn't started yet. Payroll is usually sent for the current month.`])) return;
    if (!confirm(`Send ${monthLabel(month)} payroll for approval: ${live.headcount} people, ${sum(live.totals)}?`)) return;
    return act(() => (run
      ? supabase.from('payroll_runs').update({ status: 'pending_approval', lines: live.lines, totals: live.totals, headcount: live.headcount }).eq('id', run.id)
      : supabase.from('payroll_runs').insert({ period: month, lines: live.lines, totals: live.totals, headcount: live.headcount })));
  };
  const withdraw = () => confirm('Withdraw this payroll from approval?') && act(() => supabase.from('payroll_runs').delete().eq('id', run.id));
  const approve = () => confirm(`Approve ${monthLabel(month)} payroll of ${sum(run.totals)} for ${run.headcount} people?`) && act(() => supabase.from('payroll_runs').update({ status: 'approved' }).eq('id', run.id));
  const reject = () => {
    const note = prompt('Why are you rejecting it? HR will see this.');
    if (note === null) return;
    if (!note.trim()) return alert('Please give a reason.');
    return act(() => supabase.from('payroll_runs').update({ status: 'rejected', decision_note: note.trim() }).eq('id', run.id));
  };
  const markPaid = () => {
    const ref = prompt('Bank or WPS reference for the salary transfer:');
    if (ref === null) return;
    return act(() => supabase.from('payroll_runs').update({ status: 'paid', paid_reference: ref.trim() || null, paid_at: new Date().toISOString().slice(0, 10) }).eq('id', run.id));
  };

  function exportCSV() {
    if (!shown.lines.length) return alert('Nobody to pay this month.');
    const data = shown.lines.map((l) => ({ staff_no: l.staff_no, name: l.name, job_title: l.job_title, monthly_salary: l.monthly_salary, currency: l.currency, paid_through_wps: l.wps ? 'Yes' : 'No', visa_type: l.visa_sponsor, work_week: WORK_WEEK[l.work_week], from: l.from, to: l.to, calendar_days: l.days, working_days: l.working_days, day_rate: l.full ? '' : l.day_rate, leave_deduction: l.deduction || 0, pay: l.amount, basis: l.basis }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-staff-payroll-${month.slice(0, 7)}${run ? `-${run.status}` : ''}.csv`;
    a.click();
  }

  return (
    <div className="payroll-report">
      <div className={`run-bar ${tone}`} data-tour="payroll-bar">
        <div>
          <strong>{monthLabel(month)} payroll: {label}</strong>
          <span className="sub2">
            {!run && 'Check the figures, then send them to an approver.'}
            {run?.status === 'pending_approval' && `Sent by ${run.submitted_by_email || 'HR'} on ${fmtDate(run.submitted_at?.slice(0, 10))}. An approver with Staff access needs to approve it.`}
            {run?.status === 'approved' && `Approved by ${run.decided_by_email} on ${fmtDate(run.decided_at?.slice(0, 10))}. Make the transfers, then mark it paid.`}
            {run?.status === 'rejected' && `Rejected by ${run.decided_by_email}: "${run.decision_note}". Fix it, then send again.`}
            {run?.status === 'paid' && `Paid on ${fmtDate(run.paid_at)}${run.paid_reference ? `, reference ${run.paid_reference}` : ''}. Approved by ${run.decided_by_email}.`}
          </span>
        </div>
        <span className="spacer" />
        <div className="run-actions no-print">
          {(!run || run.status === 'rejected') && <button className="btn primary" disabled={busy} onClick={send}>{run ? 'Send again for approval' : 'Send for approval'}</button>}
          {run?.status === 'pending_approval' && changes.length > 0 && <button className="btn primary" disabled={busy} onClick={send}>Update and resend</button>}
          {run?.status === 'pending_approval' && isPayrollApprover && <><button className="btn primary" disabled={busy || changes.length > 0} onClick={approve}>Approve</button><button className="btn danger" disabled={busy} onClick={reject}>Reject</button></>}
          {run?.status === 'pending_approval' && <button className="btn ghost" disabled={busy} onClick={withdraw}>Withdraw</button>}
          {run?.status === 'approved' && <button className="btn primary" disabled={busy} onClick={markPaid}>Mark paid</button>}
          <button className="btn" onClick={() => window.print()}>Print or save PDF</button>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>
      {run?.status === 'pending_approval' && (() => {
        const prev = runs.filter((r) => r.period < month && ['approved', 'paid'].includes(r.status)).sort((a, b) => b.period.localeCompare(a.period))[0];
        return <CheckList items={payrollChecks(run.lines, prev)} title={`Things to check before approving${prev ? `, compared with ${monthLabel(prev.period)}` : ''}`} />;
      })()}
      {changes.length > 0 && <p className="le-warn">Changed since it was sent: {changes.join('; ')}. Resend it so the approver sees the right figures.</p>}
      {run?.status === 'pending_approval' && !isPayrollApprover && <p className="hint">Approvers need the approver tick in Admin &gt; Users, and must be HR and finance, admin, or have Staff access.</p>}

      <div className="print-title">Robot24 staff payroll, {monthLabel(month)}</div>
      <div className="proj-cards">
        <div className="proj-card total"><h3>{run ? 'Payroll total' : 'To pay'} {monthLabel(month)}</h3><p className="kpi-num">{sum(shown.totals)}</p><p className="kpi-sub">{shown.headcount} {shown.headcount === 1 ? 'person' : 'people'}</p></div>
        <div className="proj-card"><h3>Full month</h3><p className="kpi-num">{shown.lines.filter((l) => l.full).length}</p><p className="kpi-sub">paid their monthly salary</p></div>
        <div className="proj-card planned"><h3>Part month</h3><p className="kpi-num">{shown.lines.filter((l) => !l.full).length}</p><p className="kpi-sub">monthly salary × 12 ÷ 365 per day</p></div>
      </div>
      {!run && skipped.length > 0 && <p className="note-bar">Not included because their offer is not signed yet: {skipped.map((s) => s.full_name).join(', ')}.</p>}
      {!run && noSalary.length > 0 && <p className="note-bar">Not included because no salary is set: {noSalary.length > 6 ? `${noSalary.length} people` : noSalary.map((s) => s.full_name).join(', ')}. Add their monthly salary on their profile.</p>}
      {!shown.lines.length ? <p className="empty">Nobody is employed in {monthLabel(month)}.</p> : (
        <div className="table-wrap">
          <table className="report-table">
            <thead><tr><th>Name</th><th className="r">Monthly salary</th><th>Employed this month</th><th className="r">Days</th><th className="r">Working days</th><th className="r">Pay</th></tr></thead>
            <tbody>
              {shown.lines.map((l) => (
                <tr key={l.staff_id}>
                  <td><strong>{l.name}</strong><span className="sub2">{[l.staff_no, l.job_title].filter(Boolean).join(' · ')}</span></td>
                  <td className="r num-cell">{money(l.monthly_salary, l.currency)}</td>
                  <td>{l.full ? 'Full month' : `${fmtDate(l.from)} to ${fmtDate(l.to)}`}<span className="sub2">{l.basis}</span></td>
                  <td className="r num-cell">{l.days}</td>
                  <td className="r num-cell">{l.working_days}<span className="sub2">{l.work_week === 'mon_sat' ? 'Mon to Sat' : 'Mon to Fri'}</span></td>
                  <td className="r num-cell strong">{money(l.amount, l.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5}><strong>Total</strong></td><td className="r num-cell strong">{sum(shown.totals)}</td></tr></tfoot>
          </table>
        </div>
      )}
      {run && <p className="print-sign">Sent by {run.submitted_by_email || '-'} on {fmtDate(run.submitted_at?.slice(0, 10))}{run.decided_by_email ? ` · ${run.status === 'rejected' ? 'Rejected' : 'Approved'} by ${run.decided_by_email} on ${fmtDate(run.decided_at?.slice(0, 10))}` : ''}{run.paid_reference ? ` · Paid, ref ${run.paid_reference}` : ''}</p>}
    </div>
  );
}
