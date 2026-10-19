'use client';
import { addMonths, monthLabel } from '@/lib/format';
// Small shared drawing pieces: the Robot24 wordmark, Robbie's head, menu icons and the month picker.

// ---------- Wordmark ----------
// ROBOT24.com wordmark, drawn in text so it stays sharp at any size
export function Wordmark({ sub = 'Field Team', big = false }) {
  return (
    <span className={`brand ${big ? 'big' : ''}`}>
      <span className="wordmark" aria-label="Robot24.com">ROBOT<span className="n24">24</span><span className="dotcom">.com</span></span>
      {sub && <span className="brand-sub">{sub}</span>}
    </span>
  );
}

// ---------- RobotHead ----------
// Robbie's head. mood: 'idle' | 'thinking' | 'happy'
export function RobotHead({ size = 40, mood = 'idle' }) {
  return (
    <svg className={`robbie robbie-${mood}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="5" x2="32" y2="14" stroke="#cddcf0" strokeWidth="3" strokeLinecap="round" />
      <circle className="robbie-light" cx="32" cy="6" r="4.5" fill="#6f9be0" />
      <rect x="6" y="26" width="6" height="14" rx="3" fill="#b7cde9" />
      <rect x="52" y="26" width="6" height="14" rx="3" fill="#b7cde9" />
      <rect x="10" y="13" width="44" height="40" rx="13" fill="#ffffff" stroke="#b7cde9" strokeWidth="2" />
      <rect x="15" y="20" width="34" height="22" rx="9" fill="#0f1d44" />
      <g className="robbie-eyes">
        <ellipse cx="25" cy="30" rx="4" ry="4.5" fill="#8fd3ff" />
        <ellipse cx="39" cy="30" rx="4" ry="4.5" fill="#8fd3ff" />
        <circle cx="26.3" cy="28.6" r="1.3" fill="#ffffff" />
        <circle cx="40.3" cy="28.6" r="1.3" fill="#ffffff" />
      </g>
      <path className="robbie-mouth" d="M26 46 Q32 50.5 38 46" fill="none" stroke="#1f3f8f" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17" cy="45" r="2.2" fill="#f4b6c2" opacity=".8" />
      <circle cx="47" cy="45" r="2.2" fill="#f4b6c2" opacity=".8" />
    </svg>
  );
}

// ---------- Icon ----------
// Simple line icons for the navigation
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
  jobs: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm5 0V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18',
  money: 'M3 7h18v12H3zM3 11h18M7 15h3',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 2h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  alert: 'M12 3l10 18H2zM12 10v4M12 17v.5',
  plane: 'M2 13l8-2 4-8 2 1-2 8 6 2 2 3-9-2-4 6-2-1 2-6-6 1z',
  check: 'M4 12l5 5L20 6',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  staff: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 17a4 4 0 0 1 8 0',
};
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.home} />
    </svg>
  );
}

// ---------- MonthPicker ----------
export function MonthPicker({ month, setMonth, compact = false }) {
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
