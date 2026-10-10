// Admin only. One function for managing logins, to stay within the Vercel Hobby plan:
//   list    -> sign-in status for every user
//   create  -> new login with a temporary password
//   reset   -> new temporary password
//   remove  -> block sign-in (history is kept)
//   restore -> allow sign-in again
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/requireRole';

export const runtime = 'nodejs';

const ROLES = ['production', 'hr_finance', 'admin'];
const FOREVER = '876000h';

// Easy to read aloud and type: no 0/O or 1/l/I
function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `R24-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

async function audit(sb, me, action, summary, changes) {
  await sb.from('audit_log').insert({ user_id: me.id, user_email: me.email, via: 'app', action, area: 'Users', summary, changes });
}

export async function POST(req) {
  const auth = await requireRole(req, ['admin']);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { sb, user: me } = auth;
  const body = await req.json().catch(() => ({}));
  const action = body.action || 'create';

  if (action === 'list') {
    const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({
      users: (data.users || []).map((u) => ({
        id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at || null,
        removed: !!(u.banned_until && Date.parse(u.banned_until) > Date.now()),
      })),
    });
  }

  if (action === 'create') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    if (!ROLES.includes(body.role)) return NextResponse.json({ error: 'Choose an access level' }, { status: 400 });
    const password = tempPassword();
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      const msg = /already/i.test(error.message) ? `${email} already has an account. Use Reset password on their row instead.` : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    await sb.from('profiles').upsert({ id: data.user.id, email, full_name: body.fullName?.trim() || null, role: body.role, is_approver: !!body.isApprover });
    await audit(sb, me, 'added', `${email} · login created`, { access: body.role, approver: !!body.isApprover });
    return NextResponse.json({ ok: true, email, password });
  }

  const target = body.userId;
  if (!target) return NextResponse.json({ error: 'No user chosen' }, { status: 400 });
  const { data: prof } = await sb.from('profiles').select('email, role').eq('id', target).maybeSingle();
  const email = prof?.email || 'user';

  if (action === 'reset') {
    const password = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(target, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(sb, me, 'changed', `${email} · password reset`, { password: ['(hidden)', '(hidden)'] });
    return NextResponse.json({ ok: true, email, password });
  }

  if (action === 'remove') {
    if (target === me.id) return NextResponse.json({ error: 'You cannot remove your own access' }, { status: 400 });
    if (prof?.role === 'admin') {
      const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
      if ((count || 0) <= 1) return NextResponse.json({ error: 'This is the only admin. Make someone else admin first' }, { status: 400 });
    }
    const { error } = await sb.auth.admin.updateUserById(target, { ban_duration: FOREVER });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await sb.from('profiles').update({ is_approver: false }).eq('id', target);
    await audit(sb, me, 'changed', `${email} · access removed`, { access: ['Can sign in', 'Removed'] });
    return NextResponse.json({ ok: true });
  }

  if (action === 'restore') {
    const { error } = await sb.auth.admin.updateUserById(target, { ban_duration: 'none' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit(sb, me, 'changed', `${email} · access restored`, { access: ['Removed', 'Can sign in'] });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
