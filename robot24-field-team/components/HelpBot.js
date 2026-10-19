'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { callApi } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import { RobotHead } from './Brand';
import GuidedTour from './GuidedTour';
import { balances, leaveLabel } from '@/lib/leave';
import { handOff, paidRef } from '@/lib/sticky';

const PAGE = { '/home': 'Home', '/people': 'People', '/jobs': 'Jobs', '/money': 'Money', '/reports': 'Reports', '/admin': 'Admin', '/staff': 'HR', '/me': 'My Robot24' };

function suggestionsFor({ isFinance, isAdmin, isApprover, isEmployee, hasMe }) {
  if (isEmployee) return ['Show me around', 'How do I request annual leave?', 'How do I report sick leave?', 'How much annual leave do I earn?', 'Where are my documents?'];
  const s = isFinance
    ? ["How do I upload this month's invoices?", 'How do I mark a bill paid?', 'What does a Check flag mean?', 'How do I see what an event cost?']
    : ['How do I add an assignment?', 'How do I upload a hotel booking?', 'How do I split a shared receipt?', 'How do I send a job brief?'];
  if (isApprover) s.unshift('How do I approve bills?');
  if (isAdmin) s.push('How do I add a new user?');
  if (hasMe) s.splice(3, 0, 'How do I request leave?');
  return ['Show me around', ...s.slice(0, 4)];
}

const ACTION_HINT = {
  edit_job: 'Check the change, then click Save',
  send_brief: 'Check the message, then send it',
  add_travel: 'Check it, then click Add booking',
  show_bills: 'Bills, filtered for you',
  mark_paid: 'Check the bill, then click Mark paid',
  remind_missing: 'One message at a time: you send each one',
  month_end: 'The checklist, at the next step',
  create_login: 'Check it, then click Create user',
  final_settlement: 'Their profile, at the final settlement',
  add_holidays: 'Check the dates, then add them',
  set_reporting: 'Check each line, then apply',
  cancel_leave: 'Confirm to cancel it',
  record_leave: 'Check it, then click Record leave',
  request_leave: 'Check it, then click Send request',
  add_assignment: 'Check it, then click Add assignment',
  add_staff: 'Check it, upload the passport, then add them',
  edit_staff: 'Check the change, then click Save changes',
  terminate_staff: 'Check it, then click Terminate',
  offer_letter: 'Check it, then click Download Word letter',
  open_payroll: 'Payroll for that month',
};

// **bold** for button and page names
function Rich({ text }) {
  const parts = String(text || '').split('**');
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}</>;
}

// Onboarding a new hire: each step opens the right form, already filled in
function Onboard({ a, done, onStep }) {
  const list = [
    ['add', `Add ${a.full_name} as a staff member`, { type: 'add_staff', full_name: a.full_name, job_title: a.job_title, monthly_salary: a.monthly_salary, currency: a.currency, start_date: a.start_date, work_week: a.work_week, department: a.department }],
    ['offer', 'Make their offer letter', { type: 'offer_letter', person: a.full_name }],
    a.reports_to && ['manager', `Set them to report to ${a.reports_to}`, { type: 'edit_staff', person: a.full_name, changes: { reports_to: a.reports_to } }],
    a.with_login && ['login', 'Create their My Robot24 login', { type: 'create_login', person: a.full_name }],
  ].filter(Boolean);
  return (
    <ol className="robbie-steps">
      {list.map(([k, label, act], n) => (
        <li key={k} className={done[k] ? 'done' : ''}>
          <span>{done[k] ? '✓' : n + 1}</span>
          <button className="link-btn" onClick={() => onStep(k, act)}>{label}</button>
        </li>
      ))}
      <li className="hint">Do them in order; each opens filled in for you to check and save.</li>
    </ol>
  );
}

