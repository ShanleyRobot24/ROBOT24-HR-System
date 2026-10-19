'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { fmtDate, money, openFile, cur3 } from '@/lib/format';
import { WORK_WEEK, dayRate } from '@/lib/payroll';
import { STAFF_STATUS, VISA_STATUS, VISA_TYPES, STAFF_DOCS, AI_READS, requiredDocs, isOwnVisa, docLabel, makeOfferLetter, download, daysTo } from '@/lib/staff';
import Drawer from './Drawer';
import RowMenu from './RowMenu';
import LeaveForm from './LeaveForm';
import { balances, finalSettlement, leaveLabel, LEAVE_STATUS } from '@/lib/leave';
import { CameraButton } from './ui';
import { useUndo } from './Undo';
import { amountWarning, dateWarnings, okToSave } from '@/lib/sanity';

const FIELDS = [
  ['full_name', 'Full name', 'text', 2], ['job_title', 'Job title', 'text', 2],
  ['manager_id', 'Reports to', 'manager', 2],
  ['monthly_salary', 'Monthly salary', 'number'], ['currency', 'Currency', 'text'],
  ['start_date', 'Start date', 'date'], ['work_week', 'Working days', 'week'],
  ['department', 'Department', 'text'], ['location', 'Location', 'text'],
  ['email', 'Work email', 'email'], ['phone', 'Phone', 'text'],
  ['nationality', 'Nationality', 'text'], ['date_of_birth', 'Date of birth', 'date'],
  ['passport_no', 'Passport number', 'text'], ['passport_expiry', 'Passport expiry', 'date'],
  ['visa_sponsor', 'Visa type', 'visatype'], ['insurance_by', 'Medical insurance', 'sponsor'],
  ['visa_status', 'Visa status', 'visa'], ['visa_expiry', 'Visa expiry', 'date'],
  ['wps', 'Paid through WPS', 'yesno'],
  ['emirates_id_no', 'Emirates ID number', 'text'], ['emirates_id_expiry', 'Emirates ID expiry', 'date'],
  ['labour_card_no', 'Labour card number', 'text'], ['labour_card_expiry', 'Labour card expiry', 'date'],
  ['work_permit_no', 'Work permit number', 'text'], ['work_permit_expiry', 'Work permit expiry', 'date'],
  ['contract_type', 'Contract type', 'contract'], ['contract_end_date', 'Contract end date', 'date'],
  ['basic_salary', 'Basic salary', 'number'], ['housing_allowance', 'Housing allowance', 'number'],
  ['transport_allowance', 'Transport allowance', 'number'], ['other_allowance', 'Other allowances', 'number'],
  ['probation_end', 'Probation ends', 'date'], ['annual_entitlement', 'Annual leave a year (days)', 'number'],
  ['opening_annual_balance', 'Opening annual leave balance', 'number'], ['opening_balance_date', 'Opening balance as of', 'date'],
  ['notes', 'Notes', 'text', 2],
];
const REASONS = ['Resignation', 'End of contract', 'Termination by company', 'Probation not passed', 'Other'];

function Expiry({ d }) {
  const n = daysTo(d);
  if (!d) return null;
  if (n < 0) return <span className="chip alert">Expired</span>;
  if (n <= 60) return <span className="chip warn">Expires in {n} days</span>;
  return null;
}

