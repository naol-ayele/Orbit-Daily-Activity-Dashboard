/**
 * Orbit dashboard — core app logic.
 * Fully connected to Supabase via store.js (Module 4).
 */

import { supabase } from './supabase-client.js';
import {
  getTasks, getAllTasks, addTask, toggleTask, deleteTask, updateTask, getAllTemplates,
  getSubtasks, addSubtask, toggleSubtask, deleteSubtask,
  getPlans, updatePlanProgress,
  getHistory, upsertTodayHistory,
  getProfile,
  getTaskDatesInRange,
  checkAndResetStreak, updateStreakIfAllDone,
  subscribeToTasks
} from './store.js';

/* ============ STATE ============ */
const CATEGORY_COLORS = {
  Work: '#5cc8ff',
  Personal: '#ff7ac6',
  Health: '#4fe3c1',
  Learning: '#a78bfa',
  Errands: '#ffb545'
};

const todayISO = new Date().toISOString().slice(0, 10);

let state = {
  activeCategory: 'All',
  calendarView: new Date(),
  selectedDate: todayISO,
  streak: 0,
  dailyGoalTarget: 5,
  tasks: [],
  plans: [],
  history: [],
  taskDates: new Set(),
  heatmapData: [],
  reportView: 'day',
  searchQuery: '',
  showAllDates: false,
  subtasksCache: {},
  expandedTasks: new Set()
};

let confettiFiredToday = false;
let tasksSubscription = null;
let lastRealtimeUpdate = 0;
let notifiedDeadlines = new Set();
let deadlineInterval = null;
let notificationHistory = [];
let notifIdCounter = 0;
let skipNextRealtime = false;
let editingTaskId = null;

/* ============ NOTIFICATIONS ============ */
function updateNotifBtn(state) {
  const btn = document.getElementById('notifBtn');
  if (!btn) return;
  btn.className = 'notif-btn';
  if (state === 'granted') { btn.classList.add('granted'); btn.textContent = '🔔'; }
  else if (state === 'denied') { btn.classList.add('denied'); btn.textContent = '🔕'; }
  else { btn.textContent = '🔔'; }
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification('Orbit', { body: 'Notifications are already enabled.' });
    return;
  }
  const result = await Notification.requestPermission();
  updateNotifBtn(result);
  if (result === 'granted') {
    new Notification('Orbit', { body: 'Desktop notifications enabled! You\'ll get deadline alerts here.' });
  }
}

function fireDesktopNotif(message) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Orbit', { body: message, icon: '/favicon.ico' });
}

