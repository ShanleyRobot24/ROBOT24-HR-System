'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';
import { money, fmtDate, daysUntil, monthLabel, STATUS_LABEL, openFile, totalsByCurrency, cur3 } from '@/lib/format';
import { categoryLabel } from '@/lib/categories';
import Drawer from './Drawer';
import Avatar from './Avatar';
import { resizePhoto, usePhotoUrls } from '@/lib/photos';

const INVOICE_EMAIL = process.env.R24_INVOICE_EMAIL || 's.kajee@robot24.com';
const REGIONS = ['China', 'United Kingdom', 'Singapore', 'United States', 'South Korea', 'Central Europe', 'Turkey', 'Canada'];
const KIT = ['Has it', 'Sent', 'To send', 'Not needed', 'N/A', 'No'];

// Admin only
const DETAILS = [
  ['full_name', 'Full name'],
  ['designation', 'Role', 'list', ['Journalist', 'Videographer', 'Video Journalist', 'Photographer', 'Producer', 'Editor']],
  ['region', 'Location group', 'list', REGIONS],
  ['city', 'City'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['wechat_id', 'WeChat ID'],
  ['currency', 'Currency'],
  ['day_rate', 'Day rate', 'number'],
  ['ten_day_rate', 'Old 10 day package (legacy, not used)', 'number'],
  ['fifteen_day_rate', 'Old 15 day package (legacy, not used)', 'number'],
  ['payment_terms_days', 'Pay within (days)', 'number'],
  ['tshirt_status', 'T-shirt', 'list', KIT],
  ['mic_sponge_status', 'Mic sponge', 'list', KIT],
  ['aliases', 'Other names they use (comma separated)', 'aliases', 'full'],
  ['bank_details', 'Bank details', 'textarea', 'full'],
  ['notes', 'Notes', 'textarea', 'full'],
];
// HR and finance can edit these
const ADDRESS = [
  ['address_line1', 'Address line 1', 'text', 'full'],
  ['address_line2', 'Address line 2', 'text', 'full'],
  ['address_city', 'City'],
  ['address_state', 'State or province'],
  ['address_postcode', 'Postcode'],
  ['address_country', 'Country'],
];
const DOC_TYPES = [['contract', 'Contract'], ['passport', 'Passport'], ['id_card', 'ID card'], ['visa', 'Visa or permit'], ['bank', 'Bank letter'], ['other', 'Other']];
const docLabel = (t) => (DOC_TYPES.find(([k]) => k === t) || [t, t])[1];

function instructions(c) {
  const first = (c.full_name || '').split(' ')[0];
  return `Hi ${first},

Your Robot24 reference is ${c.ref_code}.

When you send an invoice or expense claim, please:
1. Write ${c.ref_code} on the invoice, under your name
2. Send it as a PDF to ${INVOICE_EMAIL}
3. Attach receipts for any expenses

This makes sure your payment is matched to you and processed on time.

Thank you,
Robot24`;
}

function Field({ def, value, onChange, disabled }) {
  const [key, label, type, extra] = def;
  const full = type === 'textarea' || extra === 'full' || type === 'aliases';
  let input;
  if (type === 'textarea') input = <textarea rows={3} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} />;
  else if (type === 'list') input = (
    <>
      <input list={`list-${key}`} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} />
      <datalist id={`list-${key}`}>{extra.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
  else input = <input type={type === 'number' ? 'number' : 'text'} step="any" value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} disabled={disabled} />;
  return <label className={full ? 'full' : ''}>{label}{input}</label>;
}

