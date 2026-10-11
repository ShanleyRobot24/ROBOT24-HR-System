'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { addMonths, fmtDate, monthLabel, money, totalsByCurrency } from '@/lib/format';
import { categoryLabel } from '@/lib/categories';
import { placeOf, flagOf } from '@/lib/places';
import MonthPicker from './MonthPicker';
import { useMonth } from '@/lib/monthStore';
import Avatar from './Avatar';
import Drawer from './Drawer';
import { findClashes, travelMismatch } from '@/lib/schedule';

const GROUPS = [
  ['confirmed', 'Booked', 'info'],
  ['planned', 'Planned', 'neutral'],
  ['completed', 'Completed', 'ok'],
  ['cancelled', 'Cancelled', 'alert'],
];
const days = (a, from, to) => {
  const s = a.start_date > from ? a.start_date : from;
  const e = a.end_date < to ? a.end_date : to;
  return s > e ? 0 : Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1;
};

// A person's jobs and travel for a month. Used from the Directory, for every access level.
export default function PersonSchedule({ person, photoUrl, onClose }) {
  const { month: shared } = useMonth();
  const [month, setMonth] = useState(shared);
  const [jobs, setJobs] = useState([]);
  const [travel, setTravel] = useState([]);
  const [loading, setLoading] = useState(true);
  const monthEnd = new Date(Date.parse(addMonths(month, 1)) - 864e5).toISOString().slice(0, 10);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      supabase.from('assignments').select('*').eq('contractor_id', person.id).lte('start_date', monthEnd).gte('end_date', month).order('start_date'),
      supabase.from('direct_costs').select('*').eq('contractor_id', person.id).eq('period', month).order('travel_date'),
    ]).then(([a, d]) => {
      if (!live) return;
      setJobs(a.data || []);
      setTravel(d.data || []);
      setLoading(false);
    });
    return () => { live = false; };
  }, [person.id, month, monthEnd]);

  const clashes = findClashes(jobs);
  const sum = (st) => jobs.filter((j) => j.status === st).reduce((t, j) => t + days(j, month, monthEnd), 0);
  const travelFor = (id) => travel.filter((d) => d.assignment_id === id);
  const loose = travel.filter((d) => !d.assignment_id || !jobs.some((j) => j.id === d.assignment_id));

  return (
    <Drawer title={person.full_name} onClose={onClose}>
      <div className="ps-head">
        <Avatar name={person.full_name} url={photoUrl} size={64} />
        <div>
          <p className="ps-role">{[person.designation, person.city, person.region].filter(Boolean).join(' · ')}</p>
          <p className="sub2">{[person.ref_code, person.phone, person.email].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <MonthPicker month={month} setMonth={setMonth} />

      <div className="ps-sum">
        <div className="ps-tile info"><strong>{sum('confirmed')}</strong><span>{sum('confirmed') === 1 ? 'day' : 'days'} booked</span></div>
        <div className="ps-tile neutral"><strong>{sum('planned')}</strong><span>{sum('planned') === 1 ? 'day' : 'days'} planned</span></div>
        <div className="ps-tile ok"><strong>{sum('completed')}</strong><span>{sum('completed') === 1 ? 'day' : 'days'} completed</span></div>
        <div className="ps-tile"><strong>{travel.length}</strong><span>travel booking{travel.length === 1 ? '' : 's'}</span></div>
      </div>

      {loading ? <p className="page-msg">Loading</p> : !jobs.length && !travel.length ? (
        <p className="empty">Nothing booked or planned for {person.full_name.split(' ')[0]} in {monthLabel(month)}.</p>
      ) : (
        <>
          {GROUPS.map(([st, label, tone]) => {
            const list = jobs.filter((j) => j.status === st);
            if (!list.length) return null;
            return (
              <section key={st} className="ps-group">
                <h3><span className={`chip ${tone}`}>{label}</span> <span className="count">{list.length}</span></h3>
                <ul className="ps-jobs">
                  {list.map((j) => (
                    <li key={j.id} className={st === 'cancelled' ? 'inactive' : ''}>
                      <div className="ps-job-top">
                        <strong>{j.title}</strong>{j.event_reference && <span className="muted"> ({j.event_reference})</span>}{clashes[j.id] && <span className="chip clash" title={`Overlaps ${clashes[j.id].map((x) => x.title).join(', ')}`}>Clash</span>}
                        <span className="ps-place">{flagOf(placeOf(j))} {[j.city, placeOf(j)].filter((x, i, a) => x && a.indexOf(x) === i && x !== 'Place not set').join(', ') || 'Place not set'}</span>
                      </div>
                      <span className="sub2">{fmtDate(j.start_date)} to {fmtDate(j.end_date)}, {days(j, month, monthEnd)} day{days(j, month, monthEnd) === 1 ? '' : 's'} this month{j.notes ? ` · ${j.notes}` : ''}</span>
                      {travelFor(j.id).length > 0 && (
                        <ul className="ps-travel">
                          {travelFor(j.id).map((d) => (
                            <li key={d.id}><span className="kind-tag direct">{categoryLabel(d.category)}</span>{d.description || ''}{d.travel_date ? <span className="muted"> {fmtDate(d.travel_date)}{d.end_date ? ` to ${fmtDate(d.end_date)}` : ''}</span> : null}{travelMismatch(d, j) && <span className="mismatch">⚠ {travelMismatch(d, j)}</span>}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {loose.length > 0 && (
            <section className="ps-group">
              <h3><span className="chip neutral">Other travel this month</span></h3>
              <ul className="ps-travel">
                {loose.map((d) => <li key={d.id}><span className="kind-tag direct">{categoryLabel(d.category)}</span>{d.description || ''}{d.travel_date ? <span className="muted"> {fmtDate(d.travel_date)}{d.end_date ? ` to ${fmtDate(d.end_date)}` : ''}</span> : null}</li>)}
              </ul>
            </section>
          )}
          {travel.length > 0 && <p className="hint">Travel booked by Robot24 this month: {totalsByCurrency(travel).join(' + ')}</p>}
        </>
      )}
    </Drawer>
  );
}