function renderNotifPanel() {
  const body = document.getElementById('notifPanelBody');
  if (!body) return;
  if (notificationHistory.length === 0) {
    body.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  body.innerHTML = notificationHistory.slice().reverse().map(n =>
    `<div class="notif-item ${n.type}">
      ${n.message}
      <div class="notif-time">${n.time.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
    </div>`
  ).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const wasHidden = panel.classList.contains('app-hidden');
  panel.classList.toggle('app-hidden');
  if (wasHidden) renderNotifPanel();
}

/* ============ TOAST ============ */
function showToast(message, type, duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  container.appendChild(el);
  if (type === 'error' || type === 'warning') fireDesktopNotif(message);

  notificationHistory.push({ id: ++notifIdCounter, message, type, time: new Date() });
  const panel = document.getElementById('notifPanel');
  if (panel && !panel.classList.contains('app-hidden')) renderNotifPanel();

  setTimeout(() => { if (el.parentNode) el.remove(); }, duration);
}

/* ============ DEADLINE CHECK ============ */
function isWithinMinutes(taskTime, nowTime, mins) {
  const [th, tm] = taskTime.split(':').map(Number);
  const [nh, nm] = nowTime.split(':').map(Number);
  const taskMin = th * 60 + tm;
  const nowMin = nh * 60 + nm;
  return taskMin > nowMin && taskMin - nowMin <= mins;
}

function checkDeadlines() {
  if (state.selectedDate !== todayISO) return;
  const now = new Date();
  const nowStr = now.toTimeString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  todaysTasks().filter(t => !t.done && t.time).forEach(t => {
    ['overdue', 'upcoming'].forEach(subtype => {
      const key = t.id + '-' + subtype;
      if (notifiedDeadlines.has(key)) return;
      if (subtype === 'overdue' && t.time <= nowStr) {
        showToast(`🔴 Overdue: "${t.title}" (was ${t.time})`, 'error');
        notifiedDeadlines.add(key);
      } else if (subtype === 'upcoming' && isWithinMinutes(t.time, nowStr, 30)) {
        showToast(`🟡 Soon: "${t.title}" at ${t.time}`, 'warning');
        notifiedDeadlines.add(key);
      }
    });
    if (t.reminder_minutes_before != null && t.reminder_minutes_before > 0 && !t.reminder_fired_at && t.time) {
      const [th, tm] = t.time.split(':').map(Number);
      const taskMin = th * 60 + tm;
      const remindMin = taskMin - t.reminder_minutes_before;
      if (nowMin >= remindMin && nowMin < taskMin) {
        showToast(`⏰ "${t.title}" in ${t.reminder_minutes_before} min`, 'warning');
        updateTask(t.id, { reminder_fired_at: new Date().toISOString() }).catch(() => {});
        t.reminder_fired_at = new Date().toISOString();
      }
    }
  });
}

/* ============ AUTH ============ */
let authMode = 'login';

async function showDashboard() {
  document.getElementById('loginScreen').classList.add('app-hidden');
  document.getElementById('appShell').classList.remove('app-hidden');
  document.getElementById('loadingOverlay').style.display = 'flex';
  try {
    await loadAllData();
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
  }
  renderAll();

  if ('Notification' in window) {
    updateNotifBtn(Notification.permission);
    const permBtn = document.getElementById('notifPermBtn');
    if (permBtn) {
      if (Notification.permission === 'granted') {
        permBtn.textContent = '✓ Desktop notifications enabled';
        permBtn.classList.add('granted');
      } else if (Notification.permission === 'denied') {
        permBtn.textContent = 'Notifications blocked';
        permBtn.disabled = true;
      }
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    if (tasksSubscription) supabase.removeChannel(tasksSubscription);
    tasksSubscription = subscribeToTasks(user.id, handleTaskChange);
  }
  checkDeadlines();
  if (deadlineInterval) clearInterval(deadlineInterval);
  deadlineInterval = setInterval(checkDeadlines, 60000);
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('app-hidden');
  document.getElementById('appShell').classList.add('app-hidden');
}

async function loadAllData() {
  const [profile, plans, history, heatmapHistory] = await Promise.all([
    getProfile().catch(() => null),
    getPlans().catch(() => []),
    getHistory(7).catch(() => []),
    getHistory(365).catch(() => [])
  ]);
  state.heatmapData = heatmapHistory;

  state.plans = plans;

  const filteredHistory = (history || []).filter(h => h.entry_date !== todayISO);
  state.history = filteredHistory.map(h => ({
    day: new Date(h.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    pct: h.completion_pct
  }));

  if (profile) {
    state.dailyGoalTarget = profile.daily_goal_target || 5;
    confettiFiredToday = profile.last_completed_date === todayISO;
  }

  const streakResult = await checkAndResetStreak().catch(() => null);
  state.streak = streakResult ? streakResult.streak : (profile ? profile.streak || 0 : 0);

  await loadTasks();
  await loadTaskDatesForMonth();
}

/* ---------- recurring tasks ---------- */
function matchesRecurrence(recurrence, date) {
  if (!recurrence) return false;
  if (recurrence === 'daily') return true;
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayLabel = days[date.getDay()];
  return recurrence.includes(dayLabel);
}

async function generateInstancesForDate(dateStr) {
  try {
    const templates = await getAllTemplates();
    if (!templates.length) return;
    const date = new Date(dateStr + 'T00:00:00');
    const { data: existing } = await supabase
      .from('tasks')
      .select('recurrence_parent_id')
      .eq('task_date', dateStr)
      .not('recurrence_parent_id', 'is', null);
    const existingIds = new Set((existing || []).map(r => r.recurrence_parent_id));
    for (const tmpl of templates) {
      if (!matchesRecurrence(tmpl.recurrence, date)) continue;
      if (existingIds.has(tmpl.id)) continue;
      await addTask({
        title: tmpl.title, desc: tmpl.desc, category: tmpl.category,
        priority: tmpl.priority, time: tmpl.time || '', date: dateStr,
        recurrence_parent_id: tmpl.id, is_template: false
      });
    }
  } catch (_) {}
}

async function loadTasks() {
  try {
    if (!state.showAllDates) await generateInstancesForDate(state.selectedDate);
    const raw = state.showAllDates ? await getAllTasks() : await getTasks(state.selectedDate);
    state.tasks = (raw || []).filter(t => !t.is_template);
  } catch {
    state.tasks = [];
  }
}

async function loadTaskDatesForMonth() {
  const year = state.calendarView.getFullYear();
  const month = state.calendarView.getMonth();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  try {
    state.taskDates = await getTaskDatesInRange(startDate, endDate);
  } catch {
    state.taskDates = new Set();
  }
}

/* ---------- heatmap ---------- */
function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;
  const data = state.heatmapData || [];
  const map = {};
  for (const entry of data) map[entry.entry_date] = entry.completion_pct;

  const today = new Date();
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);

  let html = '';
  const cursor = new Date(start);
  while (cursor <= end) {
    html += '<div class="heatmap-col">';
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      const pct = map[iso];
      let level = 0;
      if (pct !== undefined) {
        if (pct >= 100) level = 4;
        else if (pct >= 66) level = 3;
        else if (pct >= 33) level = 2;
        else if (pct > 0) level = 1;
      }
      const tip = pct !== undefined ? `${iso}: ${Math.round(pct)}%` : iso;
      html += `<div class="heat-cell l${level}"><span class="heat-tip">${tip}</span></div>`;
      cursor.setDate(cursor.getDate() + 1);
    }
    html += '</div>';
  }
  grid.innerHTML = html;
}

