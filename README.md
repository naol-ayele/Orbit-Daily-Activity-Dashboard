# Orbit — Daily Activity Dashboard (backend scaffold)

Static site, no build step. Auth + data storage via Supabase.

## What's here (Module 0 — scaffolding)

```
index.html              dashboard markup + inline login screen (hidden/shown via JS)
js/app.js                existing dashboard logic, wrapped as an ES module (export function init())
js/store.js               data access layer — stubbed, implemented in Module 3
js/supabase-client.js      creates the shared Supabase client
js/config.example.js       template for your Supabase credentials
sql/schema.sql             database schema + Row Level Security policies
```

Nothing is wired to Supabase yet — the dashboard still runs on its original
in-memory state, unchanged. That swap happens in Module 4.

## Setup

1. **Create a Supabase project** at supabase.com → New Project (free tier).
2. **Run the schema.** Open your project's SQL Editor → paste the contents of
   `sql/schema.sql` → Run. This creates the four tables and locks each one
   down with Row Level Security, so a user can only ever see their own rows.
3. **Get your credentials.** Project Settings → API →
   copy the **Project URL** and the **anon / public** key.
4. **Create your config file:**
   ```
   cp js/config.example.js js/config.js
   ```
   Then paste your Project URL and anon key into `js/config.js`.
   (`config.js` is meant to stay untracked/gitignored — the anon key is safe
   in client code *only because* RLS is enabled on every table.)
5. **Run it locally.** Any static file server works, e.g.:
   ```
   npx serve .
   ```
   (Opening `index.html` directly via `file://` won't work — ES module
   imports require an actual HTTP server.)

## Where things stand

- ✅ Module 0 — file structure, this README
- ✅ Module 1 — schema written (`sql/schema.sql`) — **you still need to run it**
  in your own Supabase project
- ⬜ Module 2 — auth wiring (login screen exists in HTML, not yet functional)
- ⬜ Module 3 — implement `js/store.js`
- ⬜ Module 4 — swap `app.js`'s storage calls over to `store.js`
- ⬜ Module 5 — streak logic
- ⬜ Module 6 — realtime sync (optional)
- ⬜ Module 7 — deployment
- ⬜ Module 8 — QA checklist

Hand this project + the module prompt to OpenCode AI to continue from Module 2 onward.

## Confirmed build decisions

- **Login UI:** inline `#loginScreen` overlay inside `index.html` (no separate page/redirect).
- **Module format:** ES modules throughout (`type="module"`, `import`/`export`), loaded via
  `https://esm.sh/@supabase/supabase-js@2` — no bundler, no npm install.
- **Auth flow:** single form that toggles between Log In and Sign Up, rather than two separate forms.
