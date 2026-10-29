-- Prize redemption: run once in Supabase > SQL Editor (safe to re-run).

-- manager role
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('dj','manager','admin'));

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('manager','admin') and active);
$$;

-- prizes: one per winning entry
create table if not exists public.prizes (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null unique references public.entries(id) on delete cascade,
  round_id         uuid not null references public.rounds(id),
  won_venue_id     uuid not null references public.venues(id),
  phone            text not null,
  name             text not null,
  prize            text not null,
  issued_at        timestamptz not null default now(),
  valid_from       timestamptz not null,
  expires_at       timestamptz not null,
  redeemed_at      timestamptz,
  redeemed_by      uuid references auth.users(id),
  redeemed_venue_id uuid references public.venues(id),
  voided_at        timestamptz,
  void_reason      text
);
create index if not exists prizes_phone_idx on public.prizes(phone);
alter table public.prizes enable row level security;
drop policy if exists "prizes admin all" on public.prizes;
create policy "prizes admin all" on public.prizes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Prize window: valid from midnight (Chicago) the day after it was won, for 14 days.
create or replace function public.prize_window(p_issued timestamptz, out v_from timestamptz, out v_to timestamptz)
language sql stable as $$
  select ((p_issued at time zone 'America/Chicago')::date + 1) at time zone 'America/Chicago',
         ((p_issued at time zone 'America/Chicago')::date + 15) at time zone 'America/Chicago';
$$;

-- finish_round now also issues prizes for the winners
create or replace function public.finish_round(p_round_id uuid, p_winning_pick text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; w record; pw record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.rounds set status = 'finished', winning_pick = p_winning_pick, finished_at = now() where id = p_round_id returning * into r;
  update public.entries set is_winner = (pick = p_winning_pick) where round_id = p_round_id;
  select * into pw from public.prize_window(now());
  for w in select e.* from public.entries e where e.round_id = p_round_id and e.is_winner loop
    insert into public.prizes (entry_id, round_id, won_venue_id, phone, name, prize, valid_from, expires_at)
    select w.id, r.id, r.venue_id, w.phone, w.name, coalesce(r.prize, v.default_prize, 'a prize'), pw.v_from, pw.v_to
    from public.venues v where v.id = r.venue_id
    on conflict (entry_id) do nothing;
  end loop;
end $$;

-- Manager lookup by phone: returns every prize for that number with a computed status
create or replace function public.lookup_prizes(p_phone text)
returns table (id uuid, name text, prize text, won_at timestamptz, won_venue text, valid_from timestamptz, expires_at timestamptz,
               status text, redeemed_at timestamptz, redeemed_venue text, redeemed_by text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.prize, p.issued_at, v.name, p.valid_from, p.expires_at,
         case when p.voided_at is not null then 'voided'
              when p.redeemed_at is not null then 'redeemed'
              when now() < p.valid_from then 'not_yet'
              when now() > p.expires_at then 'expired'
              else 'active' end,
         p.redeemed_at, rv.name, pr.username
  from public.prizes p
  join public.venues v on v.id = p.won_venue_id
  left join public.venues rv on rv.id = p.redeemed_venue_id
  left join public.profiles pr on pr.id = p.redeemed_by
  where public.is_manager()
    and p.phone = (select case when length(d) = 11 and left(d, 1) = '1' then substr(d, 2) else d end
                   from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x)
  order by p.issued_at desc;
$$;
grant execute on function public.lookup_prizes(text) to authenticated;

-- Redeem: managers/admins only, active window only, once only
create or replace function public.redeem_prize(p_prize_id uuid, p_venue_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.prizes%rowtype;
begin
  if not public.is_manager() then return jsonb_build_object('ok', false, 'error', 'Manager login required.'); end if;
  select * into p from public.prizes where id = p_prize_id for update;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'Prize not found.'); end if;
  if p.voided_at is not null then return jsonb_build_object('ok', false, 'error', 'This prize was voided.'); end if;
  if p.redeemed_at is not null then return jsonb_build_object('ok', false, 'error', 'Already redeemed.'); end if;
  if now() < p.valid_from then return jsonb_build_object('ok', false, 'error', 'Not valid until tomorrow.'); end if;
  if now() > p.expires_at then return jsonb_build_object('ok', false, 'error', 'This prize has expired.'); end if;
  update public.prizes set redeemed_at = now(), redeemed_by = auth.uid(), redeemed_venue_id = p_venue_id where id = p_prize_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.redeem_prize(uuid, uuid) to authenticated;

-- Admin report view
create or replace view public.prizes_report as
  select p.id, p.issued_at, v.name as won_venue, g.name as game, r.code as round_code, p.name, p.phone, p.prize,
         p.valid_from, p.expires_at,
         case when p.voided_at is not null then 'voided' when p.redeemed_at is not null then 'redeemed'
              when now() < p.valid_from then 'not_yet' when now() > p.expires_at then 'expired' else 'active' end as status,
         p.redeemed_at, rv.name as redeemed_venue, pr.username as redeemed_by, p.void_reason, p.won_venue_id, p.redeemed_venue_id
  from public.prizes p
  join public.venues v on v.id = p.won_venue_id
  join public.rounds r on r.id = p.round_id
  join public.games g on g.key = r.game_key
  left join public.venues rv on rv.id = p.redeemed_venue_id
  left join public.profiles pr on pr.id = p.redeemed_by;
alter view public.prizes_report set (security_invoker = true);
grant select on public.prizes_report to authenticated;

-- Backfill prizes for winners of rounds already finished (none redeemed yet)
insert into public.prizes (entry_id, round_id, won_venue_id, phone, name, prize, valid_from, expires_at)
select e.id, r.id, r.venue_id, e.phone, e.name, coalesce(r.prize, v.default_prize, 'a prize'), (public.prize_window(r.finished_at)).v_from, (public.prize_window(r.finished_at)).v_to
from public.entries e join public.rounds r on r.id = e.round_id join public.venues v on v.id = r.venue_id
where e.is_winner and r.status = 'finished'
on conflict (entry_id) do nothing;