function renderAll() {
  renderGreeting();
  renderCategoryChips();
  renderTasks();
  renderPriority();
  renderTimeline();
  renderCalendar();
  renderPlans();
  renderReport();
  renderHeatmap();
  document.getElementById('streakNum').textContent = state.streak;
  document.getElementById('taskDate').value = todayISO;
}

/* ============ REALTIME ============ */
async function handleTaskChange() {
  if (skipNextRealtime) { skipNextRealtime = false; return; }
  try {
    await Promise.all([loadTasks(), loadTaskDatesForMonth()]);
    renderTasks();
    renderPriority();
    renderTimeline();
    renderCalendar();
    renderReport();
  } catch (_) {}
}

/* ============ INIT ============ */
export async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
}

/* ============ AUTH FORM ============ */
document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('authError');
  errorEl.textContent = '';
  errorEl.style.color = '';
  if (!email || !password) {
    errorEl.textContent = 'Please fill in both fields.';
    return;
  }
  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? 'Logging in…' : 'Signing up…';

  try {
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      errorEl.textContent = 'Check your email for the confirmation link.';
      errorEl.style.color = 'var(--mint)';
      btn.disabled = false;
      btn.textContent = 'Sign Up';
      return;
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Authentication failed.';
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Log In' : 'Sign Up';
  }
});

document.getElementById('authToggleBtn').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Log in' : 'Sign up';
  document.getElementById('authSubmitBtn').textContent = authMode === 'login' ? 'Log In' : 'Sign Up';
  document.getElementById('authToggleText').textContent = authMode === 'login' ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('authToggleBtn').textContent = authMode === 'login' ? 'Sign up' : 'Log in';
  document.getElementById('authError').textContent = '';
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    showDashboard();
  } else if (event === 'SIGNED_OUT') {
    if (tasksSubscription) { supabase.removeChannel(tasksSubscription); tasksSubscription = null; }
    if (deadlineInterval) { clearInterval(deadlineInterval); deadlineInterval = null; }
    showLogin();
  }
});

document.getElementById('notifBtn').addEventListener('click', toggleNotifPanel);

document.getElementById('notifPanelClear').addEventListener('click', () => {
  notificationHistory = [];
  renderNotifPanel();
});

