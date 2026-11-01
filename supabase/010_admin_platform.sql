-- 010: Admin platform. Settings with an admin API, SMS test mode, dashboard stats, prize reminder texts, short tracked links,
-- prize catalogue, seasonal racers + game settings, contact notes/flags/birthday, admin replies, audit log, retention purge.
-- Safe to re-run.

-- ---------- settings: admin-editable, with sensible defaults ----------
insert into private.settings (key, value) values
  ('sms_test_mode', 'true'),                 -- on until the first real send: everything except the test numbers is skipped
  ('sms_test_numbers', ''),                  -- comma separated 10-digit numbers that still receive texts in test mode
  ('prize_valid_from_days', '1'),            -- prizes start the day after the win
  ('prize_valid_days', '14'),
  ('express_hours', '6'),
  ('lapsed_days', '45'),
  ('reminder_start', 'true'),                -- "your prize is good from today"
  ('reminder_expiry', 'true'),               -- "2 days left"
  ('retention_months', '18'),
  ('short_link_base', 'https://lastcalltaverngames.com/r/')
on conflict (key) do nothing;

create or replace function public.setting(p_key text) returns text language sql stable security definer set search_path = private, public as $$
  select value from private.settings where key = p_key;
$$;
revoke execute on function public.setting(text) from public, anon, authenticated;

create or replace function public.settings_get() returns jsonb language sql stable security definer set search_path = private, public as $$
  select case when public.is_admin() then (select jsonb_object_agg(key, value) from private.settings where key <> 'sms_webhook_secret') else '{}'::jsonb end;
$$;
create or replace function public.settings_set(p_key text, p_value text) returns void language plpgsql security definer set search_path = private, public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_key in ('sms_webhook_secret', 'sms_send_url') then raise exception 'not editable here'; end if;
  insert into private.settings (key, value, updated_at) values (p_key, p_value, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.audit('setting', p_key, jsonb_build_object('value', p_value));
end $$;
grant execute on function public.settings_get() to authenticated;
grant execute on function public.settings_set(text, text) to authenticated;

-- prize window now follows the settings
create or replace function public.prize_window(p_issued timestamptz, out v_from timestamptz, out v_to timestamptz)
language sql stable security definer set search_path = private, public as $$
  select ((p_issued at time zone 'America/Chicago')::date + coalesce((select value::int from private.settings where key = 'prize_valid_from_days'), 1)) at time zone 'America/Chicago',
         ((p_issued at time zone 'America/Chicago')::date + coalesce((select value::int from private.settings where key = 'prize_valid_from_days'), 1) + coalesce((select value::int from private.settings where key = 'prize_valid_days'), 14)) at time zone 'America/Chicago';
$$;

-- ---------- audit log ----------
create table if not exists public.audit_log (
  id bigserial primary key, at timestamptz not null default now(), user_id uuid, username text, action text not null, target text, details jsonb
);
alter table public.audit_log enable row level security;
do $$ begin if not exists (select 1 from pg_policies where policyname = 'audit admin read' and tablename = 'audit_log') then execute $p$create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin())$p$; end if; end $$;
create or replace function public.audit(p_action text, p_target text, p_details jsonb default null) returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (user_id, username, action, target, details) values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_target, p_details);
$$;
revoke execute on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- ---------- contacts: notes, flags, birthday, tags ----------
alter table public.contacts add column if not exists notes text;
alter table public.contacts add column if not exists do_not_text boolean not null default false;
alter table public.contacts add column if not exists birthday_month int check (birthday_month between 1 and 12);
alter table public.contacts add column if not exists tags text[] not null default '{}';
alter table public.contacts add column if not exists failed_sends int not null default 0;
create or replace function public.contact_update(p_phone text, p_patch jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'manager login required'; end if;
  update public.contacts set
    notes = coalesce(p_patch->>'notes', notes),
    do_not_text = coalesce((p_patch->>'do_not_text')::boolean, do_not_text),
    birthday_month = case when p_patch ? 'birthday_month' then nullif(p_patch->>'birthday_month', '')::int else birthday_month end,
    tags = case when p_patch ? 'tags' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_patch->'tags') x) else tags end,
    updated_at = now()
  where phone = public.norm_phone(p_phone);
  perform public.audit('contact_update', public.norm_phone(p_phone), p_patch);
