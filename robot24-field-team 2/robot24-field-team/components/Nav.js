'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { clearSticky } from '@/lib/sticky';
import { useMonth } from '@/lib/monthStore';
import { useAuth } from './AuthProvider';
import Wordmark from './Wordmark';
import Drawer from './Drawer';
import Icon from './Icon';
import MonthPicker from './MonthPicker';

// Pages that work by month show the shared month picker in the navy strip
const MONTH_PAGES = ['/home', '/jobs', '/money', '/staff'];

export default function Nav() {
  const { session, profile, isFinance, isAdmin, isApprover, isAssignments, isStaff } = useAuth();
  const path = usePathname();
  const { month, setMonth } = useMonth();
  const [pw, setPw] = useState(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  if (!session || path === '/login') return null;

  const sections = [
    ['/home', 'Home', 'home', true],
    ['/people', 'People', 'people', true],
    ['/jobs', 'Jobs', 'jobs', isAssignments],
    ['/money', 'Money', 'money', isFinance || isApprover],
    ['/reports', 'Reports', 'reports', isFinance],
    ['/staff', 'Staff', 'staff', isStaff],
    ['/admin', 'Admin', 'admin', isAdmin],
  ].filter((s) => s[3]);

  async function savePassword(e) {
    e.preventDefault();
    if (pw.a.length < 8) return setPw({ ...pw, msg: 'Use at least 8 characters.' });
    if (pw.a !== pw.b) return setPw({ ...pw, msg: 'The two passwords do not match.' });
    setPw({ ...pw, busy: true, msg: '' });
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setPw(error ? { ...pw, busy: false, msg: error.message } : { a: '', b: '', done: true });
  }
  const name = profile?.full_name || (profile?.email || '').split('@')[0];
  const initials = name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const showMonth = MONTH_PAGES.some((p) => path.startsWith(p));

  return (
    <header className="site-head">
      <div className="topbar">
        <Link href="/home" aria-label="Home"><Wordmark /></Link>
        <nav className="main-nav" aria-label="Main">
          {sections.map(([href, label, icon]) => (
            <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''}><Icon name={icon} size={18} /><span>{label}</span></Link>
          ))}
        </nav>
        <div className="user-menu" ref={menuRef}>
          <button className="user-btn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            <span className="user-dot">{initials}</span><span className="user-name">{name.split(' ')[0]}</span><span aria-hidden>▾</span>
          </button>
          {menu && (
            <div className="user-list" role="menu">
              <p className="user-email">{profile?.email}</p>
              <button role="menuitem" onClick={() => { setMenu(false); setPw({ a: '', b: '' }); }}>Change password</button>
              <button role="menuitem" onClick={() => { clearSticky(); supabase.auth.signOut(); }}>Sign out</button>
            </div>
          )}
        </div>
      </div>
      <div className="ticker">
        <span className="ticker-pill">FIELD TEAM</span>
        {showMonth ? <MonthPicker month={month} setMonth={setMonth} compact /> : <span className="ticker-gap" />}
        <span className="ticker-date">{today}</span>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {sections.map(([href, label, icon]) => (
          <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''}><Icon name={icon} size={22} /><span>{label}</span></Link>
        ))}
      </nav>

      {pw && (
        <Drawer title="Change your password" onClose={() => setPw(null)}>
          {pw.done ? (
            <div className="cred"><p className="cred-ok">Password changed. Use it next time you sign in.</p><div className="drawer-actions"><span className="spacer" /><button className="btn primary" onClick={() => setPw(null)}>Done</button></div></div>
          ) : (
            <form className="add-user" onSubmit={savePassword}>
              <label>New password<input type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoFocus /></label>
              <label>Type it again<input type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></label>
              {pw.msg && <p className="err">{pw.msg}</p>}
              <div className="drawer-actions"><span className="hint">At least 8 characters.</span><span className="spacer" /><button className="btn primary" disabled={pw.busy}>{pw.busy ? 'Saving' : 'Change password'}</button></div>
            </form>
          )}
        </Drawer>
      )}
    </header>
  );
}
