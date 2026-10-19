'use client';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { fmtDate, money, monthLabel } from '@/lib/format';
import { buildRun } from '@/lib/payroll';
import { requiredDocs, docLabel, visaLabel, daysTo } from '@/lib/staff';
import { Icon } from './Brand';
import { balances } from '@/lib/leave';

function Card({ icon, n, label, sub, href, tone = 'info', zero = 'All clear', big }) {
  const done = !n && n !== 0 ? false : n === 0;
  return (
    <Link href={href} className={`today-card ${done ? 'done' : tone}`}>
      <span className="today-icon"><Icon name={done ? 'check' : icon} size={22} /></span>
      <span className="today-n">{big ?? n}</span>
      <span className="today-label">{label}</span>
      <span className="today-sub">{done ? zero : sub}</span>
      <span className="today-go">{done ? 'View' : 'Open'} →</span>
    </Link>
  );
}

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const EXPIRY = [['passport_expiry', 'Passport'], ['emirates_id_expiry', 'Emirates ID'], ['labour_card_expiry', 'Labour card'], ['work_permit_expiry', 'Work permit'], ['visa_expiry', 'Visa']];
const RUN = { pending_approval: ['Waiting for approval', 'alert'], approved: ['Approved, ready to pay', 'good'], rejected: ['Rejected, needs fixing', 'alert'], paid: ['Paid', 'good'] };

