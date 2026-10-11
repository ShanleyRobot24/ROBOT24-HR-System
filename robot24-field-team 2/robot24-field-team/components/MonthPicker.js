'use client';
import { addMonths, monthLabel } from '@/lib/format';

export default function MonthPicker({ month, setMonth, compact = false }) {
  return (
    <div className={`month-picker ${compact ? 'compact' : ''}`}>
      <button className="btn ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
      <label className="month-label">
        <span>{monthLabel(month)}</span>
        <input type="month" value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value + '-01')} aria-label="Choose month" />
      </label>
      <button className="btn ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
    </div>
  );
}
