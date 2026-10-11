'use strict';
/* Hands the browser the PUBLIC Supabase settings from Vercel env vars, so linking Supabase in
   Vercel (Integrations / Storage) is enough — no need to edit config.js.
   Only the URL and the anon/publishable key are exposed; never the service_role key. */
module.exports = (req, res) => {
  const env = process.env;
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.TAKEOVER_ENV = ${JSON.stringify({ supabaseUrl, supabaseAnonKey })};`);
};
