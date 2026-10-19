// Guardrails: warnings for amounts and dates that look like typos. They never block, they ask.
const median = (xs) => {
  const s = xs.filter((x) => Number(x) > 0).map(Number).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * value: the amount being saved. usual: past amounts for the same thing (or a single usual value).
 * cap: a ceiling above which it is almost certainly a typo. Returns a warning or null.
 */
export function amountWarning(value, { usual = [], cap = null, label = 'This amount', cur = '', times = 4 } = {}) {
  const v = Number(value);
  if (!v || v < 0) return null;
  const m = Array.isArray(usual) ? median(usual) : Number(usual) || null;
  const c = cur ? `${cur} ` : '';
  if (m) {
    const r = v / m;
    if (r >= 8 && r <= 12) return `${label} is ${c}${fmt(v)}, about 10 times the usual ${c}${fmt(m)}. Is there an extra zero?`;
    if (r >= times) return `${label} is ${c}${fmt(v)}, ${r < 5 ? r.toFixed(1) : Math.round(r)} times the usual ${c}${fmt(m)}.`;
    if (r > 0 && r <= 0.12) return `${label} is ${c}${fmt(v)}, about a tenth of the usual ${c}${fmt(m)}. Is a zero missing?`;
  }
  if (cap && v > cap) return `${label} is ${c}${fmt(v)}, which is unusually high. Please check it.`;
  return null;
}

const DAY = 864e5;
const today = () => Date.parse(new Date().toISOString().slice(0, 10));
const nice = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Dates that are probably typos: far in the past or future, too long, or ending before starting. */
export function dateWarnings({ start, end, label = 'The date', pastDays = 183, futureDays = 366, maxDays = null } = {}) {
  const out = [];
  const t = today();
  if (start) {
    const s = Date.parse(start);
    if (s < t - pastDays * DAY) out.push(`${label} ${nice(start)} is more than ${Math.round(pastDays / 30)} months ago.`);
    if (s > t + futureDays * DAY) out.push(`${label} ${nice(start)} is more than ${Math.round(futureDays / 30)} months away.`);
  }
  if (start && end) {
    if (end < start) out.push(`It ends (${nice(end)}) before it starts (${nice(start)}).`);
    else if (maxDays && (Date.parse(end) - Date.parse(start)) / DAY + 1 > maxDays) out.push(`It runs for ${Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1} days, which is unusually long.`);
  }
  return out;
}

/** One confirm for all warnings. Returns true to go ahead. */
export function okToSave(warnings) {
  const list = (warnings || []).filter(Boolean);
  if (!list.length) return true;
  return confirm(`Please check before saving:\n\n• ${list.join('\n• ')}\n\nSave anyway?`);
}

// Duplicate people: same passport number, same email, or the same name
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function findDuplicates(draft, existing, ignoreId) {
  return (existing || []).filter((p) => p.id !== ignoreId && (
    (draft.passport_no && norm(p.passport_no) && norm(p.passport_no) === norm(draft.passport_no))
    || (draft.email && p.email && p.email.trim().toLowerCase() === draft.email.trim().toLowerCase())
    || (draft.full_name && norm(p.full_name) === norm(draft.full_name))
  ));
}

// Plain-English things for an approver to look at. Rules, not AI, so they are exact and instant.

const moneyText = (v, c) => `${c} ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const daySpan = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

// Bills waiting for approval. rows: approval_queue rows; checks: approval_checks rows by id.
export function billChecks(rows, checks) {
  const out = [];
  for (const p of rows) {
    const c = checks[p.id] || {};
    const who = `${p.full_name}${p.invoice_number ? `, invoice ${p.invoice_number}` : ''}`;
    if (c.same_invoice > 0) out.push({ id: p.id, level: 'high', text: `${who}: this invoice number was already billed before. Possible duplicate.` });
    else if (c.same_amount > 0) out.push({ id: p.id, level: 'high', text: `${who}: another bill for exactly ${moneyText(p.amount, p.currency)} this month. Possible duplicate.` });
    if (c.prior_count >= 2 && c.prior_median) {
      const w = amountWarning(p.amount, { usual: Number(c.prior_median), label: p.kind === 'expense' ? 'Expenses' : 'The fee', cur: p.currency, times: 3 });
      if (w) out.push({ id: p.id, level: 'high', text: `${who}: ${w}` });
    }
    if (p.assignment_start && p.assignment_end && Number(p.days_worked) > daySpan(p.assignment_start, p.assignment_end)) {
      out.push({ id: p.id, level: 'high', text: `${who}: billed ${p.days_worked} days, but ${p.assignment_title} was booked for ${daySpan(p.assignment_start, p.assignment_end)}.` });
    }
    if (p.kind !== 'expense' && !p.assignment_id && !p.assignment_title) out.push({ id: p.id, level: 'low', text: `${who}: not linked to a job, so days can't be checked.` });
    if (p.rate_currency && p.currency !== p.rate_currency) out.push({ id: p.id, level: 'low', text: `${who}: invoiced in ${p.currency}, day rate is in ${p.rate_currency}.` });
  }
  const rank = { high: 0, low: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

// Staff payroll waiting for approval, compared with the previous month's approved or paid payroll
export function payrollChecks(lines, previous) {
  const out = [];
  const prev = Object.fromEntries((previous?.lines || []).map((l) => [l.staff_id, l]));
  for (const l of lines) {
    const p = prev[l.staff_id];
    if (!previous) continue;
    if (!p) out.push({ level: 'low', text: `${l.name} is new this month${l.full ? '' : ` (${l.basis})`}.` });
    else if (Math.abs(Number(p.monthly_salary) - Number(l.monthly_salary)) > 0.5) out.push({ level: 'high', text: `${l.name}: monthly salary changed from ${moneyText(p.monthly_salary, l.currency)} to ${moneyText(l.monthly_salary, l.currency)}.` });
  }
  if (previous) for (const p of previous.lines || []) if (!lines.some((l) => l.staff_id === p.staff_id)) out.push({ level: 'low', text: `${p.name} was paid last month but is not on this payroll.` });
  for (const l of lines) if (!l.full && !(previous && !prev[l.staff_id])) out.push({ level: 'low', text: `${l.name}: part month, ${l.basis}.` });
  for (const l of lines) {
    const w = amountWarning(l.monthly_salary, { cap: 150000, label: `${l.name}'s monthly salary`, cur: l.currency });
    if (w) out.push({ level: 'high', text: w });
  }
  const rank = { high: 0, low: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
