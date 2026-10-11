// Server only. Never import this into a client component.
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.R24_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('Supabase URL or secret key is missing in Vercel Environment Variables');
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
