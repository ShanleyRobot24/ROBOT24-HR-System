'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { clearSticky } from '@/lib/sticky';
import { useMonth } from '@/lib/monthStore';
import { useAuth } from './AuthProvider';
import { Wordmark } from './Brand';
import Drawer from './Drawer';
import { Icon } from './Brand';
import { MonthPicker } from './Brand';

// Pages that work by month show the shared month picker in the navy strip
const MONTH_PAGES = ['/home', '/jobs', '/money', '/staff'];

// Two separate portals: the field team (freelancers) and Staff (Robot24 employees). The gate page at / chooses between them.

export default function Nav() {
  const { session, profile, isFinance, isAdmin, isApprover, isAssignments, isStaff, hasMe, isEmployee } = useAuth();
  const path = usePathname();
  const sp = useSearchParams();
  const portal = path.startsWith('/staff') ? 'staff' : path.startsWith('/me') ? 'me' : 'field';
  const portals = [!isEmployee && ['field', '/home', 'Field team'], isStaff && ['staff', '/staff', 'HR'], hasMe && ['me', '/me', 'My Robot24']].filter(Boolean);
  const staffTab = sp.get('tab') || 'overview';
  const meTab = sp.get('tab') || 'overview';
  const { month, setMonth } = useMonth();
  const [pw, setPw] = useState(null);
  const [menu, setMenu] = useState(false);
  const [team, setTeam] = useState({ size: 0, waiting: 0 }); // people who report to me, and their leave waiting for me
  useEffect(() => {
    if (!hasMe) return;
    Promise.all([supabase.rpc('my_team'), supabase.from('leave_requests').select('staff_id, status').eq('status', 'pending')]).then(([t, l]) => {
      const ids = new Set((t.data || []).map((x) => x.id));
      setTeam({ size: ids.size, waiting: (l.data || []).filter((x) => ids.has(x.staff_id)).length });
    });
  }, [hasMe, path]);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  if (!session || path === '/login' || path === '/reset-password') return null;

  const sections = (portal === 'me' ? [
    ['/me?tab=overview', 'Overview', 'home', true, path === '/me' && meTab === 'overview'],
    ['/me?tab=leave', 'My leave', 'calendar', true, path === '/me' && meTab === 'leave'],
    ['/me?tab=documents', 'My documents', 'file', true, path === '/me' && meTab === 'documents'],
    ['/me?tab=team', team.waiting ? `My team (${team.waiting})` : 'My team', 'people', team.size > 0, path === '/me' && meTab === 'team'],
  ] : portal === 'staff' ? [
    ['/staff?tab=overview', 'Overview', 'home', true, path === '/staff' && staffTab === 'overview'],
    ['/staff?tab=staff', 'Staff', 'staff', true, path === '/staff' && staffTab === 'staff'],
    ['/staff?tab=org', 'Org chart', 'people', true, path === '/staff' && staffTab === 'org'],
    ['/staff?tab=leave', 'Leave', 'calendar', true, path === '/staff' && staffTab === 'leave'],
    ['/staff?tab=payroll', 'Payroll', 'money', true, path === '/staff' && staffTab === 'payroll'],
    ['/staff?tab=reports', 'Reports', 'reports', true, path === '/staff' && staffTab === 'reports'],
  ] : [
    ['/home', 'Home', 'home', true],
    ['/people', 'People', 'people', true],
    ['/jobs', 'Jobs', 'jobs', isAssignments],
    ['/money', 'Money', 'money', isFinance || isApprover],
    ['/reports', 'Reports', 'reports', isFinance],
    ['/admin', 'Admin', 'admin', isAdmin],
  ]).filter((s) => s[3]).map(([href, label, icon, , on]) => [href, label, icon, on ?? path.startsWith(href)]);
  const gate = path === '/';

  async function savePassword(e) {
    e.preventDefault();
    if (pw.a.length < 8) return setPw({ ...pw, msg: 'Use at least 8 characters.' });
    if (pw.a !== pw.b) return setPw({ ...pw, msg: 'The two passwords do not match.' });
    setPw({ ...pw, busy: true, msg: '' });
    const { error } = await supabase.auth.updateUser({ password: pw.a, data: { must_change_password: false } });
    setPw(error ? { ...pw, busy: false, msg: error.message } : { a: '', b: '', done: true });
  }
  const name = profile?.full_name || (profile?.email || '').split('@')[0];
  const initials = name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const showMonth = MONTH_PAGES.some((p) => path.startsWith(p));

  return (
    <header className="site-head">
      <div className={`topbar ${gate ? 'gate-bar' : ''}`}>
        <Link href={portals.length > 1 ? '/' : portals[0]?.[1] || '/home'} aria-label="Home"><Wordmark sub={gate ? '' : portal === 'staff' ? 'HR' : portal === 'me' ? 'My Robot24' : 'Field Team'} /></Link>
        {portals.length > 1 && !gate && (
          <div className="portal-switch" role="tablist" aria-label="Portal" data-tour="portal-switch">
            {portals.map(([k, href, label]) => <Link key={k} href={href} className={portal === k ? 'on' : ''}>{label}</Link>)}
          </div>
        )}
        {!gate && (
          <nav className="main-nav" aria-label="Main" data-tour="menu">
            {sections.map(([href, label, icon, on]) => (
              <Link key={href} href={href} className={on ? 'on' : ''}><Icon name={icon} size={18} /><span>{label}</span></Link>
            ))}
          </nav>
        )}
        <div className="user-menu" ref={menuRef} data-tour="user-menu">
          <button className="user-btn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            <span className="user-dot">{initials}</span><span className="user-name">{name.split(' ')[0]}</span><span aria-hidden>▾</span>
          </button>
          {menu && (
            <div className="user-list" role="menu">
              <p className="user-email">{profile?.email}<span className="user-build">Version {process.env.R24_BUILT ? new Date(process.env.R24_BUILT).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' }) : 'unknown'}</span></p>
              <button role="menuitem" onClick={() => { setMenu(false); setPw({ a: '', b: '' }); }}>Change password</button>
              <button role="menuitem" onClick={() => { setMenu(false); window.dispatchEvent(new Event('r24-tour')); }}>Take the tour again</button>
              <button role="menuitem" onClick={() => { clearSticky(); supabase.auth.signOut(); }}>Sign out</button>
            </div>
          )}
        </div>
      </div>
      <div className="ticker">
        <span className="ticker-pill">{gate ? 'ROBOT24' : portal === 'staff' ? 'HR' : portal === 'me' ? 'MY ROBOT24' : 'FIELD TEAM'}</span>
        {showMonth ? <span data-tour="month"><MonthPicker month={month} setMonth={setMonth} compact /></span> : <span className="ticker-gap" />}
        <span className="ticker-date">{today}</span>
      </div>

      <nav className="bottom-nav" aria-label="Main" data-tour="menu-phone">
        {!gate && sections.map(([href, label, icon, on]) => (
          <Link key={href} href={href} className={on ? 'on' : ''}><Icon name={icon} size={22} /><span>{label}</span></Link>
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
