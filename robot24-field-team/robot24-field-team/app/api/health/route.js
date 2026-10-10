// Open /api/health in the browser to check the app's settings. Shows no secrets or emails.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mask = (v) => (v ? `${v.slice(0, 14)}... (${v.length} characters)` : 'MISSING');

export async function GET() {
  const url = process.env.R24_SUPABASE_URL;
  const publishable = process.env.R24_SUPABASE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const out = {
    supabase_url: url || 'MISSING',
    publishable_key: mask(publishable),
    secret_key: mask(secret),
    anthropic_key: process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001 (default)',
    checks: {},
    accounts: {},
  };

  // Publishable key: this is what the login page uses
  if (!url || !publishable) {
    out.checks.login_settings = 'FAIL: Supabase URL or publishable key missing. Login cannot work. Check NEXT_SUPABASE_URL and NEXT_SUPABASE_ANON_KEY in Vercel, then redeploy.';
  } else if (/[•*]/.test(publishable)) {
    out.checks.login_settings = 'FAIL: publishable key contains dots or stars. Re-copy it with the copy button.';
  } else {
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } });
      if (!res.ok) out.checks.login_settings = `FAIL: Supabase rejected the publishable key (${res.status}). Re-copy it.`;
      else {
        const s = await res.json();
        out.checks.login_settings = s.external?.email === false ? 'FAIL: Email sign in is turned off in Supabase > Authentication > Sign In / Providers.' : 'OK';
      }
    } catch (e) {
      out.checks.login_settings = `FAIL: cannot reach ${url}. Check the Supabase URL. (${e.message})`;
    }
  }

  // Secret key: this is what invoice reading and user creation use
  if (!secret) out.checks.secret_key = 'FAIL: SUPABASE_SERVICE_ROLE_KEY missing in Vercel.';
  else if (/[•*]/.test(secret)) out.checks.secret_key = 'FAIL: contains dots or stars. It was copied while hidden. Use the copy button in Supabase.';
  else if (secret.startsWith('sb_publishable_')) out.checks.secret_key = 'FAIL: this is the publishable key, not the secret key.';
  else if (url) {
    try {
      const sb = createClient(url, secret, { auth: { persistSession: false } });
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) out.checks.secret_key = `FAIL: ${error.message}. Re-copy the secret key.`;
      else {
        out.checks.secret_key = 'OK';
        const users = data.users || [];
        out.accounts.logins = users.length;
        out.accounts.confirmed = users.filter((u) => u.email_confirmed_at).length;
        out.accounts.not_confirmed = users.length - out.accounts.confirmed;

        const { data: profiles, error: pErr } = await sb.from('profiles').select('role, is_approver');
        if (pErr) out.checks.database = `FAIL: ${pErr.message}. Run schema.sql in Supabase.`;
        else {
          out.checks.database = 'OK';
          out.accounts.admins = profiles.filter((p) => p.role === 'admin').length;
          out.accounts.hr_finance = profiles.filter((p) => p.role === 'hr_finance').length;
          out.accounts.approvers = profiles.filter((p) => p.is_approver).length;
          const { count } = await sb.from('contractors').select('id', { count: 'exact', head: true });
          out.accounts.field_team = count ?? 0;
          if (!count) out.checks.field_team = 'FAIL: no field team loaded. Run seed.sql in Supabase.';
        }
        if (!users.length) out.checks.accounts = 'FAIL: no login accounts. Supabase > Authentication > Users > Add user.';
        else if (out.accounts.not_confirmed) out.checks.accounts = `WARN: ${out.accounts.not_confirmed} account(s) not confirmed. They cannot sign in until confirmed.`;
        if (out.accounts.admins === 0) out.checks.admin = 'FAIL: nobody is admin. Run the admin SQL for your email.';
      }
    } catch (e) {
      out.checks.secret_key = `FAIL: ${e.message}`;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) out.checks.anthropic = 'FAIL: ANTHROPIC_API_KEY missing. Invoices cannot be read.';

  out.all_ok = Object.values(out.checks).every((v) => v === 'OK');
  return NextResponse.json(out, { headers: { 'cache-control': 'no-store' } });
}
