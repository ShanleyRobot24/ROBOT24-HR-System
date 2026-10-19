'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { clashesFor } from '@/lib/schedule';
import { countryName, COUNTRY_LIST } from '@/lib/places';
import { dateWarnings } from '@/lib/sanity';
import Drawer from './Drawer';
import { CameraButton } from './ui';

// Paste or upload a client brief; the AI drafts the jobs; you check them and add the ones you want.
export default function BriefDrawer({ contractors, assignments, onClose, onAdded, initialFile = null }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => { if (initialFile) read(initialFile); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const people = contractors.filter((c) => c.active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name));

  async function read(file) {
    if (!text.trim() && !file) return setNote('Paste the brief, or upload it as a PDF or photo.');
    setBusy('Reading the brief'); setNote('');
    try {
      let path = null;
      if (file) {
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-100);
        path = `direct/briefs/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) throw error;
      }
      const out = await callApi('/api/process-invoice', { mode: 'brief', text, path, fileName: file?.name, contentType: file?.type });
      setRows(out.jobs.map((j) => ({ ...j, country: countryName(j.country) || j.country || '', include: true })));
      setNote(out.jobs.length ? `Found ${out.jobs.length} job${out.jobs.length > 1 ? 's' : ''}. Check each one, untick any you don't want, then add them.${out.notes ? ` Note: ${out.notes}` : ''}` : `No jobs found in that brief.${out.notes ? ` ${out.notes}` : ''}`);
    } catch (e) { setNote(`Could not read it: ${e.message}`); }
    setBusy('');
  }

  const upd = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const problems = (r) => {
    const p = [];
    if (!r.contractor_id) p.push(r.person_name ? `"${r.person_name}" is not on the field team list, choose someone` : 'Choose who is going');
    if (!r.start_date || !r.end_date) p.push('Add the dates');
    else p.push(...dateWarnings({ start: r.start_date, end: r.end_date, label: 'The job', maxDays: 60 }));
    const clash = r.contractor_id && r.start_date && r.end_date ? clashesFor(assignments, { contractor_id: r.contractor_id, start_date: r.start_date, end_date: r.end_date, status: r.status }) : [];
    if (clash.length) p.push(`Clash: already booked on ${clash.map((a) => `${a.title} (${fmtDate(a.start_date)} to ${fmtDate(a.end_date)})`).join(', ')}`);
    return p;
  };
  const chosen = (rows || []).filter((r) => r.include);
  const blocking = chosen.filter((r) => !r.contractor_id || !r.start_date || !r.end_date);

  async function add() {
    if (blocking.length) return alert('Each ticked job needs a person and dates.');
    const clashes = chosen.filter((r) => problems(r).some((x) => x.startsWith('Clash')));
    if (clashes.length && !confirm(`${clashes.length} of these jobs clash with existing bookings. Add them anyway?`)) return;
    setBusy('Adding the jobs');
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('assignments').insert(chosen.map((r) => ({
      contractor_id: r.contractor_id, title: r.title.trim() || 'Job', event_reference: r.event_reference || null,
      city: r.city || null, country: countryName(r.country) || null, start_date: r.start_date, end_date: r.end_date,
      status: r.status, notes: r.notes || null, created_by: user?.id,
    })));
    setBusy('');
    if (error) return alert(error.message);
    onAdded(chosen.length);
  }

  return (
    <Drawer title="Add jobs from a brief" onClose={onClose}>
      {!rows && (
        <div className="add-user">
          <p className="hint">Paste a client brief, email, WhatsApp message or itinerary. The AI drafts the jobs: who, which event, where and when. Nothing is saved until you check them and click Add.</p>
          <textarea className="msg-body" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Ishaan and Shanley to cover GITEX Dubai (OPP-215), 5 to 7 October, confirmed. Helen on standby for CES Seoul 20 to 22 Oct." />
          <div className="drawer-actions">
            <label className="btn">Upload PDF or photo<input type="file" hidden accept="application/pdf,image/*" onChange={(e) => { read(e.target.files[0]); e.target.value = ''; }} disabled={!!busy} /></label>
            <CameraButton onFile={read} disabled={!!busy} />
            <span className="spacer" />
            <button className="btn primary" onClick={() => read(null)} disabled={!!busy || !text.trim()}>Read the brief</button>
          </div>
        </div>
      )}
      {busy && <p className="dc-note">{busy}…</p>}
      {!busy && note && <p className="dc-note">{note}</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="brief-list">
            {rows.map((r, i) => {
              const p = problems(r);
              return (
                <div key={i} className={`brief-job ${r.include ? '' : 'off'}`}>
                  <label className="check brief-tick"><input type="checkbox" checked={r.include} onChange={(e) => upd(i, { include: e.target.checked })} /> Add this job</label>
                  <div className="dc-grid">
                    <label className="span2">Who
                      <select value={r.contractor_id || ''} onChange={(e) => upd(i, { contractor_id: e.target.value || null })}>
                        <option value="">{r.person_name ? `Not matched: ${r.person_name}` : 'Choose the person'}</option>
                        {people.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.designation ? ` (${c.designation})` : ''}</option>)}
                      </select>
                    </label>
                    <label className="span2">Job<input value={r.title} onChange={(e) => upd(i, { title: e.target.value })} /></label>
                    <label>OPP code<input value={r.event_reference || ''} onChange={(e) => upd(i, { event_reference: e.target.value })} /></label>
                    <label>Status<select value={r.status} onChange={(e) => upd(i, { status: e.target.value })}><option value="planned">Planned</option><option value="confirmed">Confirmed</option></select></label>
                    <label>City<input value={r.city || ''} onChange={(e) => upd(i, { city: e.target.value })} /></label>
                    <label>Country<input list="brief-countries" value={r.country || ''} onChange={(e) => upd(i, { country: e.target.value })} /></label>
                    <label>Starts<input type="date" value={r.start_date || ''} onChange={(e) => upd(i, { start_date: e.target.value, end_date: r.end_date && r.end_date >= e.target.value ? r.end_date : e.target.value })} /></label>
                    <label>Ends<input type="date" value={r.end_date || ''} min={r.start_date || undefined} onChange={(e) => upd(i, { end_date: e.target.value })} /></label>
                  </div>
                  {r.notes && <p className="hint">Note from the brief: {r.notes}</p>}
                  {r.include && p.length > 0 && <ul className="brief-warn">{p.map((x) => <li key={x}>{x}</li>)}</ul>}
                </div>
              );
            })}
            <datalist id="brief-countries">{COUNTRY_LIST.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="drawer-actions">
            <button className="btn ghost" onClick={() => { setRows(null); setNote(''); }}>Start again</button>
            <span className="spacer" />
            <button className="btn primary" onClick={add} disabled={!!busy || !chosen.length || blocking.length > 0}>Add {chosen.length} job{chosen.length === 1 ? '' : 's'}</button>
          </div>
          {blocking.length > 0 && <p className="hint">Each ticked job needs a person and dates before it can be added.</p>}
        </>
      )}
    </Drawer>
  );
}