end $$;
grant execute on function public.contact_update(text, jsonb) to authenticated;

-- guests may set their own birthday month once they are in (from the entry page)
create or replace function public.set_birthday_month(p_phone text, p_month int) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_month is not null and (p_month < 1 or p_month > 12) then return jsonb_build_object('ok', false); end if;
  update public.contacts set birthday_month = p_month, updated_at = now() where phone = public.norm_phone(p_phone);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.set_birthday_month(text, int) to anon, authenticated;

-- a guest's own prize summary for the entry page (count only)
create or replace function public.my_prize_summary(p_phone text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('active', count(*) filter (where redeemed_at is null and voided_at is null and now() between valid_from and expires_at),
                            'soon', count(*) filter (where redeemed_at is null and voided_at is null and now() < valid_from))
  from public.prizes where phone = public.norm_phone(p_phone);
$$;
grant execute on function public.my_prize_summary(text) to anon, authenticated;

-- audiences and sends respect do_not_text and repeated failures
create or replace function public.campaign_audience(p_filter jsonb) returns setof text language sql stable security definer set search_path = public as $$
  select c.phone from public.contacts c
  where c.sms_opt_in and not c.do_not_text and c.failed_sends < 2
    and (p_filter->'venue_ids' is null or jsonb_array_length(p_filter->'venue_ids') = 0
         or exists (select 1 from public.contact_venues cv where cv.phone = c.phone and cv.venue_id::text in (select jsonb_array_elements_text(p_filter->'venue_ids'))))
    and (p_filter->>'visited_within_days' is null or c.last_seen_at > now() - make_interval(days => (p_filter->>'visited_within_days')::int))
    and (p_filter->>'lapsed_days' is null or c.last_seen_at < now() - make_interval(days => (p_filter->>'lapsed_days')::int))
    and (coalesce((p_filter->>'first_time')::boolean, false) = false or c.visits = 1)
    and (p_filter->>'min_visits' is null or c.visits >= (p_filter->>'min_visits')::int)
    and (p_filter->>'max_visits' is null or c.visits <= (p_filter->>'max_visits')::int)
    and (coalesce((p_filter->>'has_unredeemed_prize')::boolean, false) = false
         or exists (select 1 from public.prizes p where p.phone = c.phone and p.redeemed_at is null and p.voided_at is null and p.expires_at > now()))
    and (p_filter->'game_keys' is null or jsonb_array_length(p_filter->'game_keys') = 0
         or exists (select 1 from public.entries e join public.rounds r on r.id = e.round_id where e.phone = c.phone and r.game_key in (select jsonb_array_elements_text(p_filter->'game_keys'))))
    and (p_filter->>'birthday_month' is null or c.birthday_month = (p_filter->>'birthday_month')::int)
    and (p_filter->'tags' is null or jsonb_array_length(p_filter->'tags') = 0 or c.tags && (select array_agg(x) from jsonb_array_elements_text(p_filter->'tags') x))
    and (p_filter->>'not_texted_days' is null
         or not exists (select 1 from public.messages m where m.phone = c.phone and m.purpose = 'campaign' and m.created_at > now() - make_interval(days => (p_filter->>'not_texted_days')::int)));
$$;

-- messages: a reminder purpose, a needs-reply flag for inbound, and per-contact failure counting
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'messages_purpose_check') then execute 'alter table public.messages drop constraint messages_purpose_check'; end if;
  execute $c$alter table public.messages add constraint messages_purpose_check check (purpose in ('prize', 'reminder', 'campaign', 'verify', 'system', 'inbound', 'reply'))$c$;
end $$;
alter table public.messages add column if not exists needs_reply boolean not null default false;
alter table public.messages add column if not exists replied_at timestamptz;

create or replace function public.sms_status(p_sid text, p_status text, p_error text) returns void language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  update public.messages set status = case p_status when 'delivered' then 'delivered' when 'undelivered' then 'undelivered' when 'failed' then 'failed' when 'sent' then 'sent' else status end,
    error = coalesce(p_error, error), delivered_at = case when p_status = 'delivered' then now() else delivered_at end where provider_sid = p_sid returning phone into ph;
  if p_status in ('undelivered', 'failed') and ph is not null then update public.contacts set failed_sends = failed_sends + 1 where phone = ph; end if;
  if p_status = 'delivered' and ph is not null then update public.contacts set failed_sends = 0 where phone = ph and failed_sends > 0; end if;
