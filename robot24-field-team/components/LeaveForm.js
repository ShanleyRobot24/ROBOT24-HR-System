'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fmtDate } from '@/lib/format';
import { LEAVE_TYPES, countDays, balances, leaveLabel, SICK_TIERS } from '@/lib/leave';
import Drawer from './Drawer';
import { CameraButton } from './ui';

// Record leave (HR, for anyone) or request it (an employee, for themselves). Always starts as waiting for approval.
export default function LeaveForm({ approverName = null, staff = [], me = null, leaves = [], adjustments = [], holidays = [], initial = null, onClose, onSaved }) {
  const [f, setF] = useState({ staff_id: me?.id || initial?.staff_id || '', leave_type: initial?.leave_type || 'annual', start_date: initial?.start_date || '', end_date: initial?.end_date || initial?.start_date || '', half_day: !!initial?.half_day, reason: initial?.reason || '' });
  const [file, setFile] = useState(initial?.file || null);
  const [busy, setBusy] = useState(false);
  const person = me || staff.find((s) => s.id === f.staff_id) || null;
  const theirs = leaves.filter((l) => l.staff_id === f.staff_id);
  const days = person ? countDays(f.leave_type, f.start_date, f.end_date, f.half_day, person.work_week, holidays) : 0;
  const b = person ? balances(person, theirs, adjustments.filter((a) => a.staff_id === f.staff_id)) : null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const warnings = useMemo(() => {
    if (!person || !f.start_date || !f.end_date) return [];
    const w = [];
    if (f.end_date < f.start_date) w.push('The end date is before the start date.');
    const overlap = theirs.filter((l) => ['pending', 'approved'].includes(l.status) && l.start_date <= f.end_date && l.end_date >= f.start_date);
    if (overlap.length) w.push(`Overlaps ${overlap.map((l) => `${leaveLabel(l.leave_type)} ${fmtDate(l.start_date)} to ${fmtDate(l.end_date)}`).join(', ')}.`);
    if (f.leave_type === 'annual' && b) {
      if (b.inProbation && f.start_date < b.probationEnd) w.push(`Still on probation until ${fmtDate(b.probationEnd)}: annual leave is usually taken after that.`);
      if (days > b.annualAfterBooked) w.push(`Only ${b.annualAfterBooked} days of annual leave available after what is already booked.`);
    }
    if (f.leave_type === 'sick' && b) {
      if (b.inProbation) w.push(`On probation until ${fmtDate(b.probationEnd)}: sick leave in probation is unpaid.`);
      else if (b.sick.used + days > SICK_TIERS.full) w.push(`${b.sick.used} sick days used this year: days after 15 are half pay, after 45 unpaid.`);
      if (!file) w.push('Attach the medical certificate if you have it.');
    }
    if (f.leave_type === 'toil' && b && days > b.toil) w.push(`Only ${b.toil} days of time off in lieu earned.`);
    if (f.leave_type === 'study' && person.start_date && (Date.parse(f.start_date) - Date.parse(person.start_date)) / 864e5 < 730) w.push('Study leave needs two years of service.');
    if (f.leave_type === 'parental' && days > 5) w.push('Parental leave is 5 working days, within six months of the birth.');
    if (f.leave_type === 'bereavement' && days > 5) w.push('Bereavement leave is 5 days for a spouse, 3 for a parent, child, sibling, grandchild or grandparent.');
    if (f.leave_type === 'maternity' && days > 60) w.push('Maternity leave is 60 days: 45 at full pay, 15 at half pay.');
    if (days === 0 && f.end_date >= f.start_date) w.push('Those dates are all public holidays or days off, so no leave is needed.');
    return w;
  }, [person, f, theirs, b, days, file]);

  async function save() {
    if (!person) return alert('Choose who the leave is for.');
    if (!f.start_date || !f.end_date || f.end_date < f.start_date) return alert('Choose the dates.');
    setBusy(true);
    let attachment_path = null;
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      attachment_path = `leave/${person.id}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from('staff').upload(attachment_path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) { setBusy(false); return alert(`Could not upload the attachment: ${error.message}`); }
    }
    const { error } = await supabase.from('leave_requests').insert({
      staff_id: person.id, leave_type: f.leave_type, start_date: f.start_date, end_date: f.end_date,
      half_day: f.half_day && f.start_date === f.end_date, days, reason: f.reason.trim() || null, attachment_path,
    });
    setBusy(false);
    if (error) return alert(error.message);
    onSaved();
  }

  return (
    <Drawer title={me ? 'Request leave' : 'Record leave'} onClose={onClose}>
      {initial?._note && <p className="dc-note">{initial._note}</p>}
      <div className="add-user">
        <div className="dc-grid">
          {!me && (
            <label className="span2">Who
              <select value={f.staff_id} onChange={set('staff_id')}>
                <option value="">Choose the person</option>
                {staff.filter((s) => s.status !== 'terminated').sort((a, b) => a.full_name.localeCompare(b.full_name)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </label>
          )}
          <label className="span2">Type of leave<select value={f.leave_type} onChange={set('leave_type')}>{LEAVE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>From<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: f.end_date && f.end_date >= e.target.value ? f.end_date : e.target.value })} /></label>
          <label>To<input type="date" value={f.end_date} min={f.start_date || undefined} onChange={set('end_date')} /></label>
          {f.start_date && f.start_date === f.end_date && <label className="check span2"><input type="checkbox" checked={f.half_day} onChange={set('half_day')} /> Half day</label>}
          <label className="span2">{me ? 'Note for HR (optional)' : 'Reason or note'}<input value={f.reason} onChange={set('reason')} /></label>
        </div>
        <div className="doc-upload">
          <label className="btn">{file ? 'Change attachment' : 'Attach a document'}<input type="file" hidden accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
          <CameraButton onFile={setFile} />
          {file && <span className="hint">{file.name}</span>}
          {!file && f.leave_type === 'sick' && <span className="hint">A medical certificate, for sick leave</span>}
        </div>
        {person && b && (
          <p className="leave-sum"><strong>{days} {days === 1 ? 'day' : 'days'}</strong> of {leaveLabel(f.leave_type).toLowerCase()}
            {f.leave_type === 'annual' && <> · {b.annualAfterBooked} available before this, {Math.round((b.annualAfterBooked - days) * 10) / 10} after</>}
            {f.leave_type === 'sick' && <> · {b.sick.used} sick days used this year</>}
            {f.leave_type === 'toil' && <> · {b.toil} days in lieu earned</>}
          </p>
        )}
        {warnings.length > 0 && <ul className="brief-warn">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        <p className="hint">{me ? `${approverName ? `${approverName} approves it` : 'HR approves it'}, and you can follow it in My leave.` : `It goes to ${person?.manager_id && staff.find((x) => x.id === person.manager_id) ? `${staff.find((x) => x.id === person.manager_id).full_name} (their manager)` : 'an HR approver'} to approve; HR approvers can also decide. Approved unpaid and half-pay days come off that month's payroll.`}</p>
        <div className="drawer-actions"><button className="btn ghost" onClick={onClose}>Cancel</button><span className="spacer" /><button className="btn primary" onClick={save} disabled={busy || !person || !f.start_date}>{busy ? 'Sending' : me ? 'Send request' : 'Record leave'}</button></div>
      </div>
    </Drawer>
  );
}
