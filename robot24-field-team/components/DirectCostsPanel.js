'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { money, fmtDate, monthLabel, totalsByCurrency, groupBy, sortRegions, toCSV, openFile, cur3 } from '@/lib/format';
import { EXPENSE_CATEGORIES, categoryLabel, guessCategory } from '@/lib/categories';
import { callApi } from '@/lib/api';
import { travelMismatch } from '@/lib/schedule';
import { amountWarning, dateWarnings, okToSave } from '@/lib/sanity';
import RowMenu from './RowMenu';
import { EmptyState } from './ui';
import { CameraButton } from './ui';
import { useUndo } from './Undo';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';

// Most direct bookings are travel, so these come first
const ORDER = ['flights', 'train_bus', 'hotel', 'taxi_uber', 'car_fuel', 'visa_fees', 'equipment', 'data_phone', 'meals', 'other'];
const CATS = ORDER.map((k) => EXPENSE_CATEGORIES.find(([c]) => c === k)).filter(Boolean);

const blank = (keep = {}) => ({ contractor_id: '', assignment_id: '', category: 'flights', description: '', supplier: '', booking_ref: '', travel_date: '', end_date: '', amount: '', currency: 'USD', ...keep });
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isActive = (c) => c.active !== false;

// The assignment (opportunity) a booking belongs to, for that person:
// 1. the OPP code or event name on the document, 2. dates within 3 days of the job (city breaks a tie), 3. their only job
function pickAssignment(assignments, contractorId, date, hint = {}) {
  const mine = assignments.filter((a) => a.contractor_id === contractorId && a.status !== 'cancelled');
  if (!mine.length) return '';
  const ref = norm(hint.event_reference);
  if (ref) {
    const byCode = mine.find((a) => a.event_reference && ref.includes(norm(a.event_reference)));
    if (byCode) return byCode.id;
    const byName = mine.find((a) => norm(a.title) && (ref.includes(norm(a.title)) || norm(a.title).includes(ref)));
    if (byName) return byName.id;
  }
  if (date) {
    const t = Date.parse(date);
    const near = mine.filter((a) => t >= Date.parse(a.start_date) - 3 * 864e5 && t <= Date.parse(a.end_date) + 3 * 864e5);
    if (near.length === 1) return near[0].id;
    if (near.length > 1 && hint.city) {
      const inCity = near.find((a) => norm(a.city) && norm(a.city) === norm(hint.city));
      if (inCity) return inCity.id;
    }
    if (near.length) return near[0].id;
  }
  if (hint.city) {
    const inCity = mine.filter((a) => norm(a.city) && norm(a.city) === norm(hint.city));
    if (inCity.length === 1) return inCity[0].id;
  }
  return mine.length === 1 ? mine[0].id : '';
}

