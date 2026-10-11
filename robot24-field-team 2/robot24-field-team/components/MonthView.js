'use client';
import { useMemo, useState } from 'react';
import { useAuth } from './AuthProvider';
import { money, fmtDate, dueLabel, daysUntil, totalsByCurrency, toCSV, groupBy, sortRegions, monthLabel, STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { actionsFor, runAction, paymentAction } from '@/lib/paymentActions';
import { deleteBills } from '@/lib/invoiceActions';
import MessageDrawer from './MessageDrawer';
import { remittanceText } from '@/lib/messages';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';

const STATUS_FILTERS = [['all', 'All'], ['draft', 'To check'], ['pending_approval', 'Awaiting approval'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected']];

export default function MonthView({ month, payments, contractors, refresh, onOpen, jobs = [] }) {
  const roles = useAuth();
  const { isFinance, isApprover, isAdmin } = roles;
  const [picked, setPicked] = useState(() => new Set());
  const [remit, setRemit] = useState(null);
  const jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [region, setRegion] = useState('All');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => Object.fromEntries(contractors.map((c) => [c.id, c])), [contractors]);
  const regions = ['All', ...[...new Set(contractors.map((c) => c.region))].sort(sortRegions)];
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));

  const inScope = payments.filter((p) => {
    const c = byId[p.contractor_id];
    if (kind !== 'all' && p.kind !== kind) return false;
    if (region !== 'All' && c?.region !== region) return false;
    if (q && !`${c?.full_name || ''} ${c?.ref_code || ''} ${p.invoice_number || ''} ${p.event_reference || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const rows = inScope.filter((p) => status === 'all' || p.status === status);
  const by = (s) => inScope.filter((p) => p.status === s);
  const drafts = by('draft'), pending = by('pending_approval'), approved = by('approved'), paid = by('paid');
  const billed = inScope.filter((p) => p.status !== 'rejected');

  const groups = groupBy(rows, (p) => byId[p.contractor_id]?.region);
  const regionList = Object.keys(groups).sort(sortRegions);

  const canPick = (p) => isFinance && (['draft', 'rejected'].includes(p.status) || isAdmin);
  const pickedRows = rows.filter((p) => picked.has(p.id));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePickAll = (list) => setPicked((s) => {
    const n = new Set(s);
    const ids = list.filter(canPick).map((p) => p.id);
    const all = ids.every((id) => n.has(id));
    ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
    return n;
  });

  async function deletePicked() {
    setBusy(true);
    const done = await deleteBills(pickedRows, { isAdmin, label: `selection of ${pickedRows.length} bill${pickedRows.length > 1 ? 's' : ''}` });
    setBusy(false);
    if (done) { setPicked(new Set()); refresh(); }
  }

  async function bulk(action, list, label) {
    if (!window.confirm(`${label}: ${list.length} bill${list.length > 1 ? 's' : ''} in ${monthLabel(month)}?`)) return;
    setBusy(true);
    const err = await paymentAction(action, list.map((p) => p.id));
    setBusy(false);
    if (err) alert(err);
    refresh();
  }

  function exportCSV() {
    const data = rows.map((p) => {
      const c = byId[p.contractor_id] || {};
      return {
        month: month.slice(0, 7), name: c.full_name, reference: c.ref_code, region: c.region, role: c.designation,
        type: p.kind === 'expense' ? 'Expense' : 'Fee', invoice: p.invoice_number, event: p.event_reference,
        amount: p.amount, currency: p.currency, due_date: p.due_date, status: STATUS_LABEL[p.status],
        approved_by: p.approved_by_email, paid_on: p.paid_on, paid_reference: p.paid_reference, bank_details: c.bank_details,
      };
    });
    if (!data.length) return alert('Nothing to export.');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-payments-${month.slice(0, 7)}.csv`;
    a.click();
  }

  const card = (key, title, list, cls) => (
    <button className={`sum ${cls} ${status === key ? 'sel' : ''}`} onClick={() => setStatus(status === key ? 'all' : key)}>
      <h3>{title}</h3>
      <p className="num">{list.length}</p>
      <p className="amts">{totalsByCurrency(list).join(' + ') || 'None'}</p>
    </button>
  );

  return (
    <>
      <p className="billed">Billed in {monthLabel(month)}: <strong>{totalsByCurrency(billed).join(' + ') || 'nothing yet'}</strong> across {new Set(billed.map((p) => p.contractor_id)).size} people</p>

      <div className="summary five">
        {card('draft', 'To check', drafts, 'tocheck')}
        {card('pending_approval', 'Awaiting approval', pending, 'soon')}
        {card('approved', 'Approved, to pay', approved, 'info')}
        {card('paid', 'Paid', paid, 'later')}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search name, reference, invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUS_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="seg">
          {[['all', 'All'], ['fee', 'Fees'], ['expense', 'Expenses']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Location">
          {regions.map((r) => <option key={r}>{r}</option>)}
        </select>
        <span className="spacer" />
        {isFinance && drafts.length > 0 && <button className="btn" disabled={busy} onClick={() => bulk('send', drafts, 'Send for approval')}>Send {drafts.length} for approval</button>}
        {isApprover && pending.length > 0 && <button className="btn primary" disabled={busy} onClick={() => bulk('approve', pending, 'Approve')}>Approve all {pending.length}</button>}
        <button className="btn" onClick={exportCSV}>Export CSV</button>
        {isFinance && <button className="btn primary" onClick={() => onOpen(null)}>Add bill</button>}
      </div>

      {pickedRows.length > 0 && (
        <div className="pick-bar">
          <strong>{pickedRows.length} selected</strong>
          <span>{totalsByCurrency(pickedRows).join(' + ')}</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setPicked(new Set())}>Clear</button>
          <button className="btn danger sm" disabled={busy} onClick={deletePicked}>Delete selected</button>
        </div>
      )}

      {!rows.length && <p className="empty">No bills here for {monthLabel(month)}. Upload invoices in the Inbox tab.</p>}

      {regionList.map((r) => {
        const list = groups[r].slice().sort((a, b) => (byId[a.contractor_id]?.full_name || '').localeCompare(byId[b.contractor_id]?.full_name || '') || a.kind.localeCompare(b.kind));
        return (
          <section key={r} className="region">
            <h2>{r}<span className="count">{list.length}</span><span className="sub-total">{totalsByCurrency(list.filter((p) => p.status !== 'rejected')).join(' + ')}</span></h2>
            <div className="table-wrap">
              <table className="pay-table">
                <thead>
                  <tr>
                    {isFinance && <th className="pick"><input type="checkbox" aria-label="Select all in this location" checked={list.filter(canPick).length > 0 && list.filter(canPick).every((p) => picked.has(p.id))} onChange={() => togglePickAll(list)} disabled={!list.some(canPick)} /></th>}
                    <th>Who</th><th>Bill</th><th className="r">Amount</th><th>Due</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const c = byId[p.contractor_id] || {};
                    const unpaid = ['draft', 'pending_approval', 'approved'].includes(p.status);
                    const overdue = unpaid && daysUntil(p.due_date) !== null && daysUntil(p.due_date) < 0;
                    return (
                      <tr key={p.id} onClick={() => onOpen(p)} className={picked.has(p.id) ? 'sel-row' : ''}>
                        {isFinance && <td className="pick" onClick={(e) => e.stopPropagation()}>{canPick(p) ? <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label="Select bill" /> : null}</td>}
                        <td><div className="who-cell"><Avatar name={c.full_name || ''} url={photos[c.photo_path]} size={32} /><div><strong>{c.full_name}</strong><span className="sub2">{c.ref_code}, {c.designation}</span></div></div></td>
                        <td>
                          <span className={`kind-tag ${p.kind === 'expense' ? 'exp' : 'fee'}`}>{p.kind === 'expense' ? 'Expense' : 'Fee'}</span>
                          {p.invoice_number || <span className="muted">No number</span>}
                          <span className="sub2">{p.event_reference || p.description || ''}</span>
                          {p.assignment_id && jobsById[p.assignment_id] ? <span className="sub2 asg-link">For: {jobsById[p.assignment_id].title}</span> : p.assignment_id ? null : <span className="sub2 muted">Not linked to a job</span>}
                        </td>
                        <td className="r num-cell">{money(p.amount, p.currency)}{p.flag && <span className="flag" title={p.flag}>Check</span>}</td>
                        <td>{p.status === 'paid' ? <>Paid {fmtDate(p.paid_on)}</> : <>{fmtDate(p.due_date)}{unpaid && <span className={`sub2 ${overdue ? 'due-overdue' : ''}`}>{dueLabel(p.due_date)}</span>}</>}</td>
                        <td>
                          <span className={`chip ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                          {p.approved_by_email && ['approved', 'paid', 'rejected'].includes(p.status) && <span className="sub2">by {p.approved_by_email}</span>}
                        </td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          {actionsFor(p, roles).slice(0, 2).map(([a, label, style]) => (
                            <button key={a} className={`btn sm ${style}`} onClick={async () => { const done = await runAction(a, p, c.full_name); if (!done) return; refresh(); if (done.paid) setRemit({ payment: done.paid, person: c }); }}>{label}</button>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {remit && (
        <MessageDrawer
          title="Payment confirmation"
          intro="Paid. Let them know the money is on its way."
          to={{ name: remit.person.full_name, phone: remit.person.phone, email: remit.person.email }}
          subject={`Robot24 payment${remit.payment.invoice_number ? ` for invoice ${remit.payment.invoice_number}` : ''}`}
          text={remittanceText({ person: remit.person, payment: remit.payment, job: jobsById[remit.payment.assignment_id] })}
          onClose={() => setRemit(null)}
        />
      )}
    </>
  );
}
