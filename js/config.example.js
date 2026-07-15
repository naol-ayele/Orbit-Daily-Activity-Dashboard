// Copy this file to config.js and fill in your real values.
// config.js is a static-site "env file" — since there's no build step,
// the browser can't read a .env file directly, so credentials live here instead.
//
// Find these in your Supabase project: Project Settings → API
//   - Project URL          -> SUPABASE_URL
//   - anon / public API key -> SUPABASE_ANON_KEY
//
// The anon key is safe to expose in client-side code as long as
// Row Level Security (see /sql/schema.sql) is enabled on every table.

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
