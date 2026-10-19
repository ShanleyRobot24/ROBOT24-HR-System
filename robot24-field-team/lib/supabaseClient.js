import { createClient } from '@supabase/supabase-js';

const url = process.env.R24_SUPABASE_URL;
const key = process.env.R24_SUPABASE_KEY;

if (!url || !key) {
  console.error('Supabase URL or publishable key is missing. Check the Environment Variables in Vercel, then redeploy.');
}

// Placeholders stop the build crashing if a setting is missing. The app shows a sign in error instead.
export const supabase = createClient(url || 'https://missing-setting.supabase.co', key || 'missing-key');
