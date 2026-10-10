'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSticky } from '@/lib/sticky';
import Skeleton from './Skeleton';
import { groupBy, sortRegions } from '@/lib/format';
import Avatar from './Avatar';
import { usePhotoUrls } from '@/lib/photos';
import PersonSchedule from './PersonSchedule';

export default function DirectoryView() {
  const [people, setPeople, cached] = useSticky('people:directory', []);
  const [loaded, setLoaded] = useState(cached);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    supabase.rpc('directory').then(({ data, error }) => {
      if (error) setError(error.message);
      else setPeople(data || []);
      setLoaded(true);
    });
  }, [setPeople]);

  const photos = usePhotoUrls(people.map((p) => p.photo_path));
  const roles = useMemo(() => ['All', ...new Set(people.map((p) => p.designation).filter(Boolean))], [people]);
  const filtered = people.filter((p) => {
    if (role !== 'All' && p.designation !== role) return false;
    if (!q) return true;
    return `${p.full_name} ${p.city || ''} ${p.region} ${p.designation || ''}`.toLowerCase().includes(q.toLowerCase());
  });
  const groups = groupBy(filtered, 'region');
  const regions = Object.keys(groups).sort(sortRegions);

  return (
    <>
      <p className="sub people-count">{people.length} people across {new Set(people.map((p) => p.region)).size} locations. Click anyone to see their month.</p>
      <div className="toolbar">
        <input className="search" placeholder="Search name, city or role" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {roles.map((r) => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r}</button>)}
        </div>
      </div>
      <div className="region-jump">
        {regions.map((r) => <a key={r} href={`#r-${r}`}>{r} <span>{groups[r].length}</span></a>)}
      </div>
      {error && <p className="err">{error}</p>}
      {!loaded && !people.length && <Skeleton rows={3} cards={3} />}
      {regions.map((r) => (
        <section key={r} id={`r-${r}`} className="region">
          <h2>{r}<span className="count">{groups[r].length}</span></h2>
          <div className="people">
            {groups[r].map((p) => (
              <article key={p.id} className="person clickable" role="button" tabIndex={0} onClick={() => setOpen(p)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(p)} title="See what they are booked for">
                <div className="person-top">
                  <Avatar name={p.full_name} url={photos[p.photo_path]} size={52} />
                  <div className="person-name">
                    <h3>{p.full_name}</h3>
                    {p.city && <p className="city">{p.city}</p>}
                  </div>
                  <span className={`role-tag ${(p.designation || '').toLowerCase().includes('journalist') ? 'j' : 'v'}`}>{p.designation}</span>
                </div>
                <dl>
                  {p.phone && <><dt>Phone</dt><dd><a onClick={(e) => e.stopPropagation()} href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a></dd></>}
                  {p.email && <><dt>Email</dt><dd><a onClick={(e) => e.stopPropagation()} href={`mailto:${p.email}`}>{p.email}</a></dd></>}
                  {p.wechat_id && <><dt>WeChat</dt><dd>{p.wechat_id}</dd></>}
                  {!p.phone && !p.email && !p.wechat_id && <><dt>Contact</dt><dd className="muted">No contact on file</dd></>}
                </dl>
                <p className="see-sched">See bookings and plans</p>
                <div className="kit">
                  <span>T-shirt: {p.tshirt_status || 'n/a'}</span>
                  <span>Mic sponge: {p.mic_sponge_status || 'n/a'}</span>
                  <span className={p.contract_signed ? 'okc' : 'warn'}>{p.contract_signed ? 'Contract signed' : 'Contract not signed'}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {open && <PersonSchedule person={open} photoUrl={photos[open.photo_path]} onClose={() => setOpen(null)} />}
    </>
  );
}