document.getElementById('notifPermBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  const result = await Notification.requestPermission();
  updateNotifBtn(result);
  const btn = document.getElementById('notifPermBtn');
  if (result === 'granted') {
    btn.textContent = '✓ Desktop notifications enabled';
    btn.classList.add('granted');
    new Notification('Orbit', { body: 'You\'re all set!' });
  } else if (result === 'denied') {
    btn.textContent = 'Notifications blocked';
    btn.disabled = true;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

/* ============ GREETING ============ */
function renderGreeting() {
  const hour = new Date().getHours();
  const g = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = g + ' 👋';
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('en-US', opts);
}

/* ============ CATEGORY CHIPS ============ */
function renderCategoryChips() {
  const wrap = document.getElementById('categoryChips');
  const cats = ['All', ...Object.keys(CATEGORY_COLORS)];
  wrap.innerHTML = cats.map(c => {
    const color = CATEGORY_COLORS[c] || '#a78bfa';
    const active = state.activeCategory === c ? 'active' : '';
    return `<button class="chip ${active}" data-cat="${c}">
      ${c !== 'All' ? `<span class="swatch" style="background:${color}"></span>` : ''}${c}
    </button>`;
  }).join('');
  wrap.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      state.activeCategory = el.dataset.cat;
      renderCategoryChips();
      renderTasks();
    });
  });
}

/* ============ TASKS ============ */
function todaysTasks() {
  return state.tasks.filter(t => t.date === state.selectedDate);
}

function getDisplayTasks() {
  let items = state.showAllDates ? state.tasks : todaysTasks();
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    items = items.filter(t => t.title.toLowerCase().includes(q) || (t.desc || '').toLowerCase().includes(q));
  }
  return items;
}

function renderTasks() {
  const list = document.getElementById('taskList');
  let items = getDisplayTasks();
  if (state.activeCategory !== 'All') items = items.filter(t => t.category === state.activeCategory);
  items = [...items].sort((a, b) => a.done - b.done);

  const all = getDisplayTasks();
  document.getElementById('taskCount').textContent = `${all.filter(t => !t.done).length} open · ${all.length} total`;

  if (items.length === 0) {
    list.innerHTML = `<div class="task-item" style="justify-content:center; color:var(--text-faint); font-style:italic;">No tasks in this view yet.</div>`;
  } else {
    list.innerHTML = items.map(taskItemHTML).join('');
  }
  attachTaskEvents(list);
  updateDailyGoal();
  updateStreakAndConfetti();
}

function taskItemHTML(t) {
  const catColor = CATEGORY_COLORS[t.category] || '#888';
  const subs = state.subtasksCache[t.id] || [];
  const doneCount = subs.filter(s => s.done).length;
  const expanded = state.expandedTasks.has(t.id);
  return `
  <div class="task-item ${t.done ? 'done' : ''} ${expanded ? 'expanded' : ''}" data-id="${t.id}">
    <div class="checkbox" data-check="${t.id}">${t.done ? '✓' : ''}</div>
    <div class="task-body">
      <div class="task-top">
        <div class="task-title">${escapeHTML(t.title)}</div>
        <div class="task-actions">
          <button class="task-del" data-edit="${t.id}" title="Edit">✎</button>
          <button class="task-del" data-del="${t.id}">✕</button>
        </div>
      </div>
      ${t.desc ? `<div class="task-desc">${escapeHTML(t.desc)}</div>` : ''}
      <div class="task-tags">
        <span class="tagpill prio-${t.priority}">${t.priority}</span>
        <span class="tagpill cat-pill" style="border-color:${catColor}55;">${t.category}</span>
        ${t.time ? `<span class="tagpill cat-pill">🕐 ${t.time}</span>` : ''}
      </div>
      <div class="subtask-section">
        <div class="subtask-summary" data-expand="${t.id}">
          📋 ${doneCount}/${subs.length} subtasks ${expanded ? '▾' : '▸'}
        </div>
        ${expanded ? `
        <div class="subtask-list">
          ${subs.map(s => `
            <div class="subtask-item ${s.done ? 'done' : ''}">
              <span class="subtask-check" data-stoggle="${s.id}">${s.done ? '✓' : ''}</span>
              <span class="subtask-title">${escapeHTML(s.title)}</span>
              <button class="subtask-del" data-sdel="${s.id}">✕</button>
            </div>
          `).join('')}
          <div class="subtask-add">
            <input type="text" placeholder="Add subtask..." data-sadd="${t.id}">
          </div>
        </div>` : ''}
      </div>
    </div>
  </div>`;
}

