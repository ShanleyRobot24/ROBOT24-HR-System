// Staff payroll. A full month pays the monthly salary. A part month (joining or leaving mid-month)
// pays the day rate for each calendar day employed: day rate = monthly salary x 12 / 365.
const DAY = 864e5;
const r2 = (n) => Math.round(n * 100) / 100;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

export const WORK_WEEK = { mon_fri: 'Monday to Friday (5 days per week)', mon_sat: 'Monday to Saturday (6 days per week)' };
export const dayRate = (monthly) => r2((Number(monthly || 0) * 12) / 365);

// Working days between two dates for a work week (shown for reference)
export function workingDays(from, to, workWeek) {
  let n = 0;
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const wd = new Date(t).getUTCDay(); // 0 Sunday, 6 Saturday
    if (wd === 0) continue;
    if (wd === 6 && workWeek !== 'mon_sat') continue;
    n += 1;
  }
  return n;
}

/** Pay for one person for the month starting `month` (YYYY-MM-01). */
export function payForMonth(s, month) {
  const first = month;
  const last = iso(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const monthly = Number(s.monthly_salary || 0);
  if (!s.start_date || s.status === 'offer') return { paid: false, reason: s.status === 'offer' ? 'Offer not yet signed' : 'No start date' };
  const from = s.start_date > first ? s.start_date : first;
  const end = s.termination_date && s.termination_date < last ? s.termination_date : last;
  if (from > end) return { paid: false, reason: s.start_date > last ? 'Starts later' : 'Left before this month' };
  const days = Math.round((Date.parse(end) - Date.parse(from)) / DAY) + 1;
  const full = from === first && end === last;
  const rate = dayRate(monthly);
  return {
    paid: true, from, to: end, days, full,
    dayRate: rate,
    workingDays: workingDays(from, end, s.work_week),
    amount: full ? r2(monthly) : r2(((monthly * 12) / 365) * days),
    basis: full ? 'Full month' : `${days} day${days > 1 ? 's' : ''} x ${rate.toFixed(2)} day rate${from !== first ? ', joined ' + from : ''}${end !== last ? ', left ' + end : ''}`,
  };
}

// The payroll for a month as it will be sent for approval: one line per person paid, plus totals by currency
export function buildRun(staff, month) {
  const lines = staff
    .map((s) => ({ s, p: payForMonth(s, month) }))
    .filter((x) => x.p.paid)
    .sort((a, b) => a.s.full_name.localeCompare(b.s.full_name))
    .map(({ s, p }) => ({
      staff_id: s.id, staff_no: s.staff_no, name: s.full_name, job_title: s.job_title || '', department: s.department || '',
      monthly_salary: Number(s.monthly_salary || 0), currency: s.currency || 'AED', work_week: s.work_week,
      from: p.from, to: p.to, days: p.days, working_days: p.workingDays, full: p.full, day_rate: p.dayRate, amount: p.amount, basis: p.basis,
    }));
  const totals = {};
  for (const l of lines) totals[l.currency] = Math.round(((totals[l.currency] || 0) + l.amount) * 100) / 100;
  return { lines, totals, headcount: lines.length };
}

// What changed between a sent payroll and today's figures
export function runChanges(sent, live) {
  const out = [];
  const a = Object.fromEntries((sent || []).map((l) => [l.staff_id, l]));
  const b = Object.fromEntries((live || []).map((l) => [l.staff_id, l]));
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[id]) out.push(`${b[id].name} added`);
    else if (!b[id]) out.push(`${a[id].name} removed`);
    else if (Math.abs(a[id].amount - b[id].amount) > 0.009) out.push(`${b[id].name}: ${a[id].currency} ${a[id].amount} → ${b[id].amount}`);
  }
  return out;
}