end $$;

create or replace function public.sms_inbound(p_from text, p_body text, p_sid text) returns void language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_from); b text := upper(trim(coalesce(p_body, '')));
begin
  if b in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') then
    insert into public.messages (phone, direction, purpose, body, status, provider_sid) values (ph, 'in', 'inbound', coalesce(p_body, ''), 'received', p_sid);
    update public.contacts set sms_opt_in = false, opted_out_at = now(), updated_at = now() where phone = ph;
    update public.messages set status = 'skipped', error = 'opted out' where phone = ph and status = 'queued';
  elsif b in ('START', 'UNSTOP', 'YES') then
    insert into public.messages (phone, direction, purpose, body, status, provider_sid) values (ph, 'in', 'inbound', coalesce(p_body, ''), 'received', p_sid);
    update public.contacts set sms_opt_in = true, opted_out_at = null, updated_at = now() where phone = ph;
  elsif b in ('HELP', 'INFO') then
    insert into public.messages (phone, direction, purpose, body, status, provider_sid) values (ph, 'in', 'inbound', coalesce(p_body, ''), 'received', p_sid);
  else
    insert into public.messages (phone, direction, purpose, body, status, provider_sid, needs_reply) values (ph, 'in', 'inbound', coalesce(p_body, ''), 'received', p_sid, true);
  end if;
end $$;

-- admin reply / one-off text to a contact
create or replace function public.admin_send_sms(p_phone text, p_body text, p_reply_to uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone); c public.contacts%rowtype;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'Admin only.'); end if;
  select * into c from public.contacts where phone = ph;
  if c.phone is null then return jsonb_build_object('ok', false, 'error', 'Not a known contact.'); end if;
  if c.do_not_text then return jsonb_build_object('ok', false, 'error', 'Marked do not text.'); end if;
  insert into public.messages (phone, purpose, body) values (ph, 'reply', left(p_body, 600));
  if p_reply_to is not null then update public.messages set needs_reply = false, replied_at = now() where id = p_reply_to; end if;
  perform public.audit('sms_reply', ph, jsonb_build_object('body', left(p_body, 600)));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_send_sms(text, text, uuid) to authenticated;
create or replace function public.mark_replied(p_id uuid) returns void language sql security definer set search_path = public as $$
  update public.messages set needs_reply = false, replied_at = now() where id = p_id and public.is_admin();
$$;
grant execute on function public.mark_replied(uuid) to authenticated;

-- ---------- short tracked links ----------
create table if not exists public.links (
  code text primary key, url text not null, phone text, purpose text, clicks int not null default 0, created_at timestamptz not null default now(), last_click timestamptz
);
alter table public.links enable row level security;
create or replace function public.link_make(p_url text, p_phone text, p_purpose text) returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := translate(encode(gen_random_bytes(4), 'base64'), '+/=', 'xyz'); c := left(c, 5);
    exit when not exists (select 1 from public.links where code = c);
  end loop;
  insert into public.links (code, url, phone, purpose) values (c, p_url, p_phone, p_purpose);
  return c;
end $$;
revoke execute on function public.link_make(text, text, text) from public, anon, authenticated;
create or replace function public.link_resolve(p_code text) returns text language plpgsql security definer set search_path = public as $$
declare u text;
begin
  update public.links set clicks = clicks + 1, last_click = now() where code = p_code returning url into u;
  return u;
end $$;
grant execute on function public.link_resolve(text) to anon, authenticated;

