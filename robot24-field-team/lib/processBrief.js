// Server only. Reads a client brief, email or itinerary and drafts the jobs in it. Saves nothing:
// a person checks every draft and adds the ones they want.
import { supabaseAdmin } from './supabaseAdmin';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const validDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

function typeOf(name, type) {
  const t = (type || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf';
  if (/^image\/(jpeg|png|gif|webp)$/.test(t)) return t;
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.png$/i.test(name)) return 'image/png';
  return null;
}

export async function processBrief({ text, path, fileName, contentType }) {
  const brief = String(text || '').trim().slice(0, 12000);
  if (!brief && !path) throw new Error('Paste the brief or upload it');
  const sb = supabaseAdmin();
  const { data: roster } = await sb.from('contractors').select('id, full_name, aliases, region, city, designation').eq('active', true);
  const rosterText = (roster || []).map((c) => `${c.id} | ${c.full_name}${c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''} | ${c.designation || ''} | ${c.region}${c.city ? ', ' + c.city : ''}`).join('\n');

  const content = [];
  if (path) {
    if (!path.startsWith('direct/')) throw new Error('Brief files must be uploaded to the travel folder');
    const type = typeOf(fileName || path, contentType);
    if (!type) throw new Error('Upload a PDF or a photo of the brief');
    const { data: blob, error } = await sb.storage.from('invoices').download(path);
    if (error) throw error;
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    content.push(type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: type, data: base64 } });
  }
  content.push({ type: 'text', text: `ROSTER (id | name | role | location)\n${rosterText}\n\nBRIEF\n${brief || '(see the attached file)'}` });

  const system = `You read briefs for Robot24, a Dubai robotics media company, and list the field team jobs in them: who is going, to which event or shoot, where and when.
Today is ${new Date().toISOString().slice(0, 10)}. Turn dates like "next Monday", "5 to 7 Oct" or "the week of the 12th" into YYYY-MM-DD, choosing the next upcoming date when no year is given.
One job per person per event. If the brief names a role but no person (for example "a videographer in Seoul"), still list the job with person_name null. Match each person to exactly one ROSTER id by name, or null if unsure. Never invent people, dates or places. The brief may be in any language: answer in English.
status: "confirmed" if the brief says it is booked or confirmed, otherwise "planned".
Reply with ONLY a JSON object, no prose, no code fences:
{ "jobs": [ { "person_name": string|null, "contractor_id": string|null, "title": string, "event_reference": string|null, "city": string|null, "country": string|null, "start_date": "YYYY-MM-DD"|null, "end_date": "YYYY-MM-DD"|null, "status": "planned"|"confirmed", "notes": string|null } ], "notes": string|null }`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const clean = out.replace(/```json|```/g, '').trim();
  const ai = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  const ids = new Set((roster || []).map((c) => c.id));
  const jobs = (Array.isArray(ai.jobs) ? ai.jobs : []).slice(0, 40).map((j) => {
    let start = validDate(j.start_date), end = validDate(j.end_date) || start;
    if (start && end && end < start) [start, end] = [end, start];
    return {
      person_name: j.person_name ? String(j.person_name).slice(0, 80) : null,
      contractor_id: ids.has(j.contractor_id) ? j.contractor_id : null,
      title: String(j.title || 'Job').slice(0, 120),
      event_reference: j.event_reference ? String(j.event_reference).slice(0, 40) : null,
      city: j.city ? String(j.city).slice(0, 60) : null,
      country: j.country ? String(j.country).slice(0, 60) : null,
      start_date: start, end_date: end,
      status: j.status === 'confirmed' ? 'confirmed' : 'planned',
      notes: j.notes ? String(j.notes).slice(0, 300) : null,
    };
  });
  return { jobs, notes: ai.notes || null };
}
