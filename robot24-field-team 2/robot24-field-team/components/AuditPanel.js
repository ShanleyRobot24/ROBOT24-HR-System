'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { STATUS_LABEL, toCSV } from '@/lib/format';
import { categoryLabel } from '@/lib/categories';

const AREAS = ['Field team', 'Bills', 'Invoices', 'Booked by Robot24', 'Assignments', 'Documents', 'Users', 'Staff', 'Staff documents', 'Exchange rates'];
const ACTIONS = [['added', 'Added'], ['changed', 'Changed'], ['deleted', 'Deleted']];
const PERIODS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['all', 'All time']];
const PAGE = 200;

const LABELS = {
  full_name: 'Name', designation: 'Role', region: 'Location group', city: 'City', email: 'Email', phone: 'Phone', wechat_id: 'WeChat',
  currency: 'Currency', day_rate: 'Day rate', ten_day_rate: 'Old 10 day package', fifteen_day_rate: 'Old 15 day package', payment_terms_days: 'Pay within (days)',
  tshirt_status: 'T-shirt', mic_sponge_status: 'Mic sponge', contract_signed: 'Contract signed', bank_details: 'Bank details', notes: 'Notes',
  address_line1: 'Address line 1', address_line2: 'Address line 2', address_city: 'Address city', address_state: 'State', address_postcode: 'Postcode',
  address_country: 'Country', active: 'Active', photo_path: 'Photo', aliases: 'Other names', ref_code: 'Reference',
  status: 'Status', amount: 'Amount', kind: 'Type', period: 'Month', invoice_number: 'Invoice number', event_reference: 'Event', description: 'Description',
  due_date: 'Due date', invoice_date: 'Invoice date', work_start: 'Work start', work_end: 'Work end', days_worked: 'Days worked', line_items: 'Line items',
  approval_note: 'Approval note', approved_by_email: 'Approved or rejected by', paid_on: 'Paid on', paid_reference: 'Payment reference', flag: 'Flags',
  submitted_at: 'Sent for approval', approved_at: 'Decided on', invoice_file_path: 'Invoice file',
  file_name: 'File', doc_type: 'Document type', match_method: 'Matched by',
  category: 'Category', supplier: 'Supplier', booking_ref: 'Booking reference', travel_date: 'Travel date', receipt_path: 'Receipt',
  title: 'Assignment', start_date: 'Starts', end_date: 'Ends', country: 'Country',
  is_signed: 'Signed copy', signed_on: 'Signed on', expires_on: 'Expires on', role: 'Access', is_approver: 'Approver', staff_access: 'Staff access', monthly_salary: 'Monthly salary', job_title: 'Job title', work_week: 'Working days', visa_status: 'Visa status', termination_date: 'Last day', termination_reason: 'Reason for leaving', passport_no: 'Passport number', emirates_id_no: 'Emirates ID', labour_card_no: 'Labour card',
};
const HIDE = new Set(['approved_by', 'contractor_id', 'upload_id', 'assignment_id', 'created_by', 'uploaded_by', 'matched_contractor_id', 'replaced_by', 'file_path', 'content_type', 'expected_amount', 'doc_type_raw', 'match_confidence']);
const ROLE_LABEL = { production: 'Production and assignments', assignments: 'Production and assignments', hr_finance: 'HR and finance', admin: 'Admin' };

