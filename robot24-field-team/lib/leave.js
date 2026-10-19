// Leave rules (UAE Federal Decree-Law 33 of 2021 defaults) and the maths for balances, pay and final settlement.
const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d) + n * DAY);
const r2 = (n) => Math.round(n * 100) / 100;

// type, label, how days are counted, whether it is paid
export const LEAVE_TYPES = [
  ['annual', 'Annual leave', 'calendar'],
  ['sick', 'Sick leave', 'calendar'],
  ['maternity', 'Maternity leave', 'calendar'],
  ['parental', 'Parental leave', 'working'],
  ['bereavement', 'Bereavement leave', 'calendar'],
  ['study', 'Study leave', 'working'],
  ['national_service', 'National service', 'calendar'],
  ['unpaid', 'Unpaid leave', 'calendar'],
  ['hajj', 'Hajj leave (unpaid)', 'calendar'],
  ['toil', 'Time off in lieu', 'working'],
  ['wfh', 'Working from home', 'working'],
];
export const leaveLabel = (k) => (LEAVE_TYPES.find(([v]) => v === k) || [k, k])[1];
export const LEAVE_STATUS = { pending: ['Waiting for approval', 'warn'], approved: ['Approved', 'ok'], rejected: ['Rejected', 'alert'], cancelled: ['Cancelled', 'neutral'] };
export const SICK_TIERS = { full: 15, half: 30, unpaid: 45 }; // 90 days a year after probation
export const MATERNITY = { full: 45, half: 15 };
export const PROBATION_MONTHS = 6;

const isWorkingDay = (d, workWeek) => { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); return wd !== 0 && (wd !== 6 || workWeek === 'mon_sat'); };
const holidaySet = (holidays) => new Set((holidays || []).map((h) => (typeof h === 'string' ? h : h.day)));

/** The dates a leave counts on: calendar days (or working days for some types), never public holidays. */
export function countedDates(type, start, end, workWeek, holidays) {
  const mode = (LEAVE_TYPES.find(([v]) => v === type) || [])[2] || 'calendar';
  const hol = holidaySet(holidays);
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (hol.has(d)) continue;
    if (mode === 'working' && !isWorkingDay(d, workWeek)) continue;
    out.push(d);
  }
  return out;
}
export function countDays(type, start, end, halfDay, workWeek, holidays) {
  if (!start || !end || end < start) return 0;
  const n = countedDates(type, start, end, workWeek, holidays).length;
  return halfDay ? Math.min(n, 0.5) : n;
}

export const probationEnd = (s) => s.probation_end || (s.start_date ? (() => { const d = new Date(s.start_date + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + PROBATION_MONTHS); return iso(d); })() : null);
const monthsBetween = (a, b) => { const x = new Date(a + 'T00:00:00Z'), y = new Date(b + 'T00:00:00Z'); let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth(); if (y.getUTCDate() < x.getUTCDate()) m -= 1; return Math.max(0, m); };

/** Annual leave earned by a date: 2 days a month once 6 months are done (first year), then the yearly entitlement spread monthly. */
export function annualEarned(s, asOf) {
  if (!s.start_date || asOf < s.start_date) return 0;
  const m = monthsBetween(s.start_date, asOf);
  const ent = Number(s.annual_entitlement ?? 30);
  if (m < 6) return 0;
  if (m <= 12) return 2 * m;
  return r2(24 + (m - 12) * (ent / 12));
}

/** Balances for one person. leaves: their leave requests; adjustments: their adjustments. */
export function balances(s, leaves = [], adjustments = [], asOf = iso(Date.now())) {
  const ok = leaves.filter((l) => l.status === 'approved');
  const from = s.opening_balance_date || s.start_date || '1900-01-01';
  const opening = s.opening_balance_date ? Number(s.opening_annual_balance || 0) : 0;
  const earned = r2(annualEarned(s, asOf) - (s.opening_balance_date ? annualEarned(s, s.opening_balance_date) : 0));
  const adjAnnual = adjustments.filter((a) => a.leave_type === 'annual').reduce((t, a) => t + Number(a.days), 0);
  const annualLeaves = ok.filter((l) => l.leave_type === 'annual' && l.start_date >= from);
  const taken = annualLeaves.filter((l) => l.start_date <= asOf).reduce((t, l) => t + Number(l.days), 0);
  const booked = annualLeaves.filter((l) => l.start_date > asOf).reduce((t, l) => t + Number(l.days), 0);
  const pending = leaves.filter((l) => l.status === 'pending' && l.leave_type === 'annual').reduce((t, l) => t + Number(l.days), 0);
  const annual = r2(opening + earned + adjAnnual - taken);
  const year = asOf.slice(0, 4);
  const sickUsed = ok.filter((l) => l.leave_type === 'sick' && l.start_date.slice(0, 4) === year).reduce((t, l) => t + Number(l.days), 0);
  const toil = r2(adjustments.filter((a) => a.leave_type === 'toil').reduce((t, a) => t + Number(a.days), 0) - ok.filter((l) => l.leave_type === 'toil').reduce((t, l) => t + Number(l.days), 0));
  const pEnd = probationEnd(s);
  return {
    annual, annualAfterBooked: r2(annual - booked), booked, pending, earned: r2(opening + earned + adjAnnual), taken,
    sick: { used: sickUsed, fullLeft: Math.max(0, SICK_TIERS.full - sickUsed), halfLeft: Math.max(0, SICK_TIERS.full + SICK_TIERS.half - Math.max(SICK_TIERS.full, sickUsed)), total: 90 },
    toil, inProbation: !!pEnd && asOf < pEnd, probationEnd: pEnd,
  };
}

