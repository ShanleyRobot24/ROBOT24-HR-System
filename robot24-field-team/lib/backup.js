// A full backup of the app's records as CSV files in one zip (stored files such as PDFs stay in Supabase)
import { toCSV } from './format';

export const BACKUP_TABLES = ['contractors', 'documents', 'assignments', 'direct_costs', 'payments', 'invoice_uploads', 'fx_rates',
  'staff', 'staff_documents', 'payroll_runs', 'profiles', 'audit_log'];

const flat = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

// sb: a Supabase client (the signed-in admin in the browser, or the server's own)
export async function backupTables(sb) {
  const out = {};
  for (const t of BACKUP_TABLES) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(t).select('*').range(from, from + 999);
      if (error) { out[t] = { error: error.message }; break; }
      rows.push(...(data || []));
      if (!data || data.length < 1000) { out[t] = { rows }; break; }
    }
  }
  return out;
}

export async function backupZip(sb, PizZip) {
  const tables = await backupTables(sb);
  const zip = new PizZip();
  const lines = [`Robot24 Field Team backup, ${new Date().toISOString()}`, ''];
  for (const [t, r] of Object.entries(tables)) {
    if (r.error) { lines.push(`${t}: could not be read (${r.error})`); continue; }
    zip.file(`${t}.csv`, toCSV(r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, flat(v)])))) || '');
    lines.push(`${t}: ${r.rows.length} rows`);
  }
  lines.push('', 'Uploaded files (invoices, passports, contracts, receipts) stay in Supabase Storage and are not in this zip.');
  zip.file('README.txt', lines.join('\n'));
  return { zip, summary: lines };
}
