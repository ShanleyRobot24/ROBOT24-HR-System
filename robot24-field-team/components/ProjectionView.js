'use client';
import { Fragment, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { money, fmtDate, toCSV } from '@/lib/format';
import { MONTHS, projection, projectionByMonth } from '@/lib/reportData';
import { dayRateOf } from '@/lib/rates';

const C_CONFIRMED = '#1a2e6c';
const C_TRAVEL = '#6f9be0';
const C_PLANNED = '#c3d4ef';
const STATUS = { planned: 'Planned', confirmed: 'Confirmed', completed: 'Completed' };

function compact(n, cur) {
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(n); }
  catch { return `${cur} ${Math.round(n)}`; }
}

function Tip({ active, payload, label, cur }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + Number(p.value || 0), 0);
  return (
    <div className="tip">
      <strong>{label}</strong>
      {payload.map((p) => <p key={p.dataKey}><span className="dot" style={{ background: p.color }} />{p.name}: {money(p.value, cur)}</p>)}
      <p className="tip-total">Projected: {money(total, cur)}</p>
    </div>
  );
}

function rateText(c, cur) {
  const { rate, estimated } = dayRateOf(c);
  if (!rate) return 'No rate';
  const est = estimated ? ' (est.)' : '';
  if (c.orig_currency && c.orig_currency !== cur) {
    const o = dayRateOf({ day_rate: c.orig_day_rate, ten_day_rate: c.orig_ten_day_rate, fifteen_day_rate: c.orig_fifteen_day_rate });
    return `${money(o.rate, c.orig_currency)}/day${est} = ${money(rate, cur)}`;
  }
  return `${money(rate, cur)}/day${est}`;
}

