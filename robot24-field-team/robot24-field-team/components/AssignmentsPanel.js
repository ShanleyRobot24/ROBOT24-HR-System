'use client';
import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fmtDate, monthLabel, money, totalsByCurrency, toCSV } from '@/lib/format';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';
import { placeOf, flagOf, countryName, COUNTRY_LIST } from '@/lib/places';
import { findClashes, clashesFor, travelMismatch } from '@/lib/schedule';
import { briefText } from '@/lib/messages';
import MessageDrawer from './MessageDrawer';
import Drawer from './Drawer';
import RowMenu from './RowMenu';

const STATUSES = [['planned', 'Planned', 'neutral'], ['confirmed', 'Confirmed', 'info'], ['completed', 'Completed', 'ok'], ['cancelled', 'Cancelled', 'alert']];
const statusOf = (k) => STATUSES.find(([s]) => s === k) || STATUSES[1];
const days = (a) => Math.round((Date.parse(a.end_date) - Date.parse(a.start_date)) / 864e5) + 1;
const blank = (month) => ({ contractor_id: '', title: '', event_reference: '', city: '', country: '', start_date: month, end_date: month, status: 'confirmed', notes: '' });

export default function AssignmentsPanel({ month, contractors, assignments, costs, refresh, onAddTravel }) {
  const [f, setF] = useState(blank(month));
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [place, setPlace] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [brief, setBrief] = useState(null);
  const formRef = useRef(null);
  const byId = useMemo(() => Object.fromEntries(contractors.map((c) => [c.id, c])), [contractors]);
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const list = assignments
    .filter((a) => !place || placeOf(a) === place)
    .filter((a) => status === 'all' || a.status === status)
    .filter((a) => !q || `${byId[a.contractor_id]?.full_name || ''} ${a.title} ${a.event_reference || ''} ${a.city || ''} ${a.country || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || (byId[a.contractor_id]?.full_name || '').localeCompare(byId[b.contractor_id]?.full_name || ''));
  const travelFor = (a) => costs.filter((d) => d.assignment_id === a.id);
  const clashes = useMemo(() => findClashes(assignments), [assignments]);
  const draftClashes = clashesFor(assignments, f, editing?.id);
  const people = new Set(assignments.filter((a) => a.status !== 'cancelled').map((a) => a.contractor_id)).size;

  // One box per country, busiest first
  const places = useMemo(() => {
    const m = {};
    for (const a of assignments) {
      const name = placeOf(a);
      const p = (m[name] = m[name] || { name, jobs: 0, ids: new Set(), confirmed: 0, planned: 0, completed: 0, cancelled: 0, travel: [] });
      p.jobs += 1;
      p[a.status] = (p[a.status] || 0) + 1;
      if (a.status !== 'cancelled') p.ids.add(a.contractor_id);
      p.travel.push(...costs.filter((d) => d.assignment_id === a.id));
    }
    return Object.values(m)
      .map((p) => ({ ...p, people: p.ids.size, names: [...p.ids].map((id) => byId[id]?.full_name).filter(Boolean) }))
      .sort((x, y) => y.people - x.people || y.jobs - x.jobs || x.name.localeCompare(y.name));
  }, [assignments, costs, byId]);

  async function save(e) {
    e.preventDefault();
    if (!f.contractor_id || !f.title.trim()) return alert('Choose the person and name the assignment.');
    if (f.end_date < f.start_date) return alert('The end date is before the start date.');
    if (draftClashes.length && !confirm(`${byId[f.contractor_id]?.full_name || 'This person'} is already booked on these dates:\n\n${draftClashes.map((a) => `${a.title}, ${fmtDate(a.start_date)} to ${fmtDate(a.end_date)}`).join('\n')}\n\nSave anyway?`)) return;
    setBusy(true);
    const row = {
      contractor_id: f.contractor_id, title: f.title.trim(), event_reference: f.event_reference.trim() || null,
      city: f.city.trim() || null, country: countryName(f.country) || null, start_date: f.start_date, end_date: f.end_date,
      status: f.status, notes: f.notes.trim() || null,
    };
    let error;
    if (editing) ({ error } = await supabase.from('assignments').update(row).eq('id', editing.id));
    else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('assignments').insert({ ...row, created_by: user?.id }));
    }
    setBusy(false);
    if (error) return alert(error.message);
    // Keep the job details so the next person on the same job is quick to add
    const wasEditing = !!editing;
    setF(wasEditing ? blank(month) : { ...f, contractor_id: '' });
    setEditing(null);
    if (wasEditing) setShowForm(false);
    refresh();
  }

  function edit(a) {
    setShowForm(true);
    setEditing(a);
    setF({ contractor_id: a.contractor_id, title: a.title, event_reference: a.event_reference || '', city: a.city || '', country: a.country || '', start_date: a.start_date, end_date: a.end_date, status: a.status, notes: a.notes || '' });
  }

  async function remove(a) {
    const n = travelFor(a).length;
    if (!confirm(`Delete "${a.title}" for ${byId[a.contractor_id]?.full_name || 'this person'}?${n ? `\n\nIts ${n} travel booking${n > 1 ? 's stay' : ' stays'} on record, unlinked.` : ''}`)) return;
    const { error } = await supabase.from('assignments').delete().eq('id', a.id);
    if (error) return alert(error.message);
    if (editing?.id === a.id) { setEditing(null); setF(blank(month)); }
    refresh();
  }

  async function setStatusOf(a, s) {
    const { error } = await supabase.from('assignments').update({ status: s }).eq('id', a.id);
    if (error) alert(error.message);
    refresh();
  }

  function exportCSV() {
    if (!list.length) return alert('Nothing to export.');
    const rows = list.map((a) => {
      const c = byId[a.contractor_id] || {};
      return {
        name: c.full_name, reference: c.ref_code, role: c.designation, assignment: a.title, event: a.event_reference, city: a.city, country: a.country,
        start: a.start_date, end: a.end_date, days: days(a), status: statusOf(a.status)[1],
        travel: travelFor(a).map((d) => `${d.description || d.category} ${d.amount} ${d.currency}`).join('; '), notes: a.notes,
      };
    });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv' }));
    el.download = `robot24-assignments-${month.slice(0, 7)}.csv`;
    el.click();
  }

  return (
    <>

      <div className="sec-head">
        <h2>Where people are booked, {monthLabel(month)}<span className="count">{people} {people === 1 ? 'person' : 'people'}</span></h2>
        <span className="spacer" />
        <button className="btn primary" onClick={() => { setEditing(null); setF(blank(month)); setShowForm(true); }}>+ Add assignment</button>
      </div>
      {!places.length ? <p className="empty">No assignments in {monthLabel(month)} yet. Click + Add assignment to book someone.</p> : (
        <div className="place-grid">
          {places.map((pl) => (
            <button key={pl.name} className={`place-box ${place === pl.name ? 'on' : ''}`} onClick={() => setPlace(place === pl.name ? null : pl.name)}>
              <span className="place-flag" aria-hidden>{flagOf(pl.name)}</span>
              <span className="place-name">{pl.name}</span>
              <span className="place-people">{pl.people} {pl.people === 1 ? 'person' : 'people'} · {pl.jobs} job{pl.jobs === 1 ? '' : 's'}</span>
              <span className="place-chips">
                {pl.confirmed > 0 && <span className="chip info">{pl.confirmed} booked</span>}
                {pl.planned > 0 && <span className="chip neutral">{pl.planned} planned</span>}
                {pl.completed > 0 && <span className="chip ok">{pl.completed} completed</span>}
                {pl.cancelled > 0 && <span className="chip alert">{pl.cancelled} cancelled</span>}
              </span>
              <span className="place-faces">{pl.names.slice(0, 4).join(', ')}{pl.names.length > 4 ? ` +${pl.names.length - 4}` : ''}</span>
              {pl.travel.length > 0 && <span className="place-travel">Travel: {totalsByCurrency(pl.travel).join(' + ')}</span>}
            </button>
          ))}
        </div>
      )}

      {showForm && <Drawer title={editing ? 'Edit assignment' : 'Add an assignment'} onClose={() => { setEditing(null); setF(blank(month)); setShowForm(false); }}>
      <form ref={formRef} className="dc-form in-drawer" onSubmit={save}>
        {draftClashes.length > 0 && <p className="clash-warn">Clash: {byId[f.contractor_id]?.full_name} is already booked on {draftClashes.map((a) => `${a.title} (${fmtDate(a.start_date)} to ${fmtDate(a.end_date)})`).join(', ')}.</p>}
        <div className="dc-grid">
          <label className="span2">Person
            <select value={f.contractor_id} onChange={set('contractor_id')} required>
              <option value="">Choose the person</option>
              {contractors.filter((c) => c.active !== false || c.id === f.contractor_id).map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.ref_code ? `${c.ref_code}, ` : ''}{c.designation || 'crew'}, {c.region})</option>)}
            </select>
          </label>
          <label className="span2">Assignment<input value={f.title} onChange={set('title')} placeholder="e.g. CES Seoul coverage" required /></label>
          <label>Event or OPP code<input value={f.event_reference} onChange={set('event_reference')} placeholder="e.g. OPP-201" /></label>
          <label>City<input value={f.city} onChange={set('city')} placeholder="e.g. Seoul" /></label>
          <label>Country<input list="country-list" value={f.country} onChange={set('country')} placeholder="e.g. United Arab Emirates" /><datalist id="country-list">{COUNTRY_LIST.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label>Status
            <select value={f.status} onChange={set('status')}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label>Starts<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date })} required /></label>
          <label>Ends<input type="date" value={f.end_date} min={f.start_date} onChange={set('end_date')} required /></label>
          <label className="span2">Notes<input value={f.notes} onChange={set('notes')} placeholder="e.g. Covering keynote and show floor, 2 videos" /></label>
        </div>
        <div className="drawer-actions">
          <button type="button" className="btn ghost" onClick={() => { setEditing(null); setF(blank(month)); setShowForm(false); }}>{editing ? 'Cancel' : 'Close'}</button>
          <span className="hint">{f.start_date && f.end_date && f.end_date >= f.start_date ? `${days(f)} day${days(f) > 1 ? 's' : ''}` : ''}</span>
          <span className="spacer" />
          <button className="btn primary" disabled={busy}>{busy ? 'Saving' : editing ? 'Save changes' : 'Add assignment'}</button>
        </div>
      </form>
      </Drawer>}

      <div className="sec-head">
        <h2>{place ? <>{flagOf(place)} {place}</> : 'All assignments'}<span className="count">{list.length}</span>{place && <button className="btn ghost sm clear-place" onClick={() => setPlace(null)}>Show all places</button>}</h2>
        <span className="spacer" />
        <div className="seg">
          <button className={status === 'all' ? 'on' : ''} onClick={() => setStatus('all')}>All</button>
          {STATUSES.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        <input className="search" placeholder="Search person, job, city" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>

      {!list.length ? <p className="empty">{assignments.length ? 'Nothing matches.' : `No assignments in ${monthLabel(month)} yet.`}</p> : (
        <div className="table-wrap">
          <table className="pay-table asg-table">
            <thead><tr><th>Who</th><th>Assignment</th><th>Dates</th><th>Status</th><th>Travel booked</th><th></th></tr></thead>
            <tbody>
              {list.map((a) => {
                const c = byId[a.contractor_id] || {};
                const t = travelFor(a);
                const [, label, tone] = statusOf(a.status);
                return (
                  <tr key={a.id} className={`no-hover ${editing?.id === a.id ? 'sel-row' : ''} ${a.status === 'cancelled' ? 'inactive' : ''}`}>
                    <td><div className="who-cell"><Avatar name={c.full_name || ''} url={photos[c.photo_path]} size={34} /><div><strong>{c.full_name || 'Unknown'}</strong><span className="sub2">{[c.ref_code, c.designation].filter(Boolean).join(', ')}</span></div></div></td>
                    <td><strong>{a.title}</strong>{clashes[a.id] && <span className="chip clash" title={`Overlaps ${clashes[a.id].map((x) => x.title).join(', ')}`}>Clash</span>}<span className="sub2">{[a.event_reference, [a.city, a.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>{a.notes && <span className="sub2">{a.notes}</span>}</td>
                    <td className="nowrap">{fmtDate(a.start_date)}<span className="sub2">to {fmtDate(a.end_date)}, {days(a)} day{days(a) > 1 ? 's' : ''}</span></td>
                    <td>
                      <select className={`status-select ${tone}`} value={a.status} onChange={(e) => setStatusOf(a, e.target.value)} aria-label="Status">
                        {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td>
                      {!t.length ? <span className="muted">None yet</span> : (
                        <>
                          <strong className="num-cell">{totalsByCurrency(t).join(' + ')}</strong>
                          {t.map((d) => <span key={d.id} className="sub2">{d.description || d.category}{d.travel_date ? `, ${fmtDate(d.travel_date)}` : ''}{travelMismatch(d, a) && <span className="mismatch">⚠ {travelMismatch(d, a)}</span>}</span>)}
                        </>
                      )}
                    </td>
                    <td className="actions">
                      <button className="btn sm primary" onClick={() => onAddTravel(a)}>+ Add travel</button>
                      <RowMenu items={[{ label: 'Send brief', onClick: () => setBrief(a) }, { label: 'Edit', onClick: () => edit(a) }, { label: 'Delete', onClick: () => remove(a), danger: true }]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {brief && (() => {
        const person = byId[brief.contractor_id] || {};
        return (
          <MessageDrawer
            title={`Job brief for ${person.full_name || 'freelancer'}`}
            intro="Check the message, edit anything you need, then send it."
            to={{ name: person.full_name, phone: person.phone, email: person.email }}
            subject={`Robot24 assignment: ${brief.title}`}
            text={briefText({ person, job: brief, travel: travelFor(brief) })}
            onClose={() => setBrief(null)}
          />
        );
      })()}
    </>
  );
}