function attachTaskEvents(root) {
  root.querySelectorAll('[data-check]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.check;
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      skipNextRealtime = true;
      task.done = !task.done;
      await toggleTask(id);
      showToast(task.done ? `✓ "${task.title}" done!` : `↩ "${task.title}" reopened`, task.done ? 'success' : 'warning');
      renderTasks();
      renderPriority();
      renderReport();
    });
  });
  root.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.del;
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      const confirmed = await showConfirmDialog(`Delete "${task.title}"? This cannot be undone.`);
      if (!confirmed) return;
      if (!state.tasks.find(t => t.id === id)) return;
      skipNextRealtime = true;
      const idx = state.tasks.indexOf(task);
      if (idx !== -1) state.tasks.splice(idx, 1);
      await deleteTask(id);
      showToast(`🗑 "${task.title}" deleted`, 'warning');
      renderTasks();
      renderPriority();
      renderReport();
      renderTimeline();
    });
  });
  root.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', () => {
      const task = state.tasks.find(t => t.id === el.dataset.edit);
      if (!task) return;
      editingTaskId = task.id;
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskDesc').value = task.desc || '';
      document.getElementById('taskCategory').value = task.category;
      document.getElementById('taskPriority').value = task.priority;
      document.getElementById('taskTime').value = task.time || '';
      document.getElementById('taskDate').value = task.date;
      document.getElementById('taskRemind').value = task.reminder_minutes_before != null ? String(task.reminder_minutes_before) : '';
      document.getElementById('taskRepeat').value = task.recurrence || '';
      document.getElementById('addTaskBtn').textContent = '✎ Update';
      document.getElementById('taskTitle').focus();
      document.getElementById('cancelEditBtn').style.display = '';
    });
  });
  root.querySelectorAll('[data-expand]').forEach(el => {
    el.addEventListener('click', async () => {
      const taskId = el.dataset.expand;
      if (state.expandedTasks.has(taskId)) {
        state.expandedTasks.delete(taskId);
      } else {
        state.expandedTasks.add(taskId);
        if (!state.subtasksCache[taskId]) {
          state.subtasksCache[taskId] = await getSubtasks(taskId);
        }
      }
      renderTasks();
      renderPriority();
    });
  });
  root.querySelectorAll('[data-stoggle]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.stoggle;
      const taskId = el.closest('.task-item')?.dataset.id;
      if (!taskId) return;
      const subs = state.subtasksCache[taskId];
      const sub = subs?.find(s => s.id === id);
      if (!sub) return;
      sub.done = !sub.done;
      await toggleSubtask(id);
      renderTasks();
      renderPriority();
    });
  });
  root.querySelectorAll('[data-sdel]').forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.dataset.sdel;
      const taskId = el.closest('.task-item')?.dataset.id;
      if (!taskId || !(await showConfirmDialog('Delete this subtask?'))) return;
      const subs = state.subtasksCache[taskId];
      if (subs) { const idx = subs.findIndex(s => s.id === id); if (idx !== -1) subs.splice(idx, 1); }
      await deleteSubtask(id);
      renderTasks();
      renderPriority();
    });
  });
  root.querySelectorAll('[data-sadd]').forEach(el => {
    el.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return;
      const title = e.target.value.trim();
      if (!title) return;
      const taskId = el.dataset.sadd;
      const created = await addSubtask(taskId, title);
      if (!state.subtasksCache[taskId]) state.subtasksCache[taskId] = [];
      state.subtasksCache[taskId].push(created);
      e.target.value = '';
      renderTasks();
      renderPriority();
    });
  });
}

function cancelEdit() {
  editingTaskId = null;
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskTime').value = '';
  document.getElementById('taskRemind').value = '';
  document.getElementById('addTaskBtn').textContent = '+ Add Task';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- confirm dialog ---------- */
function showConfirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmDialog');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (!overlay || !msgEl || !okBtn || !cancelBtn) { resolve(true); return; }
    msgEl.textContent = message;
    overlay.classList.add('active');
    okBtn.focus();
    function cleanup(result) {
      overlay.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === overlay) cleanup(false); }
    function onKey(e) { if (e.key === 'Escape') cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editingTaskId) cancelEdit(); });

/* ---------- search / date scope ---------- */
let searchDebounce = null;
document.getElementById('taskSearch')?.addEventListener('input', e => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.searchQuery = e.target.value.trim();
    renderTasks();
    renderPriority();
  }, 200);
});
document.getElementById('dateScopeBtn')?.addEventListener('click', async () => {
  state.showAllDates = !state.showAllDates;
  const btn = document.getElementById('dateScopeBtn');
  btn.textContent = state.showAllDates ? '📅 All dates' : '📅 Today';
  btn.classList.toggle('active', state.showAllDates);
  await loadTasks();
  renderTasks();
  renderPriority();
  renderTimeline();
  renderReport();
});

