'use client';
import { useMemo, useState } from 'react';
import { placeOf, flagOf } from '@/lib/places';
import { findClashes } from '@/lib/schedule';
import { fmtDate } from '@/lib/format';
import Avatar from './Avatar';

const STATUS = { confirmed: 'Booked', planned: 'Planned', completed: 'Completed' };
const ICON = { flights: '✈', train_bus: '🚆', hotel: '🏨' };

// Puts overlapping bars on separate lines
function lanes(items) {
  const ends = [];
  return items.map((it) => {
    let lane = ends.findIndex((e) => e < it.from);
    if (lane === -1) { lane = ends.length; ends.push(it.to); } else ends[lane] = it.to;
    return { ...it, lane };
  });
}

export default function CalendarView({ month, assignments, byId, costs, photos = {}, onOpen }) {
  const [by, setBy] = useState('person');
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOf = (d) => {
    if (d < month) return 1;
    const last = `${month.slice(0, 7)}-${String(n).padStart(2, '0')}`;
    if (d > last) return n;
    return Number(d.slice(8, 10));
  };
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: n }, (_, i) => {
    const date = `${month.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`;
    const wd = new Date(date + 'T00:00:00Z').getUTCDay();
    return { i: i + 1, date, weekend: wd === 0 || wd === 6, letter: 'SMTWTFS'[wd], today: date === today };
  });
  const live = assignments.filter((a) => a.status !== 'cancelled');
  const clashes = useMemo(() => findClashes(live), [live]);

  const rows = useMemo(() => {
    const groups = {};
    for (const a of live) {
      const key = by === 'person' ? a.contractor_id : placeOf(a);
      (groups[key] = groups[key] || []).push(a);
    }
    return Object.entries(groups).map(([key, jobs]) => {
      const bars = lanes(jobs.map((a) => ({ a, from: dayOf(a.start_date), to: dayOf(a.end_date) })).sort((p, q) => p.from - q.from || q.to - p.to));
      const ids = new Set(jobs.map((a) => a.contractor_id));
      const marks = costs.filter((d) => ids.has(d.contractor_id) && d.travel_date && d.travel_date.slice(0, 7) === month.slice(0, 7))
        .map((d) => ({ d, day: dayOf(d.travel_date), icon: ICON[d.category] || '•' }));
      const name = by === 'person' ? (byId[key]?.full_name || 'Unknown') : key;
      return { key, name, bars, marks, laneCount: Math.max(1, ...bars.map((b) => b.lane + 1)) };
    }).sort((p, q) => p.name.localeCompare(q.name));
  }, [live, costs, by, month, byId]);

  const cols = `repeat(${n}, minmax(30px, 1fr))`;

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={by === 'person' ? 'on' : ''} onClick={() => setBy('person')}>By person</button>
          <button className={by === 'country' ? 'on' : ''} onClick={() => setBy('country')}>By country</button>
        </div>
        <span className="cal-legend">
          <span className="cal-key confirmed" /> Booked <span className="cal-key planned" /> Planned <span className="cal-key completed" /> Completed <span className="cal-key clash" /> Clash · ✈ flight 🚆 train 🏨 hotel
        </span>
      </div>
      {!rows.length ? <p className="empty">Nobody is booked this month yet.</p> : (
        <div className="cal-wrap">
          <div className="cal">
            <div className="cal-row cal-head">
              <div className="cal-name" />
              <div className="cal-days" style={{ gridTemplateColumns: cols }}>
                {days.map((d) => <div key={d.i} className={`cal-day ${d.weekend ? 'we' : ''} ${d.today ? 'today' : ''}`}><span>{d.letter}</span>{d.i}</div>)}
              </div>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="cal-row">
                <div className="cal-name">
                  {by === 'person'
                    ? <><Avatar name={r.name} url={photos[byId[r.key]?.photo_path]} size={26} /><span>{r.name}</span></>
                    : <><span className="cal-flag">{flagOf(r.name)}</span><span>{r.name}</span></>}
                </div>
                <div className="cal-days" style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${r.laneCount}, 26px) 18px` }}>
                  {days.map((d) => <div key={d.i} className={`cal-bg ${d.weekend ? 'we' : ''} ${d.today ? 'today' : ''}`} style={{ gridColumn: d.i, gridRow: `1 / span ${r.laneCount + 1}` }} />)}
                  {r.bars.map(({ a, from, to, lane }) => (
                    <button key={a.id} className={`cal-bar ${a.status} ${clashes[a.id] ? 'clash' : ''}`} style={{ gridColumn: `${from} / ${to + 1}`, gridRow: lane + 1 }}
                      title={`${by === 'person' ? '' : `${byId[a.contractor_id]?.full_name || ''}: `}${a.title}${a.event_reference ? ` (${a.event_reference})` : ''}, ${fmtDate(a.start_date)} to ${fmtDate(a.end_date)}, ${STATUS[a.status] || a.status}${clashes[a.id] ? `. Clashes with ${clashes[a.id].map((x) => x.title).join(', ')}` : ''}`}
                      onClick={() => onOpen && onOpen(a)}>
                      {by === 'person' ? a.title : `${(byId[a.contractor_id]?.full_name || '').split(' ')[0]} · ${a.title}`}
                    </button>
                  ))}
                  {r.marks.map(({ d, day, icon }) => (
                    <span key={d.id} className="cal-mark" style={{ gridColumn: day, gridRow: r.laneCount + 1 }} title={`${d.description || d.category}, ${fmtDate(d.travel_date)}${d.end_date ? ` to ${fmtDate(d.end_date)}` : ''}${by === 'country' ? `, ${byId[d.contractor_id]?.full_name || ''}` : ''}`}>{icon}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
