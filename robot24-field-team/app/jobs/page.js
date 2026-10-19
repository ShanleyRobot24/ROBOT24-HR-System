'use client';
import { Suspense } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/AuthProvider';
import { addMonths } from '@/lib/format';
import { useMonth } from '@/lib/monthStore';
import { useSticky, useTab } from '@/lib/sticky';
import { Skeleton } from '@/components/ui';
import AssignmentsPanel from '@/components/AssignmentsPanel';
import DirectCostsPanel from '@/components/DirectCostsPanel';
import CalendarView from '@/components/CalendarView';
import PersonSchedule from '@/components/PersonSchedule';
import { usePhotoUrls } from '@/lib/photos';

function Jobs() {
  const [tab, setTab] = useTab(['jobs', 'calendar', 'travel'], 'jobs');
  const { month } = useMonth();
  const [contractors, setContractors] = useSticky('jobs:people', []);
  const [assignments, setAssignments] = useSticky('jobs:assignments', []);
  const [costs, setCosts] = useSticky('jobs:costs', []);
  const [loadedMonth, setLoadedMonth] = useSticky('jobs:month', null);
  const [prefill, setPrefill] = useState(null);
  const [error, setError] = useState('');
  const [personOpen, setPersonOpen] = useState(null);

  const refresh = useCallback(async () => {
    const monthEnd = new Date(Date.parse(addMonths(month, 1)) - 864e5).toISOString().slice(0, 10);
    const [c, a, d] = await Promise.all([
      supabase.rpc('directory'),
      supabase.from('assignments').select('*').lte('start_date', monthEnd).gte('end_date', month).order('start_date'),
      supabase.from('direct_costs').select('*').eq('period', month).order('travel_date'),
    ]);
    setError(c.error?.message || a.error?.message || d.error?.message || '');
    setContractors(c.data || []);
    setAssignments(a.data || []);
    setCosts(d.data || []);
    setLoadedMonth(month);
  }, [month]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const ch = supabase.channel('assignments-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_costs' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const byId = Object.fromEntries(contractors.map((c) => [c.id, c]));
  const photos = usePhotoUrls(contractors.map((c) => c.photo_path));

  function addTravel(a) {
    setPrefill({ contractor_id: a.contractor_id, assignment_id: a.id, travel_date: a.start_date, n: Date.now() });
    setTab('travel');
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p className="sub">Who is booked where, and their flights, trains and hotels.</p>
        </div>
        <div className="tabs" role="tablist" data-tour="jobs-tabs">
          <button role="tab" className={tab === 'jobs' ? 'on' : ''} onClick={() => setTab('jobs')}>Jobs</button>
          <button role="tab" className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>Calendar</button>
          <button role="tab" className={tab === 'travel' ? 'on' : ''} onClick={() => setTab('travel')}>Travel</button>
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      {loadedMonth === null ? <Skeleton rows={6} cards={3} /> : <div className={loadedMonth !== month ? 'stale' : ''}>
      {tab === 'jobs' && <AssignmentsPanel month={month} contractors={contractors} assignments={assignments} costs={costs} refresh={refresh} onAddTravel={addTravel} />}
      {tab === 'calendar' && <CalendarView month={month} assignments={assignments} byId={byId} costs={costs} photos={photos} onOpen={(a) => setPersonOpen(byId[a.contractor_id] || null)} />}
      {personOpen && <PersonSchedule person={personOpen} photoUrl={photos[personOpen.photo_path]} onClose={() => setPersonOpen(null)} />}
      {tab === 'travel' && <DirectCostsPanel month={month} contractors={contractors} costs={costs} assignments={assignments} refresh={refresh} prefill={prefill} />}
      </div>}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="assignments"><Jobs /></RequireAuth></Suspense>;
}
