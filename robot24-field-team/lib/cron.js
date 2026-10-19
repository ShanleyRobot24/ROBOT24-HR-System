// Server only. The one scheduled job (see vercel.json): a backup emailed to admins every Monday, if email is set up.
import PizZip from 'pizzip';
import { supabaseAdmin } from './supabaseAdmin';
import { backupZip } from './backup';

const iso = (t) => new Date(t).toISOString().slice(0, 10);

async function hrEmails(sb, envName) {
  if (process.env[envName]) return process.env[envName];
  const { data } = await sb.from('profiles').select('email, role').in('role', ['admin']);
  return (data || []).map((p) => p.email).filter(Boolean);
}

async function log(sb, summary, changes) {
  await sb.from('audit_log').insert({ via: 'system', action: 'changed', area: 'Automation', summary, changes });
}

export async function runBackup() {
  const sb = supabaseAdmin();
  const { zip, summary } = await backupZip(sb, PizZip);
  const content = zip.generate({ type: 'base64', compression: 'DEFLATE' });
  const date = iso(Date.now());
  const big = content.length > 14 * 1024 * 1024;
  const to = await hrEmails(sb, 'BACKUP_TO');
  const sent = await sendMail({
    to, subject: `Robot24 Field Team backup ${date}`,
    text: `${summary.join('\n')}\n\n${big ? 'The backup is too large to attach. Download it from Admin > Backup.' : 'The backup is attached. Keep it somewhere safe.'}`,
    attachments: big ? [] : [{ filename: `robot24-backup-${date}.zip`, content }],
  });
  await log(sb, `Weekly backup ${date}`, { emailed: sent.sent ? 'yes' : sent.skipped || sent.error, size_kb: Math.round(content.length * 0.75 / 1024) });
  return { date, summary, mail: sent };
}

// Sends email through Resend (resend.com) when RESEND_API_KEY and MAIL_FROM are set.
// Without them nothing is sent, and backups are downloaded from Admin > Backup instead.
export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail({ to, subject, text, attachments }) {
  const list = (Array.isArray(to) ? to : String(to || '').split(',')).map((x) => x.trim()).filter(Boolean);
  if (!list.length) return { skipped: 'no recipient' };
  if (!mailReady()) return { skipped: 'email not set up' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: list, subject, text, ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) return { error: `Email failed (${res.status}): ${(await res.text()).slice(0, 200)}` };
  return { sent: list.length };
}
