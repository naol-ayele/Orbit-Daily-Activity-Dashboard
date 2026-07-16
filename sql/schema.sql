-- Orbit dashboard — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- Tables:
--   profiles       one row per user — streak, goal targets/progress
--   tasks          the daily task list (title, category, priority, done, etc.)
--   plans          ongoing / long-term plan tracker cards
--   daily_history  one row per day per user, used for the 7-day report chart

create extension if not exists "uuid-ossp";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  streak integer default 0,
  last_completed_date date,
  daily_goal_target integer default 5,
  monthly_goal_title text,
  monthly_goal_progress integer default 0,
  weekly_goal_title text,
  weekly_goal_progress integer default 0,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text default '',
  category text not null default 'Work',       -- Work | Personal | Health | Learning | Errands
  priority text not null default 'medium',      -- high | medium | low
  time text,                                     -- free-text e.g. '14:00'
  task_date date not null,
  done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  reminder_minutes_before integer,
  reminder_fired_at timestamptz,
  recurrence text,
  is_template boolean default false,
  recurrence_parent_id uuid references tasks(id) on delete cascade
);

create table plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text not null,
  progress integer default 0,
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table daily_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  entry_date date not null,
  completion_pct integer not null,
  unique(user_id, entry_date)
);

-- Row Level Security: every table only visible to its owner
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table plans enable row level security;
alter table daily_history enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own tasks" on tasks for all using (auth.uid() = user_id);
create policy "own plans" on plans for all using (auth.uid() = user_id);
create policy "own history" on daily_history for all using (auth.uid() = user_id);

-- Optional but recommended: auto-create a profile row whenever a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Indexes for common query patterns
create index idx_tasks_user_date on tasks(user_id, task_date);
create index idx_tasks_user_template on tasks(user_id, is_template);
create index idx_daily_history_user_date on daily_history(user_id, entry_date);

-- Enable Realtime on the tasks table (Module 6).
-- Run this after the schema is applied, or toggle via the Supabase dashboard:
-- Database → Replication → enable replication for `tasks`.
alter publication supabase_realtime add table tasks;
