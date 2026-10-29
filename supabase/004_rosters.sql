-- Racer roster per round (which of the game's racers are in play). Run once; safe to re-run.
alter table public.rounds add column if not exists racers text[];

create or replace function public.get_round_public(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', r.code,
    'status', r.status,
    'prize', coalesce(r.prize, v.default_prize),
    'venue', jsonb_build_object('name', v.name, 'slug', v.slug, 'color_primary', v.color_primary,
                                'color_accent', v.color_accent, 'logo_url', v.logo_url, 'tagline', v.tagline),
    'game', jsonb_build_object('key', g.key, 'name', g.name, 'description', g.description,
             'options', case when r.racers is null then g.options
                             else (select coalesce(jsonb_agg(o), '[]'::jsonb) from jsonb_array_elements(g.options) o where (o->>'id') = any(r.racers)) end)
  )
  from public.rounds r
  join public.venues v on v.id = r.venue_id
  join public.games  g on g.key = r.game_key
  where upper(r.code) = upper(p_code);
$$;

-- submit_entry: the pick must be one of the round's racers
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
                 where g.key = r.game_key and o->>'id' = p_pick and (r.racers is null or p_pick = any(r.racers))) into valid_pick;
  if not valid_pick then return jsonb_build_object('ok', false, 'error', 'Please pick one of the options.'); end if;
  insert into public.entries (round_id, name, phone, pick, sms_opt_in, opt_in_text, user_agent)
  values (r.id, left(trim(p_name), 60), digits, p_pick, coalesce(p_opt_in, false), p_opt_in_text, left(p_user_agent, 300))
  on conflict (round_id, phone) do update
    set pick = excluded.pick, name = excluded.name, sms_opt_in = public.entries.sms_opt_in or excluded.sms_opt_in;
  return jsonb_build_object('ok', true);
end $$;
