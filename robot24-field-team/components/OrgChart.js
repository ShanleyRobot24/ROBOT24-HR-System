'use client';
import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { callApi } from '@/lib/api';
import { useUndo } from './Undo';
import Drawer from './Drawer';
import { useHandOff } from '@/lib/sticky';

// The org chart: who reports to whom. Drag a person onto their new manager (or onto the top row).
// On a phone, tap a person and choose who they report to.
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const HUE = (d) => { let h = 0; for (const c of String(d || 'x')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export default function OrgChart({ staff, refresh, onOpen }) {
  const { showUndo } = useUndo();
  const people = useMemo(() => staff.filter((s) => s.status !== 'terminated'), [staff]);
  const byId = useMemo(() => Object.fromEntries(people.map((s) => [s.id, s])), [people]);
  const kids = useMemo(() => {
    const k = {};
    for (const s of people) { const m = s.manager_id && byId[s.manager_id] ? s.manager_id : 'top'; (k[m] = k[m] || []).push(s); }
    for (const v of Object.values(k)) v.sort((a, b) => (k[b.id]?.length || 0) - (k[a.id]?.length || 0) || a.full_name.localeCompare(b.full_name));
    return k;
  }, [people, byId]);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [closed, setClosed] = useState({});
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState('');
  const [suggest, setSuggest] = useState(null);
  const [busy, setBusy] = useState('');
  // Robbie: several reporting lines at once, shown for review like a suggestion
  useHandOff('org:lines', (h) => {
    const find = (n) => { const w = String(n || '').toLowerCase().split(/\s+/).filter(Boolean); const m = people.filter((x) => w.length && w.every((v) => x.full_name.toLowerCase().includes(v))); return m.length === 1 ? m[0] : null; };
    const lines = (h.lines || []).map((l) => { const p = find(l.person); const m = l.reports_to && !/^(nobody|none|no one)$/i.test(l.reports_to) ? find(l.reports_to) : null; return p ? { id: p.id, manager_id: m ? m.id : null, reason: m || !l.reports_to || /^(nobody|none|no one)$/i.test(l.reports_to) ? 'From Robbie' : `From Robbie: no one matched "${l.reports_to}"`, apply: !!m || !l.reports_to } : null; }).filter(Boolean);
    setSuggest(lines);
  }, people.length > 0);
  const leaders = (kids.top || []).filter((s) => kids[s.id]?.length);
  const loose = (kids.top || []).filter((s) => !kids[s.id]?.length);

  const below = (a, b) => { let cur = byId[b]?.manager_id, n = 0; while (cur && n < 60) { if (cur === a) return true; cur = byId[cur]?.manager_id; n += 1; } return false; };

  async function move(personId, managerId) {
    const p = byId[personId];
    if (!p || personId === managerId || (p.manager_id || null) === (managerId || null)) return;
    if (managerId && below(personId, managerId)) return alert(`${byId[managerId].full_name} reports to ${p.full_name}, so ${p.full_name} can't report to them.`);
    const before = p.manager_id || null;
    const { error } = await supabase.from('staff').update({ manager_id: managerId || null }).eq('id', personId);
    if (error) return alert(error.message);
    refresh();
    showUndo(managerId ? `${p.full_name} now reports to ${byId[managerId].full_name}` : `${p.full_name} moved to the top`, async () => {
      await supabase.from('staff').update({ manager_id: before }).eq('id', personId);
      refresh();
    });
  }

  async function getSuggestions() {
    const note = prompt('Anything the AI should know? (optional, e.g. "Vismay leads the writers")', '');
    if (note === null) return;
    setBusy('Working out the reporting lines from job titles');
    try {
      const out = await callApi('/api/process-invoice', { mode: 'org', note });
      const changes = out.lines.filter((l) => (byId[l.id]?.manager_id || null) !== (l.manager_id || null)).map((l) => ({ ...l, apply: true }));
      setSuggest(changes);
    } catch (e) { alert(`Could not suggest: ${e.message}`); }
    setBusy('');
  }
  async function applySuggestions() {
    const chosen = suggest.filter((c) => c.apply);
    setBusy(`Applying ${chosen.length} changes`);
    // Leaders first, so nobody briefly points at someone mid-move
    const order = [...chosen].sort((a, b) => (a.manager_id ? 1 : 0) - (b.manager_id ? 1 : 0));
    const failed = [];
    for (const c of order) {
      const { error } = await supabase.from('staff').update({ manager_id: c.manager_id }).eq('id', c.id);
      if (error) failed.push(`${byId[c.id]?.full_name}: ${error.message}`);
    }
    setBusy(''); setSuggest(null); refresh();
    if (failed.length) alert(`Some changes were not made:\n${failed.join('\n')}`);
  }

  const match = (s) => q && `${s.full_name} ${s.job_title || ''}`.toLowerCase().includes(q.toLowerCase());
  function Card({ s }) {
    const n = kids[s.id]?.length || 0;
    return (
      <div className={`org-card ${over === s.id ? 'over' : ''} ${dragging === s.id ? 'dragging' : ''} ${match(s) ? 'hit' : ''}`}
        draggable onDragStart={(e) => { setDragging(s.id); e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragging(null); setOver(null); }}
        onDragOver={(e) => { if (dragging && dragging !== s.id) { e.preventDefault(); setOver(s.id); } }}
        onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setOver(null); move(id, s.id); }}
        onClick={() => setPicked(s)}
        title="Drag onto someone to change who they report to, or click for options">
        <span className="org-dot" style={{ background: `hsl(${HUE(s.department || s.job_title)} 45% 42%)` }}>{initials(s.full_name)}</span>
        <span className="org-text"><strong>{s.full_name}</strong><small>{s.job_title || 'No title'}</small></span>
        {n > 0 && <button type="button" className="org-toggle" onClick={(e) => { e.stopPropagation(); setClosed({ ...closed, [s.id]: !closed[s.id] }); }}>{closed[s.id] ? `+${n}` : n}</button>}
      </div>
    );
  }
  function Branch({ s }) {
    const k = kids[s.id] || [];
    return (
      <li>
        <Card s={s} />
        {k.length > 0 && !closed[s.id] && <ul>{k.map((c) => <Branch key={c.id} s={c} />)}</ul>}
      </li>
    );
  }

  return (
    <>
      <div className="toolbar">
        <input className="search" placeholder="Find someone" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="hint" style={{ margin: 0 }}>Drag a person onto their manager. Click anyone for options.</span>
        <span className="spacer" />
        <button className="btn" data-tour="org-suggest" onClick={getSuggestions} disabled={!!busy}>Suggest from job titles</button>
      </div>
      {busy && <p className="dc-note">{busy}…</p>}
      <div className={`org-top ${over === 'top' ? 'over' : ''}`} onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver('top'); } }} onDragLeave={() => setOver((o) => (o === 'top' ? null : o))}
        onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), null); }}>
        Drop here to put someone at the top (reporting to no one)
      </div>
      <div className="org-wrap" data-tour="org-chart">
        {leaders.length === 0 && <p className="empty">Nobody reports to anyone yet. Drag people onto their managers, or click Suggest from job titles.</p>}
        <ul className="org-tree">{leaders.map((s) => <Branch key={s.id} s={s} />)}</ul>
      </div>
      {loose.length > 0 && (
        <section className="chart-card org-loose">
          <h3>Not placed yet ({loose.length})</h3>
          <p className="hint">Nobody reports to them and they report to nobody. Drag them onto their manager.</p>
          <div className="org-loose-grid">{loose.map((s) => <Card key={s.id} s={s} />)}</div>
        </section>
      )}

      {picked && (
        <Drawer title={picked.full_name} onClose={() => setPicked(null)}>
          <div className="add-user">
            <p className="hint">{picked.job_title || 'No title'}{kids[picked.id]?.length ? ` · ${kids[picked.id].length} reporting to them: ${kids[picked.id].map((x) => x.full_name).join(', ')}` : ''}</p>
            <label>Reports to
              <select value={picked.manager_id || ''} onChange={(e) => { move(picked.id, e.target.value || null); setPicked(null); }}>
                <option value="">Nobody (top of the chart)</option>
                {people.filter((x) => x.id !== picked.id && !below(picked.id, x.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)).map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.job_title ? ` · ${x.job_title}` : ''}</option>)}
              </select>
            </label>
            <div className="drawer-actions"><span className="spacer" /><button className="btn" onClick={() => { setPicked(null); onOpen(picked); }}>Open their profile</button></div>
          </div>
        </Drawer>
      )}

      {suggest && (
        <Drawer title="Suggested reporting lines" onClose={() => setSuggest(null)}>
          {!suggest.length ? <p className="empty">The chart already matches the suggestion.</p> : (
            <>
              <p className="hint">{suggest.length} changes. Untick any you don't want, then apply. Each one can be changed later by dragging.</p>
              <ul className="files-list">
                {suggest.map((c, i) => (
                  <li key={c.id}>
                    <label className="check"><input type="checkbox" checked={c.apply} onChange={(e) => setSuggest(suggest.map((x, j) => (j === i ? { ...x, apply: e.target.checked } : x)))} />
                      <span><strong>{byId[c.id]?.full_name}</strong> → {c.manager_id ? byId[c.manager_id]?.full_name : 'top of the chart'}<span className="sub2">{byId[c.id]?.job_title}{c.reason ? ` · ${c.reason}` : ''}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="drawer-actions"><button className="btn ghost" onClick={() => setSuggest(null)}>Cancel</button><span className="spacer" /><button className="btn primary" disabled={!!busy || !suggest.some((c) => c.apply)} onClick={applySuggestions}>Apply {suggest.filter((c) => c.apply).length} changes</button></div>
            </>
          )}
        </Drawer>
      )}
    </>
  );
}