export default function StaffDrawer({ staff, onClose, refresh, prefill = null, leaves = [], adjustments = [], holidays = [], allStaff = [] }) {
  const { isAdmin } = useAuth();
  const { showUndo } = useUndo();
  const { _prefill, ...cleanStaff } = staff;
  const [f, setF] = useState(() => (prefill?.type === 'edit_staff' ? { ...cleanStaff, ...prefill.changes } : cleanStaff));
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(() => {
    if (!prefill) return '';
    if (prefill.type === 'edit_staff') return `Filled in by Robbie: ${Object.entries(prefill.changes).map(([k, v]) => `${(FIELDS.find(([key]) => key === k)?.[1] || k.replace(/_/g, ' ')).toLowerCase()} ${k === 'manager_id' ? (v ? allStaff.find((x) => x.id === v)?.full_name || 'someone' : 'nobody') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v}`).join(', ')}. Nothing is saved yet: check it, then click Save changes.`;
    if (prefill.type === 'terminate_staff') return 'Filled in by Robbie. Check the last day and reason, then click Terminate.';
    if (prefill.type === 'offer_letter') return 'Filled in by Robbie. Check the options, then click Download Word letter.';
    if (prefill.type === 'final_settlement') return 'Opened by Robbie at the final settlement, below.';
    if (prefill.type === 'doc_file') return `Ready from Robbie: ${prefill.file?.name || 'the file'}. Check the document type in Documents below, then click Save this file.`;
    return '';
  });
  const [docType, setDocType] = useState('emirates_id');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [robbieFile, setRobbieFile] = useState(prefill?.type === 'doc_file' ? prefill.file : null);
  useEffect(() => {
    if (prefill?.type === 'doc_file' && prefill.doc_type) setDocType(prefill.doc_type);
    if (prefill?.type === 'final_settlement' || prefill?.type === 'doc_file') setTimeout(() => document.querySelector(prefill.type === 'final_settlement' ? '.settlement-box' : '.doc-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [panel, setPanel] = useState(prefill?.type === 'terminate_staff' ? 'terminate' : prefill?.type === 'offer_letter' ? 'offer' : null); // 'offer' | 'terminate'
  const [offerOpts, setOfferOpts] = useState({ date: (prefill?.type === 'offer_letter' && prefill.letter_date) || new Date().toISOString().slice(0, 10), withSignature: prefill?.type === 'offer_letter' && !!prefill.with_signature, save: true });
  const [term, setTerm] = useState(prefill?.type === 'terminate_staff' ? { date: prefill.last_day || new Date().toISOString().slice(0, 10), reason: prefill.reason || 'Resignation', notes: prefill.notes || '' } : { date: new Date().toISOString().slice(0, 10), reason: 'Resignation', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from('staff_documents').select('*').eq('staff_id', staff.id).order('created_at', { ascending: false });
    setDocs(data || []);
  }, [staff.id]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function save(patch) {
    const row = patch || Object.fromEntries(FIELDS.map(([k]) => [k, f[k] === '' ? null : f[k]]));
    for (const k of ['monthly_salary', 'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance']) if (row[k] !== undefined && row[k] !== null) row[k] = Number(row[k]);
    if (!patch) {
      const w = [];
      if (row.monthly_salary && Number(staff.monthly_salary) && row.monthly_salary !== Number(staff.monthly_salary)) w.push(amountWarning(row.monthly_salary, { usual: [staff.monthly_salary], label: 'The new monthly salary', cur: row.currency || f.currency }));
      else w.push(amountWarning(row.monthly_salary, { cap: 150000, label: 'The monthly salary', cur: row.currency || f.currency }));
      const parts = ['basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance'].map((k) => Number(row[k] || 0));
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum && row.monthly_salary && Math.abs(sum - row.monthly_salary) > 1) w.push(`Basic plus allowances is ${sum.toLocaleString('en-US')}, but the monthly salary is ${Number(row.monthly_salary).toLocaleString('en-US')}.`);
      if (row.start_date !== staff.start_date) w.push(...dateWarnings({ start: row.start_date, label: 'The start date', pastDays: 365 }));
      if (row.contract_end_date && row.start_date && row.contract_end_date < row.start_date) w.push('The contract ends before the start date.');
      if (!okToSave(w)) return;
    }
    if (row.currency) row.currency = cur3(row.currency, 'AED');
    setBusy('Saving');
    const { data, error } = await supabase.from('staff').update(row).eq('id', staff.id).select().single();
    setBusy('');
    if (error) return alert(error.message);
    setF(data);
    refresh();
    return data;
  }

  async function uploadDoc(file) {
    if (!file) return;
    setBusy(AI_READS.includes(docType) ? `Uploading and reading the ${docLabel(docType).toLowerCase()}` : 'Uploading'); setNote('');
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-100);
      const path = `${staff.id}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from('staff').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      let out = null;
      if (AI_READS.includes(docType)) {
        try { out = await callApi('/api/process-invoice', { mode: 'staffdoc', docType, path, fileName: file.name, contentType: file.type }); } catch (e) { setNote(`Saved, but could not be read: ${e.message}`); }
      }
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('staff_documents').insert({ staff_id: staff.id, doc_type: docType, file_path: path, file_name: file.name, is_signed: !!out?.signed, expires_on: out?.expires_on || null, uploaded_by: user?.id });
      if (out) {
        // Fill in only what is empty, and point out anything that differs
        const fill = {}, differ = [];
        for (const [k, v] of Object.entries(out.fields)) {
          if (v === undefined || v === null || !(FIELDS.some(([key]) => key === k) || k === 'visa_status')) continue;
          if (f[k] === null || f[k] === '' || f[k] === undefined || (k === 'visa_sponsor' && f[k] === 'own')) fill[k] = v;
          else if (String(f[k]).toLowerCase() !== String(v).toLowerCase() && !['full_name', 'currency'].includes(k)) differ.push(`${k.replace(/_/g, ' ')}: ${v}`);
        }
        if (['offer_letter', 'employment_contract', 'mohre_contract'].includes(docType) && out.signed && f.status === 'offer') fill.status = 'active';
        const total = Number(out.fields.total_salary) || ['basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance'].reduce((t, k) => t + Number(out.fields[k] || 0), 0);
        if (total && Number(f.monthly_salary) && Math.abs(total - Number(f.monthly_salary)) > 1) differ.push(`total salary on the contract is ${total.toLocaleString('en-US')}, the profile says ${Number(f.monthly_salary).toLocaleString('en-US')}`);
        if (Object.keys(fill).length) await save(fill);
        setNote(`${docLabel(docType)} saved.${Object.keys(fill).length ? ` Filled in: ${Object.keys(fill).filter((k) => k !== 'status').map((k) => (FIELDS.find(([key]) => key === k)?.[1] || k.replace(/_/g, ' ')).toLowerCase()).join(', ')}.` : ''}${fill.status === 'active' ? ' Signed, so they are now Active.' : ''}${differ.length ? ` Different on the document, please check: ${differ.join('; ')}.` : ''}${out.is_expected ? '' : ' This may not be the right kind of document.'}`);
      } else if (!AI_READS.includes(docType)) setNote(`${docLabel(docType)} saved.`);
      loadDocs();
    } catch (e) { setNote(`Upload failed: ${e.message}`); }
    setBusy('');
  }

  async function removeDoc(d) {
    const { error } = await supabase.from('staff_documents').delete().eq('id', d.id);
    if (error) return alert(error.message);
    loadDocs();
    showUndo(`Deleted ${docLabel(d.doc_type)} ${d.file_name || ''}`,
      async () => { const { error: e } = await supabase.from('staff_documents').insert(d); if (e) throw e; loadDocs(); },
      async () => { await supabase.storage.from('staff').remove([d.file_path]); });
  }

  async function generateOffer() {
    const missing = ['full_name', 'passport_no', 'date_of_birth', 'nationality', 'job_title', 'monthly_salary', 'start_date'].filter((k) => !f[k]);
    if (missing.length && !confirm(`Missing: ${missing.map((k) => k.replace(/_/g, ' ')).join(', ')}. Make the letter anyway?`)) return;
    setBusy('Making the offer letter');
    try {
      const blob = await makeOfferLetter(f, offerOpts);
      const name = `Employment_Commitment_Letter_${(f.full_name || 'staff').replace(/\s+/g, '_')}.docx`;
      download(blob, name);
      if (offerOpts.save) {
        const path = `${staff.id}/${crypto.randomUUID()}-${name}`;
        await supabase.storage.from('staff').upload(path, blob, { contentType: blob.type });
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('staff_documents').insert({ staff_id: staff.id, doc_type: 'offer_letter', file_path: path, file_name: name, is_signed: false, notes: offerOpts.withSignature ? 'Generated, signed for the company' : 'Generated, not signed', uploaded_by: user?.id });
        loadDocs();
      }
      setNote(`Offer letter downloaded${offerOpts.save ? ' and saved to their documents' : ''}. When it comes back signed, upload it as Offer letter and they become Active.`);
      setPanel(null);
    } catch (e) { alert(e.message); }
    setBusy('');
  }

  async function terminate() {
    if (!term.date) return alert('Choose the last working day.');
    if (f.start_date && term.date < f.start_date) return alert('The last day is before the start date.');
    if (!confirm(`Terminate ${f.full_name} with last day ${fmtDate(term.date)}? Their record and documents are kept, and payroll stops after that day.`)) return;
    await save({ status: 'terminated', termination_date: term.date, termination_reason: term.reason + (term.notes ? `: ${term.notes}` : '') });
    setPanel(null);
  }

  async function reinstate() {
    if (!confirm(`Undo the termination of ${f.full_name}?`)) return;
    await save({ status: 'active', termination_date: null, termination_reason: null });
  }

  async function removeStaff() {
    const typed = prompt(`This permanently deletes ${f.full_name} and all their documents. It cannot be undone. To leave someone who has worked here, use Terminate instead.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    if (docs.length) await supabase.storage.from('staff').remove(docs.map((d) => d.file_path));
    const { error } = await supabase.from('staff').delete().eq('id', staff.id);
    if (error) return alert(error.message);
    refresh();
    onClose();
  }

  const [label, tone] = STAFF_STATUS[f.status] || ['Unknown', 'neutral'];
  const have = new Set(docs.map((d) => d.doc_type));
  const missingDocs = requiredDocs(f).filter((t) => !have.has(t));

  return (
    <Drawer title={f.full_name} onClose={onClose}>
      <div className="staff-head">
        <span className={`chip ${tone}`}>{label}</span>
        <span className="muted">{f.staff_no}</span>
        <span className="spacer" />
        <RowMenu items={[
          { label: 'Generate offer letter', onClick: () => setPanel('offer') },
          f.status !== 'terminated' && { label: 'Terminate', onClick: () => setPanel('terminate'), danger: true },
          f.status === 'terminated' && { label: 'Undo termination', onClick: reinstate },
          isAdmin && { label: 'Remove (mistakes only)', onClick: removeStaff, danger: true },
        ]} />
      </div>
      {f.status === 'terminated' && <p className="le-warn">Left on {fmtDate(f.termination_date)}{f.termination_reason ? `: ${f.termination_reason}` : ''}.</p>}
      {busy && <p className="dc-note">{busy}…</p>}
      {!busy && note && <p className="dc-note">{note}</p>}

      {panel === 'offer' && (
        <div className="dc-form in-drawer panel-box">
          <h3>Generate offer letter</h3>
          <div className="dc-grid">
            <label>Letter date<input type="date" value={offerOpts.date} onChange={(e) => setOfferOpts({ ...offerOpts, date: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={offerOpts.withSignature} onChange={(e) => setOfferOpts({ ...offerOpts, withSignature: e.target.checked })} /> Add Jersild Roberts's signature for the company</label>
          <label className="check"><input type="checkbox" checked={offerOpts.save} onChange={(e) => setOfferOpts({ ...offerOpts, save: e.target.checked })} /> Save a copy to their documents</label>
          <p className="hint">Uses the details on this profile. Save any changes first.</p>
          <div className="drawer-actions"><button className="btn ghost" onClick={() => setPanel(null)}>Cancel</button><span className="spacer" /><button className="btn primary" onClick={generateOffer} disabled={!!busy}>Download Word letter</button></div>
        </div>
      )}
      {panel === 'terminate' && (
        <div className="dc-form in-drawer panel-box">
          <h3>Terminate {f.full_name}</h3>
          <div className="dc-grid">
            <label>Last working day<input type="date" value={term.date} onChange={(e) => setTerm({ ...term, date: e.target.value })} /></label>
            <label>Reason<select value={term.reason} onChange={(e) => setTerm({ ...term, reason: e.target.value })}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="span2">Notes<input value={term.notes} onChange={(e) => setTerm({ ...term, notes: e.target.value })} /></label>
          </div>
          {f.monthly_salary && <p className="hint">Their last month is paid up to this day at {f.currency} {dayRate(f.monthly_salary).toLocaleString('en-US')} a day.</p>}
          <div className="drawer-actions"><button className="btn ghost" onClick={() => setPanel(null)}>Cancel</button><span className="spacer" /><button className="btn danger" onClick={terminate}>Terminate</button></div>
        </div>
      )}

      <h3 className="sec">Details</h3>
      <div className="dc-grid staff-grid">
        {FIELDS.map(([k, l, t, span]) => (
          <label key={k} className={span === 2 ? 'span2' : ''}>{l}{['passport_expiry', 'visa_expiry', 'emirates_id_expiry', 'labour_card_expiry', 'work_permit_expiry'].includes(k) && <Expiry d={f[k]} />}
            {t === 'week' ? <select value={f[k] || 'mon_fri'} onChange={set(k)}><option value="mon_fri">{WORK_WEEK.mon_fri}</option><option value="mon_sat">{WORK_WEEK.mon_sat}</option></select>
              : t === 'visa' ? <select value={f[k] || 'unknown'} onChange={set(k)}>{VISA_STATUS.map(([v, x]) => <option key={v} value={v}>{x}</option>)}</select>
              : t === 'manager' ? <select value={f[k] || ''} onChange={set(k)}><option value="">Nobody (top of the org chart)</option>{allStaff.filter((x) => x.id !== f.id && x.status !== 'terminated').sort((a, b) => a.full_name.localeCompare(b.full_name)).map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.job_title ? ` · ${x.job_title}` : ''}</option>)}</select>
              : t === 'visatype' ? <select value={f[k] || ''} onChange={set(k)}><option value="">Not set</option>{VISA_TYPES.map(([v, x]) => <option key={v} value={v}>{x}</option>)}</select>
              : t === 'sponsor' ? <select value={f[k] || ''} onChange={set(k)}><option value="">Not set</option><option value="company">Company</option><option value="own">Own</option></select>
              : t === 'yesno' ? <select value={f[k] ? 'yes' : 'no'} onChange={(e) => setF({ ...f, [k]: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select>
              : t === 'contract' ? <select value={f[k] || ''} onChange={set(k)}><option value="">Not set</option><option value="limited">Limited (fixed term)</option><option value="unlimited">Unlimited</option></select>
                : <input type={t} value={f[k] ?? ''} onChange={set(k)} />}
          </label>
        ))}
      </div>
      {f.monthly_salary && <p className="hint">Day rate for part months: {money(dayRate(f.monthly_salary), f.currency)} ({f.currency} {Number(f.monthly_salary).toLocaleString('en-US')} × 12 ÷ 365).</p>}
      <div className="drawer-actions"><span className="spacer" /><button className="btn primary" onClick={() => save()} disabled={!!busy}>Save changes</button></div>

      <StaffLeave f={f} leaves={leaves} adjustments={adjustments} holidays={holidays} refresh={refresh} onRecord={() => setLeaveOpen(true)} />
      {leaveOpen && <LeaveForm staff={[f]} leaves={leaves} adjustments={adjustments} holidays={holidays} initial={{ staff_id: f.id }} onClose={() => setLeaveOpen(false)} onSaved={() => { setLeaveOpen(false); refresh(); }} />}

      <h3 className="sec">Documents</h3>
      {isOwnVisa(f.visa_sponsor) && <p className="hint">On their own visa: keep their work permit{['spouse', 'family', 'own'].includes(f.visa_sponsor) ? ', the NOC from their sponsor' : ''} and labour card here.</p>}
      {missingDocs.length > 0 && <p className="hint">Still to upload: {missingDocs.map(docLabel).join(', ')}.</p>}
      {robbieFile && <p className="dc-note">Ready: {robbieFile.name} <button className="btn sm primary" onClick={() => { const f = robbieFile; setRobbieFile(null); uploadDoc(f); }}>Save this file as {docLabel(docType)}</button></p>}
      <div className="doc-upload">
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>{STAFF_DOCS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="btn">{AI_READS.includes(docType) ? 'Upload and read' : 'Upload'}<input type="file" hidden accept="application/pdf,image/*,.doc,.docx" onChange={(e) => { uploadDoc(e.target.files[0]); e.target.value = ''; }} disabled={!!busy} /></label>
        <CameraButton onFile={uploadDoc} label="Take photo" disabled={!!busy} />
        {AI_READS.includes(docType) && <span className="hint">The AI fills in the number and expiry date.</span>}
      </div>
      {!docs.length ? <p className="empty">No documents yet.</p> : (
        <ul className="files-list">
          {docs.map((d) => (
            <li key={d.id}>
              <span><strong>{docLabel(d.doc_type)}</strong> {d.is_signed && <span className="chip ok">Signed</span>} <Expiry d={d.expires_on} /><span className="sub2">{d.file_name}{d.expires_on ? ` · expires ${fmtDate(d.expires_on)}` : ''}{d.notes ? ` · ${d.notes}` : ''} · added {fmtDate(d.created_at?.slice(0, 10))}</span></span>
              <span className="actions">
                <button className="btn sm" onClick={() => openFile(supabase, 'staff', d.file_path)}>Open</button>
                <RowMenu items={[{ label: 'Delete', onClick: () => removeDoc(d), danger: true }]} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}


// Leave on someone's profile: balances, history, adjustments, and the final settlement when they leave
function StaffLeave({ f, leaves, adjustments, holidays, refresh, onRecord }) {
  const b = balances(f, leaves, adjustments);
  const fs = f.status === 'terminated' ? finalSettlement(f, leaves, adjustments, holidays) : null;
  async function adjust() {
    const type = prompt('Adjust which balance? Type "annual" or "toil" (time off in lieu).', 'annual');
    if (!type) return;
    if (!['annual', 'toil'].includes(type.trim().toLowerCase())) return alert('Type annual or toil.');
    const days = Number(prompt('How many days? Use a minus sign to take days off, e.g. -2', '1'));
    if (!days) return;
    const reason = prompt('Reason (shown in the audit trail):');
    if (!reason || !reason.trim()) return alert('A reason is needed.');
    const { error } = await supabase.from('leave_adjustments').insert({ staff_id: f.id, leave_type: type.trim().toLowerCase(), days, reason: reason.trim() });
    if (error) return alert(error.message);
    refresh();
  }
  const recent = [...leaves].sort((x, y) => y.start_date.localeCompare(x.start_date)).slice(0, 8);
  return (
    <>
      <h3 className="sec">Leave</h3>
      <div className="leave-cards">
        <div className="proj-card total"><h3>Annual leave</h3><p className="kpi-num">{b.annual} days</p><p className="kpi-sub">{b.booked ? `${b.booked} booked, ${b.annualAfterBooked} after that` : 'available now'}</p></div>
        <div className="proj-card"><h3>Sick leave this year</h3><p className="kpi-num">{b.sick.used} days</p><p className="kpi-sub">{b.inProbation ? 'On probation: unpaid' : `${b.sick.fullLeft} full pay, ${b.sick.halfLeft} half pay left`}</p></div>
        <div className="proj-card planned"><h3>Time off in lieu</h3><p className="kpi-num">{b.toil} days</p><p className="kpi-sub">{b.inProbation ? `Probation ends ${fmtDate(b.probationEnd)}` : 'earned, not yet taken'}</p></div>
      </div>
      <div className="drawer-actions"><button className="btn" onClick={adjust}>Adjust a balance</button><span className="spacer" /><button className="btn primary" onClick={onRecord}>+ Record leave</button></div>
      {recent.length > 0 && (
        <ul className="files-list">
          {recent.map((l) => { const [t, tone] = LEAVE_STATUS[l.status]; return <li key={l.id}><span><strong>{leaveLabel(l.leave_type)}</strong> {fmtDate(l.start_date)}{l.end_date !== l.start_date ? ` to ${fmtDate(l.end_date)}` : ''}<span className="sub2">{l.days} day{l.days === 1 ? '' : 's'}{l.reason ? ` · ${l.reason}` : ''}</span></span><span className={`chip ${tone}`}>{t}</span></li>; })}
        </ul>
      )}
      {adjustments.length > 0 && <p className="hint">Adjustments: {adjustments.map((a) => `${a.days > 0 ? '+' : ''}${a.days} ${a.leave_type === 'toil' ? 'in lieu' : 'annual'} (${a.reason})`).join('; ')}.</p>}
      {fs && (
        <div className="panel-box dc-form in-drawer settlement-box">
          <h3>Final settlement</h3>
          <table className="report-table">
            <tbody>
              <tr><td>Unused annual leave</td><td className="r num-cell">{fs.unusedDays} days × {money(fs.daily, f.currency)}</td><td className="r num-cell strong">{money(fs.leavePay, f.currency)}</td></tr>
              <tr><td>End of service gratuity</td><td className="r num-cell">{fs.years} years of service, {fs.gratuityDays} days × {money(fs.daily, f.currency)}</td><td className="r num-cell strong">{money(fs.gratuity, f.currency)}</td></tr>
            </tbody>
            <tfoot><tr><td colSpan={2}><strong>Total, plus salary to the last day</strong></td><td className="r num-cell strong">{money(fs.total, f.currency)}</td></tr></tfoot>
          </table>
          <p className="hint">Gratuity: 21 days' basic pay a year for the first five years, 30 after that, from one year of service, capped at two years' pay. Unpaid leave does not count as service{fs.unpaidAbsence ? ` (${fs.unpaidAbsence} days taken off)` : ''}. {fs.usedBasic ? 'Uses the basic salary.' : 'No basic salary is set, so the monthly salary is used: add the basic salary on the profile if the salary includes allowances.'}</p>
        </div>
      )}
    </>
  );
}