/** Pay effect of approved leave in a month: days at half pay and unpaid days (for payroll). */
export function leavePay(s, leaves = [], holidays = [], month) {
  const first = month, last = iso(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const ok = leaves.filter((l) => l.status === 'approved').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pEnd = probationEnd(s);
  const sickSeen = {}; // sick days so far, per calendar year
  let unpaid = 0, half = 0;
  const notes = [];
  for (const l of ok) {
    const dates = countedDates(l.leave_type, l.start_date, l.end_date, s.work_week, holidays);
    const weight = l.half_day ? 0.5 : 1;
    dates.forEach((d, idx) => {
      let pay = 'full';
      if (['unpaid', 'hajj'].includes(l.leave_type)) pay = 'none';
      else if (l.leave_type === 'sick') {
        const y = d.slice(0, 4);
        sickSeen[y] = (sickSeen[y] || 0) + weight;
        const n = sickSeen[y];
        if (pEnd && d < pEnd) pay = 'none';
        else if (n <= SICK_TIERS.full) pay = 'full';
        else if (n <= SICK_TIERS.full + SICK_TIERS.half) pay = 'half';
        else pay = 'none';
      } else if (l.leave_type === 'maternity') {
        pay = idx < MATERNITY.full ? 'full' : idx < MATERNITY.full + MATERNITY.half ? 'half' : 'none';
      }
      if (d < first || d > last) return;
      if (s.start_date && d < s.start_date) return;
      if (s.termination_date && d > s.termination_date) return;
      if (pay === 'none') unpaid += weight;
      if (pay === 'half') half += weight;
    });
    if (l.leave_type === 'sick' && pEnd && l.start_date < pEnd && l.end_date >= first && l.start_date <= last) notes.push('sick leave during probation is unpaid');
  }
  const daily = (Number(s.monthly_salary || 0) * 12) / 365;
  return { unpaidDays: unpaid, halfPayDays: half, deduction: r2(daily * (unpaid + half * 0.5)), notes: [...new Set(notes)] };
}

/** Final settlement on leaving: unused annual leave paid out, plus end-of-service gratuity. Uses the basic salary. */
export function finalSettlement(s, leaves = [], adjustments = [], holidays = []) {
  const end = s.termination_date || iso(Date.now());
  const basic = Number(s.basic_salary || s.monthly_salary || 0);
  const daily = (basic * 12) / 365;
  const b = balances(s, leaves.filter((l) => l.start_date <= end), adjustments, end);
  const unusedDays = Math.max(0, b.annual);
  // Unpaid absence does not count towards service
  const unpaidAbsence = leaves.filter((l) => l.status === 'approved' && ['unpaid', 'hajj'].includes(l.leave_type) && l.start_date <= end)
    .reduce((t, l) => t + countedDates(l.leave_type, l.start_date, l.end_date > end ? end : l.end_date, s.work_week, holidays).length, 0);
  const serviceDays = s.start_date ? Math.max(0, (Date.parse(end) - Date.parse(s.start_date)) / DAY + 1 - unpaidAbsence) : 0;
  const years = serviceDays / 365;
  let gratuityDays = 0;
  if (years >= 1) gratuityDays = 21 * Math.min(years, 5) + 30 * Math.max(0, years - 5);
  const gratuity = Math.min(daily * gratuityDays, basic * 24); // capped at two years' wage
  return {
    end, basic, usedBasic: !!s.basic_salary, daily: r2(daily), unusedDays: r2(unusedDays), leavePay: r2(unusedDays * daily),
    years: r2(years), gratuityDays: r2(gratuityDays), gratuity: r2(gratuity), unpaidAbsence, total: r2(unusedDays * daily + gratuity),
  };
}