export default function ProjectionView({ year, month, isYear, setMonth, currency, region, byId, assignments, direct, payments }) {
  const [open, setOpen] = useState(() => new Set());
  const from = isYear ? `${year}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = isYear ? `${year}-12-31` : new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const scopeLabel = isYear ? String(year) : `${MONTHS[month]} ${year}`;
  const args = { assignments, direct, payments, byId, currency, region };
  const { rows, totals: t } = projection({ ...args, from, to });
  const monthly = projectionByMonth(args, year);
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function exportCSV() {
    if (!rows.length) return alert('Nothing to export.');
    const data = rows.map((r) => ({
      name: r.name, reference: r.refCode, location: r.region, day_rate: rateText(r.rate, currency),
      confirmed_days: r.confirmedDays, confirmed_fees: r.confirmedFees, travel_booked: r.travel, committed: r.committed,
      planned_days: r.plannedDays, planned_fees: r.plannedFees, projected_total: r.total,
      invoiced_fees: r.invoicedFees, still_to_invoice: r.toInvoice, jobs: r.jobs.map((j) => `${j.title} (${STATUS[j.status]}, ${j.days}d)`).join('; '), currency,
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-projection-${isYear ? year : from.slice(0, 7)}-${currency}.csv`;
    a.click();
  }

  return (
    <>
      <p className="hint lead">Projected cost for {scopeLabel} in {currency}: each freelancer's day rate times the days they are booked, plus flights, trains and hotels already booked. Jobs crossing a month end are split by days. Cancelled jobs are left out.</p>

      <div className="proj-cards">
        <div className="proj-card committed">
          <h3>Committed</h3>
          <p className="kpi-num">{money(t.committed, currency)}</p>
          <p className="kpi-sub">Confirmed and completed fees {money(t.confirmedFees, currency)} ({t.confirmedDays} days) + travel booked {money(t.travel, currency)}</p>
        </div>
        <div className="proj-card planned">
          <h3>Planned</h3>
          <p className="kpi-num">{money(t.plannedFees, currency)}</p>
          <p className="kpi-sub">{t.plannedDays} days still to confirm</p>
        </div>
        <div className="proj-card total">
          <h3>Projected total</h3>
          <p className="kpi-num">{money(t.total, currency)}</p>
          <p className="kpi-sub">{t.people} freelancer{t.people === 1 ? '' : 's'} booked</p>
        </div>
        <div className="proj-card invoiced">
          <h3>Invoiced so far</h3>
          <p className="kpi-num">{money(t.invoicedFees + t.invoicedExpenses, currency)}</p>
          <p className="kpi-sub">Confirmed fees still to be invoiced: {money(t.toInvoice, currency)}</p>
        </div>
      </div>

      {t.hidden.length > 0 && (
        <div className="note-bar">
          <strong>Booked in {scopeLabel} but not shown here:</strong>
          <ul className="hidden-list">{t.hidden.map((h) => <li key={h.name + h.reason}>{h.name}: {h.reason}</li>)}</ul>
        </div>
      )}
      {t.noRate.length > 0 && <p className="note-bar">No day rate on file for {t.noRate.join(', ')}, so their fees are not projected. Add a day rate in People, Records and documents.</p>}
      {t.estimatedRate.length > 0 && <p className="note-bar">Day rate estimated from an old 10 or 15 day package for {t.estimatedRate.join(', ')}. Set a proper day rate in People, Records and documents.</p>}

      <section className="chart-card">
        <div className="chart-head"><div><h2>Projected cost by month, {year}</h2><p className="hint">Click a bar to open that month</p></div></div>
        <div className="chart-box tall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(e) => e?.activeTooltipIndex !== undefined && setMonth(Number(e.activeTooltipIndex))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde5f1" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={(v) => compact(v, currency)} tickLine={false} axisLine={false} fontSize={12} width={64} />
              <Tooltip content={<Tip cur={currency} />} cursor={{ fill: 'rgba(31,63,143,.06)' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: '#14204a' }}>{v}</span>} />
              <Bar isAnimationActive={false} dataKey="confirmed" name="Confirmed fees" stackId="p" fill={C_CONFIRMED}>
                {monthly.map((m, i) => <Cell key={m.month} fillOpacity={isYear || i === month ? 1 : 0.4} cursor="pointer" />)}
              </Bar>
              <Bar isAnimationActive={false} dataKey="travel" name="Travel booked" stackId="p" fill={C_TRAVEL}>
                {monthly.map((m, i) => <Cell key={m.month} fillOpacity={isYear || i === month ? 1 : 0.4} cursor="pointer" />)}
              </Bar>
              <Bar isAnimationActive={false} dataKey="planned" name="Planned fees" stackId="p" fill={C_PLANNED} radius={[4, 4, 0, 0]}>
                {monthly.map((m, i) => <Cell key={m.month} fillOpacity={isYear || i === month ? 1 : 0.4} cursor="pointer" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-head">
          <div><h2>Per freelancer, {scopeLabel}</h2><p className="hint">Click a name to see their jobs and how each fee was worked out (est.) = day rate estimated from an old package rate</p></div>
          <button className="btn sm no-print" onClick={exportCSV}>Export CSV</button>
        </div>
        {!rows.length ? <p className="empty">No assignments, travel or invoices in {scopeLabel} for {currency}{region !== 'All' ? ` in ${region}` : ''}. Add jobs in Jobs.</p> : (
          <div className="table-wrap">
            <table className="report-table proj-table">
              <thead>
                <tr>
                  <th>Freelancer</th>
                  <th>Day rate</th>
                  <th className="r">Confirmed fees</th>
                  <th className="r">Travel booked</th>
                  <th className="r">Committed</th>
                  <th className="r">Planned fees</th>
                  <th className="r">Projected total</th>
                  <th className="r">Invoiced</th>
                  <th className="r">Still to invoice</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={`proj-row ${open.has(r.id) ? 'open' : ''}`} onClick={() => toggle(r.id)}>
                      <td><span className="caret">{open.has(r.id) ? '▾' : '▸'}</span><strong>{r.name}</strong><span className="sub2">{[r.refCode, r.region].filter(Boolean).join(', ')}</span></td>
                      <td className="sub-cell">{rateText(r.rate, currency)}{r.noRate && <span className="chip alert">No rate</span>}</td>
                      <td className="r num-cell">{r.confirmedFees ? money(r.confirmedFees, currency) : <span className="muted">·</span>}{r.confirmedDays ? <span className="sub2">{r.confirmedDays} days</span> : null}</td>
                      <td className="r num-cell">{r.travel ? money(r.travel, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell strong">{money(r.committed, currency)}</td>
                      <td className="r num-cell planned-col">{r.plannedFees ? money(r.plannedFees, currency) : <span className="muted">·</span>}{r.plannedDays ? <span className="sub2">{r.plannedDays} days</span> : null}</td>
                      <td className="r num-cell strong">{money(r.total, currency)}</td>
                      <td className="r num-cell">{r.invoicedFees + r.invoicedExpenses ? money(r.invoicedFees + r.invoicedExpenses, currency) : <span className="muted">·</span>}</td>
                      <td className="r num-cell">{r.toInvoice ? money(r.toInvoice, currency) : <span className="muted">·</span>}</td>
                    </tr>
                    {open.has(r.id) && (
                      <tr className="proj-detail no-hover">
                        <td colSpan={9}>
                          {r.jobs.length > 0 && (
                            <ul>
                              {r.jobs.map((j) => (
                                <li key={j.id}>
                                  <span className={`chip ${j.status === 'planned' ? 'neutral' : j.status === 'completed' ? 'ok' : 'info'}`}>{STATUS[j.status]}</span>
                                  <strong>{j.title}</strong>{j.ref ? ` (${j.ref})` : ''}{j.city ? `, ${j.city}` : ''}
                                  <span className="muted"> {fmtDate(j.start)} to {fmtDate(j.end)}</span>
                                  <span className="proj-fee">{j.fee === null ? 'No rate' : money(j.fee, currency)}</span>
                                  <span className="sub2">{j.basis}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {r.travelItems.length > 0 && (
                            <ul>
                              {r.travelItems.map((d) => (
                                <li key={d.id}>
                                  <span className="kind-tag direct">Travel</span>
                                  {d.description || d.category}{d.travel_date ? <span className="muted"> {fmtDate(d.travel_date)}</span> : null}
                                  <span className="proj-fee">{money(d.amount, currency)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {!r.jobs.length && !r.travelItems.length && <p className="muted">Invoiced in this period, but no assignment recorded for it.</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>{rows.length} freelancer{rows.length === 1 ? '' : 's'}</strong></td>
                  <td className="r num-cell">{money(t.confirmedFees, currency)}</td>
                  <td className="r num-cell">{money(t.travel, currency)}</td>
                  <td className="r num-cell strong">{money(t.committed, currency)}</td>
                  <td className="r num-cell planned-col">{money(t.plannedFees, currency)}</td>
                  <td className="r num-cell strong">{money(t.total, currency)}</td>
                  <td className="r num-cell">{money(t.invoicedFees + t.invoicedExpenses, currency)}</td>
                  <td className="r num-cell">{money(t.toInvoice, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
