'use client';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { RobotHead } from './Brand';

// Robbie's interactive tour: he opens each screen, spotlights the real button or panel, and explains it.
// The steps are built from the person's access, so nobody is shown a screen they can't use.
function stepsFor({ name, isFinance, isApprover, isAdmin, isStaff, isPayrollApprover, isEmployee, hasMe }) {
  const mine = [
    { path: '/me?tab=overview', target: 'me-balances', title: 'Your leave at a glance', text: 'Annual leave you can still take, sick leave used this year, and any time off in lieu.' },
    { path: '/me?tab=overview', target: 'me-request', title: 'Request leave', text: 'Choose the type and dates and send it. It shows how many days it is and what you will have left. HR approves it.' },
    { path: '/me?tab=leave', target: ['me-leave-list', 'me-request'], title: 'My leave', text: 'Every request and whether it is waiting, approved or rejected. You can cancel one while it is waiting.' },
    { path: '/me?tab=documents', target: ['me-expiry', 'me-request'], title: 'My documents', text: 'The documents HR holds for you, and when your passport, Emirates ID or visa expire.' },
  ];
  if (isEmployee) {
    return [
      { path: '/me', title: `Hi${name ? ` ${name}` : ''}, I'm Robbie!`, text: "Welcome to My Robot24, your own corner of the app. I'll show you around in under a minute." },
      ...mine,
      { path: '/me', target: 'user-menu', title: 'Your account', text: 'Change your password, sign out, or take this tour again from here.' },
      { path: '/me', target: 'robbie', title: "That's me!", text: 'Ask me anything about leave, or say "I need sick leave today" and I fill the request in for you to send. Beep!' },
    ];
  }
  const homeText = [
    isApprover && 'bills waiting for your approval',
    isFinance && 'invoices to sort, bills to check and pay, and missing invoices',
    'double-booked jobs, and who is working and travelling this week',
  ].filter(Boolean).join('; ');
  const menu = ['Home', 'People', 'Jobs', (isFinance || isApprover) && 'Money', isFinance && 'Reports', isAdmin && 'Admin'].filter(Boolean).join(', ');
  return [
    { path: isStaff ? '/' : '/home', title: `Hi${name ? ` ${name}` : ''}, I'm Robbie!`, text: "Let me walk you through your screens. I'll open each one and point at the parts that matter. It takes about two minutes, and you can skip any time." },
    isStaff && { path: '/', target: 'gate', title: 'Two portals', text: "You start here each time. Field team is the freelancers; Staff is Robot24's own employees." },
    { path: '/home', target: ['menu', 'menu-phone'], title: 'Your menu', text: `${menu}. You only see the sections that are yours.` },
    { path: '/home', target: 'month', title: 'The month', text: 'Pick the month once here and every page follows it.' },
    { path: '/home', target: 'home-cards', title: 'Home: what needs you', text: `Your to-do list: ${homeText}. Click any card to go straight there.` },
    isFinance && { path: '/home', target: 'month-end', title: 'Month end checklist', text: 'Each month-end step ticks itself off as the work is done. Do the next step opens the next one.' },
    { path: '/people', target: 'people-search', title: 'People', text: 'Everyone on the field team, grouped by location. Search here, and click anyone to see what they are booked for this month.' },
    isFinance && { path: '/people?tab=records', target: 'records', title: 'Records and documents', text: 'Day rates, contracts, passports and photos. Click a person to open their record and documents.' },
    { path: '/jobs?tab=jobs', target: 'add-assignment', title: 'Add a job', text: 'Who, which event, where and when. Clashes and odd dates are flagged before you save.' },
    { path: '/jobs?tab=jobs', target: 'paste-brief', title: 'Or paste a brief', text: 'Paste a client brief, email or WhatsApp message and I draft the jobs for you to check.' },
    { path: '/jobs?tab=calendar', target: ['calendar', 'jobs-tabs'], title: 'Calendar', text: 'The month by person or by country. Clashes are outlined in red; click a bar to see that person.' },
    { path: '/jobs?tab=travel', target: 'travel-upload', title: 'Flights, trains and hotels', text: 'Upload a ticket or hotel booking and the form fills itself in. Robot24 pays these, so they never go on a freelancer invoice.' },
    isFinance && { path: '/money?tab=inbox', target: 'inbox-drop', title: 'Money: the Inbox', text: "Drop the month's invoices here. The AI reads each one, splits fees from expenses and links it to the job." },
    isFinance && { path: '/money?tab=bills', target: 'bills-summary', title: 'Bills', text: 'To check, waiting for approval, approved and paid. Check them, send them for approval, then mark them paid.' },
    isApprover && { path: '/money?tab=approvals', target: 'approvals', title: 'Approvals', text: 'Bills waiting for you. A Things to check box points out anything unusual before you approve or reject.' },
    isFinance && { path: '/money?tab=missing', target: ['missing', 'money-tabs'], title: 'Missing invoices', text: 'Finished jobs with no invoice yet. Send the freelancer a reminder from here.' },
    isFinance && { path: '/reports', target: 'report-views', title: 'Reports', text: 'Spend so far, the projection, and what each event really cost, in USD or AED.' },
    isStaff && { path: '/staff?tab=overview', target: 'portal-switch', title: 'Switching to Staff', text: 'Field team | Staff switches between the two portals at any time.' },
    isStaff && { path: '/staff?tab=overview', target: 'staff-cards', title: 'Staff overview', text: 'Payroll status, documents expiring or missing, offers out, starters, visas in progress and leavers.' },
    isStaff && { path: '/staff?tab=org', target: ['org-chart', 'org-suggest'], title: 'Org chart', text: 'Who reports to whom. Drag a person onto their new manager, or let the AI suggest the structure from job titles. Leave requests go to each person\'s manager.' },
    isStaff && { path: '/staff?tab=leave', target: ['record-leave'], title: 'Leave', text: `Requests from staff and leave you record, the leave calendar, everyone's balances and public holidays.${isPayrollApprover ? ' As an approver you approve or reject requests here.' : ''} Approved unpaid and half-pay days come off payroll automatically.` },
    isStaff && { path: '/staff?tab=staff', target: 'add-staff', title: 'Add staff', text: 'Upload the passport and the details fill themselves in. Then the job and pay, and the signed offer letter.' },
    isStaff && { path: '/staff?tab=payroll', target: 'payroll-bar', title: 'Payroll', text: isPayrollApprover ? 'Each month is sent for approval. As an approver you approve or reject it here; then HR marks it paid.' : 'Send each month for approval; once it is approved, make the transfers and mark it paid.' },
    isStaff && { path: '/staff?tab=reports', target: 'staff-reports', title: 'Staff reports', text: 'Salary cost by month and a 12 month projection, including offers not yet signed.' },
    ...(hasMe ? [{ path: '/me?tab=overview', target: 'portal-switch', title: 'My Robot24', text: 'Your own leave, documents and details live in My Robot24.' }, ...mine.slice(0, 2)] : []),
    isAdmin && { path: '/admin?tab=users', target: 'add-user', title: 'Users', text: 'Add users in one form. Their access decides exactly what they see; employees get My Robot24 only, linked to their staff record.' },
    isAdmin && { path: '/admin?tab=backup', target: 'backup', title: 'Backup', text: 'Download a full backup each week. Home reminds you when one is due.' },
    { path: '/home', target: 'user-menu', title: 'Your account', text: 'Change your password, sign out, or take this tour again from here.' },
    { path: '/home', target: 'robbie', title: "That's me!", text: 'Ask me how to do anything, or ask me to fill in a form for you. You always check and save. Beep!' },
  ].filter(Boolean);
}

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
const find = (target) => [].concat(target || []).map((t) => document.querySelector(`[data-tour="${t}"]`)).find(visible) || null;

