'use client';
import { Suspense } from 'react';
import { useTab } from '@/lib/useTab';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth } from '@/components/AuthProvider';
import UsersPanel from '@/components/UsersPanel';
import AuditPanel from '@/components/AuditPanel';


function Admin() {
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useTab(['users', 'audit'], 'users');

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('email');
    setUsers(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="sub">{tab === 'users' ? 'Who can sign in, what they can see, and who approves bills.' : 'Who captured or changed what, and when.'}</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Users</button>
          <button role="tab" className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit trail</button>
        </div>
      </div>
      {tab === 'audit' ? <AuditPanel users={users} /> : <UsersPanel users={users} reload={load} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="admin"><Admin /></RequireAuth></Suspense>;
}
