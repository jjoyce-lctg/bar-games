-- ============================================================
-- Last Call Tavern Group - TV Bar Games
-- One-time Supabase setup. Paste the whole file into
-- Supabase > SQL Editor > New query, then click Run.
-- Safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES (one row per login) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  role        text not null default 'dj' check (role in ('dj','admin')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- First account ever created becomes admin. Everyone after is a DJ
-- until an admin changes their role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
  r text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  if (select count(*) from public.profiles) = 0 then r := 'admin'; else r := 'dj'; end if;
  insert into public.profiles (id, username, role) values (new.id, uname, r)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- ---------- VENUES ----------
create table if not exists public.venues (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  slug          text unique not null,
  color_primary text not null default '#111111',
  color_accent  text not null default '#ffcc00',
  logo_url      text,
  tagline       text,
  default_prize text default 'a round on us',
  sort_order    int not null default 0,
  active        boolean not null default true
);

insert into public.venues (name, slug, color_primary, color_accent, tagline, sort_order) values
  ('Willie Lill''s',     'willie-lills', '#0a0a0a', '#ffcd00', 'Chicago''s Hawkeye bar', 1),
  ('Duffy''s',           'duffys',       '#0f5c2e', '#f2f2f2', 'Lincoln Park',           2),
  ('The Butcher''s Tap', 'butchers-tap', '#8b1a1a', '#f3e9d2', 'Lincoln Park',           3),
  ('Rebel and Rye',      'rebel-and-rye','#1f1a17', '#c9803a', 'Whiskey and good times', 4),
  ('The Reveler',        'reveler',      '#004c54', '#a5acaf', 'Chicago''s Eagles bar',  5),
  ('Blue Bayou',         'blue-bayou',   '#0b4f6c', '#c9a227', 'Laissez les bons temps rouler', 6)
on conflict (slug) do nothing;

-- ---------- GAMES (catalog; options are the choices a guest can pick) ----------
create table if not exists public.games (
  key         text primary key,
  name        text not null,
  description text,
  options     jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  sort_order  int not null default 0
);

insert into public.games (key, name, description, options, sort_order) values
  ('race', 'Mascot Race',
   'Guests pick a racer. The racers run. Everyone who picked the winner gets the prize.',
   '[{"id":"hotdog","label":"Hot Dog","emoji":"🌭"},{"id":"beer","label":"Beer","emoji":"🍺"},{"id":"pretzel","label":"Pretzel","emoji":"🥨"},{"id":"pizza","label":"Pizza","emoji":"🍕"}]'::jsonb,
   1)
on conflict (key) do update set name = excluded.name, description = excluded.description, options = excluded.options;

-- ---------- ROUNDS (one per time a DJ runs a game) ----------
create table if not exists public.rounds (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  venue_id     uuid not null references public.venues(id),
  game_key     text not null references public.games(key),
  status       text not null default 'open' check (status in ('open','running','finished','cancelled')),
  prize        text,
  winning_pick text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index if not exists rounds_venue_idx on public.rounds(venue_id, created_at desc);

-- ---------- ENTRIES (one per guest per round) ----------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.rounds(id) on delete cascade,
  name        text not null,
  phone       text not null,          -- normalized to digits, 10 or 11 (US)
  pick        text,
  sms_opt_in  boolean not null default false,
  opt_in_text text,                   -- the exact disclaimer the guest agreed to
  is_winner   boolean not null default false,
  texted      boolean not null default false,  -- admin tag: prize SMS sent
  notes       text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (round_id, phone)
);
create index if not exists entries_phone_idx on public.entries(phone);
create index if not exists entries_round_idx on public.entries(round_id);

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.venues   enable row level security;
alter table public.games    enable row level security;
alter table public.rounds   enable row level security;
alter table public.entries  enable row level security;

-- profiles
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;
create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles admin all" on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- venues: anyone can read active venues (needed to brand the guest page); admins edit
drop policy if exists "venues read"      on public.venues;
drop policy if exists "venues admin all" on public.venues;
create policy "venues read"      on public.venues for select to anon, authenticated using (true);
create policy "venues admin all" on public.venues for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- games
drop policy if exists "games read"      on public.games;
drop policy if exists "games admin all" on public.games;
create policy "games read"      on public.games for select to anon, authenticated using (true);
create policy "games admin all" on public.games for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- rounds: any logged-in DJ can create/run; guests go through the RPC below
drop policy if exists "rounds auth read"   on public.rounds;
drop policy if exists "rounds auth insert" on public.rounds;
drop policy if exists "rounds auth update" on public.rounds;
create policy "rounds auth read"   on public.rounds for select to authenticated using (true);
create policy "rounds auth insert" on public.rounds for insert to authenticated with check (created_by = auth.uid());
create policy "rounds auth update" on public.rounds for update to authenticated using (true) with check (true);

-- entries: DJs read (for counts); admins tag; guests insert only via RPC
drop policy if exists "entries auth read"    on public.entries;
drop policy if exists "entries admin update" on public.entries;
drop policy if exists "entries admin delete" on public.entries;
create policy "entries auth read"    on public.entries for select to authenticated using (true);
create policy "entries admin update" on public.entries for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "entries admin delete" on public.entries for delete to authenticated using (public.is_admin());

-- ---------- PUBLIC RPCs (what the guest's phone calls) ----------

-- What a guest sees when they scan: venue branding, game, options, prize, status.
create or replace function public.get_round_public(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'status', r.status,
    'prize', coalesce(r.prize, v.default_prize),
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'color_primary', v.color_primary,
                                'color_accent', v.color_accent, 'logo_url', v.logo_url, 'tagline', v.tagline),
    'game', jsonb_build_object('key', g.key, 'name', g.name, 'description', g.description, 'options', g.options)
  )
  from public.rounds r
  join public.venues v on v.id = r.venue_id
  join public.games  g on g.key = r.game_key
  where upper(r.code) = upper(p_code);
$$;

-- Guest submits name + phone + pick + opt-in. Validates and dedupes.
create or replace function public.submit_entry(
  p_code text, p_name text, p_phone text, p_pick text, p_opt_in boolean, p_opt_in_text text, p_user_agent text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.rounds%rowtype;
  digits text;
  valid_pick boolean;
begin
  select * into r from public.rounds where upper(code) = upper(p_code);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'That game code was not found.'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'Entries are closed for this game.'); end if;

  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
  if length(digits) <> 10 then return jsonb_build_object('ok', false, 'error', 'Please enter a valid 10-digit US phone number.'); end if;

  if length(trim(coalesce(p_name, ''))) < 2 then return jsonb_build_object('ok', false, 'error', 'Please enter your name.'); end if;

  select exists (select 1 from public.games g, jsonb_array_elements(g.options) o
                 where g.key = r.game_key and o->>'id' = p_pick) into valid_pick;
  if not valid_pick then return jsonb_build_object('ok', false, 'error', 'Please pick one of the options.'); end if;

  insert into public.entries (round_id, name, phone, pick, sms_opt_in, opt_in_text, user_agent)
  values (r.id, left(trim(p_name), 60), digits, p_pick, coalesce(p_opt_in, false), p_opt_in_text, left(p_user_agent, 300))
  on conflict (round_id, phone) do update
    set pick = excluded.pick, name = excluded.name,
        sms_opt_in = public.entries.sms_opt_in or excluded.sms_opt_in;

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.get_round_public(text) to anon, authenticated;
grant execute on function public.submit_entry(text, text, text, text, boolean, text, text) to anon, authenticated;

-- DJ console: finish a round and tag winners in one call
create or replace function public.finish_round(p_round_id uuid, p_winning_pick text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.rounds set status = 'finished', winning_pick = p_winning_pick, finished_at = now() where id = p_round_id;
  update public.entries set is_winner = (pick = p_winning_pick) where round_id = p_round_id;
end $$;
grant execute on function public.finish_round(uuid, text) to authenticated;

-- ---------- CLEAN EXPORT VIEWS (admin page reads these) ----------
create or replace view public.entries_export as
  select e.created_at, v.name as venue, g.name as game, r.code as round_code,
         e.name, e.phone, e.pick, e.sms_opt_in, e.is_winner, e.texted, e.notes,
         coalesce(r.prize, v.default_prize) as prize, e.id, r.id as round_id, v.id as venue_id, r.game_key
  from public.entries e
  join public.rounds r on r.id = e.round_id
  join public.venues v on v.id = r.venue_id
  join public.games  g on g.key = r.game_key;

-- One row per phone number: the SMS marketing list
create or replace view public.contacts_export as
  select e.phone,
         (array_agg(e.name order by e.created_at desc))[1] as name,
         bool_or(e.sms_opt_in) as sms_opt_in,
         min(e.created_at) as first_seen,
         max(e.created_at) as last_seen,
         count(*) as entries,
         count(*) filter (where e.is_winner) as wins,
         string_agg(distinct v.name, ', ') as venues
  from public.entries e
  join public.rounds r on r.id = e.round_id
  join public.venues v on v.id = r.venue_id
  group by e.phone;

-- Views run with the caller's permissions (RLS still applies)
alter view public.entries_export  set (security_invoker = true);
alter view public.contacts_export set (security_invoker = true);
grant select on public.entries_export, public.contacts_export to authenticated;

-- ---------- LOGO STORAGE ----------
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "logos public read"  on storage.objects;
drop policy if exists "logos admin write"  on storage.objects;
create policy "logos public read" on storage.objects for select to anon, authenticated using (bucket_id = 'logos');
create policy "logos admin write" on storage.objects for all to authenticated
  using (bucket_id = 'logos' and public.is_admin()) with check (bucket_id = 'logos' and public.is_admin());

-- Done.