export default function DirectCostsPanel({ month, contractors, costs, refresh, assignments = [], prefill = null }) {
  const [f, setF] = useState(blank());
  const [catTouched, setCatTouched] = useState(false);
  const [ticketPath, setTicketPath] = useState(null);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState(null);
  const { showUndo } = useUndo();
  const [split, setSplit] = useState(null);
  const [sharedManual, setSharedManual] = useState(false);
  const ticketInput = useRef(null);
  const [editing, setEditing] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const fileInput = useRef(null);
  const formRef = useRef(null);

  const byId = useMemo(() => Object.fromEntries(contractors.map((c) => [c.id, c])), [contractors]);
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const byAssignment = useMemo(() => Object.fromEntries(assignments.map((a) => [a.id, a])), [assignments]);
  const myAssignments = assignments.filter((a) => a.contractor_id === f.contractor_id);

  // "+ Add travel" from an assignment opens the form for that person and job
  useEffect(() => {
    if (!prefill) return;
    setEditing(null);
    setF(blank({ contractor_id: prefill.contractor_id, assignment_id: prefill.assignment_id || '', travel_date: prefill.travel_date || '' }));
    setCatTouched(false);
    setTicketPath(null);
    setNote('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [prefill]);

  const setPerson = (e) => {
    const id = e.target.value;
    setF({ ...f, contractor_id: id, assignment_id: pickAssignment(assignments, id, f.travel_date) });
  };
  const setDescription = (e) => {
    const description = e.target.value;
    const guess = catTouched ? null : guessCategory(description);
    setF({ ...f, description, category: guess || f.category });
  };
  const setDate = (e) => {
    const travel_date = e.target.value;
    setF({ ...f, travel_date, assignment_id: f.assignment_id || pickAssignment(assignments, f.contractor_id, travel_date) });
  };

  // Upload an e-ticket or booking confirmation: the AI fills in the form
  // Others booked on the same opportunity (same OPP code, or same job name) at overlapping dates
  function colleaguesOn(job) {
    const key = job.event_reference ? norm(job.event_reference) : norm(job.title);
    return [...new Set(assignments.filter((a) => a.status !== 'cancelled' && a.id !== job.id
      && (job.event_reference ? norm(a.event_reference) === key : norm(a.title) === key)
      && a.start_date <= job.end_date && job.start_date <= a.end_date).map((a) => a.contractor_id))];
  }

  // Equal shares that always add up exactly: any leftover cent goes to the first person
  function equalShares(total, n) {
    if (!n) return [];
    const t = Math.round(Number(total || 0) * 100);
    const each = Math.floor(t / n);
    return Array.from({ length: n }, (_, i) => (each + (i === 0 ? t - each * n : 0)) / 100);
  }

  // Warn before the same booking reference is counted twice
  async function duplicateOk(ref, exclude = []) {
    const r = String(ref || '').trim();
    if (!r) return true;
    const { data } = await supabase.from('direct_costs').select('id, contractor_id, amount, currency, description, period, split_of').ilike('booking_ref', r);
    const others = (data || []).filter((d) => !exclude.includes(d.id));
    if (!others.length) return true;
    return confirm(`Booking reference ${r} is already recorded:\n\n${others.map((d) => `${byId[d.contractor_id]?.full_name || 'Someone'}: ${money(d.amount, d.currency)}${d.split_of ? ` (shared, 1 of ${d.split_of})` : ''}, ${d.description || ''}, ${monthLabel(d.period)}`).join('\n')}\n\nSaving it again would count this receipt twice. Save anyway?`);
  }

  function openSplit({ x, path, hint, language, people, perPerson = {}, unmatched = [] }) {
    const ids = [...new Set(people.filter(Boolean))];
    const given = ids.length > 1 && ids.every((id) => perPerson[id] != null);
    const eq = equalShares(x.amount, ids.length);
    setSplit({
      x: { ...x }, path, hint, language, unmatched,
      mode: given ? 'custom' : 'equal',
      rows: ids.map((id, i) => ({ contractor_id: id, assignment_id: pickAssignment(assignments, id, x.travel_date, hint), amount: given ? perPerson[id] : eq[i] })),
    });
    setAsk(null);
  }

  function applySingle(a) {
    const x = a.x;
    const person = a.person || '';
    const date = x.travel_date || f.travel_date;
    setF({
      ...f,
      contractor_id: person,
      assignment_id: pickAssignment(assignments, person, date, a.hint) || '',
      end_date: x.end_date || f.end_date,
      category: x.category || f.category,
      description: x.description || f.description,
      supplier: x.supplier || f.supplier,
      booking_ref: x.booking_ref || f.booking_ref,
      travel_date: date || '',
      amount: x.amount ?? f.amount,
      currency: x.currency || f.currency,
    });
    setCatTouched(true);
    const job = assignments.find((j) => j.id === pickAssignment(assignments, person, date, a.hint));
    const name = byId[person]?.full_name;
    setNote(`${a.language ? `Translated from ${a.language}. ` : ''}${name ? `For ${name}${job ? `, on ${job.title}` : ''}` : 'Choose the person'}. Check the details, then click ${editing ? 'Save changes' : 'Add booking'}.${a.notes ? ` Note: ${a.notes}` : ''}${x.amount == null ? ' The amount was not on the document.' : ''}`);
    setAsk(null);
  }

  async function readTicket(file) {
    if (!file) return;
    setReading(true);
    setNote('');
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Over 30 MB');
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
      const path = `direct/${month.slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      const out = await callApi('/api/process-invoice', { mode: 'ticket', path, fileName: file.name, contentType: file.type });
      const x = out.fields || {};
      const hint = out.hint || {};
      const matched = (out.travellers || []).filter((t) => t.contractor_id && contractors.some((c) => c.id === t.contractor_id));
      const primary = matched[0]?.contractor_id || (out.contractor_id && contractors.some((c) => c.id === out.contractor_id) ? out.contractor_id : f.contractor_id) || '';
      const date = x.travel_date || f.travel_date;
      const job = assignments.find((a) => a.id === pickAssignment(assignments, primary, date, hint));
      setAsk({
        path, x, hint, language: out.language, notes: out.notes, primary, job,
        matchedIds: matched.map((t) => t.contractor_id),
        perPerson: Object.fromEntries(matched.filter((t) => t.amount != null).map((t) => [t.contractor_id, t.amount])),
        unmatched: (out.travellers || []).filter((t) => !matched.includes(t)).map((t) => t.name).filter(Boolean),
        colleagues: job ? colleaguesOn(job).filter((id) => id !== primary) : [],
        person: primary,
        suggestShared: matched.length > 1,
      });
      setTicketPath(path);
    } catch (e) {
      setNote(`Could not read the ticket: ${e.message}. Fill the form in by hand.`);
    }
    setReading(false);
  }

  const list = costs.filter((d) => !q || `${byId[d.contractor_id]?.full_name || ''} ${d.description || ''} ${d.supplier || ''} ${d.booking_ref || ''}`.toLowerCase().includes(q.toLowerCase()));
  const byCat = {};
  for (const d of costs) {
    const key = `${d.category}|${d.currency}`;
    byCat[key] = (byCat[key] || 0) + Number(d.amount || 0);
  }

  async function save(e) {
    e.preventDefault();
    if (!f.contractor_id) return alert('Choose the person this was booked for.');
    if (!f.amount || isNaN(Number(f.amount)) || Number(f.amount) <= 0) return alert('Enter the amount Robot24 paid.');
    if (f.end_date && f.travel_date && f.end_date < f.travel_date) return alert('The check-out or return date is before the start date.');
    if (sharedManual && !editing) {
      const job = assignments.find((j) => j.id === f.assignment_id);
      openSplit({
        x: { category: f.category, description: f.description, supplier: f.supplier, booking_ref: f.booking_ref, travel_date: f.travel_date, end_date: f.end_date, amount: Number(f.amount), currency: f.currency },
        path: ticketPath, hint: {}, people: [f.contractor_id, ...(job ? colleaguesOn(job) : [])],
      });
      return;
    }
    const usual = costs.filter((c) => c.category === f.category && cur3(c.currency) === cur3(f.currency) && c.id !== editing?.id).map((c) => c.amount);
    if (!okToSave([
      amountWarning(f.amount, { usual: usual.length >= 3 ? usual : [], cap: cur3(f.currency) === 'AED' ? 40000 : 12000, label: 'This booking', cur: cur3(f.currency) }),
      ...dateWarnings({ start: f.travel_date, end: f.end_date, label: 'The travel date', pastDays: 120, maxDays: 60 }),
    ])) return;
    if (!(await duplicateOk(f.booking_ref, editing ? [editing.id] : []))) return;
    setBusy(true);
    try {
      let receipt_path = ticketPath || editing?.receipt_path || null;
      if (file) {
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
        const path = `direct/${month.slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) throw error;
        if (receipt_path && receipt_path !== ticketPath) await supabase.storage.from('invoices').remove([receipt_path]);
        receipt_path = path;
      }
      const row = {
        contractor_id: f.contractor_id, assignment_id: f.assignment_id || null, period: month, category: f.category,
        description: f.description || null, supplier: f.supplier || null, booking_ref: f.booking_ref || null,
        travel_date: f.travel_date || null, end_date: f.end_date || null, amount: Math.round(Number(f.amount) * 100) / 100,
        currency: cur3(f.currency), receipt_path,
      };
      if (editing) {
        const { error } = await supabase.from('direct_costs').update(row).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('direct_costs').insert({ ...row, created_by: user?.id });
        if (error) throw error;
      }
      // Keep the person, category and currency, ready for the next booking
      setF(blank({ contractor_id: f.contractor_id, assignment_id: f.assignment_id, category: f.category, currency: f.currency }));
      setEditing(null);
      setFile(null);
      setTicketPath(null);
      setCatTouched(false);
      setNote('');
      if (fileInput.current) fileInput.current.value = '';
      refresh();
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  }

  async function saveSplit() {
    const rows0 = split.rows.filter((r) => r.contractor_id);
    if (rows0.length < 2) return alert('A shared receipt needs at least two people. For one person, cancel and use the normal form.');
    if (rows0.some((r) => !Number(r.amount) || Number(r.amount) <= 0)) return alert('Each person needs an amount.');
    if (!(await duplicateOk(split.x.booking_ref))) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const x = split.x;
    const group = crypto.randomUUID();
    const total = Math.round(rows0.reduce((t, r) => t + Number(r.amount), 0) * 100) / 100;
    const rows = rows0.map((r) => ({
      contractor_id: r.contractor_id, assignment_id: r.assignment_id || null, period: month, category: x.category || 'hotel',
      description: x.description || null, supplier: x.supplier || null, booking_ref: x.booking_ref || null,
      travel_date: x.travel_date || null, end_date: x.end_date || null, amount: Math.round(Number(r.amount) * 100) / 100,
      currency: cur3(x.currency), receipt_path: split.path || null, created_by: user?.id,
      split_group: group, split_of: rows0.length, split_total: total,
    }));
    const { error } = await supabase.from('direct_costs').insert(rows);
    setBusy(false);
    if (error) return alert(error.message);
    setSplit(null);
    setSharedManual(false);
    setF(blank());
    setTicketPath(null);
    setNote(`Saved one ${categoryLabel(x.category).toLowerCase()} receipt of ${money(total, x.currency)} split between ${rows.length} people.`);
    refresh();
  }

  function edit(d) {
    setEditing(d);
    setCatTouched(true);
    setTicketPath(null);
    setNote('');
    setF({
      contractor_id: d.contractor_id, assignment_id: d.assignment_id || '', category: d.category, description: d.description || '', supplier: d.supplier || '',
      booking_ref: d.booking_ref || '', travel_date: d.travel_date || '', end_date: d.end_date || '', amount: d.amount, currency: d.currency,
    });
    setFile(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancel() {
    setEditing(null);
    setF(blank());
    setFile(null);
    setTicketPath(null);
    setCatTouched(false);
    setNote('');
  }

  async function remove(d) {
    const clean = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !['created_at', 'updated_at'].includes(k)));
    let rows = [d];
    let whole = true;
    if (d.split_group) {
      const all = confirm(`This is one share of a receipt split between ${d.split_of} people (${money(d.split_total, d.currency)} in total).\n\nOK removes all ${d.split_of} shares. Cancel removes only ${byId[d.contractor_id]?.full_name || 'this person'}'s share.`);
      if (all) {
        const { data } = await supabase.from('direct_costs').select('*').eq('split_group', d.split_group);
        rows = data || [d];
      } else whole = false;
    }
    const { error } = await supabase.from('direct_costs').delete().in('id', rows.map((r) => r.id));
    if (error) return alert(error.message);
    if (editing && rows.some((r) => r.id === editing.id)) cancel();
    refresh();
    const who = rows.length > 1 ? `${rows.length} shares` : `${byId[d.contractor_id]?.full_name || 'this person'}'s`;
    showUndo(`Deleted ${who} ${categoryLabel(d.category).toLowerCase()} booking, ${money(rows.reduce((t, r) => t + Number(r.amount), 0), d.currency)}`,
      async () => { const { error: e } = await supabase.from('direct_costs').insert(rows.map(clean)); if (e) throw e; refresh(); },
      async () => { if (whole && d.receipt_path) await supabase.storage.from('invoices').remove([d.receipt_path]); });
  }

  function exportCSV() {
    if (!costs.length) return alert('Nothing to export.');
    const rows = costs.map((d) => {
      const c = byId[d.contractor_id] || {};
      return {
        month: month.slice(0, 7), name: c.full_name, reference: c.ref_code, location: c.region, category: categoryLabel(d.category),
        assignment: d.assignment_id && byAssignment[d.assignment_id] ? byAssignment[d.assignment_id].title : '', description: d.description, supplier: d.supplier, end_date: d.end_date, booking_ref: d.booking_ref, travel_date: d.travel_date, amount: d.amount, currency: d.currency,
      };
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv' }));
    a.download = `robot24-booked-${month.slice(0, 7)}.csv`;
    a.click();
  }

  const groups = groupBy(list, (d) => byId[d.contractor_id]?.region);
  const regions = Object.keys(groups).sort(sortRegions);

  return (
    <>
      <p className="hint lead">Flights, trains, hotels and other costs Robot24 books and pays for directly. They are recorded against the person for reporting, but are not owed to them, so they never appear in bills, approvals or the payment run.</p>

      {ask && (
        <div className="dc-form ask-card">
          <div className="dc-head"><h3>Is this receipt for one person, or shared?</h3></div>
          <p className="dc-note">
            {ask.language ? `Translated from ${ask.language}. ` : ''}
            {ask.x.description || categoryLabel(ask.x.category)}{ask.x.supplier ? `, ${ask.x.supplier}` : ''}{ask.x.booking_ref ? `, ref ${ask.x.booking_ref}` : ''}
            {ask.x.travel_date ? `, ${fmtDate(ask.x.travel_date)}${ask.x.end_date ? ` to ${fmtDate(ask.x.end_date)}` : ''}` : ''}. Total {ask.x.amount != null ? money(ask.x.amount, ask.x.currency || 'USD') : 'not shown'}.
          </p>
          {ask.matchedIds.length > 1 && <p className="le-warn">The document names {ask.matchedIds.length} people: {ask.matchedIds.map((id) => byId[id]?.full_name).join(', ')}. This is probably a shared receipt.</p>}
          {ask.matchedIds.length <= 1 && ask.colleagues.length > 0 && <p className="hint">Also booked on {ask.job?.title}: {ask.colleagues.map((id) => byId[id]?.full_name).filter(Boolean).join(', ')}. If this one receipt covers them too, choose Shared so the cost is split, not counted twice.</p>}
          {ask.unmatched.length > 0 && <p className="hint">Not on the field team list: {ask.unmatched.join(', ')}.</p>}
          <div className="ask-choices">
            <div className={`ask-choice ${!ask.suggestShared && !ask.colleagues.length ? 'suggested' : ''}`}>
              <strong>One person</strong>
              <span className="sub2">The whole amount is for one person.</span>
              <select value={ask.person} onChange={(e) => setAsk({ ...ask, person: e.target.value })}>
                <option value="">Choose the person</option>
                {contractors.filter(isActive).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
              <button type="button" className="btn" onClick={() => applySingle(ask)}>Continue for one person</button>
            </div>
            <div className={`ask-choice ${ask.suggestShared || ask.colleagues.length ? 'suggested' : ''}`}>
              <strong>Shared between several people</strong>
              <span className="sub2">One receipt covering more than one person. The amount is split, never counted twice.</span>
              <button type="button" className="btn primary" onClick={() => openSplit({ x: ask.x, path: ask.path, hint: ask.hint, language: ask.language, unmatched: ask.unmatched, perPerson: ask.perPerson, people: ask.matchedIds.length > 1 ? ask.matchedIds : [ask.primary, ...ask.colleagues] })}>Split this receipt</button>
            </div>
          </div>
          <div className="drawer-actions"><button type="button" className="btn ghost" onClick={() => { setAsk(null); setTicketPath(null); }}>Cancel</button></div>
        </div>
      )}

      {split && (() => {
        const cur = split.x.currency || 'USD';
        const chosen = split.rows.map((r) => r.contractor_id);
        const suggestions = [...new Set(split.rows.flatMap((r) => { const j = assignments.find((a) => a.id === r.assignment_id); return j ? colleaguesOn(j) : []; }))].filter((id) => !chosen.includes(id));
        const setRows = (rows, mode = split.mode) => {
          if (mode === 'equal') { const eq = equalShares(split.x.amount, rows.length); rows = rows.map((r, i) => ({ ...r, amount: eq[i] })); }
          setSplit({ ...split, rows, mode });
        };
        const addPerson = (id) => id && !chosen.includes(id) && setRows([...split.rows, { contractor_id: id, assignment_id: pickAssignment(assignments, id, split.x.travel_date, split.hint), amount: 0 }]);
        const sum = split.rows.reduce((t, r) => t + Number(r.amount || 0), 0);
        return (
          <div className="dc-form group-split">
            <div className="dc-head"><h3>Split this receipt between {split.rows.length} {split.rows.length === 1 ? 'person' : 'people'}</h3></div>
            <p className="dc-note">
              {split.language ? `Translated from ${split.language}. ` : ''}
              {split.x.description || categoryLabel(split.x.category)}{split.x.supplier ? `, ${split.x.supplier}` : ''}{split.x.booking_ref ? `, ref ${split.x.booking_ref}` : ''}
              {split.x.travel_date ? `, ${fmtDate(split.x.travel_date)}${split.x.end_date ? ` to ${fmtDate(split.x.end_date)}` : ''}` : ''}. Each person gets their share, linked to their own job, and the receipt is attached to each.
            </p>
            {split.unmatched.length > 0 && <p className="le-warn">Not on the field team list: {split.unmatched.join(', ')}. Their share is not included unless you add them.</p>}
            <div className="split-controls">
              <label>Receipt total ({cur})<input className="fx-input" type="number" step="0.01" value={split.x.amount ?? ''} onChange={(e) => { const x = { ...split.x, amount: e.target.value === '' ? null : Number(e.target.value) }; const eq = equalShares(x.amount, split.rows.length); setSplit({ ...split, x, rows: split.mode === 'equal' ? split.rows.map((r, i) => ({ ...r, amount: eq[i] })) : split.rows }); }} /></label>
              <div className="seg">
                <button type="button" className={split.mode === 'equal' ? 'on' : ''} onClick={() => setRows(split.rows, 'equal')}>Split equally</button>
                <button type="button" className={split.mode === 'custom' ? 'on' : ''} onClick={() => setSplit({ ...split, mode: 'custom' })}>Enter amounts</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="pay-table">
                <thead><tr><th>Person</th><th>Assignment</th><th className="r">Share ({cur})</th><th /></tr></thead>
                <tbody>
                  {split.rows.map((r, i) => {
                    const theirs = assignments.filter((a) => a.contractor_id === r.contractor_id && a.status !== 'cancelled');
                    const upd = (patch) => setSplit({ ...split, rows: split.rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <tr key={r.contractor_id} className="no-hover">
                        <td><strong>{byId[r.contractor_id]?.full_name || 'Unknown'}</strong><span className="sub2">{byId[r.contractor_id]?.ref_code}</span></td>
                        <td>
                          <select value={r.assignment_id || ''} onChange={(e) => upd({ assignment_id: e.target.value })}>
                            <option value="">{theirs.length ? 'Not linked' : 'No assignments this month'}</option>
                            {theirs.map((a) => <option key={a.id} value={a.id}>{a.title}{a.event_reference ? ` (${a.event_reference})` : ''}</option>)}
                          </select>
                        </td>
                        <td className="r"><input className="fx-input" type="number" step="0.01" value={r.amount} disabled={split.mode === 'equal'} onChange={(e) => upd({ amount: e.target.value })} /></td>
                        <td className="actions"><button type="button" className="btn ghost sm" onClick={() => setRows(split.rows.filter((_, j) => j !== i))}>Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={2}><strong>Total</strong></td><td className="r num-cell">{money(sum, cur)}</td><td /></tr></tfoot>
              </table>
            </div>
            <div className="split-add">
              {suggestions.length > 0 && <span className="hint">Also on this job: {suggestions.map((id) => <button key={id} type="button" className="btn sm" onClick={() => addPerson(id)}>+ {byId[id]?.full_name}</button>)}</span>}
              <select value="" onChange={(e) => addPerson(e.target.value)}>
                <option value="">+ Add someone else</option>
                {contractors.filter((c) => isActive(c) && !chosen.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            {split.x.amount != null && Math.abs(sum - Number(split.x.amount)) > 0.009 && (
              <p className="le-warn">The shares add up to {money(sum, cur)}, but the receipt total is {money(split.x.amount, cur)}.</p>
            )}
            <div className="drawer-actions">
              <button type="button" className="btn ghost" onClick={() => setSplit(null)}>Cancel</button>
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={busy || split.rows.length < 2} onClick={saveSplit}>Save {split.rows.length} shares</button>
            </div>
          </div>
        );
      })()}

      <form ref={formRef} className={`dc-form ${editing ? 'editing' : ''}`} onSubmit={save}>
        <div className="dc-head">
          <h3>{editing ? 'Edit booking' : `Add a booking for ${monthLabel(month)}`}</h3>
          <button type="button" className="btn primary sm" disabled={reading} onClick={() => ticketInput.current?.click()}>{reading ? 'Reading document' : 'Upload ticket, hotel booking or receipt'}</button>
          <input ref={ticketInput} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { readTicket(e.target.files[0]); e.target.value = ''; }} />
          <CameraButton onFile={readTicket} label="Photo of receipt" disabled={reading} />
        </div>
        {note && <p className="dc-note">{note}</p>}
        {f.assignment_id && byAssignment[f.assignment_id] && travelMismatch(f, byAssignment[f.assignment_id]) && (
          <p className="le-warn">Dates don't fit {byAssignment[f.assignment_id].title} ({fmtDate(byAssignment[f.assignment_id].start_date)} to {fmtDate(byAssignment[f.assignment_id].end_date)}): {travelMismatch(f, byAssignment[f.assignment_id])}. Check the dates or the assignment.</p>
        )}
        <div className="dc-grid">
          <label className="span2">Booked for
            <select value={f.contractor_id} onChange={setPerson} required>
              <option value="">Choose the person</option>
              {contractors.filter((c) => isActive(c) || c.id === f.contractor_id).map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.ref_code}, {c.region})</option>)}
            </select>
          </label>
          <label>Category
            <select value={f.category} onChange={(e) => { setCatTouched(true); setF({ ...f, category: e.target.value }); }}>
              {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>{f.category === 'hotel' ? 'Check-in' : 'Travel date'}<input type="date" value={f.travel_date} onChange={setDate} /></label>
          <label>{f.category === 'hotel' ? 'Check-out' : 'Return (if any)'}<input type="date" value={f.end_date} min={f.travel_date || undefined} onChange={set('end_date')} /></label>
          <label className="span2">For assignment
            <select value={f.assignment_id} onChange={set('assignment_id')} disabled={!f.contractor_id}>
              <option value="">{f.contractor_id ? (myAssignments.length ? 'Not linked to an assignment' : 'No assignments for this person this month') : 'Choose the person first'}</option>
              {myAssignments.map((a) => <option key={a.id} value={a.id}>{a.title}{a.event_reference ? ` (${a.event_reference})` : ''}, {fmtDate(a.start_date)} to {fmtDate(a.end_date)}</option>)}
            </select>
          </label>
          <label className="span2">What<input value={f.description} onChange={setDescription} placeholder={f.category === 'flights' ? 'e.g. DXB to ICN return' : f.category === 'train_bus' ? 'e.g. Seoul to Busan KTX' : 'e.g. Hilton Seoul, 3 nights'} /></label>
          <label>Airline or supplier<input value={f.supplier} onChange={set('supplier')} placeholder={f.category === 'flights' ? 'e.g. Emirates' : 'e.g. Korail'} /></label>
          <label>Booking reference<input value={f.booking_ref} onChange={set('booking_ref')} placeholder="e.g. PNR or ticket no." /></label>
          <label>Amount paid<input type="number" step="0.01" min="0" value={f.amount} onChange={set('amount')} required /></label>
          <label>Currency<input value={f.currency} onChange={set('currency')} maxLength={3} /></label>
          <label className="span2">Receipt, e-ticket or booking confirmation (optional)
            <input ref={fileInput} type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
            {ticketPath && !file && <span className="sub2">The ticket you uploaded will be saved as the receipt.</span>}
            {!ticketPath && editing?.receipt_path && !file && <span className="sub2">A receipt is already attached. Choose a file only to replace it.</span>}
          </label>
        </div>
        {!editing && <label className="check shared-tick"><input type="checkbox" checked={sharedManual} onChange={(e) => setSharedManual(e.target.checked)} /> This receipt is shared between several people (split it, don't count it twice)</label>}
        <div className="drawer-actions">
          {editing && <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>}
          <span className="spacer" />
          <button className="btn primary" disabled={busy}>{busy ? 'Saving' : editing ? 'Save changes' : sharedManual ? 'Next: split it' : 'Add booking'}</button>
        </div>
      </form>

      <div className="sec-head">
        <h2>Booked by Robot24, {monthLabel(month)}<span className="count">{costs.length}</span><span className="sub-total">{totalsByCurrency(costs).join(' + ')}</span></h2>
        <span className="spacer" />
        <input className="search" placeholder="Search person, route, supplier, reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>

      {Object.keys(byCat).length > 0 && (
        <div className="cat-chips big">
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
            const [cat, cur] = k.split('|');
            return <span key={k} className="cat-chip">{categoryLabel(cat)} <strong>{money(v, cur)}</strong></span>;
          })}
        </div>
      )}

      {!list.length ? (costs.length ? <p className="empty">Nothing matches your search.</p> : <EmptyState title={`No flights, trains or hotels for ${monthLabel(month)} yet`} text="Upload a ticket, hotel booking or receipt and the form fills itself in." action="Upload ticket, hotel booking or receipt" onClick={() => ticketInput.current?.click()} />) : regions.map((r) => (
        <section key={r} className="region">
          <h2>{r}<span className="count">{groups[r].length}</span><span className="sub-total">{totalsByCurrency(groups[r]).join(' + ')}</span></h2>
          <div className="table-wrap">
            <table className="pay-table">
              <thead><tr><th>Booked for</th><th>Booking</th><th>Dates</th><th className="r">Amount</th><th></th></tr></thead>
              <tbody>
                {groups[r].slice().sort((a, b) => (byId[a.contractor_id]?.full_name || '').localeCompare(byId[b.contractor_id]?.full_name || '') || (a.travel_date || '').localeCompare(b.travel_date || '')).map((d) => {
                  const c = byId[d.contractor_id] || {};
                  return (
                    <tr key={d.id} className={editing?.id === d.id ? 'sel-row' : ''} onClick={() => edit(d)}>
                      <td><div className="who-cell"><Avatar name={c.full_name || ''} url={photos[c.photo_path]} size={32} /><div><strong>{c.full_name}</strong><span className="sub2">{c.ref_code}</span></div></div></td>
                      <td>
                        <span className="kind-tag direct">{categoryLabel(d.category)}</span>
                        {d.split_group && <span className="chip info" title={`One receipt of ${money(d.split_total, d.currency)} split between ${d.split_of} people`}>Shared, 1 of {d.split_of}</span>}
                        {d.description || <span className="muted">No description</span>}
                        <span className="sub2">{[d.supplier, d.booking_ref && `ref ${d.booking_ref}`].filter(Boolean).join(', ')}</span>
                        {d.assignment_id && byAssignment[d.assignment_id] && <span className="sub2 asg-link">For: {byAssignment[d.assignment_id].title}{byAssignment[d.assignment_id].event_reference ? ` (${byAssignment[d.assignment_id].event_reference})` : ''}</span>}
                        {d.assignment_id && byAssignment[d.assignment_id] && travelMismatch(d, byAssignment[d.assignment_id]) && <span className="mismatch">⚠ {travelMismatch(d, byAssignment[d.assignment_id])}</span>}
                      </td>
                      <td className="nowrap">{fmtDate(d.travel_date) || <span className="muted">Not set</span>}{d.end_date && <span className="sub2">to {fmtDate(d.end_date)}{d.category === 'hotel' && d.travel_date ? `, ${Math.round((Date.parse(d.end_date) - Date.parse(d.travel_date)) / 864e5)} nights` : ''}</span>}</td>
                      <td className="r num-cell">{money(d.amount, d.currency)}</td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        {d.receipt_path && <button className="btn sm" onClick={() => openFile(supabase, 'invoices', d.receipt_path)}>Receipt</button>}
                        <RowMenu items={[{ label: 'Edit', onClick: () => edit(d) }, { label: 'Delete', onClick: () => remove(d), danger: true }]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
