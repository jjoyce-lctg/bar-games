-- Bar Marbles: a game where every entry is a marble. Run once in Supabase > SQL Editor (safe to re-run).
-- The guest's "pick" is their marble colour. Finish places are stored per entry; the winner gets the prize.
-- Guests can also predict the winner from the field; a correct prediction earns bonus points.

insert into public.games (key, name, description, options, sort_order) values
  ('barmarbles', 'Bar Marbles',
   'Every guest gets a marble. Pick your colour, watch the race, first to the line wins.',
   '[{"id":"c0","label":"Red","hex":"#ff4d4d"},{"id":"c1","label":"Orange","hex":"#ff9a3c"},{"id":"c2","label":"Gold","hex":"#ffd23c"},
     {"id":"c3","label":"Lime","hex":"#b8f04a"},{"id":"c4","label":"Green","hex":"#4de08a"},{"id":"c5","label":"Teal","hex":"#3ddcc8"},
     {"id":"c6","label":"Sky","hex":"#5ac8ff"},{"id":"c7","label":"Blue","hex":"#4f7cff"},{"id":"c8","label":"Violet","hex":"#9b6bff"},
     {"id":"c9","label":"Purple","hex":"#c75cff"},{"id":"c10","label":"Pink","hex":"#ff6ad5"},{"id":"c11","label":"Rose","hex":"#ff5c8a"},
     {"id":"c12","label":"White","hex":"#f4f4f8"},{"id":"c13","label":"Black","hex":"#2b2f3a"}]'::jsonb,
   2)
on conflict (key) do update set name = excluded.name, description = excluded.description, options = excluded.options;

alter table public.entries add column if not exists place int;
alter table public.entries add column if not exists predict_entry_id uuid references public.entries(id);
alter table public.entries add column if not exists predict_ok boolean;

-- Public round view: for Bar Marbles, also the current field (first names + colours) so a guest can predict the winner.
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
                             else (select coalesce(jsonb_agg(o), '[]'::jsonb) from jsonb_array_elements(g.options) o where (o->>'id') = any(r.racers)) end),
    'field', case when g.key = 'barmarbles'
                  then (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', public.short_name(e.name), 'pick', e.pick) order by e.created_at), '[]'::jsonb)
                        from public.entries e where e.round_id = r.id)
                  else '[]'::jsonb end
  )
  from public.rounds r
  join public.venues v on v.id = r.venue_id
  join public.games  g on g.key = r.game_key
  where upper(r.code) = upper(p_code);
$$;

-- A guest's last marble colour, so returning players keep theirs (phone is the key; returns only the colour id).
create or replace function public.last_marble_pick(p_phone text) returns text
language sql stable security definer set search_path = public as $$
  select e.pick from public.entries e join public.rounds r on r.id = e.round_id
  where r.game_key = 'barmarbles'
    and e.phone = (select case when length(d) = 11 and left(d, 1) = '1' then substr(d, 2) else d end
                   from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x)
  order by e.created_at desc limit 1;
$$;
grant execute on function public.last_marble_pick(text) to anon, authenticated;

-- Predict the winner: the guest (by phone) names another entry in the same round. Cannot pick yourself. Only while the round is open.
create or replace function public.set_prediction(p_code text, p_phone text, p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rounds%rowtype; digits text; me public.entries%rowtype;
begin
  select * into r from public.rounds where upper(code) = upper(p_code);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'That game code was not found.'); end if;
  if r.status <> 'open' then return jsonb_build_object('ok', false, 'error', 'The race has started.'); end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '1' then digits := substr(digits, 2); end if;
  select * into me from public.entries where round_id = r.id and phone = digits;
  if me.id is null then return jsonb_build_object('ok', false, 'error', 'Enter the race first.'); end if;
  if p_entry_id = me.id then return jsonb_build_object('ok', false, 'error', 'Pick someone other than yourself.'); end if;
  if not exists (select 1 from public.entries where id = p_entry_id and round_id = r.id) then return jsonb_build_object('ok', false, 'error', 'That marble is not in this race.'); end if;
  update public.entries set predict_entry_id = p_entry_id where id = me.id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.set_prediction(text, text, uuid) to anon, authenticated;

-- Finish a Bar Marbles round: p_places is the finish order as entry ids (winner first). Winner gets the prize; predictions are scored.
create or replace function public.finish_round_places(p_round_id uuid, p_places uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r record; w record; pw record; i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.rounds set status = 'finished', winning_pick = null, finished_at = now() where id = p_round_id returning * into r;
  update public.entries set place = null, is_winner = false where round_id = p_round_id;
  for i in 1 .. coalesce(array_length(p_places, 1), 0) loop
    update public.entries set place = i, is_winner = (i = 1) where id = p_places[i] and round_id = p_round_id;
  end loop;
  update public.entries e set predict_ok = (e.predict_entry_id is not null and e.predict_entry_id = p_places[1]) where e.round_id = p_round_id;
  select * into pw from public.prize_window(now());
  for w in select e.* from public.entries e where e.round_id = p_round_id and e.is_winner loop
    insert into public.prizes (entry_id, round_id, won_venue_id, phone, name, prize, valid_from, expires_at)
    select w.id, r.id, r.venue_id, w.phone, w.name, coalesce(r.prize, v.default_prize, 'a prize'), pw.v_from, pw.v_to
    from public.venues v where v.id = r.venue_id
    on conflict (entry_id) do nothing;
  end loop;
end $$;
grant execute on function public.finish_round_places(uuid, uuid[]) to authenticated;

-- Points: 1 for playing, +10 for a win (either game), +5 for 2nd, +3 for 3rd, +4 for predicting the Bar Marbles winner.
create or replace view public.entry_points as
  select e.id as entry_id, e.phone, e.name, r.venue_id, e.created_at,
         (e.created_at at time zone 'America/Chicago')::date as play_date,
         1 + case when e.is_winner then 10 when e.place = 2 then 5 when e.place = 3 then 3 else 0 end
           + case when e.predict_ok then 4 else 0 end as points,
         e.is_winner
  from public.entries e join public.rounds r on r.id = e.round_id
  where r.status = 'finished';
alter view public.entry_points set (security_invoker = true);