export default function GuidedTour({ onDone }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const first = (auth.profile?.full_name || auth.profile?.email || '').split(/[\s@.]/)[0];
  const [steps] = useState(() => stepsFor({ ...auth, name: first ? first.charAt(0).toUpperCase() + first.slice(1) : '' }));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [searching, setSearching] = useState(false);
  const s = steps[i];
  const last = i === steps.length - 1;

  // Go to the step's page, then wait for its element to appear
  useEffect(() => {
    let cancelled = false;
    const here = `${window.location.pathname}${window.location.search}`;
    const [path, query] = s.path.split('?');
    const wantQuery = query ? `?${query}` : '';
    if (window.location.pathname !== path || (query && window.location.search !== wantQuery)) router.push(s.path);
    setRect(null);
    if (!s.target) return () => { cancelled = true; };
    setSearching(true);
    let tries = 0;
    const look = () => {
      if (cancelled) return;
      const el = find(s.target);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => { if (!cancelled) { setRect(el.getBoundingClientRect()); setSearching(false); } }, 350);
      } else if (++tries < 40) setTimeout(look, 120);
      else setSearching(false); // not on screen (e.g. nothing to show yet): explain it without a spotlight
    };
    setTimeout(look, here === s.path ? 50 : 250);
    return () => { cancelled = true; };
  }, [i, s, router]);

  // Keep the spotlight on the element as the page moves
  const remeasure = useCallback(() => { const el = s.target ? find(s.target) : null; setRect(el ? el.getBoundingClientRect() : null); }, [s]);
  useLayoutEffect(() => {
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => { window.removeEventListener('resize', remeasure); window.removeEventListener('scroll', remeasure, true); };
  }, [remeasure]);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onDone(); if (e.key === 'ArrowRight' && !last) setI(i + 1); if (e.key === 'ArrowLeft' && i > 0) setI(i - 1); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [i, last, onDone]);

  const pad = 8;
  const phone = typeof window !== 'undefined' && window.innerWidth < 700;
  let card = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect && !phone) {
    const w = 360, below = rect.bottom + pad + 14, fitsBelow = below + 230 < window.innerHeight;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 16);
    card = fitsBelow ? { left, top: below } : { left, top: Math.max(16, rect.top - pad - 14 - 230) };
  }
  if (phone) card = { left: 12, right: 12, bottom: rect && rect.top > window.innerHeight / 2 ? 'auto' : 12, top: rect && rect.top > window.innerHeight / 2 ? 12 : 'auto' };

  return (
    <div className="gt" role="dialog" aria-label="Robbie's tour">
      <div className="gt-block" />
      {rect ? <div className="gt-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="gt-dim" />}
      <div className={`gt-card ${phone ? 'phone' : ''}`} style={card}>
        <div className="gt-head"><RobotHead size={40} mood={searching ? 'thinking' : last ? 'happy' : 'idle'} /><div><strong>{s.title}</strong><span>{i + 1} of {steps.length}</span></div></div>
        <p>{s.text}</p>
        <div className="gt-bar"><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="gt-actions">
          <button className="btn ghost sm" onClick={onDone}>Skip tour</button>
          <span className="spacer" />
          {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary sm" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