function show(key, v) {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (v === '(hidden)') return '(hidden)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key === 'status') return STATUS_LABEL[v] || String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  if (key === 'role') return ROLE_LABEL[v] || v;
  if (key === 'kind') return v === 'expense' ? 'Expenses' : 'Fee';
  if (key === 'category') return categoryLabel(v);
  if (key === 'line_items' && Array.isArray(v)) return v.map((l) => `${l.description || categoryLabel(l.category)} ${l.amount}`).join(', ') || '(none)';
  if (key.endsWith('_path')) return String(v).split('/').pop().replace(/^[0-9a-f-]{36}-/, '');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  if (Array.isArray(v)) return v.join(', ') || '(none)';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const label = (k) => LABELS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// For changes: field, before, after. For adds and deletes: the useful fields of the record.
function details(e) {
  const c = e.changes || {};
  if (e.action === 'changed') return Object.entries(c).filter(([k]) => !HIDE.has(k)).map(([k, [a, b]]) => [label(k), show(k, a), show(k, b)]);
  return Object.entries(c).filter(([k, v]) => !HIDE.has(k) && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => [label(k), show(k, v)]);
}
function oneLine(e) {
  return details(e).map((d) => (d.length === 3 ? `${d[0]}: ${d[1]} > ${d[2]}` : `${d[0]}: ${d[1]}`)).join('; ');
}

export default function AuditPanel({ users }) {
  const [period, setPeriod] = useState('30');
  const [who, setWho] = useState('');
  const [area, setArea] = useState('');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = useCallback((beforeId) => {
    let r = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(PAGE);
    if (period !== 'all') r = r.gte('at', new Date(Date.now() - Number(period) * 864e5).toISOString());
    if (who === 'system') r = r.is('user_id', null);
    else if (who) r = r.eq('user_id', who);
    if (area) r = r.eq('area', area);
    if (action) r = r.eq('action', action);
    if (q.trim()) r = r.ilike('summary', `%${q.trim()}%`);
    if (beforeId) r = r.lt('id', beforeId);
    return r;
  }, [period, who, area, action, q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await query();
      if (!live) return;
      setRows(data || []);
      setMore((data || []).length === PAGE);
      setError(error ? error.message : '');
      setLoading(false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  async function loadMore() {
    const { data } = await query(rows.at(-1)?.id);
    setRows([...rows, ...(data || [])]);
    setMore((data || []).length === PAGE);
  }

  function exportCSV() {
    if (!rows.length) return alert('Nothing to export.');
    const data = rows.map((e) => ({
      when: new Date(e.at).toLocaleString('en-GB'), user: e.user_email || 'System', via: e.via, action: e.action, area: e.area, record: e.summary, details: oneLine(e),
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <p className="hint lead">Every addition, change and deletion, with who made it and when. Entries are written by the database and can never be edited or removed. Bank details are recorded as changed without showing them.</p>
      <div className="toolbar audit-filters">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="User">
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} (${u.email})` : u.email}</option>)}
          <option value="system">System</option>
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area"><option value="">All areas</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action"><option value="">All actions</option>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="search" placeholder="Search person, invoice, file" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>
      {error && <p className="err">{error}</p>}
      {loading ? <p className="page-msg">Loading</p> : !rows.length ? <p className="empty">No activity matches these filters.</p> : (
        <div className="table-wrap">
          <table className="audit-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>What</th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const d = details(e);
                const isOpen = open.has(e.id);
                return (
                  <Fragment key={e.id}>
                    <tr className={`audit-row ${isOpen ? 'open' : ''}`} onClick={() => toggle(e.id)}>
                      <td className="nowrap">{new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}<span className="sub2">{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></td>
                      <td>{e.user_email || <span className="muted">System</span>}{e.via === 'AI reader' && <span className="sub2">via AI reader</span>}</td>
                      <td><span className={`chip ${e.action === 'added' ? 'ok' : e.action === 'deleted' ? 'alert' : 'info'}`}>{ACTIONS.find(([k]) => k === e.action)?.[1]}</span></td>
                      <td>{e.area}</td>
                      <td>
                        <span className="caret">{isOpen ? '▾' : '▸'}</span>{e.summary || <span className="muted">(no description)</span>}
                        {e.action === 'changed' && !isOpen && d.length > 0 && <span className="sub2">{d.slice(0, 3).map((x) => x[0]).join(', ')}{d.length > 3 ? ` and ${d.length - 3} more` : ''}</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="audit-detail no-hover">
                        <td colSpan={5}>
                          {!d.length ? <p className="muted">No visible fields.</p> : (
                            <table className="mini">
                              <thead>{e.action === 'changed' ? <tr><th>Field</th><th>Before</th><th>After</th></tr> : <tr><th>Field</th><th>{e.action === 'added' ? 'Value' : 'Value when deleted'}</th></tr>}</thead>
                              <tbody>{d.map((x) => <tr key={x[0]}>{x.map((v, i) => <td key={i} className={i === 1 && x.length === 3 ? 'before' : i === 2 ? 'after' : ''}>{v}</td>)}</tr>)}</tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more && <div className="drawer-actions"><span className="spacer" /><button className="btn" onClick={loadMore}>Load older entries</button><span className="spacer" /></div>}
    </>
  );
}
