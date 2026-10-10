'use client';
import { Fragment, useState } from 'react';
import { money, fmtDate, toCSV } from '@/lib/format';
import { MONTHS, opportunities } from '@/lib/reportData';
import { flagOf, countryName } from '@/lib/places';

const STATUS = { planned: 'Planned', confirmed: 'Booked', completed: 'Completed' };

export default function OpportunityView({ year, month, isYear, currency, region, byId, assignments, payments, direct }) {
  const [open, setOpen] = useState(() => new Set());
  const from = isYear ? `${year}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = isYear ? `${year}-12-31` : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const scopeLabel = isYear ? String(year) : `${MONTHS[month]} ${year}`;
  const rows = opportunities({ assignments, payments, direct, byId, from, to, region });
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  const unlinked = payments.filter((p) => !p.assignment_id && p.status !== 'rejected' && p.period >= from.slice(0, 8) + '01' && p.period <= to).length;
  const toggle = (k) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  function exportCSV() {
    if (!rows.length) return alert('Nothing to export.');
    const data = [];
    for (const o of rows) for (const p of o.people) for (const j of p.jobs) {
      data.push({ opportunity: o.code || o.title, job: j.title, person: p.name, status: STATUS[j.status] || j.status, start: j.start, end: j.end, days: j.days,
        fees_invoiced: j.fees, expenses: j.expenses, travel_booked: j.travel, fee_estimate_not_invoiced: j.estimate, currency });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-cost-per-opportunity-${isYear ? year : from.slice(0, 7)}-${currency}.csv`;
    a.click();
  }

  return (
    <>
      <p className="hint lead">What each opportunity really costs: invoiced fees and expenses, plus flights, trains and hotels booked by Robot24, for every job on it. Jobs without a fee invoice yet are estimated from the day rate. Opportunities are grouped by OPP code, or by job name when there is no code. Showing those with a job in {scopeLabel}, in {currency}.</p>

      <div className="proj-cards">
        <div className="proj-card committed"><h3>Spent so far</h3><p className="kpi-num">{money(sum('spent'), currency)}</p><p className="kpi-sub">Fees {money(sum('fees'), currency)} · expenses {money(sum('expenses'), currency)} · travel {money(sum('travel'), currency)}</p></div>
        <div className="proj-card planned"><h3>Still to invoice (est.)</h3><p className="kpi-num">{money(sum('estimate'), currency)}</p><p className="kpi-sub">Booked and completed jobs with no fee invoice yet</p></div>
        <div className="proj-card"><h3>Planned (est.)</h3><p className="kpi-num">{money(sum('plannedEstimate'), currency)}</p><p className="kpi-sub">Jobs not yet confirmed</p></div>
        <div className="proj-card total"><h3>Total expected</h3><p className="kpi-num">{money(sum('total'), currency)}</p><p className="kpi-sub">{rows.length} opportunit{rows.length === 1 ? 'y' : 'ies'}</p></div>
      </div>
      {unlinked > 0 && <p className="note-bar">{unlinked} bill{unlinked > 1 ? 's' : ''} in this period {unlinked > 1 ? 'are' : 'is'} not linked to a job, so {unlinked > 1 ? 'they are' : 'it is'} not counted here. Link them in Money, Bills.</p>}

      <section className="chart-card">
        <div className="chart-head"><div><h2>Cost per opportunity, {scopeLabel}</h2><p className="hint">Click an opportunity to see each person and job</p></div><button className="btn sm no-print" onClick={exportCSV}>Export CSV</button></div>
        {!rows.length ? <p className="empty">No opportunities with jobs in {scopeLabel}.</p> : (
          <div className="table-wrap">
            <table className="report-table proj-table">
              <thead><tr><th>Opportunity</th><th>Where and when</th><th className="r">People / days</th><th className="r">Fees</th><th className="r">Expenses</th><th className="r">Travel</th><th className="r">Spent</th><th className="r">Still to come (est.)</th><th className="r">Total</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <Fragment key={o.key}>
                    <tr className={`proj-row ${open.has(o.key) ? 'open' : ''}`} onClick={() => toggle(o.key)}>
                      <td><span className="caret">{open.has(o.key) ? '▾' : '▸'}</span><strong>{o.code || o.title}</strong>{o.code && <span className="sub2">{o.title}</span>}</td>
                      <td className="sub-cell">{o.places.map((p) => `${flagOf(countryName(p.split(', ').pop()))} ${p}`).join(' · ') || 'Place not set'}<span className="sub2">{fmtDate(o.start)} to {fmtDate(o.end)}</span></td>
                      <td className="r num-cell">{o.people.length} / {o.days}</td>
                      <td className="r num-cell">{o.fees ? money(o.fees, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell">{o.expenses ? money(o.expenses, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell">{o.travel ? money(o.travel, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell strong">{money(o.spent, currency)}</td>
                      <td className="r num-cell planned-col">{o.estimate + o.plannedEstimate ? money(o.estimate + o.plannedEstimate, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell strong">{money(o.total, currency)}</td>
                    </tr>
                    {open.has(o.key) && (
                      <tr className="proj-detail no-hover">
                        <td colSpan={9}>
                          <ul>
                            {o.people.map((p) => p.jobs.map((j) => (
                              <li key={j.id}>
                                <span className={`chip ${j.status === 'planned' ? 'neutral' : j.status === 'completed' ? 'ok' : 'info'}`}>{STATUS[j.status]}</span>
                                <strong>{p.name}</strong> {j.title !== o.title ? `· ${j.title}` : ''}
                                <span className="muted"> {fmtDate(j.start)} to {fmtDate(j.end)}, {j.days} day{j.days > 1 ? 's' : ''}</span>
                                <span className="proj-fee">{money(j.fees + j.expenses + j.travel + j.estimate, currency)}</span>
                                <span className="sub2">Fees {j.fees ? money(j.fees, currency) : 'not invoiced'}{j.estimate ? ` (est. ${money(j.estimate, currency)})` : ''} · expenses {money(j.expenses, currency)} · travel {money(j.travel, currency)}</span>
                              </li>
                            )))}
                          </ul>
                          {o.noRate.length > 0 && <p className="muted">No day rate on file for {o.noRate.join(', ')}, so their fee is not estimated.</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
