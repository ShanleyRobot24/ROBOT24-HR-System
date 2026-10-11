'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { fmtDate, cur3 } from '@/lib/format';
import { WORK_WEEK, dayRate } from '@/lib/payroll';
import Drawer from './Drawer';
import { amountWarning, dateWarnings, findDuplicates, okToSave } from '@/lib/sanity';
import { CameraButton } from './ui';

const blank = { full_name: '', passport_no: '', nationality: '', date_of_birth: '', passport_expiry: '', gender: '', place_of_birth: '',
  job_title: '', department: '', monthly_salary: '', currency: 'AED', start_date: '', work_week: 'mon_fri', location: 'Dubai, United Arab Emirates', email: '', phone: '' };

async function upload(file, folder) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Over 20 MB');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-100);
  const path = `${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('staff').upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

// Add a staff member: 1. passport (AI fills the details), 2. job and pay, 3. signed offer letter (optional)
export default function AddStaff({ onClose, onSaved, existing = [] }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState(blank);
  const [passport, setPassport] = useState(null); // { path, name, expires }
  const [offer, setOffer] = useState(null); // { path, name, signed }
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function readPassport(file) {
    if (!file) return;
    setBusy('Reading the passport'); setNote('');
    try {
      const path = await upload(file, 'new');
      const out = await callApi('/api/process-invoice', { mode: 'staffdoc', docType: 'passport', path, fileName: file.name, contentType: file.type });
      setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(out.fields).filter(([k]) => k in blank)) }));
      setPassport({ path, name: file.name, expires: out.fields.passport_expiry || null });
      setNote(out.is_expected ? `Passport read${out.notes ? `. Note: ${out.notes}` : ''}. Check the details below.` : `This doesn't look like a passport${out.notes ? ` (${out.notes})` : ''}. Check the file, or type the details in.`);
    } catch (e) { setNote(`Could not read it: ${e.message}. You can type the details in.`); }
    setBusy('');
  }

  async function readOffer(file) {
    if (!file) return;
    setBusy('Reading the offer letter'); setNote('');
    try {
      const path = await upload(file, 'new');
      const out = await callApi('/api/process-invoice', { mode: 'staffdoc', docType: 'offer_letter', path, fileName: file.name, contentType: file.type });
      const x = out.fields;
      const diffs = [];
      if (x.monthly_salary && f.monthly_salary && Number(x.monthly_salary) !== Number(f.monthly_salary)) diffs.push(`salary on the letter is ${x.monthly_salary}`);
      if (x.start_date && f.start_date && x.start_date !== f.start_date) diffs.push(`start date on the letter is ${fmtDate(x.start_date)}`);
      if (x.job_title && f.job_title && x.job_title.toLowerCase() !== f.job_title.toLowerCase()) diffs.push(`title on the letter is "${x.job_title}"`);
      setF((cur) => ({ ...cur, monthly_salary: cur.monthly_salary || x.monthly_salary || '', start_date: cur.start_date || x.start_date || '', job_title: cur.job_title || x.job_title || '', work_week: x.work_week || cur.work_week, currency: x.currency || cur.currency }));
      setOffer({ path, name: file.name, signed: !!out.signed });
      setNote(`${out.signed ? 'Signed by the candidate.' : 'The candidate signature looks missing, so they will be saved as Offer sent.'}${diffs.length ? ` Check: ${diffs.join('; ')}.` : ''}`);
    } catch (e) { setNote(`Could not read it: ${e.message}.`); }
    setBusy('');
  }

  async function save() {
    if (!f.full_name.trim()) return alert('Enter the name.');
    if (!f.monthly_salary || !f.job_title || !f.start_date) return alert('Enter the monthly salary, job title and start date.');
    const dupes = findDuplicates(f, existing);
    const salaries = existing.filter((s) => s.status !== 'terminated' && s.currency === cur3(f.currency, 'AED')).map((s) => s.monthly_salary);
    if (!okToSave([
      dupes.length ? `Already on file: ${dupes.map((d) => `${d.full_name} (${d.staff_no}, ${d.status})`).join(', ')}. Adding them again creates a duplicate.` : null,
      amountWarning(f.monthly_salary, { usual: salaries.length >= 3 ? salaries : [], cap: 150000, label: 'The monthly salary', cur: f.currency }),
      ...dateWarnings({ start: f.start_date, label: 'The start date', pastDays: 92 }),
      f.passport_expiry && f.passport_expiry < new Date().toISOString().slice(0, 10) ? 'The passport has expired.' : null,
    ])) return;
    setBusy('Saving');
    const { data: { user } } = await supabase.auth.getUser();
    const row = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]));
    row.monthly_salary = Number(f.monthly_salary);
    row.currency = cur3(f.currency, 'AED');
    row.status = offer?.signed ? 'active' : 'offer';
    row.created_by = user?.id;
    const { data: s, error } = await supabase.from('staff').insert(row).select().single();
    if (error) { setBusy(''); return alert(error.message); }
    const docs = [];
    if (passport) docs.push({ staff_id: s.id, doc_type: 'passport', file_path: passport.path, file_name: passport.name, expires_on: passport.expires, uploaded_by: user?.id });
    if (offer) docs.push({ staff_id: s.id, doc_type: 'offer_letter', file_path: offer.path, file_name: offer.name, is_signed: offer.signed, uploaded_by: user?.id });
    if (docs.length) await supabase.from('staff_documents').insert(docs);
    setBusy('');
    onSaved(s);
  }

  const rate = f.monthly_salary ? dayRate(f.monthly_salary) : null;

  return (
    <Drawer title="Add a staff member" onClose={onClose}>
      <ol className="wizard-steps">
        {['Passport', 'Job and pay', 'Offer letter'].map((t, i) => <li key={t} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}><button type="button" onClick={() => setStep(i + 1)}>{i + 1}. {t}</button></li>)}
      </ol>
      {busy && <p className="dc-note">{busy}…</p>}
      {!busy && note && <p className="dc-note">{note}</p>}

      {step === 1 && (
        <div className="add-user">
          <label className="drop-line">Upload the passport (photo or PDF). The details fill themselves in.
            <input type="file" accept="application/pdf,image/*" onChange={(e) => readPassport(e.target.files[0])} disabled={!!busy} />
          </label>
          <CameraButton onFile={readPassport} label="Take a photo of the passport" disabled={!!busy} />
          {passport && <p className="hint">Saved: {passport.name}</p>}
          <div className="dc-grid">
            <label className="span2">Full name<input value={f.full_name} onChange={set('full_name')} /></label>
            <label>Passport number<input value={f.passport_no} onChange={set('passport_no')} /></label>
            <label>Passport expiry<input type="date" value={f.passport_expiry} onChange={set('passport_expiry')} /></label>
            <label>Nationality<input value={f.nationality} onChange={set('nationality')} placeholder="e.g. Belgian" /></label>
            <label>Date of birth<input type="date" value={f.date_of_birth} onChange={set('date_of_birth')} /></label>
            <label>Gender<select value={f.gender} onChange={set('gender')}><option value="">Not set</option><option>Male</option><option>Female</option></select></label>
            <label>Place of birth<input value={f.place_of_birth} onChange={set('place_of_birth')} /></label>
          </div>
          <div className="drawer-actions"><span className="spacer" /><button className="btn primary" onClick={() => setStep(2)} disabled={!f.full_name}>Next: job and pay</button></div>
        </div>
      )}

      {step === 2 && (
        <div className="add-user">
          <div className="dc-grid">
            <label className="span2">Job title<input value={f.job_title} onChange={set('job_title')} placeholder="e.g. Sales Specialist - Marketplace" /></label>
            <label>Monthly salary<input type="number" min="0" step="1" value={f.monthly_salary} onChange={set('monthly_salary')} /></label>
            <label>Currency<input value={f.currency} onChange={set('currency')} maxLength={3} /></label>
            <label>Start date<input type="date" value={f.start_date} onChange={set('start_date')} /></label>
            <label>Working days
              <select value={f.work_week} onChange={set('work_week')}>
                <option value="mon_fri">{WORK_WEEK.mon_fri}</option>
                <option value="mon_sat">{WORK_WEEK.mon_sat}</option>
              </select>
            </label>
            <label>Department<input value={f.department} onChange={set('department')} /></label>
            <label>Location<input value={f.location} onChange={set('location')} /></label>
            <label>Work email<input type="email" value={f.email} onChange={set('email')} /></label>
            <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
          </div>
          {rate !== null && <p className="hint">Day rate for part months: {f.currency} {Number(f.monthly_salary).toLocaleString('en-US')} × 12 ÷ 365 = <strong>{f.currency} {rate.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> a day.</p>}
          <div className="drawer-actions"><button className="btn ghost" onClick={() => setStep(1)}>Back</button><span className="spacer" /><button className="btn primary" onClick={() => setStep(3)} disabled={!f.monthly_salary || !f.job_title || !f.start_date}>Next: offer letter</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="add-user">
          <p>Has <strong>{f.full_name || 'this person'}</strong> signed the offer letter?</p>
          <label className="drop-line">Yes: upload the signed offer letter. It is checked against what you entered, and they become Active.
            <input type="file" accept="application/pdf,image/*" onChange={(e) => readOffer(e.target.files[0])} disabled={!!busy} />
          </label>
          <CameraButton onFile={readOffer} label="Photo of the signed letter" disabled={!!busy} />
          {offer && <p className="hint">Saved: {offer.name} ({offer.signed ? 'signed' : 'signature not found'})</p>}
          <p className="hint">Not yet? Save now as <strong>Offer sent</strong>, then use <strong>Generate offer letter</strong> on their profile, and upload the signed copy when it comes back.</p>
          <div className="drawer-actions">
            <button className="btn ghost" onClick={() => setStep(2)}>Back</button><span className="spacer" />
            <button className="btn primary" onClick={save} disabled={!!busy}>{offer?.signed ? 'Add as Active' : 'Add as Offer sent'}</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
