import { cur3 } from './format';
// Server only. Reads an e-ticket, booking confirmation or travel receipt and returns
// the fields for a "Booked by Robot24" entry. Saves nothing: the person checks and saves.
import { supabaseAdmin } from './supabaseAdmin';
import { normaliseCategory, guessCategory, EXPENSE_CATEGORIES } from './categories';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 4000);
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

const SYSTEM = `You read travel documents for Robot24, a Dubai media company: airline e-tickets, train tickets, hotel booking confirmations, hotel receipts or folios, and other travel receipts, booked and paid by the company for its freelance field crew.
Identify every traveller or hotel guest and match each to exactly one person on the ROSTER by name or email. Names are often SURNAME/GIVENNAME MR or MS, or in capitals. If unsure, contractor_id is null.
A booking can cover several people (several rooms, or one PNR with several passengers). List each one in travellers, with their own amount if the document shows one per room or per passenger, otherwise null.
For hotels: travel_date is check-in, end_date is check-out, description is "<hotel name>, <n> nights", supplier is the hotel or booking site. For flights and trains: travel_date is the first departure, end_date the return (null if one way), description the route, e.g. "DXB to ICN return".
If the document mentions an event, conference, project or code (for example GITEX, CES, OPP-215), put it in event_reference. Put the city of the hotel or destination in city.
Documents may be in any language (for example Chinese, Korean, Japanese, Turkish, Arabic, French, German, Spanish). Read them in full, but write every text value you return in English: translate descriptions, event names, supplier descriptions and notes. Keep proper names (people, hotels, airlines, venues) as they are, in Latin letters where the document gives them. Set "language" to the document's main language in English (e.g. "Korean"), or "English". Amounts are plain numbers: "1.234,56" is 1234.56 and "1,234.56" is 1234.56. Currency: ₩ is KRW, 元 or RMB is CNY, ¥ is CNY on a Chinese document and JPY on a Japanese one, ₺ is TRY, € is EUR, £ is GBP, $ is USD unless the document says otherwise. Dates become YYYY-MM-DD, including formats like 2026年10月3日 or 03.10.2026 (day first unless the document is American).
Return ONLY a JSON object, no prose, no code fences:
{
  "category": ${EXPENSE_CATEGORIES.map(([k]) => `"${k}"`).join('|')},
  "document_kind": "booking"|"receipt"|"ticket",
  "travellers": [ { "name": string, "contractor_id": string|null, "match_confidence": number, "amount": number|null } ],
  "emails_found": string[],
  "description": string|null,
  "supplier": string|null,
  "booking_ref": string|null,
  "travel_date": "YYYY-MM-DD"|null,
  "end_date": "YYYY-MM-DD"|null,
  "nights": number|null,
  "amount": number|null,
  "currency": string|null,
  "event_reference": string|null,
  "city": string|null,
  "notes": string|null,
  "language": string
}`;

function parseJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No JSON in model response');
  return JSON.parse(clean.slice(a, b + 1));
}

function typeOf(name, type) {
  const t = (type || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf';
  if (/^image\/(jpeg|png|gif|webp)$/.test(t)) return t;
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return null;
}

export async function processTicket({ path, fileName, contentType }) {
  if (!path || !path.startsWith('direct/')) throw new Error('Ticket files must be uploaded to the travel folder');
  const type = typeOf(fileName || path, contentType);
  if (!type) throw new Error('Only PDF or image tickets can be read');

  const sb = supabaseAdmin();
  const { data: blob, error } = await sb.storage.from('invoices').download(path);
  if (error) throw error;
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

  const { data: roster } = await sb.from('contractors').select('id, ref_code, full_name, aliases, region, city, email').eq('active', true);
  const rosterText = (roster || []).map((c) => `${c.id} | ${c.full_name}${c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''} | ${c.region}${c.city ? ', ' + c.city : ''} | ${c.email || ''}`).join('\n');

  const content = [
    type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: type, data: base64 } },
    { type: 'text', text: `ROSTER (id | name | location | email)\n${rosterText}\n\nFILE NAME: ${fileName || path}` },
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const ai = parseJson((data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));

  // Who travelled: each traveller by the AI's pick, then a similar name search. Email confirms a single traveller.
  const found = (Array.isArray(ai.emails_found) ? ai.emails_found : []).map((e) => String(e).trim().toLowerCase());
  const byEmail = (roster || []).filter((c) => c.email && found.includes(c.email.trim().toLowerCase()));
  const travellers = [];
  const list = Array.isArray(ai.travellers) && ai.travellers.length ? ai.travellers : [{ name: ai.passenger_name || null, contractor_id: ai.contractor_id || null, match_confidence: ai.match_confidence || 0, amount: null }];
  for (const t of list) {
    let c = null, method = null;
    if (t.contractor_id && Number(t.match_confidence) >= 0.6) { c = (roster || []).find((r) => r.id === t.contractor_id) || null; if (c) method = 'name'; }
    if (!c && t.name) {
      const { data: cands } = await sb.rpc('match_contractor', { q: String(t.name).replace(/\b(MR|MRS|MS|MISS|DR)\b/gi, '').replace('/', ' ') });
      if (cands?.[0] && cands[0].score >= 0.5) { c = (roster || []).find((r) => r.id === cands[0].id) || null; if (c) method = 'similar_name'; }
    }
    if (c && travellers.some((x) => x.contractor_id === c.id)) continue;
    travellers.push({ name: t.name || null, contractor_id: c?.id || null, contractor_name: c?.full_name || null, match_method: method, amount: t.amount !== null && t.amount !== undefined && !isNaN(Number(t.amount)) ? Math.round(Number(t.amount) * 100) / 100 : null });
  }
  if (travellers.length === 1 && !travellers[0].contractor_id && byEmail.length === 1) {
    Object.assign(travellers[0], { contractor_id: byEmail[0].id, contractor_name: byEmail[0].full_name, match_method: 'email' });
  }

  let category = normaliseCategory(ai.category, 'expense');
  if (category === 'other') category = guessCategory(`${ai.description || ''} ${ai.supplier || ''}`) || 'other';
  const nights = Number(ai.nights) || (validDate(ai.travel_date) && validDate(ai.end_date) ? Math.round((Date.parse(ai.end_date) - Date.parse(ai.travel_date)) / 864e5) : null);
  let description = ai.description || null;
  if (category === 'hotel' && description && nights && !/night/i.test(description)) description += `, ${nights} night${nights > 1 ? 's' : ''}`;
  const first = travellers[0] || {};

  return {
    contractor_id: travellers.length === 1 ? first.contractor_id : null,
    contractor_name: travellers.length === 1 ? first.contractor_name : null,
    passenger_name: travellers.length === 1 ? first.name : null,
    match_method: travellers.length === 1 ? first.match_method : null,
    travellers,
    fields: {
      category,
      description,
      supplier: ai.supplier || null,
      booking_ref: ai.booking_ref || null,
      travel_date: validDate(ai.travel_date),
      end_date: validDate(ai.end_date),
      amount: ai.amount !== null && ai.amount !== undefined && !isNaN(Number(ai.amount)) ? Math.round(Number(ai.amount) * 100) / 100 : null,
      currency: ai.currency ? cur3(ai.currency, null) : null,
    },
    hint: { event_reference: ai.event_reference || null, city: ai.city || null },
    kind: ai.document_kind || null,
    nights,
    notes: ai.notes || null,
    language: ai.language && !/^english$/i.test(ai.language) ? ai.language : null,
  };
}
