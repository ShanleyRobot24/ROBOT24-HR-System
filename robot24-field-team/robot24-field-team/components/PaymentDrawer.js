'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';
import { money, fmtDate, todayISO, addDays, monthLabel, STATUS_LABEL, STATUS_TONE, DOC_LABEL, openFile, cur3 } from '@/lib/format';
import { EXPENSE_CATEGORIES, FEE_CATEGORIES, INVOICE_EXPENSE_CATEGORIES, COMPANY_BOOKED, COMPANY_BOOKED_NOTE, categoryLabel, normaliseCategory, guessCategory } from '@/lib/categories';
import { actionsFor, runAction } from '@/lib/paymentActions';
import Drawer from './Drawer';
import MessageDrawer from './MessageDrawer';
import { jobDays } from '@/lib/schedule';
import { remittanceText } from '@/lib/messages';
import { expectedFee, dayRateText } from '@/lib/rates';
import { loadInvoice, deleteBills, attachFile, detachFile } from '@/lib/invoiceActions';

const BLANK = {
  contractor_id: '', kind: 'fee', invoice_number: '', event_reference: '', description: '', work_start: '', work_end: '',
  days_worked: '', amount: '', currency: 'USD', invoice_date: todayISO(), due_date: '', flag: '',
};
const round = (n) => Math.round(n * 100) / 100;

function expected(c, days) {
  return expectedFee(c, days);
}

