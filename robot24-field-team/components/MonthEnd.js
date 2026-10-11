'use client';
import Link from 'next/link';
import { monthLabel } from '@/lib/format';
import { buildRun } from '@/lib/payroll';

// The month's steps for HR and finance, ticked off automatically from what has been done
export default function MonthEnd({ month, bills = [], uploads = [], missing = 0, run = null, staff = [], showMoney, showStaff }) {
  const s = (b) => b.filter((x) => x.period === month);
  const mb = s(bills);
  const steps = [];
  if (showMoney) {
    const up = uploads.filter((u) => u.period === month);
    steps.push(
      { label: 'Invoices uploaded', done: up.length > 0 && !up.some((u) => ['unmatched', 'needs_attention', 'error'].includes(u.status)), detail: !up.length ? 'None uploaded yet' : up.some((u) => ['unmatched', 'needs_attention', 'error'].includes(u.status)) ? `${up.filter((u) => ['unmatched', 'needs_attention', 'error'].includes(u.status)).length} need a look` : `${up.length} uploaded`, href: '/money?tab=inbox' },
      { label: 'Bills checked and sent for approval', done: mb.length > 0 && !mb.some((b) => b.status === 'draft'), detail: mb.some((b) => b.status === 'draft') ? `${mb.filter((b) => b.status === 'draft').length} still to check` : mb.length ? 'All sent' : 'No bills yet', href: '/money?tab=bills' },
      { label: 'Bills approved', done: mb.length > 0 && !mb.some((b) => ['draft', 'pending_approval'].includes(b.status)), detail: mb.some((b) => b.status === 'pending_approval') ? `${mb.filter((b) => b.status === 'pending_approval').length} waiting for an approver` : '', href: '/money?tab=approvals' },
      { label: 'Freelancers paid', done: mb.length > 0 && mb.every((b) => ['paid', 'rejected'].includes(b.status)), detail: mb.some((b) => b.status === 'approved') ? `${mb.filter((b) => b.status === 'approved').length} approved, not yet marked paid` : '', href: '/money?tab=bills' },
      { label: 'Missing invoices chased', done: missing === 0, detail: missing ? `${missing} finished job${missing > 1 ? 's' : ''} without an invoice` : 'None missing', href: '/money?tab=missing' },
    );
  }
  if (showStaff && !run && !buildRun(staff, month).headcount) {
    steps.push({ label: 'Staff payroll', done: true, detail: 'Nobody to pay this month', href: '/staff?tab=payroll' });
  } else if (showStaff) {
    const live = buildRun(staff, month);
    steps.push(
      { label: 'Staff payroll sent for approval', done: !!run, detail: run ? '' : `${live.headcount} people ready to send`, href: '/staff?tab=payroll' },
      { label: 'Staff payroll approved', done: !!run && ['approved', 'paid'].includes(run.status), detail: run?.status === 'rejected' ? 'Rejected: fix it and send again' : run?.status === 'pending_approval' ? 'Waiting for an approver' : '', href: '/staff?tab=payroll' },
      { label: 'Staff salaries paid', done: run?.status === 'paid', detail: run?.status === 'approved' ? 'Approved, mark it paid once transferred' : '', href: '/staff?tab=payroll' },
    );
  }
  if (!steps.length) return null;
  const done = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  return (
    <section className="chart-card month-end">
      <div className="chart-head">
        <div>
          <h2>Month end: {monthLabel(month)}</h2>
          <p className="hint">{done === steps.length ? 'Everything is done for this month.' : `${done} of ${steps.length} done. Next: ${next.label.toLowerCase()}.`}</p>
        </div>
        {next && <Link className="btn primary" href={next.href}>Do the next step →</Link>}
      </div>
      <div className="me-bar"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="me-steps">
        {steps.map((x) => (
          <li key={x.label} className={x.done ? 'done' : x === next ? 'next' : ''}>
            <span className="me-tick" aria-hidden>{x.done ? '✓' : ''}</span>
            <Link href={x.href}>{x.label}</Link>
            {x.detail && <span className="sub2">{x.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
