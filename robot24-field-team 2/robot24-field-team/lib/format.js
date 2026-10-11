export const REGION_ORDER = ['China', 'United Kingdom', 'Singapore', 'United States', 'South Korea', 'Central Europe', 'Turkey', 'Canada'];

export function sortRegions(a, b) {
  const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export function groupBy(list, key) {
  const out = {};
  for (const item of list) {
    const k = (typeof key === 'function' ? key(item) : item[key]) || 'Other';
    (out[k] = out[k] || []).push(item);
  }
  return out;
}

export function money(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString('en-GB')}`;
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const t = new Date(todayISO() + 'T00:00:00Z').getTime();
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.round((d - t) / 86400000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00Z' : dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dueLabel(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return 'No due date';
  if (n < 0) return `${Math.abs(n)} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

// review, overdue, week, later, paid, rejected
export function bucketFor(p) {
  if (p.status === 'paid') return 'paid';
  if (p.status === 'rejected') return 'rejected';
  if (p.status === 'review') return 'review';
  const n = daysUntil(p.due_date);
  if (n === null) return 'later';
  if (n < 0) return 'overdue';
  if (n <= 7) return 'week';
  return 'later';
}

export function totalsByCurrency(list) {
  const t = {};
  for (const p of list) t[p.currency] = (t[p.currency] || 0) + Number(p.amount || 0);
  return Object.entries(t).map(([c, v]) => money(v, c));
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ---------- Months (stored as the first day, e.g. 2026-10-01) ----------
export function currentMonth() {
  return new Date().toISOString().slice(0, 7) + '-01';
}

export function addMonths(month, n) {
  const d = new Date(month + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7) + '-01';
}

export function monthLabel(month) {
  if (!month) return '';
  return new Date(month + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const STATUS_LABEL = {
  draft: 'To check',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
};

export const STATUS_TONE = {
  draft: 'neutral',
  pending_approval: 'warn',
  approved: 'info',
  rejected: 'alert',
  paid: 'ok',
};

export const DOC_LABEL = {
  final_invoice: 'Final invoice',
  expense_claim: 'Expense claim',
  receipt_only: 'Receipts only',
  payment_reminder: 'Reminder',
  quote_or_estimate: 'Quote',
  proforma: 'Proforma',
  credit_note: 'Credit note',
  other: 'Not an invoice',
};

export async function openFile(supabase, bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) return alert(error.message);
  window.open(data.signedUrl, '_blank');
}

export function addDays(dateStr, n) {
  const d = new Date((dateStr || todayISO()) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Currency codes are always three capital letters with no spaces, e.g. " usd " -> "USD"
export function cur3(v, fallback = 'USD') {
  const s = String(v ?? '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return s.length === 3 ? s : fallback;
}
