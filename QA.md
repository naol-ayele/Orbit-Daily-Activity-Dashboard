# Orbit — QA Checklist (Manual)

Test every feature below with `npx serve .` in Chrome/Firefox. Check off as you go.

---

## Core flows (Modules 0–8)

- [ ] **Sign up** — Create a new account via the login overlay. Should show dashboard after.
- [ ] **Log in / Log out** — Log out, then log back in with same credentials.
- [ ] **Add task** — Type a title, select category/priority/time/date, click "+ Add Task". Appears in list.
- [ ] **Toggle done** — Click checkbox on a task. Visual check + toast + count updates.
- [ ] **Delete task** — Click ✕. Confirm dialog appears. Cancel → nothing happens. Confirm → task removed + toast.
- [ ] **Calendar navigation** — Click prev/next month arrows. Click a date → tasks for that date load.
- [ ] **Category filter** — Click a category chip → only matching tasks shown. "All" resets.
- [ ] **Priority list** — High-priority tasks appear in the priority card. Toggle updates it.
- [ ] **Schedule / timeline** — Tasks with times appear in the schedule section.
- [ ] **Streak** — Complete all today's tasks → streak increments + confetti fires once per day.
- [ ] **Plans** — Plan cards render with progress rings (if any plans exist in DB).
- [ ] **Realtime** — Open two browser tabs. Add/toggle/delete a task in one → appears in the other within ~1s.
- [ ] **Responsive** — Narrow browser below 1000px → layout stacks to single column.

---

## Module 9 — Edit tasks

- [ ] **Edit button** — Each task card shows a ✎ button next to ✕.
- [ ] **Pre-fill** — Click ✎ → add form populates with task's title, desc, category, priority, time, date.
- [ ] **Button text changes** — Button reads "✎ Update" while editing.
- [ ] **Save edit** — Change title, click "✎ Update" → toast + task updated in list.
- [ ] **Cancel** — Click "Cancel" button or press Escape → form resets, button reverts to "+ Add Task".
- [ ] **Date change** — Edit a task's date → task moves to that day's list. Calendar dot updates.
- [ ] **Optimistic update** — No page flash or loading spinner during save.

---

## Module 10 — Streak heatmap

- [ ] **Grid renders** — GitHub-style contribution grid visible below streak card in sidebar.
- [ ] **Color levels** — Cells show 5 intensity levels (empty → full violet) based on completion_pct.
- [ ] **Hover tooltip** — Hover a cell → tooltip shows date + percentage.
- [ ] **Legend** — "Less" → "More" gradient labels below the grid.
- [ ] **365 days** — Grid shows approximately 52 weeks of data.

---

## Module 11 — Weekly/monthly report

- [ ] **Toggle** — Day / Week / Month chips in the report section header.
- [ ] **Day view** — Shows today's stats + last 7 days bar chart (same as before).
- [ ] **Week view** — Click "Week" → stats show avg completion, active days, best day. Bars show each day of current week.
- [ ] **Month view** — Click "Month" → stats for current month. Bars show weekly buckets.
- [ ] **Active chip** — Selected view chip highlighted in violet.

---

## Module 12 — Search / filter across dates

- [ ] **Search input** — Text input above task list with 🔍 icon.
- [ ] **Text search** — Type a word → task list filters to matching title/desc (200ms debounce).
- [ ] **Date scope toggle** — "📅 Today" button next to search. Click → switches to "📅 All dates".
- [ ] **All dates** — Shows tasks from all dates. Search works across all tasks.
- [ ] **Category + search** — Category chip filter works on top of search results.
- [ ] **Calendar click resets** — Clicking a calendar date resets scope back to that date.

---

## Module 13 — Reminders

- [ ] **Form control** — "Remind me" dropdown in the add/edit form: Off / 5 min / 10 min / 30 min.
- [ ] **Save reminder** — Set reminder on a task with a future time → saved and shown in edit.
- [ ] **Notification fires** — Wait until the reminder window → toast + desktop notification fires.
- [ ] **No duplicate** — Reminder fires only once (reminder_fired_at prevents repeats).
- [ ] **Edit resets** — Edit a task's time → reminder_fired_at resets, fires again.

---

## Module 14 — Recurring tasks

- [ ] **Repeat dropdown** — "Repeat" dropdown in add/edit form: None / Daily / Weekly patterns.
- [ ] **Create recurring** — Add a task with Daily repeat → task created + instance shows today.
- [ ] **Auto-generation** — Navigate to a future date → recurring instance created automatically.
- [ ] **Weekly pattern** — "Weekly: Mon, Wed, Fri" only creates instances on those days.
- [ ] **Edit instance** — Editing a recurring instance also updates the parent template.
- [ ] **No templates in list** — Template rows (is_template=true) never shown in task list.

---

## Module 15 — Subtasks / checklists

- [ ] **Expand control** — Task card shows "📋 0/0 subtasks ▸". Click → expands inline list.
- [ ] **Add subtask** — Type in the "Add subtask..." input, press Enter → subtask appears.
- [ ] **Toggle subtask** — Click the subtask checkbox → toggles done state with strikethrough.
- [ ] **Delete subtask** — Click ✕ on a subtask → confirm dialog → removed.
- [ ] **Count updates** — Expand/summary updates "x/y subtasks done" in real time.
- [ ] **Parent not auto-done** — Completing all subtasks does NOT check the parent task.

---

## Module 16 — PWA

- [ ] **Manifest** — Open DevTools → Application → Manifest. Name, icons, theme color shown.
- [ ] **Service worker** — SW registered for `/sw.js`. App shell cached.
- [ ] **Install prompt** — Browser shows "Install Orbit" (or similar) in address bar after a few visits.
- [ ] **Offline banner** — Disconnect network → amber "📶 You're offline" banner appears at bottom.
- [ ] **Offline writes** — Toggle a task while offline → queued (toast may or may not show depending on error handling).
- [ ] **Reconnect sync** — Reconnect network → queue flushed + "🔄 Offline changes synced" toast.
- [ ] **Cached shell** — Load app once, go offline, refresh → app shell loads (index.html, CSS, JS).

---

## Custom dialog

- [ ] **Delete confirmation** — Click ✕ on a task → custom dark modal appears with task name.
- [ ] **Cancel** — Click Cancel or backdrop or Escape → dialog closes, no deletion.
- [ ] **Confirm** — Click "Delete" → task removed + toast.

---

## Final checks

- [ ] **Console** — No uncaught errors in DevTools console during normal use.
- [ ] **Performance** — Toggle/add/delete feels instant (optimistic updates, no full re-fetch).
- [ ] **GitHub push** — All commits pushed to remote.
