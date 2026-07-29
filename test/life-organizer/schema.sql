-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query)
-- Creates the "tasks" table used by the life-organizer app.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other',
  priority text not null default 'medium',
  type text not null default 'daily',          -- 'daily' | 'weekly' | 'once'
  flexible boolean not null default false,       -- true = "anytime today" task, no fixed time
  time text,                                     -- 'HH:MM', null when flexible
  days int[] not null default '{}',              -- days of week (0=Sunday) for weekly tasks
  date date,                                      -- for 'once' tasks
  duration int,                                   -- minutes, optional
  notes text not null default '',
  remind boolean not null default true,
  completions text[] not null default '{}',       -- ISO dates this task was completed on
  streak int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- Personal single-user app (no login yet): allow the publishable/anon key
-- full read/write access. Tighten this later if you add authentication or
-- share the link with anyone else.
drop policy if exists "anon full access" on public.tasks;
create policy "anon full access"
  on public.tasks
  for all
  using (true)
  with check (true);

create index if not exists tasks_created_at_idx on public.tasks (created_at);