-- ---------- the winner text: shorter, via the short link, dedupe per night ----------
create or replace function public.prizes_queue_text() returns trigger language plpgsql security definer set search_path = private, public as $$
declare c public.contacts%rowtype; v text; dedupe int; recent int; tok text; url text; body text; code text; base text;
begin
  select * into c from public.contacts where phone = new.phone;
  if c.phone is null or not c.sms_opt_in or c.do_not_text then return null; end if;
  select value::int into dedupe from private.settings where key = 'prize_text_dedupe_minutes';
  select count(*) into recent from public.messages where phone = new.phone and purpose = 'prize' and created_at > now() - make_interval(mins => coalesce(dedupe, 120));
  if recent > 0 then insert into public.messages (phone, purpose, body, prize_id, status) values (new.phone, 'prize', '(another win tonight, wallet already texted)', new.id, 'skipped'); return null; end if;
  select name into v from public.venues where id = new.won_venue_id;
  select value into url from private.settings where key = 'wallet_url'; select value into base from private.settings where key = 'short_link_base';
  tok := public.wallet_token_for(new.phone);
  code := public.link_make(url || '?t=' || tok, new.phone, 'prize');
  body := v || ': you won ' || new.prize || '! Good ' || to_char(new.valid_from at time zone 'America/Chicago', 'Mon FMDD') || ' to ' || to_char(new.expires_at - interval '1 second' at time zone 'America/Chicago', 'Mon FMDD')
          || ' at any Last Call Tavern Group bar. Your prizes: ' || base || code || ' Reply STOP to opt out.';
  insert into public.messages (phone, purpose, body, prize_id) values (new.phone, 'prize', body, new.id);
  return null;
end $$;

-- ---------- reminders: morning the prize becomes valid, and 2 days before it expires ----------
create or replace function public.prize_reminders() returns int language plpgsql security definer set search_path = private, public as $$
declare n int := 0; r record; base text; url text; code text; today date := (now() at time zone 'America/Chicago')::date;
begin
  if (now() at time zone 'America/Chicago')::time < '10:30'::time or (now() at time zone 'America/Chicago')::time >= '11:30'::time then return 0; end if; -- runs hourly; fires in the 10:30 to 11:30 slot
  select value into base from private.settings where key = 'short_link_base'; select value into url from private.settings where key = 'wallet_url';
  if public.setting('reminder_start') = 'true' then
    for r in select p.*, v.name as venue from public.prizes p join public.venues v on v.id = p.won_venue_id join public.contacts c on c.phone = p.phone
             where p.redeemed_at is null and p.voided_at is null and (p.valid_from at time zone 'America/Chicago')::date = today and c.sms_opt_in and not c.do_not_text
               and not exists (select 1 from public.messages m where m.prize_id = p.id and m.purpose = 'reminder' and m.body like 'Today%') loop
      code := public.link_make(url || '?t=' || public.wallet_token_for(r.phone), r.phone, 'reminder');
      insert into public.messages (phone, purpose, body, prize_id) values (r.phone, 'reminder', 'Today''s the day: your ' || r.prize || ' from ' || r.venue || ' is good through ' || to_char(r.expires_at - interval '1 second' at time zone 'America/Chicago', 'Mon FMDD') || ' at any Last Call Tavern Group bar. ' || base || code || ' Reply STOP to opt out.', r.id);
      n := n + 1;
    end loop;
  end if;
  if public.setting('reminder_expiry') = 'true' then
    for r in select p.*, v.name as venue from public.prizes p join public.venues v on v.id = p.won_venue_id join public.contacts c on c.phone = p.phone
             where p.redeemed_at is null and p.voided_at is null and ((p.expires_at - interval '1 second') at time zone 'America/Chicago')::date = today + 2 and c.sms_opt_in and not c.do_not_text
               and not exists (select 1 from public.messages m where m.prize_id = p.id and m.purpose = 'reminder' and m.body like 'Last call%') loop
      code := public.link_make(url || '?t=' || public.wallet_token_for(r.phone), r.phone, 'reminder');
      insert into public.messages (phone, purpose, body, prize_id) values (r.phone, 'reminder', 'Last call: your ' || r.prize || ' from ' || r.venue || ' expires ' || to_char(r.expires_at - interval '1 second' at time zone 'America/Chicago', 'Mon FMDD') || '. Any Last Call Tavern Group bar. ' || base || code || ' Reply STOP to opt out.', r.id);
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;
do $$ begin if not exists (select 1 from cron.job where jobname = 'prize-reminders') then perform cron.schedule('prize-reminders', '5 * * * *', 'select public.prize_reminders()'); end if; end $$;