function LineEditor({ kind, lines, setLines, currency, editable }) {
  // Hotels and flights are not offered on bills: Robot24 books them directly
  const cats = kind === 'expense' ? INVOICE_EXPENSE_CATEGORIES : FEE_CATEGORIES;
  const [warn, setWarn] = useState('');
  const update = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => setLines(lines.filter((_, j) => j !== i));
  const add = () => setLines([...lines, { description: '', category: kind === 'expense' ? 'taxi_uber' : 'day_rate', amount: '', date: '', receipt_attached: false, kind }]);
  const total = round(lines.reduce((a, l) => a + Number(l.amount || 0), 0));

  // Totals per category, so you can see hotel, Uber and so on at a glance
  const byCat = {};
  for (const l of lines) if (Number(l.amount)) byCat[categoryLabel(l.category)] = (byCat[categoryLabel(l.category)] || 0) + Number(l.amount);

  return (
    <div className="lines-editor">
      <div className="le-head">
        <h3>{kind === 'expense' ? 'Expense breakdown' : 'Fee breakdown'}</h3>
        {lines.length > 0 && <span className="le-total">{money(total, currency)}</span>}
      </div>
      {!lines.length && <p className="hint">{editable ? (kind === 'expense' ? 'No lines yet. Add each cost: hotel, flights, Uber and so on. The bill total adds itself up.' : 'Optional. Add lines to split the fee, or just enter the amount below.') : 'No breakdown on this bill.'}</p>}
      {lines.length > 0 && (
        <ul className="le-list">
          {lines.map((l, i) => (
            <li key={i} className="le-line">
              <input className="le-what" value={l.description || ''} onBlur={() => { if (kind !== 'expense') return; const g = guessCategory(l.description); if (g && COMPANY_BOOKED.includes(g)) { setWarn(`"${l.description}" looks like a ${categoryLabel(g).toLowerCase()}. ${COMPANY_BOOKED_NOTE} Record it under Booked by Robot24 instead, or remove the line.`); return; } if (!l._picked && g && g !== l.category) update(i, { category: g }); }} placeholder={kind === 'expense' ? 'What, e.g. Hilton, 3 nights' : 'What, e.g. Filming, 2 days'} onChange={(e) => update(i, { description: e.target.value })} disabled={!editable} aria-label="Description" />
              {l.original_description && <p className="le-original" lang="">Original: {l.original_description}</p>}
              <div className="le-row">
                <select value={normaliseCategory(l.category, kind)} onChange={(e) => update(i, { category: e.target.value, _picked: true })} disabled={!editable} aria-label="Category">
                  {cats.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  {COMPANY_BOOKED.includes(normaliseCategory(l.category, kind)) && <option value={normaliseCategory(l.category, kind)}>{categoryLabel(l.category)} (booked by Robot24)</option>}
                </select>
                <input type="date" value={l.date || ''} onChange={(e) => update(i, { date: e.target.value })} disabled={!editable} aria-label="Date" />
                <input className="amt" type="number" step="0.01" placeholder="0.00" value={l.amount ?? ''} onChange={(e) => update(i, { amount: e.target.value })} disabled={!editable} aria-label="Amount" />
                {kind === 'expense' && <label className="le-receipt"><input type="checkbox" checked={!!l.receipt_attached} onChange={(e) => update(i, { receipt_attached: e.target.checked })} disabled={!editable} /> Receipt</label>}
                {editable && <button className="btn ghost sm le-remove" onClick={() => remove(i)} aria-label="Remove line">Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {(warn || (kind === 'expense' && lines.some((l) => COMPANY_BOOKED.includes(normaliseCategory(l.category, kind))))) && (
        <p className="le-warn">{warn || `This bill has a hotel or flight line. ${COMPANY_BOOKED_NOTE} Remove it before sending for approval.`}</p>
      )}
      <div className="le-foot">
        {editable && <button className="btn sm" onClick={add}>+ Add {kind === 'expense' ? 'expense' : 'line'}</button>}
        {Object.keys(byCat).length > 1 && (
          <div className="cat-chips">
            {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="cat-chip">{k} <strong>{money(v, currency)}</strong></span>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentDrawer({ payment, prefill, month, contractors, onClose, refresh, onAddExpenses }) {
  const roles = useAuth();
  const isNew = !payment;
  const [f, setF] = useState(() => {
    const base = payment ? { ...BLANK, ...payment } : { ...BLANK, period: month, ...(prefill || {}) };
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v ?? '']));
  });
  const [lines, setLines] = useState(() => ((payment?.line_items || prefill?.line_items || []).map((l) => ({ ...l, category: normaliseCategory(l.category, l.kind || payment?.kind || 'expense') }))));
  const [busy, setBusy] = useState(false);
  const [filePath, setFilePath] = useState(payment?.invoice_file_path || null);
  const [reading, setReading] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [remit, setRemit] = useState(null);
  useEffect(() => {
    if (!payment?.upload_id || !roles.isFinance) return;
    supabase.from('invoice_uploads').select('extracted').eq('id', payment.upload_id).maybeSingle()
      .then(({ data }) => setReading(data?.extracted || null));
  }, [payment?.upload_id, roles.isFinance]);
  const foreign = reading?.language && !/^english$/i.test(reading.language);

  // The person's jobs around this month, to link the bill to one
  useEffect(() => {
    if (!f.contractor_id) { setJobs([]); return; }
    const p = f.period || month;
    const shift = (n) => { const d = new Date(p + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
    supabase.from('assignments').select('id, title, event_reference, city, country, start_date, end_date, status')
      .eq('contractor_id', f.contractor_id).gte('end_date', shift(-3)).lte('start_date', shift(3)).order('start_date')
      .then(({ data }) => setJobs(data || []));
  }, [f.contractor_id, f.period, month]);
  const job = jobs.find((j) => j.id === f.assignment_id);
  const fileInput = useRef(null);
  const editable = roles.isFinance && (isNew || ['draft', 'rejected'].includes(payment.status));
  const c = contractors.find((x) => x.id === f.contractor_id);
  const exp = f.kind === 'expense' ? null : expected(c, f.days_worked);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const linesTotal = round(lines.reduce((a, l) => a + Number(l.amount || 0), 0));
  const amountFromLines = lines.some((l) => Number(l.amount));
  const shownAmount = amountFromLines ? linesTotal : f.amount;

  async function save() {
    const amount = amountFromLines ? linesTotal : Number(f.amount);
    if (!f.contractor_id || !amount) return alert('Choose a person and enter an amount, or add lines.');
    if (lines.some((l) => l.amount !== '' && isNaN(Number(l.amount)))) return alert('One of the line amounts is not a number.');
    setBusy(true);
    const nul = (v) => (v === '' ? null : v);
    const cleanLines = lines
      .filter((l) => Number(l.amount))
      .map((l) => ({ description: l.description || categoryLabel(l.category), category: l.category, amount: round(Number(l.amount)), date: l.date || null, receipt_attached: !!l.receipt_attached, kind: f.kind, ...(l.original_description ? { original_description: l.original_description } : {}) }));
    const row = {
      contractor_id: f.contractor_id, kind: f.kind, period: f.period || month, assignment_id: f.assignment_id || null,
      invoice_number: nul(f.invoice_number), event_reference: nul(f.event_reference), description: nul(f.description),
      work_start: nul(f.work_start), work_end: nul(f.work_end), days_worked: f.kind === 'fee' ? nul(f.days_worked) : null,
      amount, currency: cur3(f.currency), expected_amount: exp, line_items: cleanLines,
      invoice_date: nul(f.invoice_date),
      due_date: nul(f.due_date) || addDays(f.invoice_date || todayISO(), c?.payment_terms_days ?? 14),
      flag: nul(f.flag),
    };
    if (isNew && prefill?.upload_id) { row.upload_id = prefill.upload_id; row.invoice_file_path = prefill.invoice_file_path || null; }
    const { error } = isNew ? await supabase.from('payments').insert(row) : await supabase.from('payments').update(row).eq('id', payment.id);
    setBusy(false);
    if (error) return alert(error.message);
    await refresh();
    onClose();
  }

  async function removeBill() {
    if (await deleteBills([payment], { isAdmin: roles.isAdmin, label: 'bill' })) { await refresh(); onClose(); }
  }

  async function removeInvoice() {
    const inv = await loadInvoice({ payment });
    if (await deleteBills(inv.bills, { isAdmin: roles.isAdmin, upload: inv.upload, label: 'invoice' })) { await refresh(); onClose(); }
  }

  async function attach(file) {
    if (!file) return;
    setBusy(true);
    try { setFilePath(await attachFile({ ...payment, invoice_file_path: filePath }, file)); refresh(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function detach() {
    if (!confirm('Remove the invoice file from this bill? The bill itself stays.')) return;
    setBusy(true);
    try { await detachFile({ ...payment, invoice_file_path: filePath }); setFilePath(null); refresh(); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const canDelete = roles.isFinance && (['draft', 'rejected'].includes(payment?.status) || roles.isAdmin);

  async function act(a) {
    const done = await runAction(a, payment, c?.full_name || '');
    if (!done) return;
    await refresh();
    if (done.paid) setRemit(done.paid); else onClose();
  }

  const changeKind = (kind) => {
    setF({ ...f, kind });
    setLines(lines.map((l) => ({ ...l, kind, category: normaliseCategory(l.category, kind) })));
  };

  return (
    <Drawer title={isNew ? (f.kind === 'expense' ? 'Add expenses' : 'Add bill') : `${payment.kind === 'expense' ? 'Expenses' : 'Fee'} for ${c?.full_name || ''}`} onClose={onClose}>
      {!isNew && (
        <div className="status-box">
          <span className={`chip ${STATUS_TONE[payment.status]}`}>{STATUS_LABEL[payment.status]}</span>
          <span>{monthLabel(payment.period)}</span>
          {payment.doc_type && <span className="muted">Read as {DOC_LABEL[payment.doc_type] || payment.doc_type}</span>}
          <div className="trail">
            {payment.submitted_at && <p>Sent for approval {fmtDate(payment.submitted_at)}</p>}
            {payment.approved_by_email && <p>{payment.status === 'rejected' ? 'Rejected' : 'Approved'} by {payment.approved_by_email} on {fmtDate(payment.approved_at)}</p>}
            {payment.approval_note && <p>Note: {payment.approval_note}</p>}
            {payment.paid_on && <p>Paid {fmtDate(payment.paid_on)}{payment.paid_reference ? `, ref ${payment.paid_reference}` : ''}</p>}
          </div>
        </div>
      )}

      {foreign && (
        <div className="translated">
          <strong>Translated from {reading.language}</strong>
          {reading.translation_summary && <p>{reading.translation_summary}</p>}
          <p className="hint">Each line shows the original wording underneath. Open the invoice to compare.</p>
        </div>
      )}

      {f.flag && !editable && <div className="callout">{String(f.flag).split(' | ').map((x, i) => <p key={i}>{x}</p>)}</div>}
      {!editable && !isNew && <p className="hint">This bill is locked while it is {STATUS_LABEL[payment.status].toLowerCase()}.{payment.status === 'pending_approval' && roles.isFinance ? ' Withdraw it to make changes.' : ''}</p>}

      <fieldset disabled={!editable} className="form-grid">
        <label className="full">Person
          <select value={f.contractor_id} onChange={(e) => { const nc = contractors.find((x) => x.id === e.target.value); setF({ ...f, contractor_id: e.target.value, currency: isNew ? nc?.currency || f.currency : f.currency }); }}>
            <option value="">Choose</option>
            {contractors.filter((x) => x.active || x.id === f.contractor_id).map((x) => <option key={x.id} value={x.id}>{x.full_name} ({x.ref_code}, {x.region})</option>)}
          </select>
        </label>
        <label>Type
          <select value={f.kind} onChange={(e) => changeKind(e.target.value)}>
            <option value="fee">Fee</option>
            <option value="expense">Expense reimbursement</option>
          </select>
        </label>
        <label>Month
          <input type="month" value={(f.period || month).slice(0, 7)} onChange={(e) => e.target.value && setF({ ...f, period: e.target.value + '-01' })} />
        </label>
        <label className="full">For assignment
          <select value={f.assignment_id || ''} onChange={set('assignment_id')} disabled={!f.contractor_id}>
            <option value="">{!f.contractor_id ? 'Choose the person first' : jobs.length ? 'Not linked to an assignment' : 'No assignments around this month'}</option>
            {jobs.filter((j) => j.status !== 'cancelled' || j.id === f.assignment_id).map((j) => <option key={j.id} value={j.id}>{j.title}{j.event_reference ? ` (${j.event_reference})` : ''}, {fmtDate(j.start_date)} to {fmtDate(j.end_date)}, {jobDays(j)} day{jobDays(j) > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label>Invoice number<input value={f.invoice_number} onChange={set('invoice_number')} /></label>
        <label>Event or job<input value={f.event_reference} onChange={set('event_reference')} /></label>
      </fieldset>

      <LineEditor kind={f.kind} lines={lines} setLines={setLines} currency={cur3(f.currency)} editable={editable} />

      <fieldset disabled={!editable} className="form-grid">
        <label className="full">Description<input value={f.description} onChange={set('description')} /></label>
        <label>Work start<input type="date" value={f.work_start} onChange={set('work_start')} /></label>
        <label>Work end<input type="date" value={f.work_end} onChange={set('work_end')} /></label>
        {f.kind === 'fee' && <label>Days worked<input type="number" step="0.5" value={f.days_worked} onChange={set('days_worked')} /></label>}
        <label>Currency<input value={f.currency} onChange={set('currency')} maxLength={3} /></label>
        <label>Amount{amountFromLines && <span className="lbl-note"> (from lines)</span>}
          <input type="number" step="0.01" value={shownAmount} onChange={set('amount')} readOnly={amountFromLines} className={amountFromLines ? 'locked' : ''} />
        </label>
        <div className="rate-check">
          {c && f.kind === 'fee' && <p>Day rate: {dayRateText(c, money)}</p>}
          {job && f.kind === 'fee' && <p className={Number(f.days_worked) > jobDays(job) ? 'warn' : 'ok'}>Booked {jobDays(job)} day{jobDays(job) > 1 ? 's' : ''} on {job.title}{Number(f.days_worked) > jobDays(job) ? `, billed ${f.days_worked}` : ''}</p>}
          {exp !== null && <p className={Math.abs(exp - Number(shownAmount || 0)) > 0.5 ? 'warn' : 'ok'}>Day rate x {f.days_worked} days: {money(exp, c.currency)}</p>}
        </div>
        <label>Invoice date<input type="date" value={f.invoice_date} onChange={set('invoice_date')} /></label>
        <label>Due date<input type="date" value={f.due_date} onChange={set('due_date')} /></label>
        <label className="full">Notes and flags<textarea rows={2} value={f.flag} onChange={set('flag')} /></label>
      </fieldset>

      {!isNew && (
        <div className="file-box">
          <div>
            <h4>Invoice file</h4>
            <p className="hint">{filePath ? filePath.split('/').pop().replace(/^[0-9a-f-]{36}-/, '') : 'No file attached to this bill.'}</p>
          </div>
          <span className="spacer" />
          {filePath && <button className="btn sm" onClick={() => openFile(supabase, 'invoices', filePath)}>Open</button>}
          {roles.isFinance && <button className="btn sm" disabled={busy} onClick={() => fileInput.current?.click()}>{filePath ? 'Replace file' : 'Attach invoice'}</button>}
          {roles.isFinance && filePath && <button className="btn ghost sm" disabled={busy} onClick={detach}>Remove file</button>}
          <input ref={fileInput} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { attach(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}

      {roles.isFinance && c?.bank_details && <div className="bank"><h4>Bank details on file</h4><pre>{c.bank_details}</pre></div>}

      <div className="drawer-actions">
        {!isNew && roles.isFinance && payment.kind === 'fee' && onAddExpenses && (
          <button className="btn" onClick={() => onAddExpenses(payment)}>+ Add expenses to this invoice</button>
        )}
        {!isNew && payment.status === 'paid' && <button className="btn" onClick={() => setRemit(payment)}>Send payment confirmation</button>}
        {!isNew && canDelete && <button className="btn danger" onClick={removeBill}>Delete bill</button>}
        {!isNew && canDelete && payment.upload_id && <button className="btn danger" onClick={removeInvoice}>Delete whole invoice</button>}
        <span className="spacer" />
        {!isNew && actionsFor(payment, roles).map(([a, label, style]) => <button key={a} className={`btn ${style}`} onClick={() => act(a)}>{label}</button>)}
        {editable && <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving' : isNew ? (f.kind === 'expense' ? 'Add expenses' : 'Add bill') : 'Save changes'}</button>}
      </div>
      {remit && (
        <MessageDrawer
          title="Payment confirmation"
          intro="Let them know the money is on its way. Edit anything, then send."
          to={{ name: c?.full_name, phone: c?.phone, email: c?.email }}
          subject={`Robot24 payment${remit.invoice_number ? ` for invoice ${remit.invoice_number}` : ''}`}
          text={remittanceText({ person: c || {}, payment: remit, job })}
          onClose={() => { setRemit(null); onClose(); }}
        />
      )}
    </Drawer>
  );
}
