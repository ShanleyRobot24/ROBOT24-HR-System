// Freelancers are booked and paid by the day. The 10 and 15 day package rates were legacy contracts:
// they are kept on file for history, but are only used to estimate a day rate for anyone without one.
const r2 = (n) => Math.round(n * 100) / 100;

export function dayRateOf(c) {
  if (!c) return { rate: null, estimated: false, note: 'No rate on file' };
  if (Number(c.day_rate)) return { rate: Number(c.day_rate), estimated: false, note: 'day rate' };
  if (Number(c.ten_day_rate)) return { rate: r2(Number(c.ten_day_rate) / 10), estimated: true, note: 'estimated from old 10 day rate' };
  if (Number(c.fifteen_day_rate)) return { rate: r2(Number(c.fifteen_day_rate) / 15), estimated: true, note: 'estimated from old 15 day rate' };
  return { rate: null, estimated: false, note: 'No rate on file' };
}

// Expected fee for a number of days worked
export function expectedFee(c, days) {
  const d = Number(days);
  const { rate } = dayRateOf(c);
  return d && rate ? r2(rate * d) : null;
}

// "US$350.00 a day", or "US$135.00 a day (estimated from old 10 day rate)"
export function dayRateText(c, money, cur) {
  const { rate, estimated, note } = dayRateOf(c);
  if (!rate) return 'No day rate on file';
  return `${money(rate, cur || c.currency)} a day${estimated ? ` (${note})` : ''}`;
}
