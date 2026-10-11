'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { fmtDate, money, openFile, cur3 } from '@/lib/format';
import { WORK_WEEK, dayRate } from '@/lib/payroll';
import { STAFF_STATUS, VISA_STATUS, STAFF_DOCS, AI_READS, REQUIRED_DOCS, docLabel, makeOfferLetter, download, daysTo } from '@/lib/staff';
import Drawer from './Drawer';
import RowMenu from './RowMenu';

const FIELDS = [
  ['full_name', 'Full name', 'text', 2], ['job_title', 'Job title', 'text', 2],
  ['monthly_salary', 'Monthly salary', 'number'], ['currency', 'Currency', 'text'],
  ['start_date', 'Start date', 'date'], ['work_week', 'Working days', 'week'],
  ['department', 'Department', 'text'], ['location', 'Location', 'text'],
  ['email', 'Work email', 'email'], ['phone', 'Phone', 'text'],
  ['nationality', 'Nationality', 'text'], ['date_of_birth', 'Date of birth', 'date'],
  ['passport_no', 'Passport number', 'text'], ['passport_expiry', 'Passport expiry', 'date'],
  ['visa_status', 'Visa status', 'visa'], ['visa_expiry', 'Visa expiry', 'date'],
  ['emirates_id_no', 'Emirates ID number', 'text'], ['emirates_id_expiry', 'Emirates ID expiry', 'date'],
  ['labour_card_no', 'Labour card number', 'text'], ['labour_card_expiry', 'Labour card expiry', 'date'],
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

export default function StaffDrawer({ staff, onClose, refresh }) {
  const { isAdmin } = useAuth();
  const [f, setF] = useState(staff);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [docType, setDocType] = useState('emirates_id');
  const [panel, setPanel] = useState(null); // 'offer' | 'terminate'
  const [offerOpts, setOfferOpts] = useState({ date: new Date().toISOString().slice(0, 10), withSignature: false, save: true });
  const [term, setTerm] = useState({ date: new Date().toISOString().slice(0, 10), reason: 'Resignation', notes: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from('staff_documents').select('*').eq('staff_id', staff.id).order('created_at', { ascending: false });
    setDocs(data || []);
  }, [staff.id]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function save(patch) {
    const row = patch || Object.fromEntries(FIELDS.map(([k]) => [k, f[k] === '' ? null : f[k]]));
    if (row.monthly_salary !== undefined && row.monthly_salary !== null) row.monthly_salary = Number(row.monthly_salary);
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
          if (f[k] === null || f[k] === '' || f[k] === undefined) fill[k] = v;
          else if (String(f[k]).toLowerCase() !== String(v).toLowerCase() && !['full_name', 'currency'].includes(k)) differ.push(`${k.replace(/_/g, ' ')}: ${v}`);
        }
        if (['offer_letter', 'employment_contract', 'mohre_contract'].includes(docType) && out.signed && f.status === 'offer') fill.status = 'active';
        if (Object.keys(fill).length) await save(fill);
        setNote(`${docLabel(docType)} saved.${Object.keys(fill).length ? ` Filled in: ${Object.keys(fill).map((k) => k.replace(/_/g, ' ')).join(', ')}.` : ''}${fill.status === 'active' ? ' Signed, so they are now Active.' : ''}${differ.length ? ` Different on the document, please check: ${differ.join('; ')}.` : ''}${out.is_expected ? '' : ' This may not be the right kind of document.'}`);
      } else if (!AI_READS.includes(docType)) setNote(`${docLabel(docType)} saved.`);
      loadDocs();
    } catch (e) { setNote(`Upload failed: ${e.message}`); }
    setBusy('');
  }

  async function removeDoc(d) {
    if (!confirm(`Delete ${docLabel(d.doc_type)} "${d.file_name || ''}"?`)) return;
    await supabase.storage.from('staff').remove([d.file_path]);
    await supabase.from('staff_documents').delete().eq('id', d.id);
    loadDocs();
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
  const missingDocs = REQUIRED_DOCS.filter((t) => !have.has(t));

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
          <label key={k} className={span === 2 ? 'span2' : ''}>{l}{['passport_expiry', 'visa_expiry', 'emirates_id_expiry', 'labour_card_expiry'].includes(k) && <Expiry d={f[k]} />}
            {t === 'week' ? <select value={f[k] || 'mon_fri'} onChange={set(k)}><option value="mon_fri">{WORK_WEEK.mon_fri}</option><option value="mon_sat">{WORK_WEEK.mon_sat}</option></select>
              : t === 'visa' ? <select value={f[k] || 'not_started'} onChange={set(k)}>{VISA_STATUS.map(([v, x]) => <option key={v} value={v}>{x}</option>)}</select>
                : <input type={t} value={f[k] ?? ''} onChange={set(k)} />}
          </label>
        ))}
      </div>
      {f.monthly_salary && <p className="hint">Day rate for part months: {money(dayRate(f.monthly_salary), f.currency)} ({f.currency} {Number(f.monthly_salary).toLocaleString('en-US')} × 12 ÷ 365).</p>}
      <div className="drawer-actions"><span className="spacer" /><button className="btn primary" onClick={() => save()} disabled={!!busy}>Save changes</button></div>

      <h3 className="sec">Documents</h3>
      {missingDocs.length > 0 && <p className="hint">Still to upload: {missingDocs.map(docLabel).join(', ')}.</p>}
      <div className="doc-upload">
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>{STAFF_DOCS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="btn">{AI_READS.includes(docType) ? 'Upload and read' : 'Upload'}<input type="file" hidden accept="application/pdf,image/*,.doc,.docx" onChange={(e) => { uploadDoc(e.target.files[0]); e.target.value = ''; }} disabled={!!busy} /></label>
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