export default function StaffOverview({ staff, runs, docs, month, leaves = [], adjustments = [] }) {
  const { isPayrollApprover } = useAuth();
  const today = iso(Date.now());
  const in30 = iso(Date.now() + 30 * 864e5);
  const in60 = iso(Date.now() + 60 * 864e5);
  const current = staff.filter((s) => s.status !== 'terminated' || (s.termination_date && s.termination_date >= today));
  const active = staff.filter((s) => s.status === 'active' && (!s.termination_date || s.termination_date >= today));
  const offers = staff.filter((s) => s.status === 'offer');
  const starting = current.filter((s) => s.start_date && s.start_date >= today && s.start_date <= in30);
  const leaving = staff.filter((s) => s.termination_date && s.termination_date >= today);
  const expiring = [];
  for (const s of current) for (const [k, l] of EXPIRY) if (s[k] && s[k] <= in60) expiring.push({ s, what: l, date: s[k], n: daysTo(s[k]) });
  expiring.sort((a, b) => a.date.localeCompare(b.date));
  const have = {};
  for (const d of docs) (have[d.staff_id] = have[d.staff_id] || new Set()).add(d.doc_type);
  const missing = active.map((s) => ({ s, gaps: requiredDocs(s).filter((t) => !have[s.id]?.has(t)) })).filter((x) => x.gaps.length);
  const visasMoving = current.filter((s) => ['entry_permit_applied', 'entry_permit_issued', 'medical_and_eid'].includes(s.visa_status));
  const run = runs.find((r) => r.period === month);
  const live = buildRun(staff, month);
  const waiting = runs.filter((r) => r.status === 'pending_approval');
  const monthly = {};
  for (const s of active) monthly[s.currency] = (monthly[s.currency] || 0) + Number(s.monthly_salary || 0);
  const runRate = Object.entries(monthly).map(([c, v]) => money(v * 12, c)).join(' + ') || money(0, 'AED');
  const leaveWaiting = leaves.filter((l) => l.status === 'pending');
  const offToday = active.filter((s) => leaves.some((l) => l.staff_id === s.id && l.status === 'approved' && l.leave_type !== 'wfh' && l.start_date <= today && l.end_date >= today));
  const bal = active.map((s) => ({ s, b: balances(s, leaves.filter((l) => l.staff_id === s.id), adjustments.filter((x) => x.staff_id === s.id)) }));
  const bigBalances = bal.filter((x) => x.b.annual > 30);
  const sickHigh = bal.filter((x) => x.b.sick.used > 15);
  const [runLabel, runTone] = run ? RUN[run.status] : ['Not sent for approval', live.headcount ? 'info' : 'done'];

  return (
    <>
      <h2 className="home-h">Needs you</h2>
      <div className="today-grid" data-tour="staff-cards">
        {isPayrollApprover && <Card icon="check" tone="alert" n={waiting.length} label="Payroll waiting for your approval" sub={waiting.map((r) => monthLabel(r.period)).join(', ')} href={waiting[0] ? `/staff?tab=payroll&month=${waiting[0].period}` : '/staff?tab=payroll'} zero="Nothing to approve" />}
        <Link href="/staff?tab=payroll" className={`today-card ${runTone}`}>
          <span className="today-icon"><Icon name="money" size={22} /></span>
          <span className="today-n today-n-sm">{Object.entries(run ? run.totals : live.totals).map(([c, v]) => money(v, c)).join(' + ') || money(0, 'AED')}</span>
          <span className="today-label">{monthLabel(month)} payroll</span>
          <span className="today-sub">{runLabel} · {(run ? run.headcount : live.headcount)} people</span>
          <span className="today-go">Open →</span>
        </Link>
        <Card icon="alert" tone="alert" n={expiring.length} label="Documents expiring" sub="Passport, Emirates ID, labour card, work permit or visa within 60 days" href="/staff?tab=staff" zero="Nothing expiring in 60 days" />
        <Card icon="file" n={missing.length} label="Missing documents" sub="Active staff without every required document" href="/staff?tab=staff" zero="Every file is complete" />
        <Card icon="file" tone="alert" n={offers.length} label="Offers waiting to be signed" sub="Upload the signed letter to make them Active" href="/staff?tab=staff" zero="No offers outstanding" />
        <Card icon="staff" tone="good" n={starting.length} label="Starting in 30 days" sub={starting.map((s) => s.full_name.split(' ')[0]).join(', ')} href="/staff?tab=staff" zero="Nobody starting soon" />
        <Card icon="calendar" n={visasMoving.length} label="Visas in progress" sub="Entry permit, medical or Emirates ID stage" href="/staff?tab=staff" zero="No visas in progress" />
        <Card icon="calendar" tone="alert" n={leaveWaiting.length} label="Leave waiting for approval" sub={leaveWaiting.slice(0, 3).map((l) => staff.find((x) => x.id === l.staff_id)?.full_name.split(' ')[0]).filter(Boolean).join(', ')} href="/staff?tab=leave" zero="No leave waiting" />
        <Card icon="people" n={offToday.length} label="Off today" sub={offToday.map((s) => s.full_name.split(' ')[0]).join(', ')} href="/staff?tab=leave" zero="Everyone is in today" />
        {bigBalances.length > 0 && <Card icon="calendar" n={bigBalances.length} label="Over 30 days of annual leave" sub="Encourage them to book time off" href="/staff?tab=leave" />}
        {sickHigh.length > 0 && <Card icon="alert" n={sickHigh.length} label="Past 15 sick days this year" sub="Further sick days are half pay" href="/staff?tab=leave" />}
        <Card icon="people" n={leaving.length} label="Leaving" sub="Last day still to come" href="/staff?tab=staff" zero="Nobody leaving" />
      </div>

      <h2 className="home-h">At a glance</h2>
      <div className="today-grid">
        <Card icon="staff" n={active.length} big={active.length} label="Active staff" sub={`${offers.length} more with an offer out`} href="/staff?tab=staff" zero="No active staff yet" />
        <Link href="/staff?tab=reports" className="today-card info">
          <span className="today-icon"><Icon name="reports" size={22} /></span>
          <span className="today-n today-n-sm">{runRate}</span>
          <span className="today-label">Yearly salary run rate</span>
          <span className="today-sub">Active staff monthly salaries × 12</span>
          <span className="today-go">Reports →</span>
        </Link>
      </div>

      <div className="week-grid">
        <section className="chart-card">
          <h3>Expiring soon</h3>
          {!expiring.length ? <p className="empty">Nothing expires in the next 60 days.</p> : (
            <ul className="week-list">
              {expiring.slice(0, 8).map((x, i) => (
                <li key={i}><span className="week-flag"><Icon name="alert" size={18} /></span><span><strong>{x.s.full_name}</strong> · {x.what}<span className="sub2">{fmtDate(x.date)}</span></span><span className={`chip ${x.n < 0 ? 'alert' : 'warn'}`}>{x.n < 0 ? 'Expired' : `${x.n} days`}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="chart-card">
          <h3>Joining and leaving</h3>
          {!starting.length && !leaving.length && !missing.length ? <p className="empty">Nothing coming up.</p> : (
            <ul className="week-list">
              {starting.map((s) => <li key={`s${s.id}`}><span className="week-flag"><Icon name="staff" size={18} /></span><span><strong>{s.full_name}</strong> · starts<span className="sub2">{fmtDate(s.start_date)} · {s.job_title || ''} · visa: {visaLabel(s.visa_status)}</span></span><span className={`chip ${s.status === 'offer' ? 'warn' : 'ok'}`}>{s.status === 'offer' ? 'Offer sent' : 'Active'}</span></li>)}
              {leaving.map((s) => <li key={`l${s.id}`}><span className="week-flag"><Icon name="people" size={18} /></span><span><strong>{s.full_name}</strong> · leaves<span className="sub2">{fmtDate(s.termination_date)}{s.termination_reason ? ` · ${s.termination_reason}` : ''}</span></span><span className="chip alert">Leaving</span></li>)}
              {missing.slice(0, 5).map(({ s, gaps }) => <li key={`m${s.id}`}><span className="week-flag"><Icon name="file" size={18} /></span><span><strong>{s.full_name}</strong> · missing<span className="sub2">{gaps.map(docLabel).join(', ')}</span></span></li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
