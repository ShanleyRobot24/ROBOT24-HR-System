'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Skeleton } from './ui';
import { CheckList } from './ui';
import { billChecks } from '@/lib/sanity';
import { money, fmtDate, monthLabel, totalsByCurrency, groupBy, DOC_LABEL, openFile } from '@/lib/format';
import { paymentAction } from '@/lib/paymentActions';
import { categoryLabel } from '@/lib/categories';
import { dayRateText } from '@/lib/rates';

const TABS = [['pending_approval', 'Waiting for you'], ['approved', 'Approved'], ['rejected', 'Rejected']];

function Bill({ p, onDecide, decided }) {
  const [open, setOpen] = useState(false);
  const rates = dayRateText(p, money, p.rate_currency);
  return (
    <li className={`bill ${open ? 'open' : ''}`}>
      <div className="bill-head" onClick={() => setOpen(!open)}>
        <div>
          <strong>{p.full_name}</strong>
          <span className="sub2">{p.ref_code}, {p.designation}, {p.region}</span>
        </div>
        <div>
          <span className={`kind-tag ${p.kind === 'expense' ? 'exp' : 'fee'}`}>{p.kind === 'expense' ? 'Expense' : 'Fee'}</span>
          {p.invoice_number || 'No number'}
          <span className="sub2">{p.assignment_title ? `For ${p.assignment_title}` : p.event_reference || p.description || ''}</span>
        </div>
        <div className="r num-cell big">{money(p.amount, p.currency)}{p.flag && <span className="flag">Check</span>}</div>
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          {!decided ? <>
            <button className="btn sm primary" onClick={() => onDecide('approve', [p])}>Approve</button>
            <button className="btn sm danger" onClick={() => onDecide('reject', [p])}>Reject</button>
          </> : <span className="sub2">{p.approved_by_email}, {fmtDate(p.approved_at)}</span>}
        </div>
      </div>
      {open && (
        <div className="bill-body">
          {p.flag && <div className="callout">{p.flag.split(' | ').map((x, i) => <p key={i}>{x}</p>)}</div>}
          <dl>
            <dt>Assignment</dt><dd>{p.assignment_title ? `${p.assignment_title}${p.assignment_ref ? ` (${p.assignment_ref})` : ''}, ${fmtDate(p.assignment_start)} to ${fmtDate(p.assignment_end)}, ${Math.round((Date.parse(p.assignment_end) - Date.parse(p.assignment_start)) / 864e5) + 1} days booked` : <span className="warn-text">Not linked to an assignment</span>}</dd>
            <dt>Document</dt><dd>{DOC_LABEL[p.doc_type] || 'Added by hand'}{p.invoice_date ? `, dated ${fmtDate(p.invoice_date)}` : ''}</dd>
            <dt>Day rate</dt><dd>{rates || 'No rate on file'}</dd>
            {p.days_worked && <><dt>Days worked</dt><dd>{p.days_worked}{p.expected_amount ? `, day rate gives ${money(p.expected_amount, p.rate_currency)}` : ''}</dd></>}
            {p.work_start && <><dt>Work dates</dt><dd>{fmtDate(p.work_start)} to {fmtDate(p.work_end)}</dd></>}
            <dt>Due</dt><dd>{fmtDate(p.due_date) || 'Not set'}</dd>
            {p.approval_note && <><dt>Note</dt><dd>{p.approval_note}</dd></>}
          </dl>
          {p.line_items?.length > 0 && (
            <table className="mini">
              <tbody>
                {p.line_items.map((l, i) => (
                  <tr key={i}><td>{l.description}{l.original_description && <span className="sub2">Original: {l.original_description}</span>}</td><td>{categoryLabel(l.category)}</td><td className="r">{money(l.amount, p.currency)}</td><td>{l.kind === 'expense' && !l.receipt_attached ? <span className="warn-text">No receipt</span> : ''}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {p.invoice_file_path && <button className="btn sm" onClick={() => openFile(supabase, 'invoices', p.invoice_file_path)}>Open invoice</button>}
        </div>
      )}
    </li>
  );
}

export default function ApprovalsView({ onCount }) {
  const [tab, setTab] = useState('pending_approval');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('approval_queue', { p_status: tab, p_period: null });
    setRows(data || []);
    setError(error ? error.message : '');
    setLoading(false);
    if (tab === 'pending_approval' && onCount) onCount((data || []).length);
    if (tab === 'pending_approval') {
      const { data: c } = await supabase.rpc('approval_checks');
      setChecks(Object.fromEntries((c || []).map((x) => [x.id, x])));
    }
  }, [tab, onCount]);
  useEffect(() => { load(); }, [load]);

  async function decide(action, list) {
    let note = null;
    if (action === 'reject') {
      note = window.prompt(list.length > 1 ? `Reason for rejecting ${list.length} bills` : `Reason for rejecting the bill for ${list[0].full_name}`, '');
      if (note === null) return;
    } else if (list.length > 1 && !window.confirm(`Approve ${list.length} bills totalling ${totalsByCurrency(list).join(' + ')}?`)) return;
    const err = await paymentAction(action, list.map((p) => p.id), { note });
    if (err) alert(err);
    load();
  }

  const byMonth = groupBy(rows, 'period');
  const months = Object.keys(byMonth).sort().reverse();

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'pending_approval' && tab === k && rows.length > 0 && <span className="pill">{rows.length}</span>}</button>)}
        </div>
        <p className="hint" style={{ margin: 0 }}>Bills need an approver before finance can pay them.</p>
      </div>
      {error && <p className="err">{error}</p>}
      {tab === 'pending_approval' && rows.length > 0 && <CheckList items={billChecks(rows, checks)} />}
      {loading && !rows.length ? <Skeleton rows={4} /> : !rows.length ? (
        <p className="empty">{tab === 'pending_approval' ? 'Nothing waiting for approval.' : 'Nothing here yet.'}</p>
      ) : months.map((m) => (
        <section key={m} className="region">
          <h2>
            {monthLabel(m)}<span className="count">{byMonth[m].length}</span>
            <span className="sub-total">{totalsByCurrency(byMonth[m]).join(' + ')}</span>
            {tab === 'pending_approval' && <button className="btn primary sm h-btn" onClick={() => decide('approve', byMonth[m])}>Approve all {byMonth[m].length}</button>}
          </h2>
          <ul className="bills">
            {byMonth[m].map((p) => <Bill key={p.id} p={p} onDecide={decide} decided={tab !== 'pending_approval'} />)}
          </ul>
        </section>
      ))}
    </>
  );
}
