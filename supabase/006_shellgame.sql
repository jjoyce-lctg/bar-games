-- 006: Shell Game. Guests sign up with no pick, then choose a cup live on their phone during a 10 second window the TV opens after the shuffle.
-- Safe to re-run.

insert into public.games (key, name, description, options, sort_order) values
  ('shellgame', 'Shell Game', 'Three cups, one ball. Follow the shuffle, then pick a cup on your phone. Everyone who is right wins.',
   '[{"id":"c1","label":"Cup 1","image_url":"shell/cup.png"},{"id":"c2","label":"Cup 2","image_url":"shell/cup.png"},{"id":"c3","label":"Cup 3","image_url":"shell/cup.png"}]'::jsonb, 3)
on conflict (key) do update set name = excluded.name, description = excluded.description, options = excluded.options;

-- rounds: a 'picking' status and the moment the pick window closes
alter table public.rounds drop constraint if exists rounds_status_check;
alter table public.rounds add constraint rounds_status_check check (status in ('open','running','picking','finished','cancelled'));
alter table public.rounds add column if not exists pick_closes_at timestamptz;

-- the public round view also carries the pick window and the server clock, so phones can count down in step with the TV
create or replace function public.get_round_public(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'status', r.status,
    'prize', coalesce(r.prize, v.default_prize),
    'pick_closes_at', r.pick_closes_at,
    'winning_pick', case when r.status = 'finished' then r.winning_pick end,
    'server_now', now(),
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'color_primary', v.color_primary,
                                'color_accent', v.color_accent, 'logo_url', v.logo_url, 'tagline', v.tagline),
    'game', jsonb_build_object('key', g.key, 'name', g.name, 'description', g.description, 'options',
              case when r.racers is null then g.options
                   else (select coalesce(jsonb_agg(o), '[]'::jsonb) from jsonb_array_elements(g.options) o where (o->>'id') = any(r.racers)) end)
  )
  from public.rounds r
  join public.venues v on v.id = r.venue_id
  join public.games  g on g.key = r.game_key
  where upper(r.code) = upper(p_code)
$$;

-- sign-up: the shell game takes no pick at entry time
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

  if r.game_key = 'shellgame' then
    valid_pick := true; p_pick := null;   -- the cup is chosen live, after the shuffle
  else
    select exists (select 1 from public.games g, jsonb_array_elements(g.options) o
                   where g.key = r.game_key and o->>'id' = p_pick and (r.racers is null or p_pick = any(r.racers))) into valid_pick;
  end if;
  if not valid_pick then return jsonb_build_object('ok', false, 'error', 'Please pick one of the options.'); end if;

  insert into public.entries (round_id, name, phone, pick, sms_opt_in, opt_in_text, user_agent)
  values (r.id, left(trim(p_name), 60), digits, p_pick, coalesce(p_opt_in, false), p_opt_in_text, left(p_user_agent, 300))
  on conflict (round_id, phone) do update
    set pick = excluded.pick, name = excluded.name,
        sms_opt_in = public.entries.sms_opt_in or excluded.sms_opt_in;

  return jsonb_build_object('ok', true);
end $$;

-- TV: open the pick window. Returns when it closes (server clock).
create or replace function public.open_picks(p_round_id uuid, p_seconds int default 10)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare closes timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  closes := now() + make_interval(secs => greatest(3, least(60, p_seconds)));
  update public.rounds set status = 'picking', pick_closes_at = closes where id = p_round_id and status in ('running', 'open');
  return closes;
end $$;
grant execute on function public.open_picks(uuid, int) to authenticated;

-- phone: choose a cup while the window is open (2 seconds of grace for the network). Last tap wins.
create or replace function public.shell_pick(p_code text, p_phone text, p_pick text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.rounds%rowtype;
  digits text;
  n int;
begin
  select * into r from public.rounds where upper(code) = upper(p_code);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Game not found.'); end if;
  if r.status <> 'picking' or r.pick_closes_at is null then return jsonb_build_object('ok', false, 'error', 'Picks are not open right now.'); end if;
  if now() > r.pick_closes_at + interval '2 seconds' then return jsonb_build_object('ok', false, 'error', 'Too late, the picks are closed.'); end if;
  if p_pick not in ('c1', 'c2', 'c3') then return jsonb_build_object('ok', false, 'error', 'Pick cup 1, 2 or 3.'); end if;

  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;

  update public.entries set pick = p_pick where round_id = r.id and phone = digits;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'You are not signed up for this game.'); end if;
  return jsonb_build_object('ok', true, 'pick', p_pick);
end $$;
grant execute on function public.shell_pick(text, text, text) to anon, authenticated;

-- how many have picked so far, for the TV during the window
create or replace function public.pick_counts(p_round_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('total', count(*), 'picked', count(pick), 'c1', count(*) filter (where pick = 'c1'), 'c2', count(*) filter (where pick = 'c2'), 'c3', count(*) filter (where pick = 'c3'))
  from public.entries where round_id = p_round_id
$$;
grant execute on function public.pick_counts(uuid) to authenticated;