document.getElementById('addTaskBtn').addEventListener('click', async () => {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) return;
  const desc = document.getElementById('taskDesc').value.trim();
  const category = document.getElementById('taskCategory').value;
  const priority = document.getElementById('taskPriority').value;
  const time = document.getElementById('taskTime').value.trim();
  const date = document.getElementById('taskDate').value || todayISO;
  const remindVal = document.getElementById('taskRemind').value;
  const reminder_minutes_before = remindVal ? Number(remindVal) : null;

  if (editingTaskId) {
    skipNextRealtime = true;
    const idx = state.tasks.findIndex(t => t.id === editingTaskId);
    const oldDate = idx !== -1 ? state.tasks[idx].date : null;
    const changes = { title, desc, category, priority, time, date, reminder_minutes_before, reminder_fired_at: null };
    const task = state.tasks[idx];
    const repeatVal = document.getElementById('taskRepeat').value;
    if (repeatVal) changes.recurrence = repeatVal;
    await updateTask(editingTaskId, changes);
    if (idx !== -1) Object.assign(state.tasks[idx], changes);
    if (task && task.recurrence_parent_id) {
      const tChanges = { title, desc, category, priority, time };
      if (repeatVal) tChanges.recurrence = repeatVal;
      await updateTask(task.recurrence_parent_id, tChanges).catch(() => {});
    }
    showToast(`✎ "${title}" updated`, 'success');
    cancelEdit();
    renderTasks();
    renderPriority();
    renderReport();
    renderTimeline();
    if (oldDate && oldDate !== date) {
      await loadTaskDatesForMonth();
      renderCalendar();
    }
    return;
  }

  const repeatVal = document.getElementById('taskRepeat').value;

  skipNextRealtime = true;

  if (repeatVal) {
    const tmpl = await addTask({ title, desc, category, priority, time, date, reminder_minutes_before, recurrence: repeatVal, is_template: true });
    const instance = await addTask({ title, desc, category, priority, time, date: date, reminder_minutes_before, recurrence_parent_id: tmpl.id, is_template: false });
    state.tasks.push(instance);
    if (date && !state.taskDates.has(date)) state.taskDates.add(date);
  } else {
    const created = await addTask({ title, desc, category, priority, time, date, reminder_minutes_before });
    state.tasks.push(created);
    if (date && !state.taskDates.has(date)) state.taskDates.add(date);
  }

  showToast(`✓ "${title}" added`, 'success');

  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskTime').value = '';
  document.getElementById('taskRemind').value = '';
  document.getElementById('taskRepeat').value = '';

  renderTasks();
  renderPriority();
  renderTimeline();
  renderReport();
  renderCalendar();
});

/* ---------- report toggle ---------- */
document.querySelectorAll('.report-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.report-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.reportView = btn.dataset.view;
    renderReport();
  });
});

/* ============ PRIORITY LIST ============ */
function renderPriority() {
  const list = document.getElementById('priorityList');
  const items = todaysTasks().filter(t => t.priority === 'high').sort((a, b) => a.done - b.done);
  document.getElementById('prioCount').textContent = `${items.filter(t => !t.done).length} open high priority`;
  list.innerHTML = items.length
    ? items.map(taskItemHTML).join('')
    : `<div class="task-item" style="justify-content:center; color:var(--text-faint); font-style:italic;">No high priority tasks today. 🎉</div>`;
  attachTaskEvents(list);
}

/* ============ DAILY GOAL ============ */
function updateDailyGoal() {
  const done = todaysTasks().filter(t => t.done).length;
  const pct = Math.min(100, Math.round((done / state.dailyGoalTarget) * 100));
  document.getElementById('dailyGoalFill').style.width = pct + '%';
  document.getElementById('dailyGoalCount').textContent = `${done} of ${state.dailyGoalTarget}`;
  document.getElementById('dailyGoalPct').textContent = pct + '%';
}

