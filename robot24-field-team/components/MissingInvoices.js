'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { fmtDate } from '@/lib/format';
import { jobDays } from '@/lib/schedule';
import { reminderText } from '@/lib/messages';
import { placeOf, flagOf } from '@/lib/places';
import MessageDrawer from './MessageDrawer';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';

// Jobs that have finished but have no fee bill linked to them yet
export default function MissingInvoices({ contractors, onCount }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remind, setRemind] = useState(null);
  const [lookback, setLookback] = useState(120);
  const byId = Object.fromEntries(contractors.map((c) => [c.id, c]));
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - lookback * 864e5).toISOString().slice(0, 10);
    const { data: jobs } = await supabase.from('assignments').select('*')
      .in('status', ['confirmed', 'completed']).lt('end_date', today).gte('end_date', since).order('end_date');
    const ids = (jobs || []).map((j) => j.id);
    let billed = new Set();
    if (ids.length) {
      const { data: bills } = await supabase.from('payments').select('assignment_id').in('assignment_id', ids).eq('kind', 'fee').neq('status', 'rejected');
      billed = new Set((bills || []).map((b) => b.assignment_id));
    }
    const missing = (jobs || []).filter((j) => !billed.has(j.id));
    setRows(missing);
    onCount && onCount(missing.length);
    setLoading(false);
  }, [today, lookback, onCount]);

  useEffect(() => { load(); }, [load]);

  async function markCompleted(j) {
    const { error } = await supabase.from('assignments').update({ status: 'completed' }).eq('id', j.id);
    if (error) return alert(error.message);
    load();
  }

  const ago = (d) => {
    const n = Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
    return n === 1 ? 'Ended yesterday' : `Ended ${n} days ago`;
  };

  return (
    <>
      <p className="hint lead">Finished jobs with no fee invoice linked to them yet. Send a reminder, or if the invoice is already in, open the bill in Money, Bills and link it to the job.</p>
      <div className="toolbar">
        <label className="check">Jobs that ended in the last
          <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))} style={{ width: 'auto', marginLeft: 6 }}>
            {[30, 60, 120, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
      </div>
      {loading ? <p className="page-msg">Loading</p> : !rows.length ? <p className="empty">Every finished job has an invoice. Nothing to chase.</p> : (
        <div className="table-wrap">
          <table className="pay-table">
            <thead><tr><th>Who</th><th>Job</th><th>Dates</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((j) => {
                const c = byId[j.contractor_id] || {};
                const old = Date.parse(today) - Date.parse(j.end_date) > 14 * 864e5;
                return (
                  <tr key={j.id} className="no-hover">
                    <td><div className="who-cell"><Avatar name={c.full_name || ''} url={photos[c.photo_path]} size={32} /><div><strong>{c.full_name || 'Unknown'}</strong><span className="sub2">{c.ref_code}</span></div></div></td>
                    <td><strong>{j.title}</strong><span className="sub2">{[j.event_reference, `${flagOf(placeOf(j))} ${placeOf(j)}`].filter(Boolean).join(' · ')}</span></td>
                    <td className="nowrap">{fmtDate(j.start_date)} to {fmtDate(j.end_date)}<span className={`sub2 ${old ? 'due-overdue' : ''}`}>{jobDays(j)} day{jobDays(j) > 1 ? 's' : ''} · {ago(j.end_date)}</span></td>
                    <td>{j.status === 'completed' ? <span className="chip ok">Completed</span> : <><span className="chip warn">Ended, still Confirmed</span><button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => markCompleted(j)}>Mark completed</button></>}</td>
                    <td className="actions"><button className="btn sm primary" onClick={() => setRemind(j)}>Send reminder</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {remind && (() => {
        const c = byId[remind.contractor_id] || {};
        return (
          <MessageDrawer
            title={`Invoice reminder for ${c.full_name || 'freelancer'}`}
            to={{ name: c.full_name, phone: c.phone, email: c.email }}
            subject={`Invoice for ${remind.title}`}
            text={reminderText({ person: c, job: remind })}
            onClose={() => setRemind(null)}
          />
        );
      })()}
    </>
  );
}