-- ---------- prize catalogue ----------
create table if not exists public.prize_catalog (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text, value_cents int, active boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now()
);
alter table public.prize_catalog enable row level security;
do $$ begin if not exists (select 1 from pg_policies where policyname = 'catalog read' and tablename = 'prize_catalog') then execute $p$create policy "catalog read" on public.prize_catalog for select to authenticated using (true)$p$; end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where policyname = 'catalog admin' and tablename = 'prize_catalog') then execute $p$create policy "catalog admin" on public.prize_catalog for all to authenticated using (public.is_admin()) with check (public.is_admin())$p$; end if; end $$;
insert into public.prize_catalog (name, description, value_cents, sort_order) values ('a round on us', 'One drink, well or draft', 800, 1), ('a free appetizer', 'Any starter up to $15', 1500, 2), ('half off your tab', 'Food and drink, one visit, up to $50 off', 5000, 3) on conflict (name) do nothing;

-- ---------- games: settings json (shell swaps etc.), seasonal racers via option.from / option.to (MM-DD) ----------
alter table public.games add column if not exists settings jsonb not null default '{}'::jsonb;
update public.games set settings = '{"swaps": 20, "pick_seconds": 10}'::jsonb where key = 'shellgame' and settings = '{}'::jsonb;
create or replace function public.option_in_season(o jsonb, d date default (now() at time zone 'America/Chicago')::date) returns boolean language sql immutable as $$
  select case when o->>'from' is null or o->>'to' is null then true
              when (o->>'from') <= (o->>'to') then to_char(d, 'MM-DD') between (o->>'from') and (o->>'to')
              else to_char(d, 'MM-DD') >= (o->>'from') or to_char(d, 'MM-DD') <= (o->>'to') end;
$$;
grant execute on function public.option_in_season(jsonb, date) to anon, authenticated;

-- ---------- bars: enabled games ----------
alter table public.venues add column if not exists games_enabled text[];   -- null = all

-- ---------- dashboard ----------
create or replace function public.admin_dashboard(p_days int default 7) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then jsonb_build_object('error', 'Admin only') else jsonb_build_object(
    'since', now() - make_interval(days => p_days),
    'rounds', (select count(*) from public.rounds where status = 'finished' and finished_at > now() - make_interval(days => p_days)),
    'players', (select count(distinct phone) from public.entries where created_at > now() - make_interval(days => p_days)),
    'entries', (select count(*) from public.entries where created_at > now() - make_interval(days => p_days)),
    'new_contacts', (select count(*) from public.contacts where first_seen_at > now() - make_interval(days => p_days)),
    'contacts_total', (select count(*) from public.contacts),
    'opted_in', (select count(*) from public.contacts where sms_opt_in and not do_not_text),
    'prizes_issued', (select count(*) from public.prizes where issued_at > now() - make_interval(days => p_days)),
    'prizes_redeemed', (select count(*) from public.prizes where redeemed_at > now() - make_interval(days => p_days)),
    'prizes_open', (select count(*) from public.prizes where redeemed_at is null and voided_at is null and expires_at > now()),
    'texts_sent', (select count(*) from public.messages where direction = 'out' and status in ('sent', 'delivered') and created_at > now() - make_interval(days => p_days)),
    'texts_delivered', (select count(*) from public.messages where direction = 'out' and status = 'delivered' and created_at > now() - make_interval(days => p_days)),
    'texts_failed', (select count(*) from public.messages where direction = 'out' and status in ('failed', 'undelivered') and created_at > now() - make_interval(days => p_days)),
    'texts_queued', (select count(*) from public.messages where status in ('queued', 'sending')),
    'opt_outs', (select count(*) from public.contacts where opted_out_at > now() - make_interval(days => p_days)),
    'needs_reply', (select count(*) from public.messages where needs_reply),
    'test_mode', public.setting('sms_test_mode') = 'true',
    'by_venue', (select coalesce(jsonb_agg(jsonb_build_object('venue', v.name, 'rounds', x.rounds, 'players', x.players, 'prizes', x.prizes, 'redeemed', x.redeemed, 'opted_in', x.opted_in) order by v.sort_order), '[]'::jsonb)
                 from public.venues v cross join lateral (
                   select (select count(*) from public.rounds r where r.venue_id = v.id and r.status = 'finished' and r.finished_at > now() - make_interval(days => p_days)) as rounds,
                          (select count(distinct e.phone) from public.entries e join public.rounds r on r.id = e.round_id where r.venue_id = v.id and e.created_at > now() - make_interval(days => p_days)) as players,
                          (select count(*) from public.prizes p where p.won_venue_id = v.id and p.issued_at > now() - make_interval(days => p_days)) as prizes,
                          (select count(*) from public.prizes p where p.redeemed_venue_id = v.id and p.redeemed_at > now() - make_interval(days => p_days)) as redeemed,
                          (select count(*) from public.contact_venues cv join public.contacts c on c.phone = cv.phone where cv.venue_id = v.id and c.sms_opt_in) as opted_in) x
                 where v.active),
    'recent_rounds', (select coalesce(jsonb_agg(jsonb_build_object('at', r.finished_at, 'venue', v.name, 'game', g.name, 'players', (select count(*) from public.entries e where e.round_id = r.id), 'winners', (select count(*) from public.entries e where e.round_id = r.id and e.is_winner), 'prize', coalesce(r.prize, v.default_prize)) order by r.finished_at desc), '[]'::jsonb)
                      from (select * from public.rounds where status = 'finished' order by finished_at desc limit 12) r join public.venues v on v.id = r.venue_id join public.games g on g.key = r.game_key)
  ) end;
