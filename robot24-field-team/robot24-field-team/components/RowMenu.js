'use client';
import { useEffect, useRef, useState } from 'react';

// The "⋯" menu on a row. items: [{ label, onClick, danger }]
export default function RowMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="rowmenu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn ghost sm rowmenu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <span className="rowmenu-list" role="menu">
          {items.filter(Boolean).map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
