import { cur3 } from './format';
// Pure report calculations. No database calls, so it can be tested on its own.

export const BASIS = {
  paid: { label: 'Paid', statuses: ['paid'] },
  approved: { label: 'Approved and paid', statuses: ['approved', 'paid'] },
  billed: { label: 'Everything billed', statuses: ['draft', 'pending_approval', 'approved', 'paid'] },
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

import { categoryLabel, normaliseCategory } from './categories';
import { dayRateOf } from './rates';
export { categoryLabel };

const round = (n) => Math.round(n * 100) / 100;

// Month key (YYYY-MM) a bill counts under
export function monthOf(p, dateMode) {
  if (dateMode === 'paid_on') return p.status === 'paid' && p.paid_on ? p.paid_on.slice(0, 7) : null;
  return p.period ? p.period.slice(0, 7) : null;
}

export function filterPayments(payments, contractorsById, { basis, currency, region, dateMode }) {
  const statuses = dateMode === 'paid_on' ? ['paid'] : BASIS[basis].statuses;
  return payments.filter((p) => {
    if (!statuses.includes(p.status)) return false;
    if (currency && p.currency !== currency) return false;
    if (region && region !== 'All' && contractorsById[p.contractor_id]?.region !== region) return false;
    return !!monthOf(p, dateMode);
  });
}

export function sumUp(list) {
  let fees = 0, expenses = 0;
  for (const p of list) {
    if (p.kind === 'expense') expenses += Number(p.amount || 0);
    else fees += Number(p.amount || 0);
  }
  return { fees: round(fees), expenses: round(expenses), total: round(fees + expenses), bills: list.length };
}

export function inMonth(list, ym, dateMode) {
  return list.filter((p) => monthOf(p, dateMode) === ym);
}

export function inYear(list, year, dateMode) {
  return list.filter((p) => (monthOf(p, dateMode) || '').startsWith(String(year)));
}

// 12 rows for the year chart
export function byMonth(list, year, dateMode) {
  return MONTHS.map((label, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    const s = sumUp(inMonth(list, ym, dateMode));
    return { month: label, ym, fees: s.fees, expenses: s.expenses, total: s.total };
  });
}

export function byRegion(list, contractorsById) {
  const out = {};
  for (const p of list) {
    const r = contractorsById[p.contractor_id]?.region || 'Unknown';
    out[r] = out[r] || [];
    out[r].push(p);
  }
  return Object.entries(out)
    .map(([region, l]) => ({ region, ...sumUp(l), people: new Set(l.map((p) => p.contractor_id)).size }))
    .sort((a, b) => b.total - a.total);
}

// Splits one expense bill into { category: amount }. Uses its lines when present, else the whole bill.
function splitExpense(p) {
  const out = {};
  const lines = Array.isArray(p.line_items) ? p.line_items.filter((l) => Number(l.amount)) : [];
  const lineSum = lines.reduce((a, l) => a + Number(l.amount), 0);
  if (!lines.length) { out.uncategorised = Number(p.amount || 0); return out; }
  const factor = lineSum ? Number(p.amount || 0) / lineSum : 1; // in case the total was edited
  for (const l of lines) {
    const k = normaliseCategory(l.category, 'expense');
    out[k] = (out[k] || 0) + Number(l.amount) * factor;
  }
  return out;
}

// Expense totals by category
export function byExpenseCategory(list) {
  const out = {};
  for (const p of list) {
    if (p.kind !== 'expense') continue;
    for (const [k, v] of Object.entries(splitExpense(p))) out[k] = (out[k] || 0) + v;
  }
  return Object.entries(out)
    .map(([key, value]) => ({ key, name: categoryLabel(key), value: round(value) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Member x expense category, e.g. what each person spent on hotels and Uber
export function expensesByMember(list, contractorsById) {
  const rows = {};
  const totals = {};
  for (const p of list) {
    if (p.kind !== 'expense') continue;
    if (!rows[p.contractor_id]) {
      const c = contractorsById[p.contractor_id] || {};
      rows[p.contractor_id] = { id: p.contractor_id, name: c.full_name || 'Unknown', refCode: c.ref_code || '', region: c.region || '', cats: {}, total: 0 };
    }
    const r = rows[p.contractor_id];
    for (const [k, v] of Object.entries(splitExpense(p))) {
      r.cats[k] = (r.cats[k] || 0) + v;
      totals[k] = (totals[k] || 0) + v;
      r.total += v;
    }
  }
  const columns = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => ({ key: k, label: categoryLabel(k), total: round(totals[k]) }));
  const list2 = Object.values(rows).map((r) => ({ ...r, total: round(r.total), cats: Object.fromEntries(Object.entries(r.cats).map(([k, v]) => [k, round(v)])) }));
  list2.sort((a, b) => b.total - a.total);
  return { rows: list2, columns, grandTotal: round(columns.reduce((a, c) => a + c.total, 0)) };
}

// One row per member with fees, expenses, total, bill count
export function byMember(list, contractorsById) {
  const out = {};
  for (const p of list) {
    out[p.contractor_id] = out[p.contractor_id] || [];
    out[p.contractor_id].push(p);
  }
  return Object.entries(out)
    .map(([id, l]) => {
      const c = contractorsById[id] || {};
      return { id, name: c.full_name || 'Unknown', refCode: c.ref_code || '', region: c.region || '', role: c.designation || '', ...sumUp(l) };
    })
    .sort((a, b) => b.total - a.total);
}

// Member x month grid for the year
export function memberYearGrid(list, contractorsById, year, dateMode) {
  const rows = {};
  for (const p of list) {
    const ym = monthOf(p, dateMode);
    if (!ym || !ym.startsWith(String(year))) continue;
    const m = Number(ym.slice(5, 7)) - 1;
    if (!rows[p.contractor_id]) {
      const c = contractorsById[p.contractor_id] || {};
      rows[p.contractor_id] = { id: p.contractor_id, name: c.full_name || 'Unknown', refCode: c.ref_code || '', region: c.region || '', months: Array(12).fill(0), fees: 0, expenses: 0 };
    }
    const r = rows[p.contractor_id];
    r.months[m] += Number(p.amount || 0);
    if (p.kind === 'expense') r.expenses += Number(p.amount || 0); else r.fees += Number(p.amount || 0);
  }
  const list2 = Object.values(rows).map((r) => ({ ...r, months: r.months.map(round), fees: round(r.fees), expenses: round(r.expenses), total: round(r.fees + r.expenses) }));
  list2.sort((a, b) => b.total - a.total);
  const colTotals = MONTHS.map((_, i) => round(list2.reduce((a, r) => a + r.months[i], 0)));
  const max = Math.max(0, ...list2.flatMap((r) => r.months));
  return { rows: list2, colTotals, grandTotal: round(colTotals.reduce((a, b) => a + b, 0)), max };
}

export function change(now, before) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 1000) / 10;
}

// ---------- Projection: what each freelancer is likely to cost ----------
export const dayCount = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

// Days of a job that fall inside [from, to], counting both ends
export function overlapDays(start, end, from, to) {
  const a = start > from ? start : from;
  const b = end < to ? end : to;
  return a > b ? 0 : dayCount(a, b);
}

// Fee for the days in scope: day rate x days. (10 and 15 day packages were legacy contracts.)
export function feeEstimate(c, totalDays, days) {
  const { rate, estimated, note } = dayRateOf(c);
  if (!rate) return { fee: null, basis: 'No rate on file' };
  return { fee: round(rate * days), basis: `${days} x day rate${estimated ? ` (${note})` : ''}`, estimated };
}

/**
 * from, to: 'YYYY-MM-DD' (inclusive). Fees are in each person's rate card currency, so only people
 * whose rate card is in `currency` are projected. Travel and invoices are filtered by their own currency.
 */
export function projection({ assignments, direct, payments, byId, from, to, currency, region = 'All' }) {
  const rows = {};
  const inRegion = (c) => region === 'All' || c?.region === region;
  const row = (id) => {
    if (!rows[id]) {
      const c = byId[id] || {};
      rows[id] = {
        id, name: c.full_name || 'Unknown', refCode: c.ref_code || '', region: c.region || '', role: c.designation || '',
        photo: c.photo_path || null, rate: c, jobs: [], travelItems: [],
        confirmedDays: 0, plannedDays: 0, confirmedFees: 0, plannedFees: 0, travel: 0,
        invoicedFees: 0, invoicedExpenses: 0, noRate: false,
      };
    }
    return rows[id];
  };
  const fromMonth = from.slice(0, 7) + '-01';

  // People booked in this period but left out, with the reason, so nobody disappears silently
  const hidden = {};
  const hide = (c, id, reason) => { const name = c?.full_name || 'Unknown person'; hidden[`${id}|${reason}`] = { name, reason }; };

  for (const a of assignments) {
    const c = byId[a.contractor_id];
    const days = overlapDays(a.start_date, a.end_date, from, to);
    if (!days) continue;
    if (!c) { hide(c, a.contractor_id, 'not on the field team list (inactive or removed)'); continue; }
    if (a.status === 'cancelled') { hide(c, a.contractor_id, `"${a.title}" is cancelled`); continue; }
    if (!inRegion(c)) { hide(c, a.contractor_id, `location is ${c.region || 'not set'}, not ${region}`); continue; }
    const cur = cur3(c.currency);
    if (cur !== currency) { hide(c, a.contractor_id, `no ${cur} exchange rate yet, add one under Exchange rates`); continue; }
    const est = feeEstimate(c, dayCount(a.start_date, a.end_date), days);
    const r = row(a.contractor_id);
    const planned = a.status === 'planned';
    if (planned) { r.plannedDays += days; r.plannedFees += est.fee || 0; }
    else { r.confirmedDays += days; r.confirmedFees += est.fee || 0; }
    if (est.fee === null) r.noRate = true;
    if (est.estimated) r.estimatedRate = true;
    r.jobs.push({ id: a.id, title: a.title, ref: a.event_reference, city: a.city, start: a.start_date, end: a.end_date, status: a.status, days, fee: est.fee, basis: est.basis });
  }
  for (const d of direct) {
    if (d.currency !== currency || d.period < fromMonth || d.period > to) continue;
    const c = byId[d.contractor_id];
    if (!inRegion(c)) continue;
    const r = row(d.contractor_id);
    r.travel += Number(d.amount || 0);
    r.travelItems.push(d);
  }
  for (const p of payments) {
    if (p.status === 'rejected' || p.currency !== currency || p.period < fromMonth || p.period > to) continue;
    if (!inRegion(byId[p.contractor_id])) continue;
    const r = row(p.contractor_id);
    if (p.kind === 'expense') r.invoicedExpenses += Number(p.amount || 0); else r.invoicedFees += Number(p.amount || 0);
  }

  const list = Object.values(rows).map((r) => {
    const committed = r.confirmedFees + r.travel;
    return {
      ...r,
      confirmedFees: round(r.confirmedFees), plannedFees: round(r.plannedFees), travel: round(r.travel),
      invoicedFees: round(r.invoicedFees), invoicedExpenses: round(r.invoicedExpenses),
      committed: round(committed), total: round(committed + r.plannedFees),
      toInvoice: round(Math.max(0, r.confirmedFees - r.invoicedFees)),
    };
  }).filter((r) => r.jobs.length || r.travel || r.invoicedFees || r.invoicedExpenses);
  list.sort((a, b) => b.total - a.total || b.invoicedFees - a.invoicedFees);

  const sumOf = (k) => round(list.reduce((s, r) => s + r[k], 0));
  const totals = {
    confirmedFees: sumOf('confirmedFees'), plannedFees: sumOf('plannedFees'), travel: sumOf('travel'),
    committed: sumOf('committed'), total: sumOf('total'), invoicedFees: sumOf('invoicedFees'),
    invoicedExpenses: sumOf('invoicedExpenses'), toInvoice: sumOf('toInvoice'),
    confirmedDays: list.reduce((s, r) => s + r.confirmedDays, 0), plannedDays: list.reduce((s, r) => s + r.plannedDays, 0),
    people: list.filter((r) => r.jobs.length).length, noRate: list.filter((r) => r.noRate).map((r) => r.name),
    hidden: Object.values(hidden).filter((h) => !list.some((r) => r.name === h.name && r.jobs.length)),
    estimatedRate: list.filter((r) => r.estimatedRate && !r.noRate).map((r) => r.name),
  };
  return { rows: list, totals };
}

// Projection for each month of a year, for the chart
export function projectionByMonth(args, year) {
  return MONTHS.map((label, i) => {
    const m = String(i + 1).padStart(2, '0');
    const from = `${year}-${m}-01`;
    const to = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    const t = projection({ ...args, from, to }).totals;
    return { month: label, confirmed: t.confirmedFees, travel: t.travel, planned: t.plannedFees, invoiced: round(t.invoicedFees + t.invoicedExpenses) };
  });
}

// ---------- Cost per opportunity (OPP code, or job name when there is no code) ----------
export const oppKey = (a) => (a.event_reference ? String(a.event_reference).trim().toUpperCase() : String(a.title || 'Untitled').trim().toLowerCase());

/**
 * Opportunities with a job in [from, to]. Costs are counted for the whole opportunity, whatever month they fall in.
 * payments and direct must already be in one currency. Fees for jobs with no fee bill yet are estimated from the day rate.
 */
export function opportunities({ assignments, payments, direct, byId, from, to, region = 'All' }) {
  const live = assignments.filter((a) => a.status !== 'cancelled');
  const inScope = new Set(live.filter((a) => a.start_date <= to && a.end_date >= from).map(oppKey));
  const out = {};
  for (const a of live) {
    const k = oppKey(a);
    if (!inScope.has(k)) continue;
    const c = byId[a.contractor_id];
    if (region !== 'All' && c?.region !== region) continue;
    const o = (out[k] = out[k] || { key: k, code: a.event_reference || null, title: a.title, places: new Set(), start: a.start_date, end: a.end_date, people: {}, fees: 0, expenses: 0, travel: 0, estimate: 0, plannedEstimate: 0, days: 0, noRate: [] });
    if (a.start_date < o.start) o.start = a.start_date;
    if (a.end_date > o.end) o.end = a.end_date;
    if (a.city || a.country) o.places.add([a.city, a.country].filter(Boolean).join(', '));
    const d = dayCount(a.start_date, a.end_date);
    o.days += d;
    const person = (o.people[a.contractor_id] = o.people[a.contractor_id] || { id: a.contractor_id, name: c?.full_name || 'Unknown', jobs: [], fees: 0, expenses: 0, travel: 0, estimate: 0 });
    const bills = payments.filter((p) => p.assignment_id === a.id && p.status !== 'rejected');
    const fees = bills.filter((p) => p.kind !== 'expense').reduce((t, p) => t + Number(p.amount || 0), 0);
    const exps = bills.filter((p) => p.kind === 'expense').reduce((t, p) => t + Number(p.amount || 0), 0);
    const trav = direct.filter((x) => x.assignment_id === a.id).reduce((t, x) => t + Number(x.amount || 0), 0);
    let est = 0;
    if (!bills.some((p) => p.kind !== 'expense')) {
      const { rate } = dayRateOf(c);
      if (rate) est = rate * d; else o.noRate.push(c?.full_name || 'Unknown');
    }
    person.jobs.push({ id: a.id, title: a.title, status: a.status, start: a.start_date, end: a.end_date, days: d, fees, expenses: exps, travel: trav, estimate: est });
    person.fees += fees; person.expenses += exps; person.travel += trav; person.estimate += est;
    o.fees += fees; o.expenses += exps; o.travel += trav;
    if (a.status === 'planned') o.plannedEstimate += est; else o.estimate += est;
  }
  return Object.values(out).map((o) => {
    const spent = o.fees + o.expenses + o.travel;
    return {
      ...o,
      places: [...o.places],
      people: Object.values(o.people).map((p) => ({ ...p, fees: round(p.fees), expenses: round(p.expenses), travel: round(p.travel), estimate: round(p.estimate) })).sort((a, b) => a.name.localeCompare(b.name)),
      fees: round(o.fees), expenses: round(o.expenses), travel: round(o.travel), estimate: round(o.estimate), plannedEstimate: round(o.plannedEstimate),
      spent: round(spent), total: round(spent + o.estimate + o.plannedEstimate),
    };
  }).sort((a, b) => b.total - a.total);
}
