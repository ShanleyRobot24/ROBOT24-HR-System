// Server only. Reads a staff document and returns the details to fill in. Saves nothing: a person checks and saves.
import { supabaseAdmin } from './supabaseAdmin';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

const ASK = {
  passport: `"full_name": string (given names then surname, in normal capitalisation, e.g. "Michael David Schmidt"), "passport_no": string, "nationality": string (as an adjective in English, e.g. "Belgian", "Indian", "Filipino"), "date_of_birth": "YYYY-MM-DD", "passport_expiry": "YYYY-MM-DD", "gender": "Male"|"Female"|null, "place_of_birth": string|null`,
  emirates_id: `"full_name": string, "emirates_id_no": string (format 784-XXXX-XXXXXXX-X), "emirates_id_expiry": "YYYY-MM-DD", "nationality": string|null`,
  labour_card: `"full_name": string, "labour_card_no": string (work permit or labour card number), "labour_card_expiry": "YYYY-MM-DD", "job_title": string|null`,
  visa: `"full_name": string, "visa_kind": "entry_permit"|"residence"|"other", "visa_expiry": "YYYY-MM-DD"|null, "file_no": string|null`,
  offer_letter: `"full_name": string, "job_title": string|null, "monthly_salary": number|null, "currency": string|null, "start_date": "YYYY-MM-DD"|null, "work_week": "mon_fri"|"mon_sat"|null, "signed_by_candidate": boolean (true only if the candidate's own signature, name or date is filled in where the candidate acknowledges or accepts)`,
};
ASK.employment_contract = ASK.offer_letter;
ASK.mohre_contract = ASK.offer_letter;

function typeOf(name, type) {
  const t = (type || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf';
  if (/^image\/(jpeg|png|gif|webp)$/.test(t)) return t;
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return null;
}

export async function processStaffDoc({ path, fileName, contentType, docType }) {
  if (!ASK[docType]) throw new Error('This document type is not read automatically');
  const type = typeOf(fileName || path, contentType);
  if (!type) throw new Error('Upload a PDF or a photo (JPG or PNG) so it can be read');
  const { data: blob, error } = await supabaseAdmin().storage.from('staff').download(path);
  if (error) throw error;
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

  const system = `You read UAE employment documents for the HR team of a Dubai company. The document should be a ${docType.replace('_', ' ')}.
Read it carefully, including the machine-readable lines on passports. The document may be in Arabic and English: answer in English. Dates become YYYY-MM-DD. If a value is not on the document, use null. Never guess numbers.
Reply with ONLY a JSON object, no prose, no code fences:
{ "is_expected_document": boolean, ${ASK[docType]}, "notes": string|null }`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 800, system,
      messages: [{ role: 'user', content: [
        type === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: type, data: base64 } },
        { type: 'text', text: `File name: ${fileName || path}` },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const clean = text.replace(/```json|```/g, '').trim();
  const ai = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));

  // Keep only known fields, with dates checked
  const f = {};
  const str = (k) => { if (ai[k]) f[k] = String(ai[k]).trim().slice(0, 120); };
  const date = (k) => { const v = validDate(ai[k]); if (v) f[k] = v; };
  ['full_name', 'passport_no', 'nationality', 'gender', 'place_of_birth', 'emirates_id_no', 'labour_card_no', 'job_title'].forEach(str);
  ['date_of_birth', 'passport_expiry', 'emirates_id_expiry', 'labour_card_expiry', 'visa_expiry', 'start_date'].forEach(date);
  if (ai.monthly_salary != null && !isNaN(Number(ai.monthly_salary))) f.monthly_salary = Math.round(Number(ai.monthly_salary) * 100) / 100;
  if (ai.currency) f.currency = String(ai.currency).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || null;
  if (['mon_fri', 'mon_sat'].includes(ai.work_week)) f.work_week = ai.work_week;
  if (docType === 'visa') f.visa_status = ai.visa_kind === 'residence' ? 'residence_issued' : ai.visa_kind === 'entry_permit' ? 'entry_permit_issued' : undefined;
  const expires = f.passport_expiry || f.emirates_id_expiry || f.labour_card_expiry || f.visa_expiry || null;
  return {
    fields: f,
    expires_on: expires,
    signed: docType in { offer_letter: 1, employment_contract: 1, mohre_contract: 1 } ? !!ai.signed_by_candidate : null,
    is_expected: ai.is_expected_document !== false,
    notes: ai.notes || null,
  };
}
