import { cur3 } from './format';
// Server only. Reads one uploaded invoice file, works out who it belongs to,
// splits fees from expenses, and creates draft payments for the chosen month.
import { supabaseAdmin } from './supabaseAdmin';
import { expectedFee, dayRateOf } from './rates';
import { matchJob, jobDays } from './schedule';
import { AI_CATEGORY_GUIDE, normaliseCategory, guessCategory, COMPANY_BOOKED } from './categories';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 4000);
const DEFAULT_TERMS = Number(process.env.DEFAULT_PAYMENT_TERMS_DAYS || 14);
const AI_MIN_CONFIDENCE = 0.7;
const NAME_MIN_SCORE = 0.5;
const PAYABLE_TYPES = ['final_invoice', 'expense_claim', 'receipt_only'];
const REF_RE = /R\s*24\s*[-_ ]?\s*([A-Z]{2})\s*[-_ ]?\s*(\d{1,4})(?!\d)/gi;

export function findRefCodes(...texts) {
  const out = new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const m of String(t).matchAll(REF_RE)) out.add(`R24-${m[1].toUpperCase()}-${String(parseInt(m[2], 10)).padStart(3, '0')}`);
  }
  return [...out];
}

export function expectedAmount(c, days) {
  return expectedFee(c, days);
}

