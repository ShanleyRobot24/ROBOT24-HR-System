'use client';
import { supabase } from './supabaseClient';
import { money } from './format';

const LOCKED = ['pending_approval', 'approved', 'paid'];

// An invoice is the uploaded file plus every bill made from it (usually a fee and an expense bill).
export async function loadInvoice({ payment, upload }) {
  let up = upload || null;
  if (!up && payment?.upload_id) {
    const { data } = await supabase.from('invoice_uploads').select('*').eq('id', payment.upload_id).maybeSingle();
    up = data || null;
  }
  let bills = [];
  if (up) {
    const { data } = await supabase.from('payments').select('id, status, kind, amount, currency, invoice_file_path').eq('upload_id', up.id);
    bills = data || [];
  }
  if (payment && !bills.some((b) => b.id === payment.id)) bills.push(payment);
  return { upload: up, bills };
}

// Deletes bills, the upload record and the files. Returns true if something was deleted.
export async function deleteBills(bills, { isAdmin, upload = null, label = 'invoice' }) {
  if (!bills.length && !upload) return false;
  const locked = bills.filter((b) => LOCKED.includes(b.status));
  const total = bills.map((b) => money(b.amount, b.currency)).join(' + ');
  const what = `${bills.length} bill${bills.length === 1 ? '' : 's'}${total ? ` (${total})` : ''}${upload ? ' and the invoice file' : ''}`;

  if (locked.length && !isAdmin) {
    const paid = locked.some((b) => ['approved', 'paid'].includes(b.status));
    alert(paid
      ? 'This includes a bill that is already approved or paid, so it cannot be deleted. Ask an admin, or an approver to undo the approval first.'
      : 'This includes a bill waiting for approval. Withdraw it in Money, Bills first, then delete.');
    return false;
  }
  if (locked.length && isAdmin) {
    const typed = window.prompt(`Admin delete: this ${label} includes ${locked.length} bill${locked.length > 1 ? 's' : ''} already sent for approval, approved or paid.\n\nDeleting removes ${what} from all records and reports.\n\nType DELETE to confirm.`);
    if (typed === null) return false;
    if (typed.trim().toUpperCase() !== 'DELETE') { alert('Not deleted. You need to type DELETE.'); return false; }
  } else if (!window.confirm(`Delete this ${label}?\n\nThis removes ${what}. It cannot be undone.`)) {
    return false;
  }

  if (bills.length) {
    const { error } = await supabase.from('payments').delete().in('id', bills.map((b) => b.id));
    if (error) { alert(error.message); return false; }
  }
  // Remove files nobody else uses: the upload's file, and any file attached by hand
  const files = new Set();
  if (upload?.file_path) files.add(upload.file_path);
  for (const b of bills) if (b.invoice_file_path && b.invoice_file_path.includes('/manual/')) files.add(b.invoice_file_path);
  if (files.size) await supabase.storage.from('invoices').remove([...files]);
  if (upload) {
    const { error } = await supabase.from('invoice_uploads').delete().eq('id', upload.id);
    if (error) { alert(error.message); return false; }
  }
  return true;
}

// Attaches a file to a bill without reading it with AI
export async function attachFile(payment, file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Over 30 MB');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${(payment.period || '').slice(0, 7) || 'misc'}/manual/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  const { error: e2 } = await supabase.from('payments').update({ invoice_file_path: path }).eq('id', payment.id);
  if (e2) throw e2;
  // Tidy up an older file that was attached by hand to this bill only
  if (payment.invoice_file_path && payment.invoice_file_path.includes('/manual/')) {
    await supabase.storage.from('invoices').remove([payment.invoice_file_path]);
  }
  return path;
}

export async function detachFile(payment) {
  const { error } = await supabase.from('payments').update({ invoice_file_path: null }).eq('id', payment.id);
  if (error) throw error;
  if (payment.invoice_file_path && payment.invoice_file_path.includes('/manual/')) {
    await supabase.storage.from('invoices').remove([payment.invoice_file_path]);
  }
}