$$;
grant execute on function public.admin_dashboard(int) to authenticated;

-- ---------- rounds: replay support (what the TV showed) ----------
create or replace function public.round_results(p_round_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'round', (select to_jsonb(r) from public.rounds r where r.id = p_round_id),
    'winners', (select coalesce(jsonb_agg(e.name order by e.created_at), '[]'::jsonb) from public.entries e where e.round_id = p_round_id and e.is_winner),
    'count', (select count(*) from public.entries e where e.round_id = p_round_id)) end;
$$;
grant execute on function public.round_results(uuid) to authenticated;

-- ---------- retention: anonymise never-opted-in contacts not seen in N months ----------
create or replace function public.retention_purge() returns int language plpgsql security definer set search_path = private, public as $$
declare months int := coalesce(public.setting('retention_months')::int, 18); n int := 0; r record;
begin
  for r in select phone from public.contacts where not sms_opt_in and opted_in_at is null and last_seen_at < now() - make_interval(months => months) loop
    update public.entries set phone = 'purged-' || left(md5(phone), 12), name = 'Purged' where phone = r.phone;
    delete from public.prizes where phone = r.phone and (redeemed_at is not null or expires_at < now());
    delete from public.messages where phone = r.phone; delete from public.wallet_tokens where phone = r.phone; delete from public.links where phone = r.phone;
    delete from public.contact_venues where phone = r.phone; delete from public.contacts where phone = r.phone;
    n := n + 1;
  end loop;
  if n > 0 then insert into public.audit_log (action, target, details) values ('retention_purge', null, jsonb_build_object('contacts', n)); end if;
  return n;
end $$;
do $$ begin if not exists (select 1 from cron.job where jobname = 'retention-purge') then perform cron.schedule('retention-purge', '0 9 1 * *', 'select public.retention_purge()'); end if; end $$;

-- ---------- logins: last sign-in ----------
create or replace function public.list_logins() returns table (id uuid, username text, role text, active boolean, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.role, p.active, p.created_at, u.last_sign_in_at from public.profiles p join auth.users u on u.id = p.id where public.is_admin() order by p.created_at;
$$;
grant execute on function public.list_logins() to authenticated;

-- ---------- staff: redeem from a wallet token (QR on the guest's phone) ----------
create or replace function public.wallet_phone_by_token(p_token text) returns text language sql stable security definer set search_path = public as $$
  select phone from public.wallet_tokens where token = p_token and expires_at > now() and public.is_manager();
$$;
grant execute on function public.wallet_phone_by_token(text) to authenticated;

-- audit the sensitive actions that already exist
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
  perform public.audit('redeem_prize', p_prize_id::text, jsonb_build_object('venue_id', p_venue_id, 'phone', p.phone));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.void_prize(p_prize_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.prizes set voided_at = now(), void_reason = p_reason where id = p_prize_id and redeemed_at is null;
  perform public.audit('void_prize', p_prize_id::text, jsonb_build_object('reason', p_reason));
end $$;
grant execute on function public.void_prize(uuid, text) to authenticated;
