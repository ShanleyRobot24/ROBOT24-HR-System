import { cur3 } from './format';
// Currency conversion for reports. Everything is converted to US dollars first, then shown in USD or AED.
// AED is pegged to the dollar at 3.6725, so USD <-> AED is exact. Other currencies use the rate saved
// for that month in Exchange rates; a month without one uses the closest earlier month, then the closest later one.

export const AED_PER_USD = 3.6725;
export const REPORT_CURRENCIES = ['USD', 'AED'];
const r2 = (n) => Math.round(n * 100) / 100;

export function makeFx(rates) {
  const byCur = {};
  for (const r of rates || []) (byCur[r.currency] = byCur[r.currency] || []).push(r);
  for (const k of Object.keys(byCur)) byCur[k].sort((a, b) => a.period.localeCompare(b.period));

  // USD value of one unit of `currency` in the month of `period` (YYYY-MM-DD), or null if unknown
  function usdPerUnit(currency, period) {
    const cur = cur3(currency);
    if (cur === 'USD') return 1;
    if (cur === 'AED') return 1 / AED_PER_USD;
    const list = byCur[cur];
    if (!list?.length) return null;
    const month = (period || '').slice(0, 7) + '-01';
    let pick = null;
    for (const r of list) { if (r.period <= month) pick = r; else break; }
    return Number((pick || list[0]).usd_per_unit);
  }

  function rateUsed(currency, period) {
    const cur = cur3(currency);
    if (cur === 'USD' || cur === 'AED') return { exact: true };
    const list = byCur[cur];
    if (!list?.length) return null;
    const month = (period || '').slice(0, 7) + '-01';
    let pick = null;
    for (const r of list) { if (r.period <= month) pick = r; else break; }
    const used = pick || list[0];
    return { ...used, sameMonth: used.period === month };
  }

  // Convert an amount to the report currency (USD or AED). Returns null when no rate is known.
  function convert(amount, currency, period, to = 'USD') {
    const u = usdPerUnit(currency, period);
    if (u === null) return null;
    const usd = Number(amount || 0) * u;
    return r2(to === 'AED' ? usd * AED_PER_USD : usd);
  }

  return { usdPerUnit, rateUsed, convert };
}
