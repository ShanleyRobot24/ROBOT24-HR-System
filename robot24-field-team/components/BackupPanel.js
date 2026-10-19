'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { backupZip } from '@/lib/backup';

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [last, setLast] = useState(undefined);
  const loadLast = () => supabase.from('audit_log').select('at, user_email, area, summary, changes').in('area', ['Backup', 'Automation']).order('id', { ascending: false }).limit(20)
    .then(({ data }) => setLast((data || []).find((r) => r.area === 'Backup' || (r.summary || '').startsWith('Weekly backup') && r.changes?.emailed === 'yes') || null));
  useEffect(() => { loadLast(); }, []);
  async function download() {
    setBusy(true);
    try {
      const { default: PizZip } = await import('pizzip');
      const { zip, summary: s } = await backupZip(supabase, PizZip);
      const blob = zip.generate({ type: 'blob', compression: 'DEFLATE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `robot24-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setSummary(s);
      await supabase.rpc('record_backup', { p_summary: `Backup downloaded · ${s[0] || ''}`.slice(0, 300) });
      loadLast();
    } catch (e) { alert(`Backup failed: ${e.message}`); }
    setBusy(false);
  }
  return (
    <div className="backup">
      <p className="hint lead">A copy of every record in the app (field team, jobs, travel, bills, invoices, exchange rates, staff, payroll, users and the audit trail) as spreadsheet files in one zip. Uploaded files such as invoices and passports stay safely in Supabase.</p>
      <p className="backup-last">{last === undefined ? 'Checking the last backup…' : last ? `Last backup: ${new Date(last.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${last.user_email ? ` by ${last.user_email}` : ' (emailed automatically)'}` : 'No backup made yet.'}</p>
      <button className="btn primary" data-tour="backup" onClick={download} disabled={busy}>{busy ? 'Making the backup…' : 'Download full backup'}</button>
      <p className="hint">Make one every week; Home reminds admins when the last one is over 7 days old. Optional: once email is set up (see the README), a backup is also emailed to admins every Monday automatically.</p>
      {summary && <pre className="backup-summary">{summary.join('\n')}</pre>}
    </div>
  );
}
