'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AED_PER_USD } from '@/lib/fx';
import Drawer from './Drawer';

const monthName = (p) => new Date(p + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const thisMonth = () => new Date().toISOString().slice(0, 7) + '-01';

export default function FxPanel({ currencies, rates, month, onClose, refresh }) {
  const [period, setPeriod] = useState(month || thisMonth());
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const forMonth = useMemo(() => Object.fromEntries(rates.filter((r) => r.period === period).map((r) => [r.currency, r])), [rates, period]);
  const list = [...new Set([...currencies, ...rates.map((r) => r.currency)])].filter((c) => c !== 'USD' && c !== 'AED').sort();

  async function save(cur) {
    const v = Number(draft[cur]);
    if (!v || v <= 0) return setMsg(`Enter how many US dollars 1 ${cur} is worth, e.g. 1.27`);
    setBusy(true); setMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('fx_rates').upsert({ currency: cur, period, usd_per_unit: v, source: 'manual', updated_by: user?.id, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return setMsg(error.message);
    setDraft({ ...draft, [cur]: undefined });
    refresh();
  }

  async function fetchToday() {
    if (!list.length) return setMsg('No other currencies to fetch. Every amount is in USD or AED.');
    setBusy(true); setMsg('');
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.result !== 'success' || !data.rates) throw new Error('The rate service did not answer. Enter the rates by hand.');
      const { data: { user } } = await supabase.auth.getUser();
      const month = thisMonth();
      const rows = list.filter((c) => data.rates[c]).map((c) => ({ currency: c, period: month, usd_per_unit: Math.round((1 / data.rates[c]) * 1e6) / 1e6, source: 'ExchangeRate-API', updated_by: user?.id, updated_at: new Date().toISOString() }));
      const missingCur = list.filter((c) => !data.rates[c]);
      if (rows.length) {
        const { error } = await supabase.from('fx_rates').upsert(rows);
        if (error) throw error;
      }
      setPeriod(month);
      setMsg(`Saved today's rates for ${monthName(month)}: ${rows.map((r) => `1 ${r.currency} = ${r.usd_per_unit} USD`).join(', ')}.${missingCur.length ? ` Not available: ${missingCur.join(', ')}, enter by hand.` : ''}`);
      refresh();
    } catch (e) {
      setMsg(`Could not get today's rates: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <Drawer title="Exchange rates" onClose={onClose}>
      <p className="hint">Reports convert every amount to US dollars, then show USD or AED. AED is fixed at {AED_PER_USD} per USD. Other currencies use the rate saved for that month; a month without one uses the closest earlier month.</p>
      <div className="fx-head">
        <label>Month<input type="month" value={period.slice(0, 7)} onChange={(e) => e.target.value && setPeriod(e.target.value + '-01')} /></label>
        <span className="spacer" />
        <button className="btn primary" disabled={busy} onClick={fetchToday}>{busy ? 'Working' : "Get today's rates"}</button>
      </div>
      {msg && <p className="dc-note">{msg}</p>}
      <div className="table-wrap">
        <table className="fx-table">
          <thead><tr><th>Currency</th><th className="r">1 unit in USD</th><th className="r">1 unit in AED</th><th>Saved</th><th></th></tr></thead>
          <tbody>
            <tr className="no-hover"><td><strong>USD</strong></td><td className="r num-cell">1</td><td className="r num-cell">{AED_PER_USD}</td><td className="muted">Base currency</td><td /></tr>
            <tr className="no-hover"><td><strong>AED</strong></td><td className="r num-cell">{(1 / AED_PER_USD).toFixed(6)}</td><td className="r num-cell">1</td><td className="muted">Pegged, never changes</td><td /></tr>
            {list.map((c) => {
              const r = forMonth[c];
              const shown = draft[c] ?? (r ? String(r.usd_per_unit) : '');
              return (
                <tr key={c} className="no-hover">
                  <td><strong>{c}</strong>{!r && <span className="chip warn">No rate for {monthName(period)}</span>}</td>
                  <td className="r"><input className="fx-input" type="number" step="0.000001" min="0" value={shown} placeholder="e.g. 1.27" onChange={(e) => setDraft({ ...draft, [c]: e.target.value })} /></td>
                  <td className="r num-cell">{Number(shown) ? (Number(shown) * AED_PER_USD).toFixed(4) : '·'}</td>
                  <td className="sub-cell">{r ? `${r.source === 'manual' ? 'Entered by hand' : r.source}, ${new Date(r.updated_at).toLocaleDateString('en-GB')}` : <span className="muted">Not saved</span>}</td>
                  <td className="actions">{draft[c] !== undefined && draft[c] !== (r ? String(r.usd_per_unit) : '') && <button className="btn sm primary" disabled={busy} onClick={() => save(c)}>Save</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!list.length && <p className="empty">Every bill and booking so far is in USD or AED, so no rates are needed.</p>}
      <p className="hint fx-credit">Today's rates: <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a>. Past months: enter the rate finance used, e.g. from your bank statement. Every change is recorded in the audit trail.</p>
    </Drawer>
  );
}