/* ============ TIMELINE / SCHEDULE ============ */
function renderTimeline() {
  const card = document.getElementById('timelineCard');
  const hours = ['07:00', '09:00', '11:00', '14:00', '18:00', '19:30', '20:00'];
  const tasksByTime = {};
  todaysTasks().forEach(t => { if (t.time) tasksByTime[t.time] = t; });

  const slots = [...new Set([...hours, ...Object.keys(tasksByTime)])].sort();

  card.innerHTML = slots.map(time => {
    const t = tasksByTime[time];
    if (t) {
      const catColor = CATEGORY_COLORS[t.category] || '#888';
      return `<div class="tl-row">
        <div class="tl-time">${time}</div>
        <div class="tl-block" style="border-left-color:${catColor}">
          <span>${escapeHTML(t.title)}</span>
          <span class="badge" style="background:${catColor}22; color:${catColor}">${t.category}</span>
        </div>
      </div>`;
    }
    return `<div class="tl-row">
      <div class="tl-time">${time}</div>
      <div class="tl-block empty">Open slot</div>
    </div>`;
  }).join('');
}

/* ============ CALENDAR ============ */
function renderCalendar() {
  const view = state.calendarView;
  const year = view.getFullYear(), month = view.getMonth();
  document.getElementById('calMonthLabel').textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calGrid');
  const dows = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-day muted">${daysInPrevMonth - i}</div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = iso === todayISO;
    const isSelected = iso === state.selectedDate;
    const hasTask = state.taskDates.has(iso);
    html += `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${iso}">
      ${d}${hasTask && !isToday ? '<span class="dot"></span>' : ''}
    </div>`;
  }
  const totalCells = firstDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= trailing; d++) {
    html += `<div class="cal-day muted">${d}</div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', async () => {
      state.selectedDate = el.dataset.date;
      if (state.showAllDates) {
        state.showAllDates = false;
        const btn = document.getElementById('dateScopeBtn');
        btn.textContent = '📅 Today';
        btn.classList.remove('active');
      }
      await loadTasks();
      renderCalendar();
      renderTasks();
      renderPriority();
      renderTimeline();
    });
  });
}

document.getElementById('calPrev').addEventListener('click', async () => {
  state.calendarView.setMonth(state.calendarView.getMonth() - 1);
  state.calendarView = new Date(state.calendarView);
  await loadTaskDatesForMonth();
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click', async () => {
  state.calendarView.setMonth(state.calendarView.getMonth() + 1);
  state.calendarView = new Date(state.calendarView);
  await loadTaskDatesForMonth();
  renderCalendar();
});

/* ============ PLAN TRACKER ============ */
function renderPlans() {
  const grid = document.getElementById('planGrid');
  grid.innerHTML = state.plans.map(p => {
    const color = CATEGORY_COLORS[p.category] || '#a78bfa';
    const circumference = 2 * Math.PI * 30;
    const offset = circumference - (p.progress / 100) * circumference;
    return `<div class="plan-card">
      <div class="plan-cat">${p.category}</div>
      <div class="plan-title">${escapeHTML(p.title)}</div>
      <div class="ring-wrap">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" stroke="rgba(255,255,255,0.08)" stroke-width="7" fill="none"/>
          <circle cx="36" cy="36" r="30" stroke="${color}" stroke-width="7" fill="none"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 36 36)"/>
          <text x="36" y="41" text-anchor="middle" font-size="15" fill="#eef0f4" font-family="IBM Plex Mono">${p.progress}%</text>
        </svg>
        <div class="plan-note">${escapeHTML(p.note)}</div>
      </div>
    </div>`;
  }).join('');
}

/* ============ REPORT ============ */
function renderReport() {
  const barsTitle = document.getElementById('barsTitle');
  const bars = document.getElementById('barsRow');
  const stats = document.getElementById('reportStats');
  document.querySelectorAll('.report-chip').forEach(b => b.classList.toggle('active', b.dataset.view === state.reportView));

  if (state.reportView === 'day') {
    const today = todaysTasks();
    const done = today.filter(t => t.done).length;
    const total = today.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const highOpen = today.filter(t => t.priority === 'high' && !t.done).length;

    stats.innerHTML = `
      <div class="stat-card"><div class="stat-num mono">${done}/${total}</div><div class="stat-label">Tasks Completed</div></div>
      <div class="stat-card"><div class="stat-num mono">${pct}%</div><div class="stat-label">Completion Rate</div></div>
      <div class="stat-card"><div class="stat-num mono">${highOpen}</div><div class="stat-label">High Priority Open</div></div>
      <div class="stat-card"><div class="stat-num mono">${state.streak}</div><div class="stat-label">Day Streak</div></div>
    `;

    if (barsTitle) barsTitle.textContent = 'Last 7 Days Completion';
    const hist = [...state.history, { day: 'Today', pct }];
    bars.innerHTML = hist.map(h => `
      <div class="bar-col ${h.day === 'Today' ? 'today' : ''}">
        <div class="bar-fill" style="height:${Math.max(4, h.pct)}%"></div>
        <div class="bar-day">${h.day}</div>
      </div>
    `).join('');
    return;
  }

  const rawData = state.heatmapData || [];
  const now = new Date();
  let start, end, labelFn;

  if (state.reportView === 'week') {
    const dayOfWeek = now.getDay();
    start = new Date(now); start.setDate(now.getDate() - dayOfWeek);
    end = new Date(start); end.setDate(start.getDate() + 6);
    if (barsTitle) barsTitle.textContent = 'This Week';
    labelFn = d => d.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (barsTitle) barsTitle.textContent = 'This Month';
    labelFn = d => String(d.getDate());
  }

  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const entries = rawData.filter(h => h.entry_date >= startStr && h.entry_date <= endStr);

  const avgPct = entries.length ? Math.round(entries.reduce((s, e) => s + e.completion_pct, 0) / entries.length) : 0;
  const activeDays = entries.filter(e => e.completion_pct > 0).length;
  const totalDays = Math.round((end - start) / 86400000) + 1;
  let bestDay = { entry_date: '', completion_pct: 0 };
  for (const e of entries) { if (e.completion_pct > bestDay.completion_pct) bestDay = e; }

  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num mono">${avgPct}%</div><div class="stat-label">Avg Completion</div></div>
    <div class="stat-card"><div class="stat-num mono">${activeDays}/${totalDays}</div><div class="stat-label">Active Days</div></div>
    <div class="stat-card"><div class="stat-num mono">${bestDay.completion_pct}%</div><div class="stat-label">Best Day${bestDay.entry_date ? ` (${bestDay.entry_date})` : ''}</div></div>
    <div class="stat-card"><div class="stat-num mono">${state.streak}</div><div class="stat-label">Day Streak</div></div>
  `;

  if (state.reportView === 'month') {
    const weekBuckets = [];
    let weekStart = new Date(start);
    while (weekStart <= end) {
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEntries = rawData.filter(h => h.entry_date >= weekStart.toISOString().slice(0, 10) && h.entry_date <= weekEnd.toISOString().slice(0, 10) && h.entry_date <= endStr);
      const avg = weekEntries.length ? Math.round(weekEntries.reduce((s, e) => s + e.completion_pct, 0) / weekEntries.length) : 0;
      weekBuckets.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, pct: avg });
      weekStart.setDate(weekStart.getDate() + 7);
    }
    bars.innerHTML = weekBuckets.map(w => `
      <div class="bar-col">
        <div class="bar-fill" style="height:${Math.max(4, w.pct)}%"></div>
        <div class="bar-day">${w.label}</div>
      </div>
    `).join('');
  } else {
    const dayMap = {};
    for (const e of entries) dayMap[e.entry_date] = e.completion_pct;
    let cursor = new Date(start);
    let dayHtml = '';
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      const pct = dayMap[iso] || 0;
      const isToday = iso === todayISO;
      dayHtml += `<div class="bar-col${isToday ? ' today' : ''}">
        <div class="bar-fill" style="height:${Math.max(4, pct)}%"></div>
        <div class="bar-day">${labelFn(cursor)}</div>
      </div>`;
      cursor.setDate(cursor.getDate() + 1);
    }
    bars.innerHTML = dayHtml;
  }
}

/* ============ STREAK + CONFETTI ============ */
function updateStreakAndConfetti() {
  if (!confettiFiredToday && state.selectedDate === todayISO) {
    updateStreakIfAllDone(state.tasks, todayISO).then(result => {
      if (result) {
        confettiFiredToday = true;
        state.streak = result.streak;
        document.getElementById('streakNum').textContent = state.streak;
        fireConfetti();
      }
    }).catch(() => {});
  }
}

const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function fireConfetti() {
  const colors = ['#ff6b6b', '#ffb545', '#4fe3c1', '#a78bfa', '#5cc8ff', '#ff7ac6'];
  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.3,
    r: 4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 10
  }));
  let frame = 0;
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    });
    if (alive && frame < 260) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  tick();
}
