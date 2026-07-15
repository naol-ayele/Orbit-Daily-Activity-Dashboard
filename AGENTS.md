# Orbit — AGENTS.md

## Architecture
- Static vanilla HTML/CSS/JS site. **No build step, no bundler, no npm.**
- ES modules throughout. `index.html` loads `js/app.js` via `<script type="module">`.
- Supabase client imported from `https://esm.sh/@supabase/supabase-js@2` at runtime.
- Auth UI is an **inline overlay** (`#loginScreen` in `index.html`), not a separate page.
- All dashboard markup + CSS is in `index.html`; logic is in `js/app.js`.

## Before anything works
- `js/config.js` must exist (copy from `js/config.example.js`). **It is gitignored.**
- The schema in `sql/schema.sql` must be run manually in the Supabase SQL Editor.
- Serve via `npx serve .` (or any static server). `file://` will fail for ES module imports.

## Module build order (from README)
0–1 ✅ done | 2 Auth ✅ | 3 store.js ✅ | 4 Frontend integration ✅ | 5 Streak ✅ | 6 Realtime ✅ | 7 Deploy | 8 QA

## Current state (scaffolding)
- `js/store.js` — all 10 functions throw `"not implemented"`. Auth not wired yet.
- `js/app.js` — uses `store.js` for all data operations (Supabase-backed). `init()` exported.
- `js/supabase-client.js` — ready, imports from `./config.js`.

## Key conventions
- Dark theme CSS variables in `:root` (--bg, --panel, --violet, --mint, --coral, --grad-1/2/3).
- Fonts: `Unbounded` (headings), `IBM Plex Sans` (body), `IBM Plex Mono` (mono). From Google Fonts.
- Category colors: `CATEGORY_COLORS` map in `app.js:10`.
- Task priorities: `high`/`medium`/`low` with CSS classes `.prio-high/medium/low`.
- Calendar dots show task presence; confetti fires once per day when all tasks done.

## API / storage layer
- `store.js` exports Promise-based functions: `getTasks(date)`, `addTask(task)`, `toggleTask(id)`, `deleteTask(id)`, `getPlans()`, `updatePlanProgress(id, progress)`, `getHistory(days)`, `upsertTodayHistory(pct)`, `getProfile()`, `updateProfile(partial)`.
- Every query must scope to `supabase.auth.getUser()?.id`. RLS enforces this server-side.
- Streak logic (Module 5) lives in `store.js`, called after `toggleTask`.

## Running locally
```sh
npx serve .
# Then open http://localhost:3000
```

## No tests
- No test framework, CI, or linter config. Verification is manual (Module 8 QA checklist).

## Deletion safety rule
Before deleting or removing any file, code block, CSS rule, DOM element, or data path, you **must** explain:
1. What you are deleting and why
2. What depends on it (imports, event listeners, DOM references, style cascade, etc.)
3. What will break if removed
4. Your plan for handling the breakage (migration, redirect, fallback, etc.)

Wait for explicit user confirmation before deleting anything non-trivial.
