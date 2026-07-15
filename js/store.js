import { supabase } from './supabase-client.js';

async function getUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

/* ---------- helpers ---------- */

function toDbTask(task) {
  const { desc, date, ...rest } = task;
  return { ...rest, description: desc || '', task_date: date };
}

function fromDbTask(task) {
  const { description, task_date, ...rest } = task;
  return { ...rest, desc: description || '', date: task_date };
}

/* ---------- tasks ---------- */

/** Tasks for a given ISO date (YYYY-MM-DD), for the current user. */
export async function getTasks(date) {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('task_date', date)
      .order('created_at');
    if (error) throw error;
    return (data || []).map(fromDbTask);
  } catch (err) {
    console.error('store.getTasks:', err);
    throw err;
  }
}

/** Insert a new task. Returns the created task with its server-generated id. */
export async function addTask(task) {
  try {
    const userId = await getUserId();
    const dbTask = toDbTask(task);
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...dbTask, user_id: userId, done: false })
      .select()
      .single();
    if (error) throw error;
    return fromDbTask(data);
  } catch (err) {
    console.error('store.addTask:', err);
    throw err;
  }
}

/** Flip a task's done state. */
export async function toggleTask(id) {
  try {
    await getUserId();
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('done')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ done: !task.done })
      .eq('id', id);
    if (updateError) throw updateError;
  } catch (err) {
    console.error('store.toggleTask:', err);
    throw err;
  }
}

/** Delete a task by id. */
export async function deleteTask(id) {
  try {
    await getUserId();
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('store.deleteTask:', err);
    throw err;
  }
}

/** Update fields on an existing task (title, description, category, priority, time, date). */
export async function updateTask(id, partial) {
  try {
    await getUserId();
    const dbPartial = {};
    if ('title' in partial) dbPartial.title = partial.title;
    if ('desc' in partial) dbPartial.description = partial.desc;
    if ('category' in partial) dbPartial.category = partial.category;
    if ('priority' in partial) dbPartial.priority = partial.priority;
    if ('time' in partial) dbPartial.time = partial.time;
    if ('date' in partial) dbPartial.task_date = partial.date;
    const { data, error } = await supabase
      .from('tasks')
      .update(dbPartial)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return fromDbTask(data);
  } catch (err) {
    console.error('store.updateTask:', err);
    throw err;
  }
}

/* ---------- plans ---------- */

/** All ongoing plans for the current user. */
export async function getPlans() {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('store.getPlans:', err);
    throw err;
  }
}

/** Update a plan's progress percentage. */
export async function updatePlanProgress(id, progress) {
  try {
    await getUserId();
    const { error } = await supabase
      .from('plans')
      .update({ progress })
      .eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('store.updatePlanProgress:', err);
    throw err;
  }
}

/* ---------- history ---------- */

/** Get a Set of ISO date strings that have tasks in the given range. */
export async function getTaskDatesInRange(startDate, endDate) {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('tasks')
      .select('task_date')
      .eq('user_id', userId)
      .gte('task_date', startDate)
      .lte('task_date', endDate);
    if (error) throw error;
    return new Set((data || []).map(d => d.task_date));
  } catch (err) {
    console.error('store.getTaskDatesInRange:', err);
    throw err;
  }
}

/** Last N days of completion history, oldest first. */
export async function getHistory(days = 7) {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('daily_history')
      .select('*')
      .eq('user_id', userId)
      .order('entry_date', { ascending: true })
      .limit(days);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('store.getHistory:', err);
    throw err;
  }
}

/** Upsert today's completion percentage into daily_history. */
export async function upsertTodayHistory(pct) {
  try {
    const userId = await getUserId();
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from('daily_history')
      .upsert(
        { user_id: userId, entry_date: today, completion_pct: pct },
        { onConflict: 'user_id, entry_date' }
      );
    if (error) throw error;
  } catch (err) {
    console.error('store.upsertTodayHistory:', err);
    throw err;
  }
}

/* ---------- profile ---------- */

/** The current user's profile row (streak, goals, targets). */
export async function getProfile() {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('store.getProfile:', err);
    throw err;
  }
}

/** Partial update to the current user's profile row. */
export async function updateProfile(partial) {
  try {
    const userId = await getUserId();
    const { error } = await supabase
      .from('profiles')
      .update(partial)
      .eq('id', userId);
    if (error) throw error;
  } catch (err) {
    console.error('store.updateProfile:', err);
    throw err;
  }
}

/* ---------- streak ---------- */

/** On app init: if last_completed_date is older than yesterday, reset streak to 0. */
export async function checkAndResetStreak() {
  try {
    const userId = await getUserId();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('streak, last_completed_date')
      .eq('id', userId)
      .single();
    if (error || !profile) return null;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (profile.last_completed_date && profile.last_completed_date < yesterdayStr) {
      await supabase.from('profiles').update({ streak: 0 }).eq('id', userId);
      return { ...profile, streak: 0 };
    }
    return profile;
  } catch (err) {
    console.error('store.checkAndResetStreak:', err);
    throw err;
  }
}

/**
 * If all tasks for the given date are done, increment streak and set last_completed_date.
 * Called after toggleTask. Returns updated { streak, last_completed_date } or null if
 * all tasks aren't done or streak was already counted for today.
 */
export async function updateStreakIfAllDone(tasks, date) {
  const allDone = tasks.length > 0 && tasks.every(t => t.done);
  if (!allDone) return null;

  try {
    const userId = await getUserId();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('streak, last_completed_date')
      .eq('id', userId)
      .single();
    if (error) throw error;

    if (profile.last_completed_date === date) return profile;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak;
    if (profile.last_completed_date === yesterdayStr) {
      newStreak = (profile.streak || 0) + 1;
    } else {
      newStreak = 1;
    }

    await supabase
      .from('profiles')
      .update({ streak: newStreak, last_completed_date: date })
      .eq('id', userId);

    return { streak: newStreak, last_completed_date: date };
  } catch (err) {
    console.error('store.updateStreakIfAllDone:', err);
    throw err;
  }
}

/* ---------- realtime ---------- */

/**
 * Subscribe to INSERT / UPDATE / DELETE on the tasks table for a user.
 * The returned channel object can be passed to supabase.removeChannel() to unsubscribe.
 * Requires Realtime to be enabled on the `tasks` table in the Supabase dashboard
 * (Database → Replication) or via SQL:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
 */
export function subscribeToTasks(userId, callback) {
  return supabase
    .channel('tasks-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${userId}`
      },
      (payload) => callback(payload)
    )
    .subscribe();
}
