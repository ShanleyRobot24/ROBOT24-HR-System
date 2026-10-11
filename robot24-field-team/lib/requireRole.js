// Server only. Checks the signed in user from the Authorization header.
import { supabaseAdmin } from './supabaseAdmin';

export async function requireRole(req, roles) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return { error: 'Not signed in. Sign out and back in, then try again.', status: 401 };

  let sb;
  try { sb = supabaseAdmin(); } catch (e) { return { error: e.message, status: 500 }; }

  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user) {
    const why = error?.message || 'unknown';
    const hint = /api key|apikey|invalid.*key|no api key/i.test(why)
      ? 'The Supabase secret key in Vercel is wrong or incomplete. Check SUPABASE_SERVICE_ROLE_KEY in Vercel > Settings > Environment Variables.'
      : 'Your session could not be confirmed. Sign out and back in. If it continues, check the Supabase keys in Vercel > Settings > Environment Variables.';
    return { error: `${hint} (Supabase said: ${why})`, status: 401 };
  }

  const { data: profile, error: pErr } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  if (pErr || !profile) return { error: `No profile found for ${data.user.email}. Run schema.sql in Supabase.`, status: 403 };
  if (!roles.includes(profile.role)) return { error: `${data.user.email} has ${profile.role} access. This needs ${roles.join(' or ')}.`, status: 403 };
  return { user: data.user, profile, sb };
}
