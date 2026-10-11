-- Run once in Supabase → SQL Editor.
-- One row per user holding the whole dashboard as JSON.
create table if not exists public.takeover_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.takeover_state enable row level security;

create policy "read own state" on public.takeover_state
  for select using (auth.uid() = user_id);
create policy "insert own state" on public.takeover_state
  for insert with check (auth.uid() = user_id);
create policy "update own state" on public.takeover_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
