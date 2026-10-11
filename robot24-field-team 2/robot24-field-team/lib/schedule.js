// Scheduling rules shared by the screens and the invoice reader.
const DAY = 864e5;
export const jobDays = (a) => Math.round((Date.parse(a.end_date) - Date.parse(a.start_date)) / DAY) + 1;
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Jobs of the same person whose dates overlap. Cancelled jobs never clash.
// Returns { [assignmentId]: [other assignments] }
export function findClashes(assignments) {
  const out = {};
  const live = assignments.filter((a) => a.status !== 'cancelled');
  for (let i = 0; i < live.length; i++) {
    for (let k = i + 1; k < live.length; k++) {
      const a = live[i], b = live[k];
      if (a.contractor_id !== b.contractor_id) continue;
      if (a.start_date <= b.end_date && b.start_date <= a.end_date) {
        (out[a.id] = out[a.id] || []).push(b);
        (out[b.id] = out[b.id] || []).push(a);
      }
    }
  }
  return out;
}

// Other jobs this person already has on these dates (for a warning before saving)
export function clashesFor(assignments, draft, ignoreId) {
  if (!draft.contractor_id || !draft.start_date || !draft.end_date || draft.status === 'cancelled') return [];
  return assignments.filter((a) => a.id !== ignoreId && a.contractor_id === draft.contractor_id && a.status !== 'cancelled'
    && a.start_date <= draft.end_date && draft.start_date <= a.end_date);
}

// Travel should fall around the job: arriving up to 3 days before, leaving up to 3 days after.
// Returns a short reason when it doesn't, otherwise null.
export function travelMismatch(cost, job) {
  if (!cost || !job || !cost.travel_date) return null;
  const s = Date.parse(job.start_date), e = Date.parse(job.end_date);
  const t = Date.parse(cost.travel_date);
  const t2 = cost.end_date ? Date.parse(cost.end_date) : null;
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (t < s - 3 * DAY) return `Starts ${fmt(t)}, more than 3 days before the job (${fmt(s)})`;
  if (t > e + 1 * DAY) return `Starts ${fmt(t)}, after the job ended (${fmt(e)})`;
  if (t2 && t2 > e + 3 * DAY) return `Ends ${fmt(t2)}, more than 3 days after the job (${fmt(e)})`;
  if (t2 && t2 < s) return `Ends ${fmt(t2)}, before the job starts (${fmt(s)})`;
  return null;
}

// Which of a person's jobs an invoice is for: OPP code or event name, then work dates, then the month.
export function matchJob(jobs, { eventReference, description, workStart, workEnd, invoiceDate, period } = {}) {
  const live = jobs.filter((a) => a.status !== 'cancelled');
  if (!live.length) return null;
  const text = norm(`${eventReference || ''} ${description || ''}`);
  if (text) {
    const byCode = live.filter((a) => a.event_reference && text.includes(norm(a.event_reference)));
    if (byCode.length === 1) return byCode[0];
    // Word by word, tolerant of small spelling differences (Marriot / Marriott)
    const words = (v) => String(v || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const textWords = words(`${eventReference || ''} ${description || ''}`);
    const score = (a) => {
      const tw = words(a.title);
      if (!tw.length) return 0;
      const hit = tw.filter((w) => textWords.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x)) && Math.min(x.length, w.length) >= 4)));
      return hit.length / tw.length;
    };
    const ranked = live.map((a) => [a, score(a)]).filter(([, sc]) => sc >= 0.6).sort((x, y) => y[1] - x[1]);
    if (ranked.length === 1 || (ranked.length > 1 && ranked[0][1] > ranked[1][1])) return ranked[0][0];
  }
  if (workStart || workEnd) {
    const ws = workStart || workEnd, we = workEnd || workStart;
    const hits = live.filter((a) => a.start_date <= we && ws <= a.end_date);
    if (hits.length === 1) return hits[0];
  }
  const month = (period || invoiceDate || '').slice(0, 7);
  if (month) {
    const inMonth = live.filter((a) => a.start_date.slice(0, 7) <= month && a.end_date.slice(0, 7) >= month);
    if (inMonth.length === 1) return inMonth[0];
  }
  return null;
}

// Plain text for messages
export const dateRange = (a, b) => {
  const f = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return !b || a === b ? f(a) : `${f(a)} to ${f(b)}`;
};
