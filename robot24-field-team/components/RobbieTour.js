'use client';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import RobotHead from './RobotHead';

// A short walkthrough on first sign-in, showing only the sections this person can use
export default function RobbieTour({ onDone }) {
  const { profile, isFinance, isApprover, isAdmin, isStaff } = useAuth();
  const first = (profile?.full_name || profile?.email || '').split(/[\s@.]/)[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  const slides = [
    { t: `Hi${name ? ` ${name}` : ''}, I'm Robbie!`, b: "Beep! I'll show you around in under a minute. You only see the parts of the app that are yours." },
    { t: 'Home', b: 'Your to-do list. Every card is something that needs you, and clicking it takes you straight there.' },
    { t: 'People', b: `Everyone on the field team. Click anyone to see what they're booked for this month.${isFinance ? ' Records and documents holds rates, contracts and passports.' : ''}` },
    { t: 'Jobs', b: 'Who is booked where. Add jobs, see the calendar, and upload flight, hotel and train bookings. The AI fills the forms in for you.' },
    isFinance && { t: 'Money', b: 'Drop invoices into the Inbox and the AI reads them. Check the bills, send them for approval, then mark them paid. Missing invoices shows who still owes you one.' },
    !isFinance && isApprover && { t: 'Money > Approvals', b: 'Bills waiting for you. A box at the top points out anything unusual before you approve.' },
    isFinance && { t: 'Reports', b: 'What has been spent, what jobs will cost, and what each event really cost, in USD or AED.' },
    isStaff && { t: 'Staff', b: "Robot24's own team: add staff from a passport, make offer letters, keep documents, and run payroll with approval." },
    isAdmin && { t: 'Admin', b: 'Add users in one form, and see every change in the audit trail.' },
    { t: 'The month at the top', b: 'Pick the month once in the navy strip and every page follows it.' },
    { t: "Stuck? I'm right here", b: "Click me in the bottom corner and ask how to do anything. I'll give you the steps and take you there." },
  ].filter(Boolean);
  const [i, setI] = useState(0);
  const s = slides[i];
  const last = i === slides.length - 1;
  return (
    <div className="tour-wrap" role="dialog" aria-label="Welcome tour">
      <div className="tour">
        <RobotHead size={64} mood={last ? 'happy' : 'idle'} />
        <h2>{s.t}</h2>
        <p>{s.b}</p>
        <div className="tour-dots">{slides.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="drawer-actions">
          <button className="btn ghost" onClick={onDone}>Skip</button>
          <span className="spacer" />
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Let's go" : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
