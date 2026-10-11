'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/AuthProvider';
import { useMonth } from '@/lib/monthStore';
import Skeleton from '@/components/Skeleton';
import { money, toCSV, sortRegions, cur3 } from '@/lib/format';
import ProjectionView from '@/components/ProjectionView';
import OpportunityView from '@/components/OpportunityView';
import FxPanel from '@/components/FxPanel';
import { makeFx, AED_PER_USD } from '@/lib/fx';
import {
  BASIS, MONTHS, filterPayments, sumUp, inMonth, inYear, byMonth, byRegion, byExpenseCategory, byMember, memberYearGrid, change, expensesByMember,
} from '@/lib/reportData';

const FEE = '#1a2e6c';
const EXP = '#6f9be0';
const PALETTE = ['#1a2e6c', '#6f9be0', '#2f56b0', '#a9c3ea', '#c47f17', '#2f7d4f', '#b4372c', '#7a8b2c', '#5a6784'];

function compact(n, cur) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch { return `${cur} ${Math.round(n)}`; }
}

function download(name, rows) {
  if (!rows.length) return alert('Nothing to export.');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

function Delta({ now, before, label }) {
  const c = change(now, before);
  if (c === null) return <span className="delta new">New vs {label}</span>;
  if (c === 0) return <span className="delta flat">Same as {label}</span>;
  return <span className={`delta ${c > 0 ? 'up' : 'down'}`}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}% vs {label}</span>;
}

function Kpi({ title, value, sub, children, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <h3>{title}</h3>
      <p className="kpi-num">{value}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
      {children}
    </div>
  );
}

