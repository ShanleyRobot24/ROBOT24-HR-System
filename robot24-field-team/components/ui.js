'use client';
// Small shared pieces: camera upload, approver checks box, empty pages, loading outlines
import Link from 'next/link';

// "Take photo" opens the phone camera directly. Shown only on phones and tablets.
export function CameraButton({ onFile, label = 'Take photo', disabled = false }) {
  return (
    <label className={`btn camera-btn ${disabled ? 'disabled' : ''}`}>
      <span aria-hidden>📷</span> {label}
      <input type="file" accept="image/*" capture="environment" hidden disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );
}

// The approver summary box
export function CheckList({ items, title = 'Things to check before approving' }) {
  if (!items) return null;
  if (!items.length) return <div className="checks ok"><strong>Nothing unusual found.</strong> <span className="hint">Amounts, dates and duplicates all look normal.</span></div>;
  return (
    <div className="checks">
      <strong>{title} ({items.length})</strong>
      <ul>{items.map((c, i) => <li key={i} className={c.level}>{c.text}</li>)}</ul>
    </div>
  );
}

// An empty page that says what to do next, with the one button to press
export function EmptyState({ title, text, action, href, onClick }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action && (href ? <Link className="btn primary" href={href}>{action}</Link> : <button className="btn primary" onClick={onClick}>{action}</button>)}
    </div>
  );
}

// Grey outline of a page while it loads for the first time
export function Skeleton({ rows = 5, cards = 0 }) {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      {cards > 0 && <div className="skel-cards">{Array.from({ length: cards }, (_, i) => <div key={i} className="skel-card" />)}</div>}
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel-row" style={{ width: `${96 - (i % 3) * 9}%` }} />)}
    </div>
  );
}
