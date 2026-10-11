'use client';
import { Suspense } from 'react';
import { useTab } from '@/lib/useTab';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RequireAuth, useAuth } from '@/components/AuthProvider';
import { useMonth } from '@/lib/monthStore';
import { useSticky } from '@/lib/sticky';
import { Skeleton } from '@/components/ui';
import ApprovalsView from '@/components/ApprovalsView';
import { addMonths } from '@/lib/format';
import UploadPanel from '@/components/UploadPanel';
import MonthView from '@/components/MonthView';
import PaymentDrawer from '@/components/PaymentDrawer';
import MissingInvoices from '@/components/MissingInvoices';

function Money() {
  const { isFinance, isApprover } = useAuth();
  const tabs = [...(isFinance ? ['inbox', 'bills'] : []), ...(isApprover ? ['approvals'] : []), ...(isFinance ? ['missing'] : [])];
  const [tab, setTab] = useTab(tabs, tabs[0]);
  const { month } = useMonth();
  const [contractors, setContractors] = useSticky('money:contractors', []);
  const [payments, setPayments] = useSticky('money:payments', []);
  const [uploads, setUploads] = useSticky('money:uploads', []);
  const [assignments, setAssignments] = useSticky('money:assignments', []);
  const [loadedMonth, setLoadedMonth] = useSticky('money:month', null);
  const [missing, setMissing] = useState(null);
  const [waiting, setWaiting] = useState(null);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(null); // null closed, { id } edit, { prefill, n } new

  const refresh = useCallback(async () => {
    if (!isFinance) return;
    const monthEnd = new Date(Date.parse(addMonths(month, 1)) - 864e5).toISOString().slice(0, 10);
    const [c, p, u, asg] = await Promise.all([
      supabase.from('contractors').select('*').order('full_name'),
      supabase.from('payments').select('*').eq('period', month).order('created_at'),
      supabase.from('invoice_uploads').select('*').eq('period', month).order('uploaded_at', { ascending: false }),
      supabase.from('assignments').select('*').lte('start_date', monthEnd).gte('end_date', month).order('start_date'),
    ]);
    const err = c.error || p.error || u.error;
    setError(err ? err.message : '');
    setContractors(c.data || []);
    setPayments(p.data || []);
    setUploads(u.data || []);
    setAssignments(asg.data || []);
    setLoadedMonth(month);
  }, [month, isFinance]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const ch = supabase.channel('finance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_uploads' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const stale = loadedMonth !== null && loadedMonth !== month;
  const needsAction = uploads.filter((u) => ['unmatched', 'needs_attention', 'error'].includes(u.status)).length;
  const toCheck = payments.filter((p) => p.status === 'draft').length;
  const current = drawer?.id ? payments.find((p) => p.id === drawer.id) : null;
  const openBill = (p) => setDrawer(p ? { id: p.id } : { prefill: null, n: Date.now() });
  const addExpenses = (p) => setDrawer({
    n: Date.now(),
    prefill: {
      contractor_id: p.contractor_id, kind: 'expense', period: p.period, invoice_number: p.invoice_number,
      event_reference: p.event_reference, currency: p.currency, invoice_date: p.invoice_date, due_date: p.due_date,
      upload_id: p.upload_id, invoice_file_path: p.invoice_file_path,
    },
  });

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <h1>Money</h1>
          <p className="sub">Invoices in, bills checked, approved and paid.</p>
        </div>
        <div className="tabs" role="tablist">
          {isFinance && <button role="tab" className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>
            Inbox{needsAction > 0 && <span className="pill alert">{needsAction}</span>}
          </button>}
          {isFinance && <button role="tab" className={tab === 'bills' ? 'on' : ''} onClick={() => setTab('bills')}>
            Bills{toCheck > 0 && <span className="pill">{toCheck}</span>}
          </button>}
          {isApprover && <button role="tab" className={tab === 'approvals' ? 'on' : ''} onClick={() => setTab('approvals')}>
            Approvals{waiting > 0 && <span className="pill alert">{waiting}</span>}
          </button>}
          {isFinance && <button role="tab" className={tab === 'missing' ? 'on' : ''} onClick={() => setTab('missing')}>
            Missing invoices{missing > 0 && <span className="pill alert">{missing}</span>}
          </button>}
        </div>
      </div>
      {error && <p className="err">{error}</p>}
      {isFinance && tab !== 'missing' && missing === null && <span style={{ display: 'none' }}><MissingInvoices contractors={contractors} onCount={setMissing} /></span>}
      {isApprover && tab !== 'approvals' && waiting === null && <span style={{ display: 'none' }}><ApprovalsView onCount={setWaiting} /></span>}

      <div className={stale ? 'stale' : ''}>
        {(tab === 'inbox' || tab === 'bills') && loadedMonth === null ? <Skeleton rows={6} cards={tab === 'bills' ? 4 : 0} /> : <>
          {tab === 'inbox' && <UploadPanel month={month} contractors={contractors} uploads={uploads} refresh={refresh} goToMonth={() => setTab('bills')} />}
          {tab === 'bills' && <MonthView month={month} payments={payments} contractors={contractors} refresh={refresh} onOpen={openBill} jobs={assignments} />}
        </>}
      </div>
      {tab === 'approvals' && <ApprovalsView onCount={setWaiting} />}
      {tab === 'missing' && <MissingInvoices contractors={contractors} onCount={setMissing} />}

      {drawer && (drawer.id ? current : true) && (
        <PaymentDrawer
          key={drawer.id || `new-${drawer.n}`}
          payment={drawer.id ? current : null}
          prefill={drawer.prefill}
          month={month}
          contractors={contractors}
          refresh={refresh}
          onAddExpenses={addExpenses}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RequireAuth need="money"><Money /></RequireAuth></Suspense>;
}
