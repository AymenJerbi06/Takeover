-- Personalized scores: retain all owner-only policies and existing progress.
-- Run after supabase-social.sql. Safe to rerun; no app data is reset.
begin;
alter table public.takeover_scores add column if not exists scheduled boolean not null default true;
create or replace function public.takeover_publish_scores(p_revision bigint, p_start date, p_through date, p_days jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_shared boolean; v_state jsonb; v_min date; v_row jsonb; v_day date; v_score integer; v_scheduled boolean;
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
    v_scheduled := true;
    if v_state->>'experience' = 'personal' then
      select exists (
        select 1 from jsonb_array_elements(coalesce(v_state->'personalPlan'->'habits', '[]'::jsonb)) h
        where (h->>'startsOn')::date <= v_day
          and ((h->>'endsOn') is null or (h->>'endsOn')::date > v_day)
          and h->'days' @> to_jsonb(extract(dow from v_day)::integer)
      ) into v_scheduled;
    end if;
    insert into public.takeover_scores(user_id, day, score, scheduled) values(auth.uid(), v_day, v_score, v_scheduled);
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
        else round(avg(d.score) filter (where d.scheduled)) end,
      count(d.day) filter (where d.scheduled)::integer,
      s.updated_at, m.id = auth.uid()
    from members m left join public.takeover_score_settings s on s.user_id = m.id
    left join public.takeover_scores d on d.user_id = m.id and d.day between greatest(v_start, s.start_day) and p_today
    group by m.id, m.display_name, m.avatar_data, s.user_id, s.start_day, s.updated_at
    order by 4 desc nulls last, m.display_name, m.id;
end;
$$;

revoke all on function public.takeover_publish_scores(bigint,date,date,jsonb), public.takeover_leaderboard(text,date) from public, anon;
grant execute on function public.takeover_publish_scores(bigint,date,date,jsonb), public.takeover_leaderboard(text,date) to authenticated;
commit;