/** @type {import('next').NextConfig} */

// Accepts the Vercel setting names with or without NEXT_PUBLIC_, and passes the
// browser-safe ones (URL, publishable key, invoice email) through to the browser.
const pick = (...names) => names.map((n) => process.env[n]).find(Boolean) || '';

const nextConfig = {
  env: {
    R24_SUPABASE_URL: pick('SUPABASE_URL', 'NEXT_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    R24_SUPABASE_KEY: pick(
      'SUPABASE_ANON_KEY', 'NEXT_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY', 'NEXT_SUPABASE_PUBLISHABLE_KEY'
    ),
    R24_INVOICE_EMAIL: pick('INVOICE_EMAIL', 'NEXT_INVOICE_EMAIL', 'NEXT_PUBLIC_INVOICE_EMAIL') || 's.kajee@robot24.com',
  },
  // Old page addresses forward to the new sections, including the tab, so bookmarks keep working
  async redirects() {
    const tab = (source, value, destination) => ({ source, has: [{ type: 'query', key: 'tab', value }], destination, permanent: false });
    return [
      tab('/finance', 'upload', '/money?tab=inbox'),
      tab('/finance', 'month', '/money?tab=bills'),
      tab('/finance', 'missing', '/money?tab=missing'),
      tab('/finance', 'direct', '/jobs?tab=travel'),
      tab('/finance', 'team', '/people?tab=records'),
      tab('/assignments', 'calendar', '/jobs?tab=calendar'),
      tab('/assignments', 'travel', '/jobs?tab=travel'),
      { source: '/finance', destination: '/money', permanent: false },
      { source: '/assignments', destination: '/jobs', permanent: false },
      { source: '/directory', destination: '/people', permanent: false },
      { source: '/approvals', destination: '/money?tab=approvals', permanent: false },
    ];
  },
};

export default nextConfig;