function addDays(dateStr, n) {
  const d = new Date((dateStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

function parseJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON in model response');
  return JSON.parse(clean.slice(a, b + 1));
}

const SYSTEM = `You read invoices and expense claims from freelance field crew (journalists, videographers) working for Robot24, a Dubai media company. HR uploads the files.
Each person has a Robot24 reference in the format R24-XX-000, shown on the ROSTER. They are asked to write it on the invoice under their name.
Match the document to exactly one person on the ROSTER using the reference, the email address on the document, the name, the signature, bank account name, and the file name. Report every email address printed anywhere on the document in emails_found. Names may be partial, nicknames, transliterated, or in a different order. If you are not confident, return null for contractor_id.

Documents may be in any language (for example Chinese, Korean, Japanese, Turkish, Arabic, French, German, Spanish). Read them in full, but write every text value you return in English: translate descriptions, event names, supplier descriptions and notes. Keep proper names (people, hotels, airlines, venues) as they are, in Latin letters where the document gives them. Set "language" to the document's main language in English (e.g. "Korean"), or "English". Amounts are plain numbers: "1.234,56" is 1234.56 and "1,234.56" is 1234.56. Currency: ₩ is KRW, 元 or RMB is CNY, ¥ is CNY on a Chinese document and JPY on a Japanese one, ₺ is TRY, € is EUR, £ is GBP, $ is USD unless the document says otherwise. Dates become YYYY-MM-DD, including formats like 2026年10月3日 or 03.10.2026 (day first unless the document is American).

Decide what kind of document this is:
- final_invoice: a final bill asking to be paid (may include expenses as extra lines)
- expense_claim: only reimbursement of costs, no fee
- receipt_only: receipts with no invoice, treat as expenses to reimburse
- quote_or_estimate: a quote, estimate, or rate proposal, not yet payable
- proforma: a proforma or draft invoice, not final
- payment_reminder: chasing an invoice already sent
- credit_note: reduces or cancels an earlier invoice
- other: anything else (contracts, letters, IDs)

Split every amount into line items, one line per cost (for example each hotel stay, each Uber ride or a monthly Uber total, each flight). In each line's description keep what the person wrote the cost was for, in their words translated to English (for example "Uber, hotel to venue"), and pick the category from that purpose. When the document is not in English, put the line's original wording in original_description, otherwise null. If a cost covered other people too (for example "taxi for 2 crew" or a group meal), list their names in shared_with, or ["1 other person"] when no name is given; otherwise an empty list. translation_summary: when the document is not in English, two or three English sentences saying what it is and what it claims; otherwise null. kind is "fee" for day rates, fixed fees, filming, editing or writing work. kind is "expense" for costs they paid that Robot24 reimburses. Do not double count subtotals. Keep amounts in the currency on the document.

${AI_CATEGORY_GUIDE}

Robot24 always books and pays hotels and flights itself, so a freelancer should never invoice for them. If a hotel, lodging or flight cost does appear, still list it as its own line with category "hotel" or "flights" so finance can see it, and mention it in notes.

Return ONLY a JSON object, no prose, no code fences:
{
  "language": string,
  "translation_summary": string|null,
  "document_type": "final_invoice"|"expense_claim"|"receipt_only"|"quote_or_estimate"|"proforma"|"payment_reminder"|"credit_note"|"other",
  "reference_code": string|null,
  "emails_found": string[],
  "contractor_name": string|null,
  "contractor_id": string|null,
  "match_confidence": number,
  "invoice_number": string|null,
  "currency": string|null,
  "line_items": [ { "description": string, "original_description": string|null, "shared_with": string[], "kind": "fee"|"expense", "category": string, "amount": number, "date": "YYYY-MM-DD"|null, "receipt_attached": boolean } ],
  "fee_total": number|null,
  "expense_total": number|null,
  "total": number|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,
  "work_start": "YYYY-MM-DD"|null,
  "work_end": "YYYY-MM-DD"|null,
  "days_worked": number|null,
  "event_reference": string|null,
  "description": string|null,
  "bank_details": string|null,
  "notes": string|null
}`;

async function readWithClaude({ roster, fileName, contentType, base64 }) {
  const content = [];
  if (contentType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
  } else {
    content.push({ type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } });
  }
  const rosterText = roster
    .map((c) => `${c.id} | ${c.ref_code || ''} | ${c.full_name}${c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''} | ${c.designation || ''} | ${c.region}${c.city ? ', ' + c.city : ''} | ${c.email || ''}`)
    .join('\n');
  content.push({ type: 'text', text: `ROSTER (id | reference | name | role | location | email)\n${rosterText}\n\nFILE NAME: ${fileName}` });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return parseJson((data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

function normaliseType(name, type) {
  const t = (type || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf';
  if (/^image\/(jpeg|png|gif|webp)$/.test(t)) return t;
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return null;
}

/** { path, fileName, contentType, period: 'YYYY-MM-01', userId, uploadId? } */
export async function processInvoice({ path, fileName, contentType, period, userId, uploadId }) {
  const sb = supabaseAdmin();

  let upload;
  if (uploadId) {
    const { data } = await sb.from('invoice_uploads').update({ status: 'processing', error: null }).eq('id', uploadId).select().single();
    upload = data;
  } else {
    const { data, error } = await sb.from('invoice_uploads')
      .insert({ period, file_path: path, file_name: fileName, content_type: contentType, uploaded_by: userId, status: 'processing' })
      .select().single();
    if (error) throw error;
    upload = data;
  }
  if (!upload) throw new Error('Upload record not found');

  const finish = async (fields) => {
    await sb.from('invoice_uploads').update(fields).eq('id', upload.id);
    return { id: upload.id, ...fields };
  };

  try {
    const type = normaliseType(upload.file_name, upload.content_type);
    if (!type) return finish({ status: 'needs_attention', error: 'Only PDF or image files can be read. Save it as a PDF and upload again.' });

    const { data: blob, error: dlErr } = await sb.storage.from('invoices').download(upload.file_path);
    if (dlErr) throw dlErr;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

    const { data: roster } = await sb.from('contractors')
      .select('id, ref_code, full_name, aliases, designation, region, city, email, currency, day_rate, ten_day_rate, fifteen_day_rate, payment_terms_days')
      .eq('active', true);

    const ai = await readWithClaude({ roster: roster || [], fileName: upload.file_name, contentType: type, base64 });
    const docType = ai.document_type || 'other';
    const flags = [];

    // Who is it: reference, then name, then fuzzy search
    let contractor = null, method = null, confidence = 0;
    const aiPick = ai.contractor_id ? (roster || []).find((c) => c.id === ai.contractor_id) : null;
    const refs = findRefCodes(upload.file_name, ai.reference_code);
    const hits = [...new Map(refs.map((r) => (roster || []).find((c) => (c.ref_code || '').toUpperCase() === r)).filter(Boolean).map((c) => [c.id, c])).values()];

    if (hits.length === 1) {
      contractor = hits[0]; method = 'reference'; confidence = 1;
      if (aiPick && aiPick.id !== contractor.id && Number(ai.match_confidence) >= AI_MIN_CONFIDENCE) {
        flags.push(`Reference ${contractor.ref_code} is ${contractor.full_name}, but the name on the invoice looks like ${aiPick.full_name}`);
      }
    } else if (hits.length > 1) {
      flags.push(`More than one reference on the document: ${hits.map((c) => c.ref_code).join(', ')}`);
    } else if (refs.length) {
      flags.push(`Reference ${refs.join(', ')} is not on file`);
    }
    // Email on the invoice matched to the email on file
    if (!contractor) {
      const found = (Array.isArray(ai.emails_found) ? ai.emails_found : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
      const byEmail = (roster || []).filter((c) => c.email && found.includes(c.email.trim().toLowerCase()));
      if (byEmail.length === 1) {
        contractor = byEmail[0]; method = 'email'; confidence = 0.98;
        if (aiPick && aiPick.id !== contractor.id && Number(ai.match_confidence) >= AI_MIN_CONFIDENCE) {
          flags.push(`Email on the invoice belongs to ${contractor.full_name}, but the name looks like ${aiPick.full_name}`);
        }
      }
    }
    if (!contractor && aiPick && Number(ai.match_confidence) >= AI_MIN_CONFIDENCE) {
      contractor = aiPick; method = 'name'; confidence = Number(ai.match_confidence);
    }
    if (!contractor && ai.contractor_name) {
      const { data: cands } = await sb.rpc('match_contractor', { q: ai.contractor_name });
      if (cands?.[0] && cands[0].score >= NAME_MIN_SCORE) {
        contractor = (roster || []).find((c) => c.id === cands[0].id); method = 'similar_name'; confidence = Number(cands[0].score);
      }
    }
    if (contractor && method !== 'reference') flags.push(`No reference on the invoice. Ask ${contractor.full_name} to add ${contractor.ref_code}`);

    // Fees vs expenses
    const items = (Array.isArray(ai.line_items) ? ai.line_items.filter((l) => l && Number(l.amount)) : [])
      .map((l) => {
        const kind = l.kind === 'fee' ? 'fee' : 'expense';
        let category = normaliseCategory(l.category, kind);
        // If the AI was unsure, what the person wrote decides (e.g. "Uber to venue" -> Taxi and Uber)
        if (kind === 'expense' && (category === 'other' || category === 'travel')) category = guessCategory(l.description) || category;
        const original = l.original_description && l.original_description !== l.description ? String(l.original_description) : null;
        return { ...l, kind, amount: Number(l.amount), category, original_description: original };
      });
    const sum = (k) => Math.round(items.filter((l) => l.kind === k).reduce((a, l) => a + Number(l.amount), 0) * 100) / 100;
    // Hotels and flights are booked by Robot24, never paid to the freelancer: keep them off the bill
    const companyBooked = items.filter((l) => l.kind === 'expense' && COMPANY_BOOKED.includes(l.category));
    if (companyBooked.length) {
      for (const l of companyBooked) items.splice(items.indexOf(l), 1);
      const listed = companyBooked.map((l) => `${l.description || l.category} ${l.amount}`).join(', ');
      flags.push(`Left off the bill: ${listed}. Robot24 books hotels and flights directly. Check with the person; only add it back by hand if this was agreed`);
    }
    const companyBookedSum = companyBooked.reduce((a, l) => a + Number(l.amount), 0);
    const hadLines = items.length + companyBooked.length > 0;
    // With line items, only the lines count. Totals are a fallback for invoices the AI could not split
    let feeTotal = hadLines ? sum('fee') : Number(ai.fee_total || 0);
    let expenseTotal = hadLines ? sum('expense') : Number(ai.expense_total || 0);
    if (!hadLines && !feeTotal && !expenseTotal && ai.total) {
      if (docType === 'expense_claim' || docType === 'receipt_only') expenseTotal = Number(ai.total); else feeTotal = Number(ai.total);
    }
    if (ai.total && items.length && Math.abs(feeTotal + expenseTotal + companyBookedSum - Number(ai.total)) > 0.5) {
      flags.push(`Lines add up to ${feeTotal + expenseTotal}, document total says ${ai.total}`);
    }

    const base = { doc_type: docType, extracted: { ...ai, flags }, matched_contractor_id: contractor?.id || null, match_method: method, match_confidence: confidence || null, error: null };

    if (!contractor) return finish({ ...base, status: 'unmatched' });

    if (docType === 'payment_reminder' && ai.invoice_number) {
      const { data: prior } = await sb.from('payments').select('id, status').eq('contractor_id', contractor.id).eq('invoice_number', String(ai.invoice_number));
      if (prior?.length) return finish({ ...base, status: 'duplicate', extracted: { ...ai, flags: [...flags, `Reminder for invoice ${ai.invoice_number}, currently ${prior.map((p) => p.status).join(', ')}`] } });
    }
    if (!PAYABLE_TYPES.includes(docType) && docType !== 'payment_reminder') {
      const why = { quote_or_estimate: 'Quote or estimate, not a final invoice', proforma: 'Proforma or draft, not a final invoice', credit_note: 'Credit note, adjust the related payment by hand', other: 'Not an invoice or expense claim' };
      return finish({ ...base, status: 'needs_attention', extracted: { ...ai, flags: [...flags, `${why[docType] || 'Unclear document'}. No payment created`] } });
    }
    if (!feeTotal && !expenseTotal) return finish({ ...base, status: 'needs_attention', extracted: { ...ai, flags: [...flags, companyBooked.length ? 'Nothing payable: the invoice only claims hotels or flights, which Robot24 books directly' : 'No amount found'] } });

    const invoiceDate = validDate(ai.invoice_date);
    const terms = contractor.payment_terms_days ?? DEFAULT_TERMS;
    const due = validDate(ai.due_date) || addDays(invoiceDate || new Date().toISOString().slice(0, 10), terms);
    const currency = cur3(ai.currency || contractor.currency);
    if (ai.bank_details) flags.push('Bank details on the invoice, check against file');
    if (ai.notes) flags.push(ai.notes);
    const docMonth = (invoiceDate || validDate(ai.work_end) || validDate(ai.work_start) || '').slice(0, 7);
    if (docMonth && docMonth !== period.slice(0, 7)) flags.push(`Invoice dated ${docMonth}, uploaded under ${period.slice(0, 7)}. Check the month`);

    // Which job this invoice is for
    const around = (d, m) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
    const { data: jobs } = await sb.from('assignments').select('id, title, event_reference, start_date, end_date, status')
      .eq('contractor_id', contractor.id).gte('end_date', around(period, -3)).lte('start_date', around(period, 3));
    const job = matchJob(jobs || [], {
      eventReference: ai.event_reference, description: [ai.description, ...items.map((l) => l.description)].filter(Boolean).join(' '),
      workStart: validDate(ai.work_start), workEnd: validDate(ai.work_end), invoiceDate, period,
    });
    // The same expense claimed by colleagues on the same opportunity may be one shared receipt
    const sharedNotes = [];
    for (const l of items.filter((x) => x.kind === 'expense' && Array.isArray(x.shared_with) && x.shared_with.length)) {
      sharedNotes.push(`${l.description || 'An expense'} (${l.amount}) also covered ${l.shared_with.join(', ')}. Make sure they don't claim it too`);
    }
    if (job) {
      const key = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const k = job.event_reference ? key(job.event_reference) : key(job.title);
      const { data: peers } = await sb.from('assignments').select('id, contractor_id, title, event_reference, status')
        .neq('contractor_id', contractor.id).lte('start_date', job.end_date).gte('end_date', job.start_date);
      const same = (peers || []).filter((a) => a.status !== 'cancelled' && (job.event_reference ? key(a.event_reference) === k : key(a.title) === k));
      if (same.length && items.some((l) => l.kind === 'expense')) {
        const { data: theirs } = await sb.from('payments').select('contractor_id, line_items, status').in('assignment_id', same.map((a) => a.id)).eq('kind', 'expense').neq('status', 'rejected');
        for (const l of items.filter((x) => x.kind === 'expense')) {
          for (const b of theirs || []) {
            for (const o of b.line_items || []) {
              const sameDay = !l.date || !o.date || l.date === o.date;
              if (o.category === l.category && Math.abs(Number(o.amount) - Number(l.amount)) <= 0.5 && sameDay) {
                const who = (roster || []).find((c) => c.id === b.contractor_id)?.full_name || 'A colleague';
                sharedNotes.push(`Possible shared receipt: ${who} also claimed ${o.description || o.category} ${o.amount}${o.date ? ` on ${o.date}` : ''} for the same job. Check it isn't the same receipt counted twice`);
              }
            }
          }
        }
      }
    }

    if (!job) flags.push((jobs || []).length ? 'Could not tell which assignment this invoice is for. Link it in the bill' : 'No assignment recorded for this work. Add it in Jobs, then link it in the bill');

    const paymentIds = [];
    let duplicate = false;
    for (const [kind, amount] of [['fee', feeTotal], ['expense', expenseTotal]]) {
      if (!amount) continue;
      const f = [...flags];
      let expected = null;
      if (kind === 'fee') {
        // Days billed against days booked on the job
        if (job && Number(ai.days_worked) > jobDays(job)) f.push(`Billed ${ai.days_worked} days, but ${job.title} was booked for ${jobDays(job)}`);
        if (job && !Number(ai.days_worked) && currency === cur3(contractor.currency)) {
          const cap = expectedFee(contractor, jobDays(job));
          if (cap && amount > cap + 0.5) f.push(`Fee is more than the day rate for the ${jobDays(job)} days booked on ${job.title} (${contractor.currency} ${cap})`);
        }
        // Only compare with the day rate when both are in the same currency
        if (currency !== cur3(contractor.currency)) {
          f.push(`Invoiced in ${currency}, day rate is in ${contractor.currency}. Convert before approving`);
        } else {
          expected = expectedAmount(contractor, ai.days_worked);
        }
        if (expected && Math.abs(expected - amount) > 0.5) f.push(`Day rate gives ${contractor.currency} ${expected} for ${ai.days_worked} days${dayRateOf(contractor).estimated ? ' (day rate estimated from an old package rate)' : ''}`);
      } else {
        f.push(...[...new Set(sharedNotes)]);
        const missing = items.filter((l) => l.kind === 'expense' && !l.receipt_attached).length;
        if (missing) f.push(`${missing} expense line${missing > 1 ? 's' : ''} without a receipt`);
      }
      if (ai.invoice_number) {
        const { data: dup } = await sb.from('payments').select('id').eq('contractor_id', contractor.id)
          .eq('invoice_number', String(ai.invoice_number)).eq('kind', kind).neq('status', 'rejected').limit(1);
        if (dup?.length) { duplicate = true; continue; }
      }
      const { data: pay, error: payErr } = await sb.from('payments').insert({
        contractor_id: contractor.id, upload_id: upload.id, assignment_id: job?.id || null, period, kind, doc_type: docType,
        line_items: items.filter((l) => l.kind === kind),
        invoice_number: ai.invoice_number ? String(ai.invoice_number) : null,
        description: kind === 'expense' ? `Expenses${ai.event_reference ? ', ' + ai.event_reference : ''}` : ai.description || null,
        event_reference: ai.event_reference || null,
        work_start: validDate(ai.work_start), work_end: validDate(ai.work_end),
        days_worked: kind === 'fee' ? ai.days_worked ?? null : null,
        amount, currency, expected_amount: expected,
        flag: f.length ? f.join(' | ') : null,
        invoice_date: invoiceDate, due_date: due,
        invoice_file_path: upload.file_path,
      }).select('id').single();
      if (payErr) throw payErr;
      paymentIds.push(pay.id);
    }

    return finish({
      ...base,
      status: paymentIds.length ? 'processed' : duplicate ? 'duplicate' : 'needs_attention',
      payment_ids: paymentIds,
      extracted: { ...ai, flags: duplicate ? [...flags, `Invoice ${ai.invoice_number} was already uploaded`] : flags },
    });
  } catch (e) {
    return finish({ status: 'error', error: String(e.message || e).slice(0, 500) });
  }
}
