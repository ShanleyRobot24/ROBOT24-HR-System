'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth, useAuth } from '@/components/AuthProvider';
import { useMonth } from '@/lib/monthStore';
import { useSticky } from '@/lib/sticky';
import { addMonths, fmtDate, monthLabel, totalsByCurrency, cur3 } from '@/lib/format';
import { findClashes } from '@/lib/schedule';
import { placeOf, flagOf } from '@/lib/places';
import { categoryLabel } from '@/lib/categories';
import { Icon } from '@/components/Brand';
import { Skeleton } from '@/components/ui';
import MonthEnd from '@/components/MonthEnd';

const iso = (d) => d.toISOString().slice(0, 10);

function Card({ icon, n, label, sub, href, tone = 'info', zero = 'All clear' }) {
  const done = !n;
  return (
    <Link href={href} className={`today-card ${done ? 'done' : tone}`}>
      <span className="today-icon"><Icon name={done ? 'check' : icon} size={22} /></span>
      <span className="today-n">{done ? '0' : n}</span>
      <span className="today-label">{label}</span>
      <span className="today-sub">{done ? zero : sub}</span>
      <span className="today-go">{done ? 'View' : 'Open'} →</span>
    </Link>
  );
}

function Home() {
  const { profile, isFinance, isApprover, isAssignments, isAdmin, isStaff, isPayrollApprover } = useAuth();
  const { month } = useMonth();
  const [d, setD, cached] = useSticky('home:data', null);
  const [loaded, setLoaded] = useState(cached);

  const load = useCallback(async () => {
    const today = new Date();
    const t0 = iso(today), t7 = iso(new Date(Date.now() + 7 * 864e5));
    const monthEnd = iso(new Date(Date.parse(addMonths(month, 1)) - 864e5));
    const q = {
      people: supabase.rpc('directory'),
      jobs: isAssignments ? supabase.from('assignments').select('*').lte('start_date', monthEnd > t7 ? monthEnd : t7).gte('end_date', month < t0 ? month : t0) : null,
      travel: isAssignments ? supabase.from('direct_costs').select('id, contractor_id, category, description, travel_date, end_date, amount, currency').gte('travel_date', t0).lte('travel_date', t7).order('travel_date') : null,
      bills: isFinance ? supabase.from('payments').select('id, status, amount, currency, period, kind') .in('status', ['draft', 'approved']) : null,
      uploads: isFinance ? supabase.from('invoice_uploads').select('id, status').in('status', ['unmatched', 'needs_attention', 'error']) : null,
      monthBills: isFinance ? supabase.from('payments').select('id, status, period').eq('period', month) : null,
      monthUploads: isFinance ? supabase.from('invoice_uploads').select('id, status, period').eq('period', month) : null,
      docs: isFinance ? supabase.from('documents').select('contractor_id, doc_type, expires_on').in('doc_type', ['passport', 'visa']) : null,
      contractors: isFinance ? supabase.from('contractors').select('id, full_name, active, contract_signed, currency, day_rate, ten_day_rate, fifteen_day_rate').eq('active', true) : null,
      ended: isFinance ? supabase.from('assignments').select('id').in('status', ['confirmed', 'completed']).lt('end_date', t0).gte('end_date', iso(new Date(Date.now() - 120 * 864e5))) : null,
      rates: isFinance ? supabase.from('fx_rates').select('currency, period').eq('period', month) : null,
      waiting: isApprover ? supabase.rpc('approval_queue', { p_status: 'pending_approval', p_period: null }) : null,
      backups: isAdmin ? supabase.from('audit_log').select('at, area, summary, changes').in('area', ['Backup', 'Automation']).order('id', { ascending: false }).limit(20) : null,
    };
    const keys = Object.keys(q).filter((k) => q[k]);
    const res = await Promise.all(keys.map((k) => q[k]));
    const r = Object.fromEntries(keys.map((k, i) => [k, res[i].data || []]));
    // Finished jobs with no fee bill linked
    let missing = 0;
    if (isFinance && r.ended.length) {
      const { data } = await supabase.from('payments').select('assignment_id').in('assignment_id', r.ended.map((x) => x.id)).eq('kind', 'fee').neq('status', 'rejected');
      const billed = new Set((data || []).map((x) => x.assignment_id));
      missing = r.ended.filter((x) => !billed.has(x.id)).length;
    }
    setD({ ...r, missing, t0, t7, month });
    setLoaded(true);
  }, [month, isFinance, isApprover, isAssignments, isStaff, isPayrollApprover, isAdmin, setD]);
  useEffect(() => { load(); }, [load]);

  const first = (profile?.full_name || profile?.email || '').split(/[\s@.]/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (!loaded || !d) return <div className="wrap"><div className="page-head"><h1>{hello}{first ? `, ${first.charAt(0).toUpperCase() + first.slice(1)}` : ''}</h1></div><Skeleton rows={4} cards={4} /></div>;

  const byId = Object.fromEntries((d.people || []).map((p) => [p.id, p]));
  const jobs = (d.jobs || []).filter((j) => j.status !== 'cancelled');
  const monthEnd = iso(new Date(Date.parse(addMonths(d.month, 1)) - 864e5));
  const monthJobs = jobs.filter((j) => j.start_date <= monthEnd && j.end_date >= d.month);
  const clashes = Object.keys(findClashes(monthJobs)).length;
  const thisWeek = jobs.filter((j) => j.start_date <= d.t7 && j.end_date >= d.t0).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const drafts = (d.bills || []).filter((b) => b.status === 'draft');
  const toPay = (d.bills || []).filter((b) => b.status === 'approved');
  const soon = iso(new Date(Date.now() + 182 * 864e5));
  const passports = new Map();
  for (const doc of d.docs || []) if (doc.doc_type === 'passport') passports.set(doc.contractor_id, doc.expires_on);
  const passportIssues = (d.contractors || []).filter((c) => !passports.has(c.id) || (passports.get(c.id) && passports.get(c.id) < soon)).length;
  const unsigned = (d.contractors || []).filter((c) => !c.contract_signed).length;
  const noRate = (d.contractors || []).filter((c) => !Number(c.day_rate)).length;
  const foreign = [...new Set((d.contractors || []).map((c) => cur3(c.currency)))].filter((c) => c !== 'USD' && c !== 'AED');
  const lastBackup = (d.backups || []).find((r) => r.area === 'Backup' || ((r.summary || '').startsWith('Weekly backup') && r.changes?.emailed === 'yes'));
  const backupDays = lastBackup ? Math.floor((Date.now() - Date.parse(lastBackup.at)) / 864e5) : null;
  const missingRates = foreign.filter((c) => !(d.rates || []).some((r) => r.currency === c));

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>{hello}{first ? `, ${first.charAt(0).toUpperCase() + first.slice(1)}` : ''}</h1>
          <p className="sub">Here's what needs you today. Robbie, bottom right, can walk you through anything.</p>
        </div>
      </div>

      {(isFinance || isApprover || isAssignments) && <h2 className="home-h">Needs you</h2>}
      <div className="today-grid" data-tour="home-cards">
        {isApprover && <Card icon="check" tone="alert" n={(d.waiting || []).length} label="Waiting for your approval" sub={totalsByCurrency(d.waiting || []).join(' + ')} href="/money?tab=approvals" zero="Nothing to approve" />}
        {isFinance && <Card icon="inbox" tone="alert" n={(d.uploads || []).length} label="Uploads that need a look" sub="Who is this?, needs a look or failed" href="/money?tab=inbox" zero="Every upload is sorted" />}
        {isFinance && <Card icon="file" n={drafts.length} label="Bills to check" sub={totalsByCurrency(drafts).join(' + ')} href="/money?tab=bills" zero="Nothing waiting to be checked" />}
        {isFinance && <Card icon="money" tone="good" n={toPay.length} label="Approved, ready to pay" sub={totalsByCurrency(toPay).join(' + ')} href="/money?tab=bills" zero="Nothing waiting to be paid" />}
        {isFinance && <Card icon="alert" tone="alert" n={d.missing} label="Missing invoices" sub="Finished jobs with no invoice yet" href="/money?tab=missing" zero="Every finished job has an invoice" />}
        {isAssignments && <Card icon="calendar" tone="alert" n={clashes} label="Clashing jobs" sub={`Double bookings in ${monthLabel(d.month)}`} href="/jobs?tab=calendar" zero={`No double bookings in ${monthLabel(d.month)}`} />}
        {isFinance && <Card icon="people" n={passportIssues} label="Passports to chase" sub="Missing, or expiring within 6 months" href="/people?tab=records" zero="Every passport is fine" />}
        {isFinance && unsigned > 0 && <Card icon="file" n={unsigned} label="Contracts not signed" sub="Upload the signed copy" href="/people?tab=records" />}
        {isAdmin && noRate > 0 && <Card icon="money" n={noRate} label="No proper day rate" sub="Old package rates or none" href="/people?tab=records" />}
        {isAdmin && (backupDays === null || backupDays > 7) && <Card icon="file" tone="alert" n={backupDays === null ? '!' : backupDays} label={backupDays === null ? 'No backup made yet' : 'Days since the last backup'} sub="Admin > Backup > Download full backup" href="/admin?tab=backup" />}
        {isFinance && missingRates.length > 0 && <Card icon="reports" n={missingRates.length} label="Exchange rates missing" sub={`${missingRates.join(', ')} for ${monthLabel(d.month)}`} href="/reports" />}
      </div>

      {isFinance && (
        <MonthEnd month={d.month} bills={d.monthBills || []} uploads={d.monthUploads || []} missing={d.missing} showMoney={isFinance}
          showStaff={false} staff={[]} run={null} />
      )}

      {isAssignments && (
        <>
          <h2 className="home-h">This week</h2>
          <div className="week-grid">
            <section className="chart-card">
              <h3>Working</h3>
              {!thisWeek.length ? <p className="empty">Nobody is booked this week.</p> : (
                <ul className="week-list">
                  {thisWeek.map((j) => (
                    <li key={j.id}>
                      <span className="week-flag">{flagOf(placeOf(j))}</span>
                      <span><strong>{byId[j.contractor_id]?.full_name || 'Unknown'}</strong> · {j.title}<span className="sub2">{fmtDate(j.start_date)} to {fmtDate(j.end_date)}{j.city ? `, ${j.city}` : ''}</span></span>
                      <span className={`chip ${j.status === 'planned' ? 'neutral' : j.status === 'completed' ? 'ok' : 'info'}`}>{j.status === 'confirmed' ? 'Booked' : j.status.charAt(0).toUpperCase() + j.status.slice(1)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="chart-card">
              <h3>Travelling</h3>
              {!(d.travel || []).length ? <p className="empty">No flights, trains or hotels in the next 7 days.</p> : (
                <ul className="week-list">
                  {d.travel.map((t) => (
                    <li key={t.id}>
                      <span className="week-flag"><Icon name="plane" size={18} /></span>
                      <span><strong>{byId[t.contractor_id]?.full_name || 'Unknown'}</strong> · {t.description || categoryLabel(t.category)}<span className="sub2">{fmtDate(t.travel_date)}{t.end_date ? ` to ${fmtDate(t.end_date)}` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="hint">{monthLabel(d.month)}: {new Set(monthJobs.map((j) => j.contractor_id)).size} people on {monthJobs.length} jobs. <Link href="/jobs">Open Jobs →</Link></p>
        </>
      )}

      {!isAssignments && !isFinance && !isApprover && (
        <p className="empty">Use <Link href="/people">People</Link> to find anyone on the field team.</p>
      )}
    </div>
  );
}

export default function Page() {
  return <RequireAuth><Home /></RequireAuth>;
}
