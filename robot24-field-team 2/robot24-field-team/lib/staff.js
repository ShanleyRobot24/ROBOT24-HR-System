'use client';
import { WORK_WEEK } from './payroll';

export const STAFF_STATUS = { offer: ['Offer sent', 'warn'], active: ['Active', 'ok'], terminated: ['Terminated', 'alert'] };
export const VISA_STATUS = [
  ['not_started', 'Not started'],
  ['entry_permit_applied', 'Entry permit applied'],
  ['entry_permit_issued', 'Entry permit issued'],
  ['medical_and_eid', 'Medical and Emirates ID in progress'],
  ['residence_issued', 'Residence visa issued'],
  ['own_visa', 'Own visa (not sponsored)'],
  ['cancelled', 'Cancelled'],
];
export const visaLabel = (k) => (VISA_STATUS.find(([v]) => v === k) || [k, k])[1];
export const STAFF_DOCS = [
  ['passport', 'Passport copy'],
  ['emirates_id', 'Emirates ID'],
  ['labour_card', 'Labour card'],
  ['mohre_contract', 'MOHRE contract'],
  ['offer_letter', 'Offer letter'],
  ['employment_contract', 'Employment contract'],
  ['visa', 'Visa'],
  ['other', 'Other'],
];
export const docLabel = (k) => (STAFF_DOCS.find(([v]) => v === k) || [k, k])[1];
// Documents the AI can read, and what it fills in
export const AI_READS = ['passport', 'emirates_id', 'labour_card', 'visa', 'offer_letter', 'employment_contract', 'mohre_contract'];
export const REQUIRED_DOCS = ['passport', 'emirates_id', 'labour_card', 'mohre_contract', 'offer_letter', 'employment_contract'];

const long = (d, weekday = false) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { ...(weekday ? { weekday: 'long' } : {}), day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const amount = (v, cur) => `${cur || 'AED'} ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// Fill the company offer letter template. Jersild Roberts's signature is only added when asked for.
export async function makeOfferLetter(s, { date, withSignature }) {
  const res = await fetch(withSignature ? '/templates/offer-letter-signed.docx' : '/templates/offer-letter.docx');
  if (!res.ok) throw new Error('The offer letter template is missing');
  // Loaded only when a letter is made, to keep the page light
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([import('pizzip'), import('docxtemplater')]);
  const zip = new PizZip(await res.arrayBuffer());
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({
    name: s.full_name || '',
    passport: s.passport_no || '',
    dob: long(s.date_of_birth),
    nationality: s.nationality || '',
    title: s.job_title || '',
    location: s.location || 'Dubai, United Arab Emirates',
    salary: amount(s.monthly_salary, s.currency),
    start: long(s.start_date, true).replace(/^(\w+) /, '$1, '),
    workdays: WORK_WEEK[s.work_week] || WORK_WEEK.mon_fri,
    date: long(date),
  });
  return doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Days until a date (negative when past)
export const daysTo = (d) => (d ? Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5) : null);