function ChartCard({ title, sub, children, action }) {
  return (
    <section className="chart-card">
      <div className="chart-head">
        <div><h2>{title}</h2>{sub && <p className="hint">{sub}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoneyTip({ active, payload, label, cur }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + Number(p.value || 0), 0);
  return (
    <div className="tip">
      <strong>{label || payload[0]?.payload?.name}</strong>
      {payload.map((p) => <p key={p.dataKey || p.name}><span className="dot" style={{ background: p.color || p.payload?.fill }} />{p.name}: {money(p.value, cur)}</p>)}
      {payload.length > 1 && <p className="tip-total">Total: {money(total, cur)}</p>}
    </div>
  );
}

function Reports() {
  const thisYear = new Date().getUTCFullYear();
  // Starts from the month chosen anywhere else in the app, and picking a month here updates it everywhere
  const shared = useMonth();
  const [year, setYear] = useState(Number(shared.month.slice(0, 4)));
  const [month, setMonthLocal] = useState(Number(shared.month.slice(5, 7)) - 1); // 0 to 11, or 'year'
  const setMonth = (m) => {
    setMonthLocal(m);
    if (m !== 'year') shared.setMonth(`${year}-${String(m + 1).padStart(2, '0')}-01`);
  };
  const [basis, setBasis] = useState('paid');
  const [dateMode, setDateMode] = useState('period');
  const [region, setRegion] = useState('All');
  const [currency, setCurrency] = useState('USD');
  const [rawPayments, setPayments] = useState([]);
  const [rates, setRates] = useState([]);
  const [fxOpen, setFxOpen] = useState(false);
  const [fxTick, setFxTick] = useState(0);
  const [rawContractors, setContractors] = useState([]);
  const [rawDirect, setDirect] = useState([]);
  const [includeDirect, setIncludeDirect] = useState(true);
  const [mode, setMode] = useState('actual');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState(['total', -1]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      supabase.from('payments').select('id, contractor_id, assignment_id, kind, amount, currency, status, period, paid_on, line_items')
        .gte('period', `${year - 1}-01-01`).lte('period', `${year}-12-01`),
      supabase.from('contractors').select('id, full_name, ref_code, region, designation, currency, day_rate, ten_day_rate, fifteen_day_rate, photo_path'),
      supabase.from('assignments').select('id, contractor_id, title, event_reference, city, country, start_date, end_date, status')
        .lte('start_date', `${year}-12-31`).gte('end_date', `${year}-01-01`),
      supabase.from('fx_rates').select('*'),
      supabase.from('direct_costs').select('id, contractor_id, assignment_id, period, category, description, travel_date, amount, currency')
        .gte('period', `${year - 1}-01-01`).lte('period', `${year}-12-01`),
    ]).then(([p, c, a, fxr, d]) => {
      setRates(fxr.data || []);
      if (!live) return;
      setError(p.error?.message || c.error?.message || a.error?.message || d.error?.message || '');
      setAssignments(a.data || []);
      setPayments(p.data || []);
      setDirect(d.data || []);
      setContractors(c.data || []);
      setLoading(false);
    });
    return () => { live = false; };
  }, [year, fxTick]);

  // Everything is converted to the report currency (USD or AED) using Exchange rates. Originals are kept.
  const fx = useMemo(() => makeFx(rates), [rates]);
  const otherCur = currency === 'USD' ? 'AED' : 'USD';
  const inOther = (v) => (currency === 'USD' ? v * AED_PER_USD : v / AED_PER_USD);
  const { payments, direct, contractors, missingRates, foreignCurrencies } = useMemo(() => {
    const miss = {};
    // Full precision here; amounts are only rounded when shown, so USD and AED views agree
    const conv = (amt, cur, period) => {
      const k = fx.usdPerUnit(cur, period);
      if (k === null) { miss[cur] = (miss[cur] || 0) + 1; return null; }
      const usd = Number(amt || 0) * k;
      return currency === 'AED' ? usd * AED_PER_USD : usd;
    };
    const ps = rawPayments.map((p) => {
      const v = conv(p.amount, p.currency, p.period);
      return v === null ? null : { ...p, amount: v, currency, orig_amount: Number(p.amount), orig_currency: cur3(p.currency) };
    }).filter(Boolean);
    const ds = rawDirect.map((d) => {
      const v = conv(d.amount, d.currency, d.period);
      return v === null ? null : { ...d, amount: v, currency, orig_amount: Number(d.amount), orig_currency: cur3(d.currency) };
    }).filter(Boolean);
    const now = new Date().toISOString().slice(0, 7) + '-01';
    const cs = rawContractors.map((c) => {
      const cur = cur3(c.currency);
      const k = fx.usdPerUnit(cur, now);
      if (k === null) return { ...c, currency: cur, orig_currency: cur, fx_missing: true };
      const f = (v) => (v === null || v === undefined || v === '' ? v : Math.round(fx.convert(v, cur, now, currency) * 100) / 100);
      return { ...c, currency, day_rate: f(c.day_rate), ten_day_rate: f(c.ten_day_rate), fifteen_day_rate: f(c.fifteen_day_rate), orig_currency: cur, orig_day_rate: c.day_rate, orig_ten_day_rate: c.ten_day_rate, orig_fifteen_day_rate: c.fifteen_day_rate };
    });
    const foreign = [...new Set([...rawPayments, ...rawDirect].map((x) => cur3(x.currency)).concat(rawContractors.map((c) => cur3(c.currency))))].filter((c) => c !== 'USD' && c !== 'AED');
    return { payments: ps, direct: ds, contractors: cs, missingRates: miss, foreignCurrencies: foreign };
  }, [rawPayments, rawDirect, rawContractors, fx, currency]);
  const byId = useMemo(() => Object.fromEntries(contractors.map((c) => [c.id, c])), [contractors]);
  const regions = ['All', ...[...new Set(contractors.map((c) => c.region))].sort(sortRegions)];

  const opts = { basis, currency, region, dateMode };
  const list = useMemo(() => filterPayments(payments, byId, opts), [payments, byId, basis, currency, region, dateMode]);
  const isYear = month === 'year';
  const ym = isYear ? null : `${year}-${String(month + 1).padStart(2, '0')}`;
  const prevYm = isYear ? null : month === 0 ? `${year - 1}-12` : `${year}-${String(month).padStart(2, '0')}`;

  const scope = isYear ? inYear(list, year, dateMode) : inMonth(list, ym, dateMode);
  const prevScope = isYear ? inYear(list, year - 1, dateMode) : inMonth(list, prevYm, dateMode);
  const now = sumUp(scope);
  const before = sumUp(prevScope);
  const people = new Set(scope.map((p) => p.contractor_id)).size;
  const prevPeople = new Set(prevScope.map((p) => p.contractor_id)).size;
  const vsLabel = isYear ? String(year - 1) : MONTHS[month === 0 ? 11 : month - 1];
  const scopeLabel = isYear ? String(year) : `${MONTHS[month]} ${year}`;

  const monthly = byMonth(list, year, dateMode);
  const regionsData = byRegion(scope, byId);
  // Costs Robot24 paid directly (flights, trains, hotels booked by the company)
  const directIn = direct.filter((d) => d.currency === currency && (region === 'All' || byId[d.contractor_id]?.region === region));
  const directScope = directIn.filter((d) => (isYear ? d.period.startsWith(String(year)) : d.period.slice(0, 7) === ym));
  const directPrev = directIn.filter((d) => (isYear ? d.period.startsWith(String(year - 1)) : d.period.slice(0, 7) === prevYm));
  const directTotal = Math.round(directScope.reduce((a, d) => a + Number(d.amount || 0), 0) * 100) / 100;
  const directPrevTotal = directPrev.reduce((a, d) => a + Number(d.amount || 0), 0);
  const directByMember = {};
  for (const d of directScope) directByMember[d.contractor_id] = (directByMember[d.contractor_id] || 0) + Number(d.amount || 0);
  const directAsExpense = directScope.map((d) => ({ contractor_id: d.contractor_id, kind: 'expense', amount: d.amount, currency: d.currency, line_items: [{ category: d.category, amount: d.amount }] }));
  const expenseSource = includeDirect ? [...scope, ...directAsExpense] : scope;
  const cats = byExpenseCategory(expenseSource);
  const catsTotal = Math.round(cats.reduce((a, c) => a + c.value, 0) * 100) / 100;
  const members = (() => {
    const rows = byMember(scope, byId).map((m) => ({ ...m, direct: Math.round((directByMember[m.id] || 0) * 100) / 100 }));
    for (const id of Object.keys(directByMember)) {
      if (rows.some((m) => m.id === id)) continue;
      const c = byId[id] || {};
      rows.push({ id, name: c.full_name || 'Unknown', refCode: c.ref_code || '', region: c.region || '', role: c.designation || '', fees: 0, expenses: 0, total: 0, bills: 0, direct: Math.round(directByMember[id] * 100) / 100 });
    }
    const orig = {};
    const exact = {};
    for (const p of scope) {
      const o = (orig[p.contractor_id] = orig[p.contractor_id] || {});
      o[p.orig_currency] = (o[p.orig_currency] || 0) + p.orig_amount;
      exact[p.contractor_id] = (exact[p.contractor_id] || 0) + Number(p.amount || 0);
    }
    return rows.map((m) => ({ ...m, full: Math.round((m.total + m.direct) * 100) / 100, paidIn: orig[m.id] || {}, exactTotal: exact[m.id] || 0 }));
  })();
  const hasDirect = directScope.length > 0;
  const top = [...members].sort((a, b) => b.total - a.total).filter((m) => m.total > 0).slice(0, 10).map((m) => ({ ...m, short: m.name.length > 18 ? m.name.slice(0, 17) + '…' : m.name }));
  const grid = memberYearGrid(list, byId, year, dateMode);
  const expGrid = expensesByMember(expenseSource, byId);

  const sorted = [...members].sort((a, b) => {
    const [k, dir] = sort;
    const av = a[k], bv = b[k];
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
  const sortBy = (k) => setSort(([sk, d]) => [k, sk === k ? -d : k === 'name' || k === 'region' ? 1 : -1]);
  const arrow = (k) => (sort[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : '');



  const basisNote = dateMode === 'paid_on' ? 'paid bills, by payment date' : `${BASIS[basis].label.toLowerCase()} bills, by bill month`;

  return (
    <div className="wrap reports">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="sub">{scopeLabel}, shown in {currency}, {mode === 'projection' ? 'projection from assignments and day rates' : mode === 'opportunity' ? 'cost per opportunity' : basisNote}{region !== 'All' ? `, ${region}` : ''}</p>
        </div>
        <div className="tabs no-print" role="tablist">
          <button className={mode === 'actual' ? 'on' : ''} onClick={() => setMode('actual')}>Spend so far</button>
          <button className={mode === 'projection' ? 'on' : ''} onClick={() => setMode('projection')}>Projection</button>
          <button className={mode === 'opportunity' ? 'on' : ''} onClick={() => setMode('opportunity')}>By opportunity</button>
        </div>
        <div className="report-actions no-print">
          <button className="btn" onClick={() => window.print()}>Print or save PDF</button>
        </div>
      </div>

      <div className="report-controls no-print">
        <div className="year-pick">
          <button className="btn ghost" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
          <strong>{year}</strong>
          <button className="btn ghost" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
        </div>
        <div className="month-chips" role="group" aria-label="Month">
          {MONTHS.map((m, i) => <button key={m} className={month === i ? 'on' : ''} onClick={() => setMonth(i)}>{m}</button>)}
          <button className={`whole ${isYear ? 'on' : ''}`} onClick={() => setMonth('year')}>Whole year</button>
        </div>
        <div className="filters">
          {mode === 'actual' && <label>Count<select value={dateMode === 'paid_on' ? 'paid_on' : basis} onChange={(e) => { if (e.target.value === 'paid_on') { setDateMode('paid_on'); } else { setDateMode('period'); setBasis(e.target.value); } }}>
            <option value="paid">Paid, by bill month</option>
            <option value="paid_on">Paid, by payment date</option>
            <option value="approved">Approved and paid</option>
            <option value="billed">Everything billed</option>
          </select></label>}
          <label>Location<select value={region} onChange={(e) => setRegion(e.target.value)}>{regions.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label>Show in
            <span className="seg cur-seg">
              {['USD', 'AED'].map((c) => <button key={c} type="button" className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>{c}</button>)}
            </span>
          </label>
          <label>Exchange rates<button type="button" className="btn sm fx-btn" onClick={() => setFxOpen(true)}>{foreignCurrencies.length ? `View or edit (${foreignCurrencies.join(', ')})` : 'View'}</button></label>
          {mode === 'actual' && <label className="check toggle"><input type="checkbox" checked={includeDirect} onChange={(e) => setIncludeDirect(e.target.checked)} /> Include travel booked by Robot24 in expense charts</label>}
        </div>
      </div>

      {error && <p className="err">{error}</p>}
      {Object.keys(missingRates).length > 0 && (
        <p className="note-bar">No exchange rate yet for {Object.entries(missingRates).map(([c, n]) => `${c} (${n} item${n > 1 ? 's' : ''})`).join(', ')}, so {Object.keys(missingRates).length > 1 ? 'they are' : 'it is'} left out of these totals. <button className="linkish" onClick={() => setFxOpen(true)}>Add a rate</button></p>
      )}
      {fxOpen && <FxPanel currencies={foreignCurrencies} rates={rates} month={isYear ? undefined : `${year}-${String(month + 1).padStart(2, '0')}-01`} onClose={() => setFxOpen(false)} refresh={() => setFxTick((t) => t + 1)} />}

      {(!loading || rawContractors.length > 0) && mode === 'projection' && (
        <ProjectionView year={year} month={month === 'year' ? 0 : month} isYear={isYear} setMonth={setMonth} currency={currency} region={region} byId={byId} assignments={assignments} direct={direct} payments={payments} />
      )}

      {(!loading || rawContractors.length > 0) && mode === 'opportunity' && (
        <OpportunityView year={year} month={month === 'year' ? 0 : month} isYear={isYear} currency={currency} region={region} byId={byId} assignments={assignments} payments={payments} direct={direct} />
      )}

      {loading && !rawContractors.length ? <Skeleton rows={6} cards={5} /> : mode !== 'actual' ? null : (
        <>
          <div className="kpis">
            <Kpi title={`Total ${dateMode === 'paid_on' || basis === 'paid' ? 'paid' : 'value'}`} value={money(now.total, currency)} sub={`= ${money(inOther(scope.reduce((t, p) => t + Number(p.amount || 0), 0)), otherCur)}`} tone="main">
              <Delta now={now.total} before={before.total} label={vsLabel} />
            </Kpi>
            <Kpi title="Fees" value={money(now.fees, currency)} sub={now.total ? `${Math.round((now.fees / now.total) * 100)}% of total` : ''}>
              <Delta now={now.fees} before={before.fees} label={vsLabel} />
            </Kpi>
            <Kpi title="Expenses" value={money(now.expenses, currency)} sub={now.total ? `${Math.round((now.expenses / now.total) * 100)}% of total` : ''}>
              <Delta now={now.expenses} before={before.expenses} label={vsLabel} />
            </Kpi>
            <Kpi title="Members paid" value={people} sub={`${now.bills} bill${now.bills === 1 ? '' : 's'}`}>
              <Delta now={people} before={prevPeople} label={vsLabel} />
            </Kpi>
            <Kpi title="Average per member" value={money(people ? now.total / people : 0, currency)}>
              <Delta now={people ? now.total / people : 0} before={prevPeople ? before.total / prevPeople : 0} label={vsLabel} />
            </Kpi>
          </div>

          {scope.length > 0 && (
            <p className="paid-in">
              <strong>Paid in:</strong>{' '}
              {Object.entries(scope.reduce((m, p) => { m[p.orig_currency] = (m[p.orig_currency] || 0) + p.orig_amount; return m; }, {}))
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => {
                  const conv = scope.filter((p) => p.orig_currency === c).reduce((a, p) => a + p.amount, 0);
                  return <span key={c} className="paid-chip">{money(v, c)}{c !== currency && <em> = {money(conv, currency)}</em>}</span>;
                })}
            </p>
          )}

          {(hasDirect || directPrevTotal > 0) && (
            <div className="cost-strip">
              <div><span>Paid to members</span><strong>{money(now.total, currency)}</strong></div>
              <span className="op">+</span>
              <div><span>Booked by Robot24</span><strong>{money(directTotal, currency)}</strong><Delta now={directTotal} before={directPrevTotal} label={vsLabel} /></div>
              <span className="op">=</span>
              <div className="full"><span>Full field team cost</span><strong>{money(now.total + directTotal, currency)}</strong><Delta now={now.total + directTotal} before={before.total + directPrevTotal} label={vsLabel} /></div>
            </div>
          )}

          {!now.bills && !hasDirect && (
            <div className="empty-report">
              <p><strong>Nothing to show for {scopeLabel}.</strong></p>
              <p className="hint">{basis === 'paid' || dateMode === 'paid_on' ? 'No bills have been marked paid yet. Try "Everything billed" to include bills still in progress, or pick another month.' : 'Try another month, location or currency.'}</p>
            </div>
          )}

          <div className="chart-grid">
            <ChartCard title={`Month by month, ${year}`} sub="Click a bar to open that month" >
              <div className="chart-box tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(e) => e?.activeTooltipIndex !== undefined && setMonth(Number(e.activeTooltipIndex))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde5f1" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickFormatter={(v) => compact(v, currency)} tickLine={false} axisLine={false} fontSize={12} width={64} />
                    <Tooltip content={<MoneyTip cur={currency} />} cursor={{ fill: 'rgba(31,63,143,.06)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                    <Bar isAnimationActive={false} dataKey="fees" name="Fees" stackId="a" fill={FEE} radius={[0, 0, 0, 0]}>
                      {monthly.map((m, i) => <Cell key={m.ym} fillOpacity={isYear || i === month ? 1 : 0.35} cursor="pointer" />)}
                    </Bar>
                    <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" stackId="a" fill={EXP} radius={[4, 4, 0, 0]}>
                      {monthly.map((m, i) => <Cell key={m.ym} fillOpacity={isYear || i === month ? 1 : 0.35} cursor="pointer" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="By location" sub={scopeLabel}>
              {!regionsData.length ? <p className="empty">No data.</p> : (
                <div className="chart-box" style={{ height: Math.max(180, regionsData.length * 44 + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={regionsData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dde5f1" />
                      <XAxis type="number" tickFormatter={(v) => compact(v, currency)} tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis type="category" dataKey="region" width={110} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip content={<MoneyTip cur={currency} />} cursor={{ fill: 'rgba(31,63,143,.06)' }} />
                      <Bar isAnimationActive={false} dataKey="fees" name="Fees" stackId="r" fill={FEE} />
                      <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" stackId="r" fill={EXP} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Expenses by category" sub={`${scopeLabel}. ${includeDirect && hasDirect ? 'Includes travel booked by Robot24' : 'Hotels, flights, Uber and more'}`}>
              {!cats.length ? <p className="empty">No expenses in this period.</p> : (
                <div className="donut-wrap">
                  <div className="chart-box donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie isAnimationActive={false} data={cats} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">
                          {cats.map((c, i) => <Cell key={c.key} fill={PALETTE[i % PALETTE.length]} />)}
                        </Pie>
                        <Tooltip content={<MoneyTip cur={currency} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-centre"><span>{money(catsTotal, currency)}</span><small>{includeDirect && hasDirect ? 'incl. booked' : 'expenses'}</small></div>
                  </div>
                  <ul className="legend-list">
                    {cats.map((c, i) => (
                      <li key={c.key}>
                        <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="lg-name">{c.name}</span>
                        <span className="lg-val">{money(c.value, currency)}</span>
                        <span className="lg-pct">{catsTotal ? Math.round((c.value / catsTotal) * 100) : 0}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Top members" sub={`${scopeLabel}, highest total first`}>
              {!top.length ? <p className="empty">No data.</p> : (
                <div className="chart-box" style={{ height: Math.max(180, top.length * 36 + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dde5f1" />
                      <XAxis type="number" tickFormatter={(v) => compact(v, currency)} tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis type="category" dataKey="short" width={130} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip content={<MoneyTip cur={currency} />} cursor={{ fill: 'rgba(31,63,143,.06)' }} />
                      <Bar isAnimationActive={false} dataKey="fees" name="Fees" stackId="t" fill={FEE} />
                      <Bar isAnimationActive={false} dataKey="expenses" name="Expenses" stackId="t" fill={EXP} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title={`Each member, ${scopeLabel}`}
            sub="Click a column heading to sort"
            action={<button className="btn sm no-print" onClick={() => download(`robot24-members-${isYear ? year : ym}-${currency}.csv`, sorted.map((m) => ({ name: m.name, reference: m.refCode, location: m.region, role: m.role, paid_in: Object.entries(m.paidIn).map(([c, v]) => `${c} ${Math.round(v * 100) / 100}`).join(' + '), fees: m.fees, expenses: m.expenses, paid_to_member: m.total, [`paid_to_member_${otherCur}`]: Math.round(inOther(m.exactTotal) * 100) / 100, booked_by_robot24: m.direct, full_cost: m.full, bills: m.bills, currency })))}>Export CSV</button>}
          >
            {!sorted.length ? <p className="empty">No members paid in this period.</p> : (
              <div className="table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => sortBy('name')}>Member{arrow('name')}</th>

                      <th className="r sortable" onClick={() => sortBy('fees')}>Fees{arrow('fees')}</th>
                      <th className="r sortable" onClick={() => sortBy('expenses')}>Expenses{arrow('expenses')}</th>
                      <th className="r">Paid in</th>
                      <th className="r sortable" onClick={() => sortBy('total')}>{hasDirect ? 'Paid to them' : 'Total'} ({currency}){arrow('total')}</th>
                      <th className="r">{otherCur}</th>
                      {hasDirect && <th className="r sortable" onClick={() => sortBy('direct')}>Booked by R24{arrow('direct')}</th>}
                      {hasDirect && <th className="r sortable" onClick={() => sortBy('full')}>Full cost{arrow('full')}</th>}
                      <th className="share-col">Share</th>
                      <th className="r sortable" onClick={() => sortBy('bills')}>Bills{arrow('bills')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => (
                      <tr key={m.id} className="no-hover">
                        <td><strong>{m.name}</strong><span className="sub2">{[m.refCode, m.region].filter(Boolean).join(', ')}</span></td>
                        <td className="r num-cell">{money(m.fees, currency)}</td>
                        <td className="r num-cell">{money(m.expenses, currency)}</td>
                        <td className="r num-cell paid-in-cell">{Object.entries(m.paidIn).map(([c, v]) => <span key={c} className={c !== currency ? 'foreign' : ''}>{money(v, c)}</span>)}{!Object.keys(m.paidIn).length && <span className="muted">·</span>}</td>
                        <td className="r num-cell strong">{money(m.total, currency)}</td>
                        <td className="r num-cell muted-num">{money(inOther(m.exactTotal), otherCur)}</td>
                        {hasDirect && <td className="r num-cell direct-col">{m.direct ? money(m.direct, currency) : <span className="muted">·</span>}</td>}
                        {hasDirect && <td className="r num-cell strong">{money(m.full, currency)}</td>}
                        <td className="share-col">
                          {(() => {
                            const base = hasDirect ? now.total + directTotal : now.total;
                            const v = hasDirect ? m.full : m.total;
                            const pct = base ? Math.round((v / base) * 1000) / 10 : 0;
                            return <><div className="share"><span style={{ width: `${pct}%` }} /></div><span className="sub2">{pct}%</span></>;
                          })()}
                        </td>
                        <td className="r">{m.bills}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>{sorted.length} member{sorted.length === 1 ? '' : 's'}</strong></td>
                      <td className="r num-cell">{money(now.fees, currency)}</td>
                      <td className="r num-cell">{money(now.expenses, currency)}</td>
                      <td />
                      <td className="r num-cell strong">{money(now.total, currency)}</td>
                      <td className="r num-cell muted-num">{money(inOther(scope.reduce((t, p) => t + Number(p.amount || 0), 0)), otherCur)}</td>
                      {hasDirect && <td className="r num-cell direct-col">{money(directTotal, currency)}</td>}
                      {hasDirect && <td className="r num-cell strong">{money(now.total + directTotal, currency)}</td>}
                      <td />
                      <td className="r">{now.bills}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title={`Expenses by member, ${scopeLabel}`}
            sub={includeDirect && hasDirect ? 'Claimed expenses plus travel booked by Robot24' : 'What each person spent on hotels, flights, Uber and so on'}
            action={<button className="btn sm no-print" onClick={() => download(`robot24-expenses-${isYear ? year : ym}-${currency}.csv`, expGrid.rows.map((r) => ({ name: r.name, reference: r.refCode, location: r.region, ...Object.fromEntries(expGrid.columns.map((c) => [c.label, r.cats[c.key] || 0])), total: r.total, currency })))}>Export CSV</button>}
          >
            {!expGrid.rows.length ? <p className="empty">No expenses in this period.</p> : (
              <div className="table-wrap">
                <table className="grid-table exp-table">
                  <thead>
                    <tr>
                      <th className="sticky">Member</th>
                      {expGrid.columns.map((c, i) => <th key={c.key} className="r"><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{c.label}</th>)}
                      <th className="r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expGrid.rows.map((r) => (
                      <tr key={r.id} className="no-hover">
                        <td className="sticky"><strong>{r.name}</strong><span className="sub2">{r.region}</span></td>
                        {expGrid.columns.map((c) => <td key={c.key} className="r num-cell">{r.cats[c.key] ? money(r.cats[c.key], currency) : <span className="muted">·</span>}</td>)}
                        <td className="r num-cell strong">{money(r.total, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="sticky"><strong>All members</strong></td>
                      {expGrid.columns.map((c) => <td key={c.key} className="r num-cell">{money(c.total, currency)}</td>)}
                      <td className="r num-cell strong">{money(expGrid.grandTotal, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title={`Year at a glance, ${year}`}
            sub={`Paid to each member by month${hasDirect || direct.length ? ', excluding travel booked by Robot24' : ''}. Darker cells mean more paid that month`}
            action={<button className="btn sm no-print" onClick={() => download(`robot24-year-${year}-${currency}.csv`, grid.rows.map((r) => ({ name: r.name, reference: r.refCode, location: r.region, ...Object.fromEntries(MONTHS.map((m, i) => [m, r.months[i]])), fees: r.fees, expenses: r.expenses, total: r.total, currency })))}>Export CSV</button>}
          >
            {!grid.rows.length ? <p className="empty">Nothing for {year} yet.</p> : (
              <div className="table-wrap">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th className="sticky">Member</th>
                      {MONTHS.map((m, i) => <th key={m} className={`r ${!isYear && i === month ? 'cur' : ''}`}>{m}</th>)}
                      <th className="r">Fees</th>
                      <th className="r">Expenses</th>
                      <th className="r">Year total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((r) => (
                      <tr key={r.id} className="no-hover">
                        <td className="sticky"><strong>{r.name}</strong><span className="sub2">{r.region}</span></td>
                        {r.months.map((v, i) => (
                          <td key={i} className={`r heat ${!isYear && i === month ? 'cur' : ''}`} style={v ? { background: `rgba(26,46,108,${0.07 + 0.78 * (v / grid.max)})`, color: v / grid.max > 0.55 ? '#fff' : undefined } : undefined}>
                            {v ? compact(v, currency) : <span className="muted">·</span>}
                          </td>
                        ))}
                        <td className="r num-cell">{money(r.fees, currency)}</td>
                        <td className="r num-cell">{money(r.expenses, currency)}</td>
                        <td className="r num-cell strong">{money(r.total, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="sticky"><strong>All members</strong></td>
                      {grid.colTotals.map((v, i) => <td key={i} className={`r num-cell ${!isYear && i === month ? 'cur' : ''}`}>{v ? compact(v, currency) : '·'}</td>)}
                      <td className="r num-cell">{money(grid.rows.reduce((a, r) => a + r.fees, 0), currency)}</td>
                      <td className="r num-cell">{money(grid.rows.reduce((a, r) => a + r.expenses, 0), currency)}</td>
                      <td className="r num-cell strong">{money(grid.grandTotal, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <RequireAuth need="finance"><Reports /></RequireAuth>;
}
