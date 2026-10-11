'use client';
import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { money, fmtDate, monthLabel, todayISO, addDays, DOC_LABEL, openFile, cur3 } from '@/lib/format';
import { loadInvoice, deleteBills } from '@/lib/invoiceActions';
import { useAuth } from './AuthProvider';

const UPLOAD_STATUS = {
  waiting: ['Waiting', 'neutral'],
  uploading: ['Uploading', 'neutral'],
  reading: ['Reading', 'neutral'],
  processing: ['Reading', 'neutral'],
  processed: ['Added', 'ok'],
  unmatched: ['Who is this?', 'alert'],
  needs_attention: ['Needs a look', 'warn'],
  duplicate: ['Already uploaded', 'neutral'],
  error: ['Failed', 'alert'],
  failed: ['Failed', 'alert'],
  dismissed: ['Dismissed', 'neutral'],
  replaced: ['Replaced', 'neutral'],
};

async function uploadAndRead(file, period) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Over ${MAX_MB} MB`);
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${period.slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  return callApi('/api/process-invoice', { path, fileName: file.name, contentType: file.type, period });
}

// Bills made from an uploaded invoice, and whether they can still be removed
async function billsOf(u) {
  const { data } = await supabase.from('payments').select('id, status').eq('upload_id', u.id);
  const bills = data || [];
  const done = bills.filter((b) => ['approved', 'paid'].includes(b.status));
  const waiting = bills.filter((b) => b.status === 'pending_approval');
  let blocked = null;
  if (done.length) blocked = 'A bill from this invoice is already approved or paid, so it cannot be removed. An approver or admin must undo that first.';
  else if (waiting.length) blocked = 'A bill from this invoice is waiting for approval. Withdraw it in Money, Bills first.';
  return { bills, blocked };
}
const MAX_MB = 30;

function sums(x) {
  const items = x?.line_items || [];
  const s = (k) => items.filter((l) => l.kind === k).reduce((a, l) => a + Number(l.amount || 0), 0);
  return { fee: items.length ? s('fee') : Number(x?.fee_total || 0), expense: items.length ? s('expense') : Number(x?.expense_total || 0) };
}

function UploadRow({ u, contractors, refresh }) {
  const [open, setOpen] = useState(['unmatched', 'needs_attention', 'error'].includes(u.status));
  const [assign, setAssign] = useState(u.matched_contractor_id || '');
  const [kind, setKind] = useState(u.doc_type === 'expense_claim' || u.doc_type === 'receipt_only' ? 'expense' : 'fee');
  const [busy, setBusy] = useState(false);
  const x = u.extracted || {};
  const who = contractors.find((c) => c.id === u.matched_contractor_id);
  const [label, tone] = UPLOAD_STATUS[u.status] || [u.status, 'neutral'];
  const t = sums(x);
  const cur = x.currency || who?.currency || 'USD';

  async function reread() {
    setBusy(true);
    try { await callApi('/api/process-invoice', { uploadId: u.id }); } catch (e) { alert(e.message); }
    setBusy(false);
    refresh();
  }

  async function createPayment() {
    const c = contractors.find((k) => k.id === assign);
    if (!c) return alert('Choose the person first.');
    const lines = (x.line_items || []).filter((l) => l.kind === kind);
    const suggested = lines.length ? lines.reduce((a, l) => a + Number(l.amount || 0), 0) : (kind === 'expense' ? t.expense : t.fee) || x.total || '';
    const amount = window.prompt(`${kind === 'expense' ? 'Expenses' : 'Fee'} for ${c.full_name}`, suggested);
    if (amount === null || amount === '' || isNaN(Number(amount))) return;
    const { data: pay, error } = await supabase.from('payments').insert({
      contractor_id: c.id, upload_id: u.id, period: u.period, kind, doc_type: u.doc_type || null, line_items: lines,
      invoice_number: x.invoice_number || null, description: x.description || null, event_reference: x.event_reference || null,
      work_start: x.work_start || null, work_end: x.work_end || null, days_worked: kind === 'fee' ? x.days_worked ?? null : null,
      amount: Number(amount), currency: cur3(x.currency || c.currency),
      invoice_date: x.invoice_date || null, due_date: x.due_date || addDays(x.invoice_date || todayISO(), c.payment_terms_days ?? 14),
      invoice_file_path: u.file_path, flag: 'Assigned by hand',
    }).select('id').single();
    if (error) return alert(error.message);
    await supabase.from('invoice_uploads').update({
      matched_contractor_id: c.id, match_method: 'manual', match_confidence: 1, status: 'processed',
      payment_ids: [...(u.payment_ids || []), pay.id],
    }).eq('id', u.id);
    refresh();
  }

  const replaceInput = useRef(null);

  const { isAdmin } = useAuth();

  async function deleteInvoice() {
    setBusy(true);
    const inv = await loadInvoice({ upload: u });
    const done = await deleteBills(inv.bills, { isAdmin, upload: u, label: 'invoice' });
    setBusy(false);
    if (done) refresh();
  }

  async function replaceWith(file) {
    if (!file) return;
    const { bills, blocked } = await billsOf(u);
    if (blocked) return alert(blocked);
    const reason = window.prompt(`Replacing ${u.file_name} with ${file.name}.\n\nWhy? For example: overcharged by USD 200, agreed corrected invoice.`, 'Disputed, corrected invoice received');
    if (reason === null) return;
    setBusy(true);
    try {
      // Remove the disputed bills first, so the corrected invoice is not flagged as a duplicate
      if (bills.length) {
        const { error } = await supabase.from('payments').delete().in('id', bills.map((b) => b.id));
        if (error) throw error;
      }
      const out = await uploadAndRead(file, u.period);
      await supabase.from('invoice_uploads').update({ status: 'replaced', replaced_by: out.id, note: reason || null, payment_ids: [] }).eq('id', u.id);
      alert(out.status === 'processed' ? 'Corrected invoice read and added. The old one is kept, marked Replaced.' : `Corrected invoice uploaded but needs attention: ${UPLOAD_STATUS[out.status]?.[0] || out.status}. Check it in the list.`);
    } catch (e) {
      alert(`Could not replace: ${e.message}. The disputed bills may have been removed. Use Read again on the old invoice to restore them.`);
    }
    setBusy(false);
    refresh();
  }

  async function dismiss() {
    await supabase.from('invoice_uploads').update({ status: 'dismissed' }).eq('id', u.id);
    refresh();
  }

  return (
    <li className={`mail ${open ? 'open' : ''}`}>
      <button className="mail-head" onClick={() => setOpen(!open)}>
        <span className={`chip ${tone}`}>{label}</span>
        <span className="mail-from">{who ? who.full_name : x.contractor_name ? `Says: ${x.contractor_name}` : 'Unknown'}</span>
        <span className="mail-subj">{u.file_name}</span>
        <span className="mail-who">
          {[x.language && !/^english$/i.test(x.language) && `From ${x.language}`, u.doc_type && DOC_LABEL[u.doc_type], t.fee && `Fee ${money(t.fee, cur)}`, t.expense && `Expenses ${money(t.expense, cur)}`].filter(Boolean).join(', ')}
        </span>
        <span className="mail-date">{fmtDate(u.uploaded_at)}</span>
      </button>
      {open && (
        <div className="mail-body">
          <div className="extracted">
            <dl>
              <dt>Name on invoice</dt><dd>{x.contractor_name || 'Not found'}{x.reference_code ? `, ref ${x.reference_code}` : ''}</dd>
              <dt>Matched to</dt><dd>{who ? `${who.full_name} (${who.ref_code}), ${who.region}` : 'No match'}{u.match_method ? `, by ${u.match_method.replace(/_/g, ' ')}${u.match_confidence && u.match_confidence < 1 ? ` ${Math.round(u.match_confidence * 100)}%` : ''}` : ''}</dd>
              {x.language && !/^english$/i.test(x.language) && <><dt>Language</dt><dd><span className="chip info">Translated from {x.language}</span></dd></>}
              {x.translation_summary && <><dt>In English</dt><dd>{x.translation_summary}</dd></>}
              <dt>Document</dt><dd>{DOC_LABEL[u.doc_type] || 'Not read yet'}{x.invoice_number ? `, no. ${x.invoice_number}` : ''}{x.invoice_date ? `, dated ${fmtDate(x.invoice_date)}` : ''}</dd>
              <dt>Amounts</dt><dd>Fee {money(t.fee || 0, cur)}, expenses {money(t.expense || 0, cur)}</dd>
              {x.flags?.length > 0 && <><dt>Flags</dt><dd>{x.flags.join('. ')}</dd></>}
              {u.error && <><dt>Problem</dt><dd className="err">{u.error}</dd></>}
            </dl>
            {u.status === 'replaced' && <p className="replaced-note">Replaced by a corrected invoice{u.note ? `: ${u.note}` : ''}. Kept for the record. No bills are counted from it.</p>}
            <div className="files">
              <button className="btn sm" onClick={() => openFile(supabase, 'invoices', u.file_path)}>Open file</button>
              {['error', 'needs_attention', 'unmatched'].includes(u.status) && <button className="btn sm" disabled={busy} onClick={reread}>{busy ? 'Working' : 'Read again'}</button>}
              {u.status !== 'replaced' && <button className="btn sm" disabled={busy} onClick={() => replaceInput.current?.click()}>Replace with corrected invoice</button>}
              <button className="btn sm danger" disabled={busy} onClick={deleteInvoice}>Delete invoice</button>
              <input ref={replaceInput} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { replaceWith(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </div>
          {['unmatched', 'needs_attention', 'error'].includes(u.status) && (
            <div className="assign">
              <select value={assign} onChange={(e) => setAssign(e.target.value)}>
                <option value="">Choose the person</option>
                {contractors.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.ref_code}, {c.region})</option>)}
              </select>
              <select className="narrow" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="fee">Fee</option>
                <option value="expense">Expenses</option>
              </select>
              <button className="btn primary sm" onClick={createPayment}>Create bill</button>
              <button className="btn ghost sm" onClick={dismiss}>Dismiss</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function UploadPanel({ month, contractors, uploads, refresh, goToMonth }) {
  const [queue, setQueue] = useState([]);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState('action');
  const input = useRef(null);
  const busy = queue.some((q) => ['waiting', 'uploading', 'reading'].includes(q.status));

  const update = (key, patch) => setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function handleOne(item) {
    const file = item.file;
    try {
      update(item.key, { status: 'reading' });
      const out = await uploadAndRead(file, month);
      const who = contractors.find((c) => c.id === out.matched_contractor_id);
      const t = sums(out.extracted);
      const cur = out.extracted?.currency || who?.currency || 'USD';
      update(item.key, {
        status: out.status,
        message: [who?.full_name, DOC_LABEL[out.doc_type], t.fee && `fee ${money(t.fee, cur)}`, t.expense && `expenses ${money(t.expense, cur)}`, out.error].filter(Boolean).join(', '),
      });
    } catch (e) {
      update(item.key, { status: 'failed', message: e.message });
    }
  }

  async function addFiles(fileList) {
    const items = [...fileList].filter((f) => f.size > 0).map((file) => ({ key: crypto.randomUUID(), name: file.name, status: 'waiting', file }));
    if (!items.length) return;
    setQueue((q) => [...items, ...q]);
    let i = 0;
    const worker = async () => { while (i < items.length) await handleOne(items[i++]); };
    await Promise.all([worker(), worker(), worker()]);
    refresh();
  }

  const shown = uploads.filter((u) => filter === 'all' || ['unmatched', 'needs_attention', 'error', 'processing'].includes(u.status));

  return (
    <>
      <div
        className={`dropzone ${drag ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <p className="dz-title">Drop invoices for <strong>{monthLabel(month)}</strong></p>
        <p className="hint">PDFs or photos, as many as you like. Each one is read, split into fees and expenses, and matched to the right person.</p>
        <span className="btn primary">Choose files</span>
        <input ref={input} type="file" multiple accept="application/pdf,image/*" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {queue.length > 0 && (
        <div className="queue">
          <div className="sec-head">
            <h2>Just uploaded<span className="count">{queue.length}</span></h2>
            {!busy && <button className="btn sm" onClick={goToMonth}>See them in Bills</button>}
            {!busy && <button className="btn ghost sm" onClick={() => setQueue([])}>Clear list</button>}
          </div>
          <ul className="queue-list">
            {queue.map((q) => {
              const [label, tone] = UPLOAD_STATUS[q.status] || [q.status, 'neutral'];
              return (
                <li key={q.key}>
                  <span className={`chip ${tone}`}>{label}</span>
                  <span className="q-name">{q.name}</span>
                  <span className="q-msg">{q.message || ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sec-head">
        <h2>Uploads for {monthLabel(month)}<span className="count">{uploads.length}</span></h2>
        <div className="seg">
          <button className={filter === 'action' ? 'on' : ''} onClick={() => setFilter('action')}>Needs action</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </div>
      {!shown.length ? (
        <p className="empty">{filter === 'action' ? 'Nothing needs your attention this month.' : 'No invoices uploaded for this month yet.'}</p>
      ) : (
        <ul className="mails">{shown.map((u) => <UploadRow key={u.id} u={u} contractors={contractors} refresh={refresh} />)}</ul>
      )}
    </>
  );
}
