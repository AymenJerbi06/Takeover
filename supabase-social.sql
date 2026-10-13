-- Account profiles and private, opt-in friends. Run in Supabase SQL Editor.
-- Dashboard rows and their sensitive contents remain private to their owner.
begin;

create table if not exists public.takeover_profiles (
  id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null default 'Member' check (char_length(trim(display_name)) between 1 and 40),
  avatar_data text check (avatar_data is null or (char_length(avatar_data) <= 180000 and avatar_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')),
  friend_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  share_progress boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.takeover_profiles enable row level security;
drop policy if exists "profile owner read" on public.takeover_profiles;
drop policy if exists "profile owner insert" on public.takeover_profiles;
drop policy if exists "profile owner update" on public.takeover_profiles;
create policy "profile owner read" on public.takeover_profiles for select to authenticated using (id = auth.uid());
create policy "profile owner insert" on public.takeover_profiles for insert to authenticated with check (id = auth.uid());
create policy "profile owner update" on public.takeover_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.takeover_profiles from anon, authenticated;
grant select on public.takeover_profiles to authenticated;
grant insert (id, display_name, avatar_data) on public.takeover_profiles to authenticated;
grant update (display_name, avatar_data, share_progress) on public.takeover_profiles to authenticated;

create table if not exists public.takeover_friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.takeover_profiles(id) on delete cascade,
  recipient uuid not null references public.takeover_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> recipient)
);
create unique index if not exists takeover_friend_pair on public.takeover_friendships (least(requester, recipient), greatest(requester, recipient));
alter table public.takeover_friendships enable row level security;
revoke all on public.takeover_friendships from anon, authenticated;

create table if not exists public.takeover_scores (
  user_id uuid not null references public.takeover_profiles(id) on delete cascade,
  day date not null,
  score integer not null check (score between 0 and 100),
  primary key (user_id, day)
);
create table if not exists public.takeover_score_settings (
  user_id uuid primary key references public.takeover_profiles(id) on delete cascade,
  start_day date not null,
  through_day date not null,
  source_revision bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.takeover_scores enable row level security;
alter table public.takeover_score_settings enable row level security;
revoke all on public.takeover_scores, public.takeover_score_settings from anon, authenticated;

create or replace function public.takeover_clear_shared_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.share_progress and not new.share_progress then
    delete from public.takeover_scores where user_id = new.id;
    delete from public.takeover_score_settings where user_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists takeover_sharing_off on public.takeover_profiles;
create trigger takeover_sharing_off after update of share_progress on public.takeover_profiles for each row execute function public.takeover_clear_shared_scores();
revoke all on function public.takeover_clear_shared_scores() from public, anon, authenticated;

create or replace function public.takeover_friends() returns table (
  relationship_id uuid, peer_id uuid, display_name text, avatar_data text,
  status text, incoming boolean, created_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view friends.'; end if;
  return query select f.id, p.id, p.display_name, p.avatar_data, f.status,
    f.recipient = auth.uid(), f.created_at
    from public.takeover_friendships f
    join public.takeover_profiles p on p.id = case when f.requester = auth.uid() then f.recipient else f.requester end
    where auth.uid() in (f.requester, f.recipient)
    order by f.created_at desc;
end;
$$;

create or replace function public.takeover_invite(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_peer uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to add friends.'; end if;
  if p_code !~ '^[a-fA-F0-9]{12}$' then raise exception 'Enter a 12-character friend code.'; end if;
  perform 1 from public.takeover_profiles where id = auth.uid() for update;
  if not found then raise exception 'Create your profile first.'; end if;
  select id into v_peer from public.takeover_profiles where friend_code = lower(p_code);
  if v_peer is null or v_peer = auth.uid() then raise exception 'No other profile matches that code.'; end if;
  if (select count(*) from public.takeover_friendships where requester = auth.uid() and status = 'pending') >= 30 then raise exception 'You can have up to 30 pending requests.'; end if;
  insert into public.takeover_friendships(requester, recipient) values (auth.uid(), v_peer)
    on conflict do nothing;
end;
$$;

create or replace function public.takeover_friend_action(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_friend public.takeover_friendships%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to manage friends.'; end if;
  select * into v_friend from public.takeover_friendships where id = p_id and auth.uid() in (requester, recipient) for update;
  if not found then raise exception 'This request is no longer available.'; end if;
  if p_action = 'accept' and v_friend.status = 'pending' and v_friend.recipient = auth.uid() then
    update public.takeover_friendships set status = 'accepted' where id = p_id;
  elsif p_action = 'decline' and v_friend.status = 'pending' and v_friend.recipient = auth.uid() then
    delete from public.takeover_friendships where id = p_id;
  elsif p_action = 'cancel' and v_friend.status = 'pending' and v_friend.requester = auth.uid() then
    delete from public.takeover_friendships where id = p_id;
  elsif p_action = 'remove' and v_friend.status = 'accepted' then
    delete from public.takeover_friendships where id = p_id;
  else raise exception 'That action is not available for this request.';
  end if;
end;
$$;

-- Only publish a score snapshot after the same dashboard revision has synced.
-- Row locks prevent an older device racing a newer cloud revision or opt-out.
create or replace function public.takeover_publish_scores(p_revision bigint, p_start date, p_through date, p_days jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shared boolean; v_state jsonb; v_min date; v_row jsonb; v_day date; v_score integer;
begin
  if auth.uid() is null then raise exception 'Sign in to share progress.'; end if;
  select share_progress into v_shared from public.takeover_profiles where id = auth.uid() for update;
  if not coalesce(v_shared, false) then raise exception 'Progress sharing is off.'; end if;
  select data into v_state from public.takeover_state where user_id = auth.uid() for share;
  if v_state is null or v_state->>'updatedAt' is distinct from p_revision::text then raise exception 'Sync your latest progress before sharing.'; end if;
  if p_start is null or p_through is null or p_start::text is distinct from v_state->>'startDate'
    or p_through < current_date - 1 or p_through > current_date + 1
    or p_start > p_through or p_start < date '2000-01-01' then raise exception 'Invalid progress date range.'; end if;
  v_min := greatest(p_start, p_through - 366);
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) <> p_through - v_min + 1 then raise exception 'Incomplete progress snapshot.'; end if;
  delete from public.takeover_scores where user_id = auth.uid();
  for v_row in select value from jsonb_array_elements(p_days) loop
    if v_row->>'day' !~ '^\d{4}-\d{2}-\d{2}$' or v_row->>'score' !~ '^\d{1,3}$' then raise exception 'Invalid progress score.'; end if;
    v_day := (v_row->>'day')::date; v_score := (v_row->>'score')::integer;
    if v_day is null or v_day < v_min or v_day > p_through or v_score is null or v_score < 0 or v_score > 100 then raise exception 'Invalid progress score.'; end if;
    insert into public.takeover_scores(user_id, day, score) values(auth.uid(), v_day, v_score);
  end loop;
  insert into public.takeover_score_settings(user_id, start_day, through_day, source_revision)
    values(auth.uid(), p_start, p_through, p_revision)
    on conflict (user_id) do update set start_day = excluded.start_day, through_day = excluded.through_day,
      source_revision = excluded.source_revision, updated_at = now();
end;
$$;

create or replace function public.takeover_leaderboard(p_period text, p_today date) returns table (
  user_id uuid, display_name text, avatar_data text, average_score numeric,
  days_count integer, last_shared_at timestamptz, is_self boolean
) language plpgsql security definer set search_path = '' as $$
declare v_start date;
begin
  if auth.uid() is null then raise exception 'Sign in to view your leaderboard.'; end if;
  if p_today is null or p_today < current_date - 1 or p_today > current_date + 1 then raise exception 'Check your device date and try again.'; end if;
  v_start := case p_period when 'today' then p_today when 'week' then date_trunc('week', p_today)::date when 'month' then date_trunc('month', p_today)::date else null end;
  if v_start is null then raise exception 'Choose Today, This week, or This month.'; end if;
  return query
    with members as (
      select p.id, p.display_name, p.avatar_data from public.takeover_profiles p
      where p.share_progress and (p.id = auth.uid() or exists (
        select 1 from public.takeover_friendships f where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.recipient = p.id) or (f.recipient = auth.uid() and f.requester = p.id))
      ))
    )
    select m.id, m.display_name, m.avatar_data,
      case when s.user_id is null or s.start_day > p_today then null
        else round(coalesce(sum(d.score), 0)::numeric / (p_today - greatest(v_start, s.start_day) + 1)) end,
      case when s.user_id is null or s.start_day > p_today then 0 else (p_today - greatest(v_start, s.start_day) + 1) end,
      s.updated_at, m.id = auth.uid()
    from members m left join public.takeover_score_settings s on s.user_id = m.id
    left join public.takeover_scores d on d.user_id = m.id and d.day between greatest(v_start, s.start_day) and p_today
    group by m.id, m.display_name, m.avatar_data, s.user_id, s.start_day, s.updated_at
    order by 4 desc nulls last, m.display_name, m.id;
end;
$$;

revoke all on function public.takeover_friends(), public.takeover_invite(text), public.takeover_friend_action(uuid,text), public.takeover_publish_scores(bigint,date,date,jsonb), public.takeover_leaderboard(text,date) from public, anon;
grant execute on function public.takeover_friends(), public.takeover_invite(text), public.takeover_friend_action(uuid,text), public.takeover_publish_scores(bigint,date,date,jsonb), public.takeover_leaderboard(text,date) to authenticated;
commit;
