-- Leaderboards: run once in Supabase > SQL Editor (safe to re-run).

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  created_at timestamptz not null default now()
);
alter table public.seasons enable row level security;
drop policy if exists "seasons read" on public.seasons;
drop policy if exists "seasons admin" on public.seasons;
create policy "seasons read"  on public.seasons for select to anon, authenticated using (true);
create policy "seasons admin" on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.seasons (name, starts_on, ends_on)
select 'Fall 2026', '2026-09-01', '2027-02-15' where not exists (select 1 from public.seasons);

-- Points: 1 for playing, +10 for backing the winner. (Roll Call places will add their own later.)
create or replace view public.entry_points as
  select e.id as entry_id, e.phone, e.name, r.venue_id, e.created_at,
         (e.created_at at time zone 'America/Chicago')::date as play_date,
         1 + case when e.is_winner then 10 else 0 end as points,
         e.is_winner
  from public.entries e join public.rounds r on r.id = e.round_id
  where r.status = 'finished';
alter view public.entry_points set (security_invoker = true);

-- Display name: first name + last initial
create or replace function public.short_name(p text) returns text language sql immutable as $$
  select case when array_length(regexp_split_to_array(trim(p), '\s+'), 1) > 1
              then split_part(trim(p), ' ', 1) || ' ' || left((regexp_split_to_array(trim(p), '\s+'))[array_length(regexp_split_to_array(trim(p), '\s+'), 1)], 1) || '.'
              else trim(p) end;
$$;

-- kind = 'night' (this bar, today Chicago time) or 'season' (all bars, current season)
create or replace function public.leaderboard(p_venue_id uuid, p_kind text, p_limit int default 10)
returns table (rank int, display_name text, points bigint, wins bigint, plays bigint)
language sql stable security definer set search_path = public as $$
  with scope as (
    select ep.* from public.entry_points ep
    where case when p_kind = 'night'
               then ep.venue_id = p_venue_id and ep.play_date = (now() at time zone 'America/Chicago')::date
               else ep.play_date between (select s.starts_on from public.seasons s where current_date between s.starts_on and s.ends_on order by s.starts_on desc limit 1)
                                     and (select s.ends_on   from public.seasons s where current_date between s.starts_on and s.ends_on order by s.starts_on desc limit 1)
          end
  ), agg as (
    select phone, public.short_name((array_agg(name order by created_at desc))[1]) as display_name,
           sum(points) as points, count(*) filter (where is_winner) as wins, count(*) as plays, max(created_at) as last_play
    from scope group by phone
  )
  select (row_number() over (order by points desc, wins desc, last_play asc))::int, display_name, points, wins, plays
  from agg order by points desc, wins desc, last_play asc limit p_limit;
$$;
grant execute on function public.leaderboard(uuid, text, int) to authenticated;

create or replace function public.current_season() returns table (id uuid, name text, starts_on date, ends_on date)
language sql stable security definer set search_path = public as $$
  select id, name, starts_on, ends_on from public.seasons where current_date between starts_on and ends_on order by starts_on desc limit 1;
$$;
grant execute on function public.current_season() to anon, authenticated;
