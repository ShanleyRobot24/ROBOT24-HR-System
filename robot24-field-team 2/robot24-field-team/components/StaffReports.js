'use client';
import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { money, monthLabel, toCSV } from '@/lib/format';
import { buildRun } from '@/lib/payroll';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const C_PAID = '#1a2e6c', C_APPROVED = '#2f7d4f', C_PROJ = '#6f9be0', C_PIPE = '#c3d4ef';
const m0 = (y, i) => `${y}-${String(i + 1).padStart(2, '0')}-01`;
const addM = (m, n) => { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

export default function StaffReports({ staff, runs, month }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const cur = Object.entries(staff.reduce((m, s) => { m[s.currency] = (m[s.currency] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || 'AED';
  const others = [...new Set(staff.map((s) => s.currency))].filter((c) => c !== cur);
  const pick = (t) => Number((t || {})[cur] || 0);
  const committed = staff.filter((s) => s.status !== 'offer');
  const pipeline = staff.filter((s) => s.status === 'offer');

  // For each month: approved or paid payroll where it exists, otherwise worked out from staff records
  const monthRow = (m) => {
    const run = runs.find((r) => r.period === m && ['approved', 'paid'].includes(r.status));
    const proj = buildRun(committed, m);
    const pipe = buildRun(pipeline.map((s) => ({ ...s, status: 'active' })), m);
    const heads = run ? run.headcount : proj.headcount;
    return {
      m, label: MONTHS[Number(m.slice(5, 7)) - 1],
      paid: run?.status === 'paid' ? pick(run.totals) : 0,
      approved: run?.status === 'approved' ? pick(run.totals) : 0,
      projected: run ? 0 : pick(proj.totals),
      pipeline: pick(pipe.totals),
      heads, pipeHeads: pipe.headcount, status: run?.status || (runs.find((r) => r.period === m)?.status) || null,
    };
  };
  const yearRows = MONTHS.map((_, i) => monthRow(m0(year, i)));
  const T = (k) => yearRows.reduce((t, r) => t + r[k], 0);
  const actual = T('paid') + T('approved');
  const projected = T('projected');
  const next12 = Array.from({ length: 12 }, (_, i) => monthRow(addM(month, i)));
  const N = (k) => next12.reduce((t, r) => t + r[k], 0);

  // Department and joiners / leavers
  const today = new Date().toISOString().slice(0, 10);
  const activeNow = staff.filter((s) => s.status === 'active' && (!s.termination_date || s.termination_date >= today));
  const dept = {};
  for (const s of activeNow) { const k = s.department || 'No department'; dept[k] = dept[k] || { n: 0, monthly: 0 }; dept[k].n += 1; if (s.currency === cur) dept[k].monthly += Number(s.monthly_salary || 0); }
  const joiners = staff.filter((s) => s.start_date?.startsWith(String(year)) && s.status !== 'offer');
  const leavers = staff.filter((s) => s.termination_date?.startsWith(String(year)));

  function exportCSV() {
    const data = [...yearRows.map((r) => ({ section: `Year ${year}`, month: monthLabel(r.m), headcount: r.heads, paid: r.paid, approved: r.approved, projected: r.projected, offers_pipeline: r.pipeline, status: r.status || 'not sent', currency: cur })),
      ...next12.map((r) => ({ section: 'Next 12 months', month: monthLabel(r.m), headcount: r.heads, paid: r.paid, approved: r.approved, projected: r.projected, offers_pipeline: r.pipeline, status: r.status || 'not sent', currency: cur }))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCSV(data)], { type: 'text/csv' }));
    a.download = `robot24-staff-payroll-report-${year}.csv`;
    a.click();
  }

  const Tip = ({ active, payload, label }) => !active || !payload?.length ? null : (
    <div className="tip"><strong>{label} {year}</strong>{payload.filter((p) => p.value).map((p) => <p key={p.dataKey}><span className="dot" style={{ background: p.color }} />{p.name}: {money(p.value, cur)}</p>)}</div>
  );

  return (
    <>
      <div className="toolbar">
        <div className="month-picker">
          <button className="btn ghost" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
          <span className="month-label"><span>{year}</span></span>
          <button className="btn ghost" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => window.print()}>Print or save PDF</button>
        <button className="btn" onClick={exportCSV}>Export CSV</button>
      </div>
      <p className="hint lead">Approved and paid payrolls are actual figures. Other months are worked out from staff records (salary, start and last day). Offers not yet signed are shown separately as the pipeline. In {cur}{others.length ? `; staff paid in ${others.join(', ')} are left out of the totals` : ''}.</p>

      <div className="proj-cards">
        <div className="proj-card committed"><h3>{year} paid and approved</h3><p className="kpi-num">{money(actual, cur)}</p><p className="kpi-sub">from payrolls approved so far</p></div>
        <div className="proj-card planned"><h3>{year} still to come</h3><p className="kpi-num">{money(projected, cur)}</p><p className="kpi-sub">current staff, not yet approved</p></div>
        <div className="proj-card total"><h3>{year} expected total</h3><p className="kpi-num">{money(actual + projected, cur)}</p><p className="kpi-sub">plus {money(T('pipeline'), cur)} if open offers are signed</p></div>
        <div className="proj-card"><h3>Active staff now</h3><p className="kpi-num">{activeNow.length}</p><p className="kpi-sub">{joiners.length} joined, {leavers.length} left in {year}</p></div>
      </div>

      <section className="chart-card">
        <div className="chart-head"><div><h2>Salary cost by month, {year}</h2><p className="hint">Paid, approved, projected, and offers waiting to be signed</p></div></div>
        <div className="chart-box tall">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde5f1" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(31,63,143,.06)' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: '#14204a' }}>{v}</span>} />
              <Bar isAnimationActive={false} dataKey="paid" name="Paid" stackId="s" fill={C_PAID} />
              <Bar isAnimationActive={false} dataKey="approved" name="Approved" stackId="s" fill={C_APPROVED} />
              <Bar isAnimationActive={false} dataKey="projected" name="Projected" stackId="s" fill={C_PROJ} />
              <Bar isAnimationActive={false} dataKey="pipeline" name="Offers not signed" stackId="s" fill={C_PIPE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-head"><div><h2>Projection, next 12 months</h2><p className="hint">From {monthLabel(month)}. Committed is everyone Active or already approved; the pipeline is offers still to be signed.</p></div></div>
        <div className="table-wrap">
          <table className="report-table">
            <thead><tr><th>Month</th><th className="r">Headcount</th><th className="r">Committed</th><th className="r">Offers not signed</th><th className="r">Total</th><th>Payroll</th></tr></thead>
            <tbody>
              {next12.map((r) => (
                <tr key={r.m}>
                  <td>{monthLabel(r.m)}</td>
                  <td className="r num-cell">{r.heads}{r.pipeHeads ? <span className="sub2">+{r.pipeHeads} offer{r.pipeHeads > 1 ? 's' : ''}</span> : null}</td>
                  <td className="r num-cell">{money(r.paid + r.approved + r.projected, cur)}</td>
                  <td className="r num-cell planned-col">{r.pipeline ? money(r.pipeline, cur) : <span className="muted">·</span>}</td>
                  <td className="r num-cell strong">{money(r.paid + r.approved + r.projected + r.pipeline, cur)}</td>
                  <td>{r.status ? <span className={`chip ${r.status === 'paid' || r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'alert' : 'warn'}`}>{{ paid: 'Paid', approved: 'Approved', pending_approval: 'Waiting', rejected: 'Rejected' }[r.status]}</span> : <span className="muted">Not sent</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td><strong>12 months</strong></td><td /><td className="r num-cell strong">{money(N('paid') + N('approved') + N('projected'), cur)}</td><td className="r num-cell planned-col">{money(N('pipeline'), cur)}</td><td className="r num-cell strong">{money(N('paid') + N('approved') + N('projected') + N('pipeline'), cur)}</td><td /></tr></tfoot>
          </table>
        </div>
      </section>

      <div className="week-grid">
        <section className="chart-card">
          <h3>By department, active staff</h3>
          {!Object.keys(dept).length ? <p className="empty">No active staff yet.</p> : (
            <table className="report-table">
              <thead><tr><th>Department</th><th className="r">People</th><th className="r">Monthly</th><th className="r">Yearly</th></tr></thead>
              <tbody>{Object.entries(dept).sort((a, b) => b[1].monthly - a[1].monthly).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r num-cell">{v.n}</td><td className="r num-cell">{money(v.monthly, cur)}</td><td className="r num-cell">{money(v.monthly * 12, cur)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section className="chart-card">
          <h3>Joiners and leavers, {year}</h3>
          {!joiners.length && !leavers.length ? <p className="empty">Nobody joined or left in {year}.</p> : (
            <ul className="week-list">
              {joiners.map((s) => <li key={`j${s.id}`}><span className="week-flag">+</span><span><strong>{s.full_name}</strong> · joined<span className="sub2">{s.start_date} · {s.job_title || ''}</span></span><span className="chip ok">Joined</span></li>)}
              {leavers.map((s) => <li key={`l${s.id}`}><span className="week-flag">−</span><span><strong>{s.full_name}</strong> · left<span className="sub2">{s.termination_date}{s.termination_reason ? ` · ${s.termination_reason}` : ''}</span></span><span className="chip alert">Left</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
