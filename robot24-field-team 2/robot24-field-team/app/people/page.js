'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth, useAuth } from '@/components/AuthProvider';
import { useTab } from '@/lib/useTab';
import { useSticky } from '@/lib/sticky';
import DirectoryView from '@/components/DirectoryView';
import TeamPanel from '@/components/TeamPanel';
import Skeleton from '@/components/Skeleton';

function Records() {
  const [contractors, setContractors, cached] = useSticky('people:records', []);
  const [documents, setDocuments] = useSticky('people:documents', []);
  const [loaded, setLoaded] = useState(cached);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase.from('contractors').select('*').order('full_name'),
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
    ]);
    setError(c.error?.message || d.error?.message || '');
    setContractors(c.data || []);
    setDocuments(d.data || []);
    setLoaded(true);
  }, [setContractors, setDocuments]);
  useEffect(() => { refresh(); }, [refresh]);
  if (!loaded) return <Skeleton rows={7} />;
  return <>{error && <p className="err">{error}</p>}<TeamPanel contractors={contractors} documents={documents} refresh={refresh} /></>;
}

function People() {
  const { isFinance } = useAuth();
  const [tab, setTab] = useTab(isFinance ? ['directory', 'records'] : ['directory'], 'directory');
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p className="sub">The field team: who they are, how to reach them{isFinance ? ', and their records and documents' : ''}.</p>
        </div>
        {isFinance && (
          <div className="tabs" role="tablist">
            <button role="tab" className={tab === 'directory' ? 'on' : ''} onClick={() => setTab('directory')}>Directory</button>
            <button role="tab" className={tab === 'records' ? 'on' : ''} onClick={() => setTab('records')}>Records and documents</button>
          </div>
        )}
      </div>
      {tab === 'directory' ? <DirectoryView /> : <Records />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth><People /></RequireAuth></Suspense>;
}