export default function ContractorDrawer({ contractor, documents, onClose, onCreated, refresh }) {
  const { isAdmin, isFinance } = useAuth();
  const isNew = !contractor;
  const [f, setF] = useState(() => (contractor ? { ...contractor, aliases: (contractor.aliases || []).join(', ') } : { currency: 'USD', active: true, contract_signed: false, region: '' }));
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [booked, setBooked] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [doc, setDoc] = useState({ type: 'contract', file: null, signed: true, signedOn: '', expiresOn: '' });
  const [copied, setCopied] = useState(false);
  const change = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [photoPath, setPhotoPath] = useState(contractor?.photo_path || null);
  const photoUrls = usePhotoUrls([photoPath]);
  const photoInput = useRef(null);

  async function setPhoto(file) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await resizePhoto(file);
      const path = `${contractor.id}/photo-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { error } = await supabase.from('contractors').update({ photo_path: path }).eq('id', contractor.id);
      if (error) throw error;
      if (photoPath) await supabase.storage.from('photos').remove([photoPath]);
      setPhotoPath(path);
      refresh();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function removePhoto() {
    if (!photoPath || !confirm('Remove this photo?')) return;
    setBusy(true);
    const { error } = await supabase.from('contractors').update({ photo_path: null }).eq('id', contractor.id);
    if (error) alert(error.message);
    else { await supabase.storage.from('photos').remove([photoPath]); setPhotoPath(null); refresh(); }
    setBusy(false);
  }

  useEffect(() => {
    if (!contractor) return;
    supabase.from('payments').select('id, period, kind, amount, currency, status, invoice_number, paid_on')
      .eq('contractor_id', contractor.id).order('period', { ascending: false }).limit(60)
      .then(({ data }) => setHistory(data || []));
    supabase.from('direct_costs').select('id, period, category, description, supplier, travel_date, amount, currency')
      .eq('contractor_id', contractor.id).order('period', { ascending: false }).limit(60)
      .then(({ data }) => setBooked(data || []));
    supabase.from('assignments').select('id, title, event_reference, city, country, start_date, end_date, status')
      .eq('contractor_id', contractor.id).order('start_date', { ascending: false }).limit(60)
      .then(({ data }) => setJobs(data || []));
  }, [contractor]);

  function detailsRow() {
    const row = {};
    for (const [k, , type] of DETAILS) {
      let v = f[k];
      if (type === 'number') v = v === '' || v === null || v === undefined ? null : Number(v);
      else if (type === 'aliases') v = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
      else v = v === '' || v === undefined ? null : v;
      row[k] = v;
    }
    row.currency = cur3(row.currency);
    row.contract_signed = !!f.contract_signed;
    row.active = !!f.active;
    return row;
  }
  function addressRow() {
    const row = {};
    for (const [k] of ADDRESS) row[k] = f[k] === '' || f[k] === undefined ? null : f[k];
    return row;
  }

  async function save() {
    if (!f.full_name || !f.region) return alert('Name and location group are required.');
    setBusy(true);
    let res;
    if (isNew) res = await supabase.from('contractors').insert({ ...detailsRow(), ...addressRow() }).select('id').single();
    else if (isAdmin) res = await supabase.from('contractors').update({ ...detailsRow(), ...addressRow() }).eq('id', contractor.id);
    else res = await supabase.from('contractors').update(addressRow()).eq('id', contractor.id);
    setBusy(false);
    if (res.error) return alert(res.error.message);
    await refresh();
    if (isNew) onCreated(res.data.id); else onClose();
  }

  async function upload() {
    if (!doc.file) return;
    setBusy(true);
    const safe = doc.file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `${contractor.id}/${doc.type}-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(path, doc.file, { contentType: doc.file.type || 'application/octet-stream' });
    if (upErr) { setBusy(false); return alert(upErr.message); }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('documents').insert({
      contractor_id: contractor.id, doc_type: doc.type, file_path: path, file_name: doc.file.name,
      is_signed: doc.type === 'contract' ? doc.signed : false,
      signed_on: doc.signedOn || null, expires_on: doc.expiresOn || null, uploaded_by: user?.id,
    });
    setBusy(false);
    if (error) return alert(error.message);
    setDoc({ type: doc.type, file: null, signed: true, signedOn: '', expiresOn: '' });
    refresh();
  }

  async function removeDoc(d) {
    if (!confirm(`Delete ${d.file_name}?`)) return;
    await supabase.storage.from('documents').remove([d.file_path]);
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) alert(error.message);
    refresh();
  }

  async function copy() {
    await navigator.clipboard.writeText(instructions(contractor));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Drawer title={isNew ? 'Add field team member' : contractor.full_name} onClose={onClose}>
      {!isNew && (
        <div className="ref-box">
          <div className="photo-box">
            <Avatar name={contractor.full_name} url={photoUrls[photoPath]} size={84} />
            {isFinance && (
              <div className="photo-actions">
                <button className="btn sm" disabled={busy} onClick={() => photoInput.current?.click()}>{photoPath ? 'Change photo' : 'Add photo'}</button>
                {photoPath && <button className="btn ghost sm" disabled={busy} onClick={removePhoto}>Remove</button>}
                <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { setPhoto(e.target.files[0]); e.target.value = ''; }} />
              </div>
            )}
          </div>
          <div>
            <span className="hint">Invoice reference</span>
            <p className="ref-big">{contractor.ref_code}</p>
          </div>
          <span className="spacer" />
          {contractor.email && <a className="btn" href={`mailto:${contractor.email}?subject=${encodeURIComponent('Your Robot24 invoice reference')}&body=${encodeURIComponent(instructions(contractor))}`}>Email reference</a>}
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy reference message'}</button>
        </div>
      )}

      {isNew && <p className="hint">You can add a photo, documents and the address once the person is saved.</p>}
      <h3 className="sec first">Details</h3>
      {!isAdmin && <p className="hint">Only an admin can change these.</p>}
      <div className="form-grid">
        {DETAILS.map((d) => <Field key={d[0]} def={d} value={f[d[0]]} onChange={change} disabled={!isAdmin} />)}
        <label className="check"><input type="checkbox" checked={!!f.contract_signed} onChange={(e) => change('contract_signed', e.target.checked)} disabled={!isAdmin} /> Contract signed</label>
        <label className="check"><input type="checkbox" checked={!!f.active} onChange={(e) => change('active', e.target.checked)} disabled={!isAdmin} /> Active</label>
      </div>

      <h3 className="sec">Home address</h3>
      <div className="form-grid">
        {ADDRESS.map((d) => <Field key={d[0]} def={d} value={f[d[0]]} onChange={change} disabled={!isFinance} />)}
      </div>

      <div className="drawer-actions">
        <span className="spacer" />
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving' : isNew ? 'Add person' : isAdmin ? 'Save all changes' : 'Save address'}</button>
      </div>

      {!isNew && (
        <>
          <h3 className="sec">Contracts, passport and ID</h3>
          {documents.length === 0 && <p className="empty">Nothing uploaded yet.</p>}
          <ul className="files-list">
            {documents.map((d) => {
              const n = d.expires_on ? daysUntil(d.expires_on) : null;
              return (
                <li key={d.id}>
                  <span className="doc-type">{docLabel(d.doc_type)}</span>
                  <button className="linkish" onClick={() => openFile(supabase, 'documents', d.file_path)}>{d.file_name}</button>
                  <span className="sub2">
                    {[d.doc_type === 'contract' && (d.is_signed ? 'Signed copy' : 'Unsigned'), d.signed_on && `signed ${fmtDate(d.signed_on)}`, `uploaded ${fmtDate(d.created_at)}`].filter(Boolean).join(', ')}
                    {d.expires_on && <span className={n < 0 ? 'due-overdue' : n < 180 ? 'warn-text' : ''}>, {n < 0 ? 'expired' : 'expires'} {fmtDate(d.expires_on)}</span>}
                  </span>
                  <button className="btn ghost sm" onClick={() => removeDoc(d)}>Delete</button>
                </li>
              );
            })}
          </ul>
          <div className="upload">
            <label>Document
              <select value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
                {DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label>File<input type="file" accept="application/pdf,image/*,.doc,.docx" onChange={(e) => setDoc({ ...doc, file: e.target.files[0] || null })} /></label>
            {doc.type === 'contract' && <>
              <label className="check"><input type="checkbox" checked={doc.signed} onChange={(e) => setDoc({ ...doc, signed: e.target.checked })} /> Signed copy</label>
              <label>Signed on<input type="date" value={doc.signedOn} onChange={(e) => setDoc({ ...doc, signedOn: e.target.value })} /></label>
            </>}
            <label>{doc.type === 'contract' ? 'Contract ends' : 'Expires on'}<input type="date" value={doc.expiresOn} onChange={(e) => setDoc({ ...doc, expiresOn: e.target.value })} /></label>
            <button className="btn" disabled={!doc.file || busy} onClick={upload}>Upload</button>
          </div>
          {doc.type === 'contract' && <p className="hint">Uploading a signed copy marks the contract as signed for production.</p>}

          <h3 className="sec">Payments</h3>
          {!history.length ? <p className="empty">No bills yet.</p> : (
            <ul className="files-list">
              {history.map((p) => (
                <li key={p.id}>
                  <span><strong>{money(p.amount, p.currency)}</strong> {p.kind === 'expense' ? 'Expenses' : 'Fee'}{p.invoice_number ? `, ${p.invoice_number}` : ''}</span>
                  <span className="sub2">{monthLabel(p.period)}, {STATUS_LABEL[p.status]}{p.paid_on ? ` ${fmtDate(p.paid_on)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="sec">Assignments</h3>
          {!jobs.length ? <p className="empty">No assignments recorded yet.</p> : (
            <ul className="files-list">
              {jobs.map((a) => (
                <li key={a.id}>
                  <span><strong>{a.title}</strong>{a.event_reference ? ` (${a.event_reference})` : ''}{a.city ? `, ${a.city}` : ''}</span>
                  <span className="sub2">{fmtDate(a.start_date)} to {fmtDate(a.end_date)}, {a.status}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="sec">Booked by Robot24</h3>
          {!booked.length ? <p className="empty">No flights, trains or hotels booked directly for this person.</p> : (
            <>
              <p className="hint">Total: {totalsByCurrency(booked).join(' + ')}. Not owed to them, shown for the full cost.</p>
              <ul className="files-list">
                {booked.map((d) => (
                  <li key={d.id}>
                    <span><strong>{money(d.amount, d.currency)}</strong> {categoryLabel(d.category)}{d.description ? `, ${d.description}` : ''}</span>
                    <span className="sub2">{monthLabel(d.period)}{d.travel_date ? `, travel ${fmtDate(d.travel_date)}` : ''}{d.supplier ? `, ${d.supplier}` : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
