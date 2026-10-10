// Ready-to-send messages for freelancers: job brief, invoice reminder, payment confirmation.
import { dateRange } from './schedule';
import { categoryLabel } from './categories';

const INVOICE_EMAIL = process.env.R24_INVOICE_EMAIL || 's.kajee@robot24.com';
const first = (name) => (name || '').trim().split(/\s+/)[0] || 'there';
const money = (v, c) => {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: c || 'USD' }).format(Number(v || 0)); }
  catch { return `${c} ${v}`; }
};

export function briefText({ person, job, travel = [] }) {
  const where = [job.city, job.country].filter(Boolean).join(', ');
  const lines = [
    `Hi ${first(person.full_name)},`,
    '',
    `Here are the details for your Robot24 assignment:`,
    '',
    `Job: ${job.title}${job.event_reference ? ` (${job.event_reference})` : ''}`,
    `Dates: ${dateRange(job.start_date, job.end_date)}`,
  ];
  if (where) lines.push(`Location: ${where}`);
  if (job.notes) lines.push(`Brief: ${job.notes}`);
  const flights = travel.filter((d) => ['flights', 'train_bus'].includes(d.category));
  const hotels = travel.filter((d) => d.category === 'hotel');
  const other = travel.filter((d) => !['flights', 'train_bus', 'hotel'].includes(d.category));
  if (flights.length) {
    lines.push('', 'Travel:');
    for (const d of flights) lines.push(`- ${d.description || categoryLabel(d.category)}${d.supplier ? `, ${d.supplier}` : ''}${d.travel_date ? `, ${dateRange(d.travel_date, d.end_date)}` : ''}${d.booking_ref ? `, booking ref ${d.booking_ref}` : ''}`);
  }
  if (hotels.length) {
    lines.push('', 'Hotel:');
    for (const d of hotels) lines.push(`- ${d.description || 'Hotel'}${d.supplier ? `, ${d.supplier}` : ''}${d.travel_date ? `, check-in ${dateRange(d.travel_date)}` : ''}${d.end_date ? `, check-out ${dateRange(d.end_date)}` : ''}${d.booking_ref ? `, confirmation ${d.booking_ref}` : ''}`);
  }
  if (other.length) {
    lines.push('', 'Also booked for you:');
    for (const d of other) lines.push(`- ${categoryLabel(d.category)}: ${d.description || ''}${d.booking_ref ? `, ref ${d.booking_ref}` : ''}`);
  }
  if (travel.length) lines.push('', 'Flights and hotels are booked and paid by Robot24, so please do not include them on your invoice.');
  lines.push('', `After the job, please send your invoice as a PDF to ${INVOICE_EMAIL}${person.ref_code ? ` and write your reference ${person.ref_code} under your name` : ''}.`, '', 'Thank you,', 'Robot24');
  return lines.join('\n');
}

export function reminderText({ person, job }) {
  const days = Math.round((Date.parse(job.end_date) - Date.parse(job.start_date)) / 864e5) + 1;
  return [
    `Hi ${first(person.full_name)},`,
    '',
    `We haven't received your invoice yet for ${job.title}${job.event_reference ? ` (${job.event_reference})` : ''}, ${dateRange(job.start_date, job.end_date)} (${days} day${days > 1 ? 's' : ''}).`,
    '',
    `Please send it as a PDF to ${INVOICE_EMAIL}${person.ref_code ? ` with your reference ${person.ref_code} under your name` : ''}, including any receipts for expenses. Flights and hotels were booked by Robot24, so please leave those off.`,
    '',
    'Thank you,',
    'Robot24',
  ].join('\n');
}

export function remittanceText({ person, payment, job }) {
  const what = payment.kind === 'expense' ? 'expenses' : 'fee';
  return [
    `Hi ${first(person.full_name)},`,
    '',
    `We've paid your ${what}${payment.invoice_number ? ` for invoice ${payment.invoice_number}` : ''}${job ? ` (${job.title}${job.event_reference ? `, ${job.event_reference}` : ''})` : ''}.`,
    '',
    `Amount: ${money(payment.amount, payment.currency)}`,
    payment.paid_on ? `Paid on: ${dateRange(payment.paid_on)}` : null,
    payment.paid_reference ? `Bank reference: ${payment.paid_reference}` : null,
    '',
    'Depending on your bank it can take a few working days to arrive. Reply to this message if anything looks wrong.',
    '',
    'Thank you,',
    'Robot24',
  ].filter((l) => l !== null).join('\n');
}