export default function HelpBot() {
  const auth = useAuth();
  const { session, profile } = auth;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [tour, setTour] = useState(false);
  const [ctx, setCtx] = useState(null); // what Robbie may answer from, and what needs this person
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef(null);
  const [steps, setSteps] = useState({}); // onboarding checklist progress, by message
  useEffect(() => { if (open && session) { clearContext(); loadContext(auth).then(setCtx).catch(() => setCtx({ needs: [], text: '' })); } }, [open, session]); // eslint-disable-line react-hooks/exhaustive-deps
  const bottom = useRef(null);
  const input = useRef(null);
  const first = (profile?.full_name || profile?.email || '').split(/[\s@.]/)[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150); }, [open]);
  // The welcome tour on first sign-in, and again from the name menu
  useEffect(() => {
    if (!session || !profile) return;
    try { if (!localStorage.getItem(`r24-tour-${profile.id}`)) setTour(true); } catch { /* storage off */ }
    const again = () => setTour(true);
    window.addEventListener('r24-tour', again);
    return () => window.removeEventListener('r24-tour', again);
  }, [session, profile]);
  const endTour = () => {
    setTour(false);
    try { localStorage.setItem(`r24-tour-${profile?.id}`, '1'); localStorage.setItem('r24-robbie-waved', '1'); } catch { /* storage off */ }
  };

  // A friendly wave the first time someone visits on this device
  useEffect(() => {
    try {
      if (!session || localStorage.getItem('r24-robbie-waved')) return;
      const t = setTimeout(() => setHint(true), 2500);
      const u = setTimeout(() => setHint(false), 12000);
      localStorage.setItem('r24-robbie-waved', '1');
      return () => { clearTimeout(t); clearTimeout(u); };
    } catch { /* storage off */ }
  }, [session]);

  if (!session || pathname === '/login' || pathname === '/reset-password') return null;

  async function ask(text) {
    const question = String(text || q).trim();
    if (!question || busy) return;
    // "Show me around", "give me a tour": start the interactive tour, no question needed
    if (/\b(tour|show me around|walk me through (the|everything|it)|how does (the|this) app work)\b/i.test(question)) {
      setQ(''); setOpen(false); setTour(true);
      return;
    }
    setQ('');
    const history = msgs.flatMap((m) => (m.role === 'user' ? [{ role: 'user', text: m.text }] : m.answer ? [{ role: 'assistant', text: [m.answer.intro, ...m.answer.steps].join('\n') }] : []));
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const c = ctx?.text ? ctx : await loadContext(auth).catch(() => null);
      const answer = await callApi('/api/process-invoice', { mode: 'help', question, history, page: PAGE[pathname] || pathname, context: c?.text || '' });
      setMsgs((m) => [...m, { role: 'bot', answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', answer: { intro: `Bzzt, my circuits hiccupped (${e.message}). Try asking again in a moment.`, steps: [], tip: null, go: null } }]);
    }
    setBusy(false);
  }

  // Robbie filled in a job: find the person, then open the Add assignment form with the details
  const sendTo = (path, target, payload, file) => { router.push(path); setTimeout(() => handOff(target, payload, file), 60); setOpen(false); };
  const KIND = { invoice: 'a freelancer invoice', flight: 'a flight booking', hotel: 'a hotel booking', train: 'a train or bus ticket', receipt: 'a receipt', brief: 'a brief', passport: 'a passport', emirates_id: 'an Emirates ID', labour_card: 'a labour card', work_permit: 'a work permit', visa: 'a visa', noc: 'an NOC', offer_letter: 'an offer letter', employment_contract: 'an employment contract', mohre_contract: 'a MOHRE contract', medical_certificate: 'a medical certificate', other: 'a document' };
  const STAFF_DOC = { passport: 'passport', emirates_id: 'emirates_id', labour_card: 'labour_card', work_permit: 'work_permit', visa: 'visa', noc: 'noc', offer_letter: 'offer_letter', employment_contract: 'employment_contract', mohre_contract: 'mohre_contract' };

  // A file dropped into the chat: work out what it is, then offer where it can go (only places this person can use)
  async function dropFile(file) {
    if (!file || busy) return;
    if (file.size > 20 * 1024 * 1024) return alert('That file is over 20 MB.');
    setMsgs((m) => [...m, { role: 'user', text: `📎 ${file.name}` }]);
    setBusy(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const id = crypto.randomUUID();
      const [bucket, path] = auth.isEmployee ? ['staff', `leave/${profile.staff_id}/robbie-${id}-${safe}`] : auth.isStaff ? ['staff', `robbie/${id}-${safe}`] : ['invoices', `direct/robbie/${id}-${safe}`];
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      const r = await callApi('/api/process-invoice', { mode: 'classify', bucket, path, fileName: file.name, contentType: file.type });
      const who = r.person_name;
      const choices = [];
      if (r.kind === 'invoice' && auth.isFinance) choices.push({ label: 'Add it to Money > Inbox', hint: 'The AI reads it and makes the bill for you to check', run: () => sendTo('/money?tab=inbox', 'money:file', {}, file) });
      if (['flight', 'hotel', 'train'].includes(r.kind) && auth.isAssignments && !auth.isEmployee) choices.push({ label: 'Add it to Jobs > Travel', hint: 'The form fills itself in; you check and save', run: () => sendTo('/jobs?tab=travel', 'jobs:travelfile', {}, file) });
      if (r.kind === 'brief' && auth.isAssignments && !auth.isEmployee) choices.push({ label: 'Turn it into jobs', hint: 'I draft the jobs; you check and add them', run: () => sendTo('/jobs?tab=jobs', 'jobs:brieffile', {}, file) });
      if (STAFF_DOC[r.kind] && auth.isStaff && who) choices.push({ label: `Save it to ${who}'s profile`, hint: `As their ${KIND[r.kind].replace(/^an? /, '')}: you click Upload and read`, run: () => sendTo('/staff?tab=staff', 'staff:docfile', { person: who, doc_type: STAFF_DOC[r.kind] }, file) });
      if (r.kind === 'medical_certificate' && auth.hasMe && (!who || (ctx?.text || '').includes(`ME: ${who}`))) choices.push({ label: 'Request sick leave with it attached', hint: 'Check the dates, then send', run: () => sendTo('/me?tab=leave', 'me:leavefile', { leave_type: 'sick', start_date: r.date, end_date: r.end_date || r.date }, file) });
      if (r.kind === 'medical_certificate' && auth.isStaff && who) choices.push({ label: `Record sick leave for ${who}`, hint: 'With the certificate attached', run: () => sendTo('/staff?tab=leave', 'leave:record', { person: who, leave_type: 'sick', start_date: r.date, end_date: r.end_date || r.date }, file) });
      setMsgs((m) => [...m, { role: 'bot', answer: { intro: `This looks like ${KIND[r.kind]}${who ? ` for **${who}**` : ''}. ${r.summary || ''}${choices.length ? '' : ' I\'m not sure where it should go for you: open the right page and upload it there.'}`, steps: [], tip: null, go: null, choices } }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', answer: { intro: `I couldn't read that file (${e.message}).`, steps: [], tip: null, go: null } }]);
    }
    setBusy(false);
  }

  async function openFilledForm(a) {
    const to = (path, target, payload, file) => { router.push(path); setTimeout(() => handOff(target, payload, file), 60); setOpen(false); };
    if (a.type === 'edit_job') return to('/jobs?tab=jobs', 'jobs:edit', a);
    if (a.type === 'send_brief') return to('/jobs?tab=jobs', 'jobs:brief', a);
    if (a.type === 'add_travel') return to('/jobs?tab=travel', 'jobs:travel', a);
    if (a.type === 'show_bills') return to('/money?tab=bills', 'money:bills', { search: a.search || '', status: a.status || 'all' });
    if (a.type === 'mark_paid') { paidRef.value = a.reference || ''; return to('/money?tab=bills', 'money:bills', { search: a.person, status: 'approved', note: `Click Mark paid on ${a.person}'s bill${a.reference ? `: the reference ${a.reference} is filled in` : ''}.` }); }
    if (a.type === 'remind_missing') return to('/money?tab=missing', 'money:remind', {});
    if (a.type === 'month_end') { router.push('/home'); setOpen(false); setTimeout(() => document.querySelector('[data-tour="month-end"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 900); return; }
    if (a.type === 'create_login') return to('/admin?tab=users', 'admin:login', a);
    if (a.type === 'add_holidays') return to('/staff?tab=leave', 'leave:holidays', a);
    if (a.type === 'set_reporting') return to('/staff?tab=org', 'org:lines', a);
    if (a.type === 'cancel_leave') return to('/me?tab=leave', 'me:cancel', a);
    if (a.type === 'request_leave') {
      sessionStorage.setItem('r24-me-leave', JSON.stringify({ leave_type: a.leave_type, start_date: a.start_date || '', end_date: a.end_date || a.start_date || '', half_day: !!a.half_day, reason: a.reason || '', _note: 'Filled in by Robbie. Check it, then click Send request.' }));
      router.push('/me?tab=leave');
      window.dispatchEvent(new Event('r24-me-prefill'));
      setOpen(false);
      return;
    }
    if (a.type !== 'add_assignment') {
      // Staff portal forms: the Staff page opens them and finds the person
      sessionStorage.setItem('r24-staff-action', JSON.stringify(a));
      router.push(a.type === 'open_payroll' ? `/staff?tab=payroll&month=${a.month}` : a.type === 'record_leave' ? '/staff?tab=leave' : '/staff?tab=staff');
      window.dispatchEvent(new Event('r24-staff-prefill'));
      setOpen(false); // get out of the way of the form's buttons
      return;
    }
    const { data } = await supabase.rpc('directory');
    const norm = (v) => String(v || '').toLowerCase();
    const words = norm(a.person).split(/\s+/).filter(Boolean);
    const hits = (data || []).filter((p) => words.length && words.every((w) => norm(p.full_name).includes(w)));
    const person = hits.length === 1 ? hits[0] : null;
    sessionStorage.setItem('r24-new-assignment', JSON.stringify({
      contractor_id: person?.id || '', title: a.title || '', event_reference: a.event_reference || '', city: a.city || '', country: a.country || '',
      start_date: a.start_date || '', end_date: a.end_date || a.start_date || '', status: a.status || 'confirmed', notes: a.notes || '',
      _note: person ? '' : hits.length > 1 ? `More than one person matches "${a.person}". Choose the right one.` : `"${a.person}" isn't on the field team list. Choose the person.`,
    }));
    router.push('/jobs?tab=jobs');
    window.dispatchEvent(new Event('r24-prefill'));
    setOpen(false); // get out of the way of the form's buttons
  }

  function go(path) {
    router.push(path);
    if (window.innerWidth < 700) setOpen(false);
  }

  return (
    <>
      {tour && <GuidedTour onDone={endTour} />}
      {!open && hint && !tour && <button className="robbie-hint" onClick={() => { setHint(false); setOpen(true); }}>Hi{name ? ` ${name}` : ''}! Stuck? Ask me how to do anything.</button>}
      <button data-tour="robbie" className={`robbie-fab ${open ? 'open' : ''}`} onClick={() => { setOpen(!open); setHint(false); }} aria-label={open ? 'Close help' : 'Ask Robbie for help'} title="Ask Robbie for help">
        {open ? <span className="robbie-x">×</span> : <RobotHead size={44} mood={busy ? 'thinking' : 'idle'} />}
      </button>

      {open && (
        <section onDragOver={(e) => { e.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)} onDrop={(e) => { e.preventDefault(); setDropping(false); dropFile(e.dataTransfer.files[0]); }} className={`robbie-panel ${dropping ? 'dropping' : ''}`} role="dialog" aria-label="Robbie, your help assistant">
          <header className="robbie-head">
            <RobotHead size={46} mood={busy ? 'thinking' : 'happy'} />
            <div>
              <strong>Robbie</strong>
              <span>{busy ? 'Thinking…' : 'Your Robot24 helper'}</span>
            </div>
            {msgs.length > 0 && <button className="robbie-reset" onClick={() => setMsgs([])}>Start over</button>}
            <button className="robbie-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>

          <div className="robbie-body">
            <div className="robbie-msg bot">
              <p>Beep! Hi{name ? ` ${name}` : ''}, I'm Robbie. Ask me how to do anything in the app and I'll walk you through it step by step.</p>
            </div>
            {!msgs.length && ctx && ctx.needs?.length > 0 && (
              <div className="robbie-msg bot robbie-needs">
                <p><strong>What needs you</strong></p>
                <ul>{ctx.needs.map((n) => <li key={n.text}><button className="link-btn" onClick={() => go(n.href)}><span className={`chip ${n.tone}`}>{n.n}</span> {n.text}</button></li>)}</ul>
              </div>
            )}
            {!msgs.length && ctx && !ctx.needs?.length && <div className="robbie-msg bot"><p>Nothing needs you right now. Beep!</p></div>}
            {!msgs.length && (
              <div className="robbie-chips">
                {suggestionsFor(auth).map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (m.role === 'user' ? (
              <div key={i} className="robbie-msg user"><p>{m.text}</p></div>
            ) : (
              <div key={i} className="robbie-msg bot">
                {m.answer.intro && <p><Rich text={m.answer.intro} /></p>}
                {m.answer.steps.length > 0 && <ol>{m.answer.steps.map((s, j) => <li key={j}><Rich text={s} /></li>)}</ol>}
                {m.answer.tip && <p className="robbie-tip"><span aria-hidden>💡</span> <Rich text={m.answer.tip} /></p>}
                {m.answer.action?.type === 'onboard' && <Onboard a={m.answer.action} done={steps[i] || {}} onStep={(k, act) => { setSteps({ ...steps, [i]: { ...(steps[i] || {}), [k]: true } }); openFilledForm(act); }} />}
                {m.answer.choices && m.answer.choices.map((c) => <button key={c.label} className="robbie-go" onClick={c.run}><span>{c.label} →</span><small>{c.hint}</small></button>)}
                {m.answer.action && m.answer.action.type !== 'onboard' && <button className="robbie-go" onClick={() => openFilledForm(m.answer.action)}><span>{m.answer.action.type === 'open_payroll' ? 'Open the payroll →' : 'Open the filled-in form →'}</span><small>{ACTION_HINT[m.answer.action.type] || 'Check it, then save'}</small></button>}
                {!m.answer.action && m.answer.go && <button className="robbie-go" onClick={() => go(m.answer.go)}><span>Take me there →</span><small>{m.answer.goLabel}</small></button>}
              </div>
            )))}
            {busy && <div className="robbie-msg bot typing"><span /><span /><span /></div>}
            <div ref={bottom} />
          </div>

          <form className="robbie-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <button type="button" className="robbie-clip" title="Drop or attach a file: I'll work out what it is" aria-label="Attach a file" onClick={() => fileInput.current?.click()} disabled={busy}>📎</button>
            <input ref={fileInput} type="file" hidden accept="application/pdf,image/*" onChange={(e) => { dropFile(e.target.files[0]); e.target.value = ''; }} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="How do I…" maxLength={600} />
            <button className="btn primary" disabled={busy || !q.trim()}>Ask</button>
          </form>
        </section>
      )}
    </>
  );
}

// What Robbie may answer from: only data this person can already see in the app (the database enforces it too).
// Kept short, so answers stay quick and cheap.
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (n) => iso(Date.now() + n * 864e5);
let cache = { at: 0, key: '', value: null };

async function loadContext(auth) {
  const key = `${auth.profile?.id}:${auth.profile?.role}`;
  if (cache.value && cache.key === key && Date.now() - cache.at < 120000) return cache.value;
  const today = iso(Date.now());
  const q = {};
  if (auth.isAssignments && !auth.isEmployee) {
    q.people = supabase.rpc('directory');
    q.jobs = supabase.from('assignments').select('contractor_id, title, event_reference, city, country, start_date, end_date, status').gte('end_date', addDays(-45)).lte('start_date', addDays(120));
    q.travel = supabase.from('direct_costs').select('contractor_id, category, description, supplier, travel_date, end_date').gte('travel_date', addDays(-30)).lte('travel_date', addDays(90));
  }
  if (auth.isFinance) q.bills = supabase.from('payments').select('contractor_id, kind, amount, currency, status, period, invoice_number, paid_on').gte('period', iso(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 3, 1)));
  if (auth.isApprover && !auth.isFinance) q.waiting = supabase.rpc('approval_queue', { p_status: 'pending_approval', p_period: null });
  if (auth.isStaff) {
    q.staff = supabase.from('staff').select('id, full_name, job_title, department, manager_id, start_date, status, termination_date, monthly_salary, currency, work_week, visa_sponsor, visa_status, passport_expiry, emirates_id_expiry, labour_card_expiry, work_permit_expiry, visa_expiry, probation_end, annual_entitlement, opening_annual_balance, opening_balance_date');
    q.leave = supabase.from('leave_requests').select('staff_id, leave_type, start_date, end_date, days, status, half_day');
    q.adj = supabase.from('leave_adjustments').select('staff_id, leave_type, days');
    q.runs = supabase.from('payroll_runs').select('period, status, totals, headcount');
  }
  if (auth.hasMe) {
    q.me = supabase.rpc('my_staff');
    q.team = supabase.rpc('my_team');
    q.myLeave = supabase.from('leave_requests').select('staff_id, leave_type, start_date, end_date, days, status, half_day');
    q.myAdj = supabase.from('leave_adjustments').select('staff_id, leave_type, days');
  }
  q.holidays = supabase.from('public_holidays').select('day, name').gte('day', today).order('day').limit(8);
  const keys = Object.keys(q);
  const res = await Promise.all(keys.map((k) => q[k]));
  const d = Object.fromEntries(keys.map((k, i) => [k, res[i].data || []]));
  const out = { lines: [], needs: [] };
  const L = (s) => out.lines.push(s);
  const need = (n, text, href, tone = 'alert') => { if (n > 0) out.needs.push({ n, text, href, tone }); };
  L(`Today is ${today}.`);

  if (d.people) {
    const name = Object.fromEntries(d.people.map((p) => [p.id, p.full_name]));
    L(`FIELD TEAM (${d.people.length}): ${d.people.map((p) => `${p.full_name} (${p.designation || ''}, ${p.city || p.region})`).join('; ')}`);
    L(`JOBS (45 days back to 120 ahead): ${d.jobs.map((j) => `${name[j.contractor_id] || '?'}: ${j.title}${j.event_reference ? ` ${j.event_reference}` : ''}, ${j.city || ''} ${j.country || ''}, ${j.start_date} to ${j.end_date}, ${j.status}`).join('; ') || 'none'}`);
    L(`TRAVEL BOOKED: ${d.travel.map((t) => `${name[t.contractor_id] || '?'}: ${t.category} ${t.description || t.supplier || ''} ${t.travel_date}${t.end_date ? ` to ${t.end_date}` : ''}`).join('; ') || 'none'}`);
    const week = d.jobs.filter((j) => j.status !== 'cancelled' && j.start_date <= addDays(7) && j.start_date >= today);
    need(week.length, `job${week.length > 1 ? 's' : ''} starting this week`, '/jobs?tab=jobs', 'info');
  }
  if (d.bills) {
    const nm = Object.fromEntries((d.people || []).map((p) => [p.id, p.full_name]));
    L(`FREELANCER BILLS (last 3 months): ${d.bills.map((b) => `${nm[b.contractor_id] || 'a freelancer'} ${b.kind} ${b.currency} ${b.amount}, ${b.period.slice(0, 7)}, ${b.status}${b.invoice_number ? `, ${b.invoice_number}` : ''}`).join('; ') || 'none'}`);
    need(d.bills.filter((b) => b.status === 'draft').length, 'bills to check', '/money?tab=bills');
    need(d.bills.filter((b) => b.status === 'approved').length, 'approved bills to pay', '/money?tab=bills', 'good');
    if (auth.isApprover) need(d.bills.filter((b) => b.status === 'pending_approval').length, 'bills waiting for your approval', '/money?tab=approvals');
  }
  if (d.waiting) need(d.waiting.length, 'bills waiting for your approval', '/money?tab=approvals');

  if (d.staff) {
    const live = d.staff.filter((s) => s.status !== 'terminated');
    const nm = Object.fromEntries(d.staff.map((s) => [s.id, s.full_name]));
    const in60 = addDays(60);
    L(`STAFF (${live.length}): ${live.map((s) => {
      const b = balances(s, d.leave.filter((l) => l.staff_id === s.id), d.adj.filter((a) => a.staff_id === s.id));
      const exp = [['passport', s.passport_expiry], ['Emirates ID', s.emirates_id_expiry], ['labour card', s.labour_card_expiry], ['work permit', s.work_permit_expiry], ['visa', s.visa_expiry]].filter(([, x]) => x).map(([w, x]) => `${w} expires ${x}`).join(', ');
      return `${s.full_name}: ${s.job_title || ''}${s.department ? `, ${s.department}` : ''}, reports to ${nm[s.manager_id] || 'nobody'}, started ${s.start_date || '?'}, ${s.status}, salary ${s.monthly_salary ? `${s.currency} ${s.monthly_salary}` : 'not set'}, visa ${s.visa_sponsor || '?'}, annual leave ${b.annualAfterBooked} days available, sick ${b.sick.used} days this year${b.inProbation ? `, probation to ${b.probationEnd}` : ''}${exp ? `, ${exp}` : ''}`;
    }).join('; ')}`);
    L(`STAFF LEAVE (pending and upcoming): ${d.leave.filter((l) => ['pending', 'approved'].includes(l.status) && l.end_date >= addDays(-30)).map((l) => `${nm[l.staff_id] || '?'}: ${leaveLabel(l.leave_type)} ${l.start_date} to ${l.end_date}, ${l.days} days, ${l.status}`).join('; ') || 'none'}`);
    L(`PAYROLL RUNS: ${d.runs.map((r) => `${r.period.slice(0, 7)} ${r.status}, ${r.headcount} people, ${Object.entries(r.totals || {}).map(([c, v]) => `${c} ${v}`).join(' + ')}`).join('; ') || 'none'}`);
    need(d.leave.filter((l) => l.status === 'pending').length, 'leave requests waiting', '/staff?tab=leave');
    if (auth.isPayrollApprover) need(d.runs.filter((r) => r.status === 'pending_approval').length, 'payroll waiting for your approval', '/staff?tab=payroll');
    need(live.filter((s) => [s.passport_expiry, s.emirates_id_expiry, s.labour_card_expiry, s.work_permit_expiry, s.visa_expiry].some((x) => x && x <= in60)).length, 'staff with documents expiring within 60 days', '/staff?tab=overview', 'warn');
    need(live.filter((s) => s.status === 'offer').length, 'offers waiting to be signed', '/staff?tab=staff', 'info');
  }
  if (d.me && d.me[0]) {
    const me = d.me[0];
    const mine = d.myLeave.filter((l) => l.staff_id === me.id);
    const b = balances(me, mine, d.myAdj.filter((a) => a.staff_id === me.id));
    L(`ME: ${me.full_name}, ${me.job_title || ''}, reports to ${me.manager_name || 'nobody'}, started ${me.start_date}, annual leave ${b.annualAfterBooked} days available (${b.booked} booked, ${b.pending} waiting), sick ${b.sick.used} days used this year, time off in lieu ${b.toil}${b.inProbation ? `, probation until ${b.probationEnd}` : ''}. Documents: ${[['passport', me.passport_expiry], ['Emirates ID', me.emirates_id_expiry], ['labour card', me.labour_card_expiry], ['work permit', me.work_permit_expiry], ['visa', me.visa_expiry]].filter(([, x]) => x).map(([w, x]) => `${w} expires ${x}`).join(', ') || 'no expiry dates on file'}.`);
    L(`MY LEAVE: ${mine.map((l) => `${leaveLabel(l.leave_type)} ${l.start_date} to ${l.end_date}, ${l.days} days, ${l.status}`).join('; ') || 'none'}`);
    need(mine.filter((l) => l.status === 'pending').length, 'of your leave requests waiting', '/me?tab=leave', 'warn');
    const mineExp = [me.passport_expiry, me.emirates_id_expiry, me.labour_card_expiry, me.work_permit_expiry, me.visa_expiry].filter((x) => x && x <= addDays(60)).length;
    need(mineExp, 'of your documents expiring within 60 days: tell HR', '/me?tab=documents', 'warn');
    if (d.team.length) {
      const tn = Object.fromEntries(d.team.map((t) => [t.id, t.full_name]));
      const tl = d.myLeave.filter((l) => tn[l.staff_id]);
      L(`MY TEAM (${d.team.length}): ${d.team.map((t) => `${t.full_name} (${t.job_title || ''}), annual leave ${balances(t, tl.filter((l) => l.staff_id === t.id), []).annualAfterBooked} days`).join('; ')}`);
      L(`MY TEAM'S LEAVE: ${tl.map((l) => `${tn[l.staff_id]}: ${leaveLabel(l.leave_type)} ${l.start_date} to ${l.end_date}, ${l.status}`).join('; ') || 'none'}`);
      need(tl.filter((l) => l.status === 'pending').length, 'team leave requests waiting for you', '/me?tab=team');
    }
  }
  L(`PUBLIC HOLIDAYS COMING: ${d.holidays.map((h) => `${h.day} ${h.name}`).join('; ') || 'none listed'}`);
  out.text = out.lines.join('\n').slice(0, 40000);
  cache = { at: Date.now(), key, value: out };
  return out;
}
const clearContext = () => { cache = { at: 0, key: '', value: null }; };
