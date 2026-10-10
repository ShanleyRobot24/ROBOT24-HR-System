'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { callApi } from '@/lib/api';
import RobotHead from './RobotHead';

const PAGE = { '/home': 'Home', '/people': 'People', '/jobs': 'Jobs', '/money': 'Money', '/reports': 'Reports', '/admin': 'Admin' };

function suggestionsFor({ isFinance, isAdmin, isApprover }) {
  const s = isFinance
    ? ["How do I upload this month's invoices?", 'How do I mark a bill paid?', 'What does a Check flag mean?', 'How do I see what an event cost?']
    : ['How do I add an assignment?', 'How do I upload a hotel booking?', 'How do I split a shared receipt?', 'How do I send a job brief?'];
  if (isApprover) s.unshift('How do I approve bills?');
  if (isAdmin) s.push('How do I add a new user?');
  return s.slice(0, 5);
}

// **bold** for button and page names
function Rich({ text }) {
  const parts = String(text || '').split('**');
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}</>;
}

export default function HelpBot() {
  const auth = useAuth();
  const { session, profile } = auth;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const bottom = useRef(null);
  const input = useRef(null);
  const first = (profile?.full_name || profile?.email || '').split(/[\s@.]/)[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, open]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150); }, [open]);
  // A friendly wave the first time someone visits on this device
  useEffect(() => {
    try {
      if (!session || localStorage.getItem('r24-robbie-waved')) return;
      const t = setTimeout(() => setHint(true), 2500);
      const u = setTimeout(() => setHint(false), 12000);
      localStorage.setItem('r24-robbie-waved', '1');
      return () => { clearTimeout(t); clearTimeout(u); };
    } catch { /* storage off */ }
  }, [session]);

  if (!session || pathname === '/login') return null;

  async function ask(text) {
    const question = String(text || q).trim();
    if (!question || busy) return;
    setQ('');
    const history = msgs.flatMap((m) => (m.role === 'user' ? [{ role: 'user', text: m.text }] : m.answer ? [{ role: 'assistant', text: [m.answer.intro, ...m.answer.steps].join('\n') }] : []));
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const answer = await callApi('/api/process-invoice', { mode: 'help', question, history, page: PAGE[pathname] || pathname });
      setMsgs((m) => [...m, { role: 'bot', answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', answer: { intro: `Bzzt, my circuits hiccupped (${e.message}). Try asking again in a moment.`, steps: [], tip: null, go: null } }]);
    }
    setBusy(false);
  }

  function go(path) {
    router.push(path);
    if (window.innerWidth < 700) setOpen(false);
  }

  return (
    <>
      {!open && hint && <button className="robbie-hint" onClick={() => { setHint(false); setOpen(true); }}>Hi{name ? ` ${name}` : ''}! Stuck? Ask me how to do anything.</button>}
      <button className={`robbie-fab ${open ? 'open' : ''}`} onClick={() => { setOpen(!open); setHint(false); }} aria-label={open ? 'Close help' : 'Ask Robbie for help'} title="Ask Robbie for help">
        {open ? <span className="robbie-x">×</span> : <RobotHead size={44} mood={busy ? 'thinking' : 'idle'} />}
      </button>

      {open && (
        <section className="robbie-panel" role="dialog" aria-label="Robbie, your help assistant">
          <header className="robbie-head">
            <RobotHead size={46} mood={busy ? 'thinking' : 'happy'} />
            <div>
              <strong>Robbie</strong>
              <span>{busy ? 'Thinking…' : 'Your Field Team helper'}</span>
            </div>
            {msgs.length > 0 && <button className="robbie-reset" onClick={() => setMsgs([])}>Start over</button>}
            <button className="robbie-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>

          <div className="robbie-body">
            <div className="robbie-msg bot">
              <p>Beep! Hi{name ? ` ${name}` : ''}, I'm Robbie. Ask me how to do anything in the app and I'll walk you through it step by step.</p>
            </div>
            {!msgs.length && (
              <div className="robbie-chips">
                {suggestionsFor(auth).map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (m.role === 'user' ? (
              <div key={i} className="robbie-msg user"><p>{m.text}</p></div>
            ) : (
              <div key={i} className="robbie-msg bot">
                {m.answer.intro && <p><Rich text={m.answer.intro} /></p>}
                {m.answer.steps.length > 0 && <ol>{m.answer.steps.map((s, j) => <li key={j}><Rich text={s} /></li>)}</ol>}
                {m.answer.tip && <p className="robbie-tip"><span aria-hidden>💡</span> <Rich text={m.answer.tip} /></p>}
                {m.answer.go && <button className="robbie-go" onClick={() => go(m.answer.go)}><span>Take me there →</span><small>{m.answer.goLabel}</small></button>}
              </div>
            )))}
            {busy && <div className="robbie-msg bot typing"><span /><span /><span /></div>}
            <div ref={bottom} />
          </div>

          <form className="robbie-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="How do I…" maxLength={600} />
            <button className="btn primary" disabled={busy || !q.trim()}>Ask</button>
          </form>
        </section>
      )}
    </>
  );
}
