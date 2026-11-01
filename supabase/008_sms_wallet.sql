-- 008: Contacts, message log, campaigns, prize wallet access. Twilio sending lives in the sms-send edge function; this file is the data side.
-- Safe to re-run.

create extension if not exists pg_net with schema extensions;

-- ---------- private settings (never exposed through the API) ----------
create schema if not exists private;
create table if not exists private.settings (key text primary key, value text not null, updated_at timestamptz not null default now());
revoke all on schema private from public, anon, authenticated;
revoke all on private.settings from public, anon, authenticated;
insert into private.settings (key, value) values
  ('sms_webhook_secret', encode(gen_random_bytes(24), 'hex')),
  ('sms_send_url', ''),                                   -- set after the edge function is deployed
  ('campaign_quiet_start', '10:00'), ('campaign_quiet_end', '20:00'),
  ('campaign_min_days_between', '7'),
  ('prize_text_dedupe_minutes', '120'),
  ('wallet_url', 'https://lastcalltaverngames.com/prizes.html')
on conflict (key) do nothing;

-- ---------- contacts: one row per phone, kept current by a trigger on entries ----------
create table if not exists public.contacts (
  phone          text primary key,
  name           text not null,
  first_seen_at  timestamptz not null,
  last_seen_at   timestamptz not null,
  visits         int not null default 0,          -- distinct bar nights (venue + night) with at least one entry
  games          int not null default 0,          -- entries
  wins           int not null default 0,
  sms_opt_in     boolean not null default false,
  opted_in_at    timestamptz,
  opted_out_at   timestamptz,
  opt_in_text    text,
  last_venue_id  uuid references public.venues(id),
  updated_at     timestamptz not null default now()
);
create table if not exists public.contact_venues (
  phone          text not null references public.contacts(phone) on delete cascade,
  venue_id       uuid not null references public.venues(id),
  visits         int not null default 0,
  first_visit_at timestamptz not null,
  last_visit_at  timestamptz not null,
  primary key (phone, venue_id)
);
alter table public.contacts enable row level security;
alter table public.contact_venues enable row level security;
drop policy if exists "contacts staff read" on public.contacts;
drop policy if exists "contact_venues staff read" on public.contact_venues;
create policy "contacts staff read" on public.contacts for select to authenticated using (public.is_manager());
create policy "contact_venues staff read" on public.contact_venues for select to authenticated using (public.is_manager());

-- a bar night: the Chicago date, with anything before 6am counting as the night before
create or replace function public.bar_night(p timestamptz) returns date language sql immutable as $$
  select ((p - interval '6 hours') at time zone 'America/Chicago')::date;
$$;

create or replace function public.refresh_contact(p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select e.phone, (array_agg(e.name order by e.created_at desc))[1] as name, min(e.created_at) as first_seen, max(e.created_at) as last_seen,
         count(distinct (r.venue_id, public.bar_night(e.created_at))) as visits, count(*) as games, count(*) filter (where e.is_winner) as wins,
         bool_or(e.sms_opt_in) as opt_in, min(e.created_at) filter (where e.sms_opt_in) as opted_in_at,
         (array_agg(e.opt_in_text order by e.created_at desc) filter (where e.sms_opt_in))[1] as opt_in_text,
         (array_agg(r.venue_id order by e.created_at desc))[1] as last_venue
  into c from public.entries e join public.rounds r on r.id = e.round_id where e.phone = p_phone group by e.phone;
  if c.phone is null then return; end if;
  insert into public.contacts (phone, name, first_seen_at, last_seen_at, visits, games, wins, sms_opt_in, opted_in_at, opt_in_text, last_venue_id, updated_at)
  values (c.phone, c.name, c.first_seen, c.last_seen, c.visits, c.games, c.wins, c.opt_in, c.opted_in_at, c.opt_in_text, c.last_venue, now())
  on conflict (phone) do update set name = excluded.name, first_seen_at = excluded.first_seen_at, last_seen_at = excluded.last_seen_at,
    visits = excluded.visits, games = excluded.games, wins = excluded.wins, last_venue_id = excluded.last_venue_id, updated_at = now(),
    -- opt-in only ever turns on from an entry; a STOP (opted_out_at) wins over everything until they sign up again later
    sms_opt_in = case when public.contacts.opted_out_at is not null and public.contacts.opted_out_at > excluded.last_seen_at then false else (public.contacts.sms_opt_in or excluded.sms_opt_in) end,
    opted_in_at = coalesce(public.contacts.opted_in_at, excluded.opted_in_at), opt_in_text = coalesce(excluded.opt_in_text, public.contacts.opt_in_text);
  insert into public.contact_venues (phone, venue_id, visits, first_visit_at, last_visit_at)
  select e.phone, r.venue_id, count(distinct public.bar_night(e.created_at)), min(e.created_at), max(e.created_at)
  from public.entries e join public.rounds r on r.id = e.round_id where e.phone = p_phone group by e.phone, r.venue_id
  on conflict (phone, venue_id) do update set visits = excluded.visits, first_visit_at = excluded.first_visit_at, last_visit_at = excluded.last_visit_at;
end $$;

create or replace function public.entries_refresh_contact() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.refresh_contact(coalesce(new.phone, old.phone)); return null; end $$;
drop trigger if exists entries_refresh_contact on public.entries;
create trigger entries_refresh_contact after insert or update or delete on public.entries for each row execute function public.entries_refresh_contact();

-- backfill
do $$ declare p text; begin for p in select distinct phone from public.entries loop perform public.refresh_contact(p); end loop; end $$;

-- ---------- messages: every text we send or receive, with why ----------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  direction     text not null default 'out' check (direction in ('out', 'in')),
  purpose       text not null check (purpose in ('prize', 'campaign', 'verify', 'system', 'inbound')),
  body          text not null,
  campaign_id   uuid,
  prize_id      uuid references public.prizes(id),
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received', 'skipped')),
  send_after    timestamptz not null default now(),
  provider_sid  text,
  error         text,
  segments      int,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  delivered_at  timestamptz
);
create index if not exists messages_phone_idx on public.messages(phone, created_at desc);
create index if not exists messages_queue_idx on public.messages(status, send_after) where status = 'queued';
alter table public.messages enable row level security;
drop policy if exists "messages staff read" on public.messages;
create policy "messages staff read" on public.messages for select to authenticated using (public.is_manager());

create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  body            text not null,
  filter          jsonb not null default '{}'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  audience_count  int,
  sent_count      int not null default 0,
  failed_count    int not null default 0,
  scheduled_for   timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
alter table public.campaigns enable row level security;
drop policy if exists "campaigns admin all" on public.campaigns;
create policy "campaigns admin all" on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
alter table public.messages drop constraint if exists messages_campaign_fk;
alter table public.messages add constraint messages_campaign_fk foreign key (campaign_id) references public.campaigns(id);

-- ---------- wallet access: private links (long-lived tokens) and one-time codes for self lookup ----------
create table if not exists public.wallet_tokens (
  token       text primary key,
  phone       text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  last_used   timestamptz
);
create index if not exists wallet_tokens_phone_idx on public.wallet_tokens(phone);
create table if not exists public.verify_codes (
  phone       text primary key,
  code        text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  sent_at     timestamptz not null default now(),
  sends_hour  int not null default 1,
  hour_start  timestamptz not null default now()
);
alter table public.wallet_tokens enable row level security;
alter table public.verify_codes enable row level security;
-- no policies: only reachable through the functions below

create or replace function public.norm_phone(p text) returns text language sql immutable as $$
  select case when length(d) = 11 and left(d, 1) = '1' then substr(d, 2) else d end from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- a wallet link for a phone: reuse a live token, else mint one good for 120 days
create or replace function public.wallet_token_for(p_phone text) returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is not null and not public.is_manager() then raise exception 'manager login required'; end if;
  select token into t from public.wallet_tokens where phone = p_phone and expires_at > now() + interval '30 days' order by created_at desc limit 1;
  if t is null then
    t := encode(gen_random_bytes(9), 'base64'); t := translate(t, '+/=', 'xyz');
    insert into public.wallet_tokens (token, phone, expires_at) values (t, p_phone, now() + interval '120 days');
  end if;
  return t;
end $$;

-- the wallet itself: redeemable first (newest on top), then everything else newest first
create or replace function public.wallet_for_phone(p_phone text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', (select name from public.contacts where phone = p_phone),
    'phone', p_phone,
    'prizes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'prize', x.prize, 'venue', x.venue, 'won_at', x.issued_at, 'valid_from', x.valid_from, 'expires_at', x.expires_at,
        'status', x.status, 'redeemed_at', x.redeemed_at, 'redeemed_venue', x.redeemed_venue) order by x.rank, x.issued_at desc)
      from (select p.id, p.prize, v.name as venue, p.issued_at, p.valid_from, p.expires_at, p.redeemed_at, rv.name as redeemed_venue,
                   case when p.voided_at is not null then 'voided' when p.redeemed_at is not null then 'redeemed'
                        when now() < p.valid_from then 'not_yet' when now() > p.expires_at then 'expired' else 'active' end as status,
                   case when p.voided_at is null and p.redeemed_at is null and now() <= p.expires_at then 0 else 1 end as rank
            from public.prizes p join public.venues v on v.id = p.won_venue_id left join public.venues rv on rv.id = p.redeemed_venue_id
            where p.phone = p_phone) x), '[]'::jsonb));
$$;

create or replace function public.wallet_by_token(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.wallet_tokens%rowtype;
begin
  select * into t from public.wallet_tokens where token = p_token and expires_at > now();
  if t.token is null then return jsonb_build_object('ok', false, 'error', 'This link has expired. Enter your number below to get a new one.'); end if;
  update public.wallet_tokens set last_used = now() where token = p_token;
  return jsonb_build_object('ok', true) || public.wallet_for_phone(t.phone);
end $$;

-- self lookup: text a 4-digit code (1 per minute, 5 per hour per number). Only numbers we know get a code; unknown numbers get the same reply so the list cannot be probed.
create or replace function public.wallet_request_code(p_phone text) returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone); v public.verify_codes%rowtype; c text; known boolean;
begin
  if length(ph) <> 10 then return jsonb_build_object('ok', false, 'error', 'Enter a 10-digit mobile number.'); end if;
  select exists(select 1 from public.contacts where phone = ph) into known;
  if not known then return jsonb_build_object('ok', true); end if;
  select * into v from public.verify_codes where phone = ph;
  if v.phone is not null then
    if v.sent_at > now() - interval '60 seconds' then return jsonb_build_object('ok', true); end if;
    if v.hour_start > now() - interval '1 hour' and v.sends_hour >= 5 then return jsonb_build_object('ok', false, 'error', 'Too many codes. Try again in an hour.'); end if;
  end if;
  c := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into public.verify_codes (phone, code, expires_at, attempts, sent_at, sends_hour, hour_start) values (ph, c, now() + interval '10 minutes', 0, now(), 1, now())
  on conflict (phone) do update set code = excluded.code, expires_at = excluded.expires_at, attempts = 0, sent_at = now(),
    sends_hour = case when public.verify_codes.hour_start > now() - interval '1 hour' then public.verify_codes.sends_hour + 1 else 1 end,
    hour_start = case when public.verify_codes.hour_start > now() - interval '1 hour' then public.verify_codes.hour_start else now() end;
  insert into public.messages (phone, purpose, body) values (ph, 'verify', 'Last Call Tavern Games: your code is ' || c || '. It expires in 10 minutes.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.wallet_verify(p_phone text, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone); v public.verify_codes%rowtype;
begin
  select * into v from public.verify_codes where phone = ph for update;
  if v.phone is null or v.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'That code has expired. Request a new one.'); end if;
  if v.attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'Too many tries. Request a new code.'); end if;
  if v.code <> regexp_replace(coalesce(p_code, ''), '\D', '', 'g') then update public.verify_codes set attempts = attempts + 1 where phone = ph; return jsonb_build_object('ok', false, 'error', 'That code is not right.'); end if;
  delete from public.verify_codes where phone = ph;
  return jsonb_build_object('ok', true, 'token', public.wallet_token_for(ph));
end $$;

-- ---------- the winner's text: queued when a prize is issued ----------
create or replace function public.prizes_queue_text() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contacts%rowtype; v text; dedupe int; recent int; tok text; url text; body text;
begin
  select * into c from public.contacts where phone = new.phone;
  if c.phone is null or not c.sms_opt_in then return null; end if;
  select value::int into dedupe from private.settings where key = 'prize_text_dedupe_minutes';
  select count(*) into recent from public.messages where phone = new.phone and purpose = 'prize' and created_at > now() - make_interval(mins => coalesce(dedupe, 120));
  if recent > 0 then insert into public.messages (phone, purpose, body, prize_id, status) values (new.phone, 'prize', '(another win tonight, wallet already texted)', new.id, 'skipped'); return null; end if;
  select name into v from public.venues where id = new.won_venue_id;
  select value into url from private.settings where key = 'wallet_url';
  tok := public.wallet_token_for(new.phone);
  body := v || ': you won ' || new.prize || '! Valid ' || to_char(new.valid_from at time zone 'America/Chicago', 'Mon FMDD') || ' to ' || to_char(new.expires_at at time zone 'America/Chicago', 'Mon FMDD')
          || ' at any Last Call Tavern Group bar. Show a staff member: ' || url || '?t=' || tok || ' Reply STOP to opt out.';
  insert into public.messages (phone, purpose, body, prize_id) values (new.phone, 'prize', body, new.id);
  return null;
end $$;
drop trigger if exists prizes_queue_text on public.prizes;
create trigger prizes_queue_text after insert on public.prizes for each row execute function public.prizes_queue_text();

-- ---------- nudge the sender: an insert into the queue pings the edge function; a cron sweep catches anything left ----------
create or replace function public.messages_nudge_sender() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  select value into url from private.settings where key = 'sms_send_url';
  select value into secret from private.settings where key = 'sms_webhook_secret';
  if coalesce(url, '') = '' then return null; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-lctg-secret', secret), body := jsonb_build_object('reason', 'nudge'), timeout_milliseconds := 5000);
  return null;
end $$;
drop trigger if exists messages_nudge_sender on public.messages;
create trigger messages_nudge_sender after insert on public.messages for each statement execute function public.messages_nudge_sender();

-- ---------- what the sender needs: claim a batch, record results, take inbound ----------
-- (called by the edge function with the service role, so no grants to anon/authenticated)
create or replace function public.sms_claim_batch(p_limit int default 40) returns setof public.messages language plpgsql security definer set search_path = public as $$
begin
  return query update public.messages m set status = 'sending', sent_at = now()
    where m.id in (select id from public.messages where status = 'queued' and direction = 'out' and send_after <= now() order by created_at limit p_limit for update skip locked)
    returning m.*;
end $$;
create or replace function public.sms_mark(p_id uuid, p_status text, p_sid text, p_error text, p_segments int) returns void language sql security definer set search_path = public as $$
  update public.messages set status = p_status, provider_sid = coalesce(p_sid, provider_sid), error = p_error, segments = coalesce(p_segments, segments),
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end where id = p_id;
$$;
create or replace function public.sms_status(p_sid text, p_status text, p_error text) returns void language sql security definer set search_path = public as $$
  update public.messages set status = case p_status when 'delivered' then 'delivered' when 'undelivered' then 'undelivered' when 'failed' then 'failed' when 'sent' then 'sent' else status end,
    error = coalesce(p_error, error), delivered_at = case when p_status = 'delivered' then now() else delivered_at end where provider_sid = p_sid;
$$;
create or replace function public.sms_inbound(p_from text, p_body text, p_sid text) returns void language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_from); b text := upper(trim(coalesce(p_body, '')));
begin
  insert into public.messages (phone, direction, purpose, body, status, provider_sid) values (ph, 'in', 'inbound', coalesce(p_body, ''), 'received', p_sid);
  if b in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') then
    update public.contacts set sms_opt_in = false, opted_out_at = now(), updated_at = now() where phone = ph;
    update public.messages set status = 'skipped', error = 'opted out' where phone = ph and status = 'queued';
  elsif b in ('START', 'UNSTOP', 'YES') then
    update public.contacts set sms_opt_in = true, opted_out_at = null, updated_at = now() where phone = ph;
  end if;
end $$;

-- ---------- campaigns: audience filter, preview, send ----------
-- filter keys: venue_ids[], visited_within_days, lapsed_days (no visit in N days), first_time (true: exactly one visit), min_visits, max_visits,
--              has_unredeemed_prize (true), game_keys[], not_texted_days (no campaign text in N days)
create or replace function public.campaign_audience(p_filter jsonb) returns setof text language sql stable security definer set search_path = public as $$
  select c.phone from public.contacts c
  where c.sms_opt_in
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
    and (p_filter->>'not_texted_days' is null
         or not exists (select 1 from public.messages m where m.phone = c.phone and m.purpose = 'campaign' and m.created_at > now() - make_interval(days => (p_filter->>'not_texted_days')::int)));
$$;

create or replace function public.campaign_preview(p_filter jsonb) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object('count', (select count(*) from public.campaign_audience(p_filter)), 'opted_in_total', (select count(*) from public.contacts where sms_opt_in)) else jsonb_build_object('error', 'Admin only') end;
$$;

-- queue a campaign for everyone in its audience. Honours quiet hours by scheduling, and the per-contact minimum days between campaign texts.
create or replace function public.campaign_send(p_campaign_id uuid, p_when timestamptz default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.campaigns%rowtype; n int := 0; qs text; qe text; t timestamptz; mind int; lt time;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'error', 'Admin only.'); end if;
  select * into c from public.campaigns where id = p_campaign_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Campaign not found.'); end if;
  if c.status not in ('draft', 'scheduled') then return jsonb_build_object('ok', false, 'error', 'Already sent.'); end if;
  select value into qs from private.settings where key = 'campaign_quiet_start'; select value into qe from private.settings where key = 'campaign_quiet_end';
  select value::int into mind from private.settings where key = 'campaign_min_days_between';
  t := coalesce(p_when, now());
  -- push into the allowed window (Chicago time) if needed
  lt := (t at time zone 'America/Chicago')::time;
  if lt < qs::time then t := ((t at time zone 'America/Chicago')::date::timestamp + qs::time) at time zone 'America/Chicago';
  elsif lt > qe::time then t := (((t at time zone 'America/Chicago')::date + 1)::timestamp + qs::time) at time zone 'America/Chicago'; end if;
  insert into public.messages (phone, purpose, body, campaign_id, send_after)
  select a.phone, 'campaign', c.body || case when c.body ilike '%STOP%' then '' else ' Reply STOP to opt out.' end, c.id, t
  from public.campaign_audience(c.filter) a
  where not exists (select 1 from public.messages m where m.phone = a.phone and m.purpose = 'campaign' and m.status <> 'skipped' and m.created_at > now() - make_interval(days => coalesce(mind, 7)));
  get diagnostics n = row_count;
  update public.campaigns set status = case when t > now() + interval '2 minutes' then 'scheduled' else 'sending' end, audience_count = n, scheduled_for = t, sent_at = case when t <= now() + interval '2 minutes' then now() else null end where id = c.id;
  return jsonb_build_object('ok', true, 'queued', n, 'send_at', t);
end $$;

-- contact detail for staff: profile, venues, prizes, messages
create or replace function public.contact_detail(p_phone text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_manager() then jsonb_build_object('error', 'Manager login required') else jsonb_build_object(
    'contact', (select to_jsonb(c) from public.contacts c where c.phone = public.norm_phone(p_phone)),
    'venues', (select coalesce(jsonb_agg(jsonb_build_object('venue', v.name, 'visits', cv.visits, 'first', cv.first_visit_at, 'last', cv.last_visit_at) order by cv.last_visit_at desc), '[]'::jsonb) from public.contact_venues cv join public.venues v on v.id = cv.venue_id where cv.phone = public.norm_phone(p_phone)),
    'wallet', public.wallet_for_phone(public.norm_phone(p_phone)),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'purpose', m.purpose, 'body', m.body, 'status', m.status, 'at', m.created_at, 'campaign', (select name from public.campaigns where id = m.campaign_id)) order by m.created_at desc), '[]'::jsonb) from (select * from public.messages where phone = public.norm_phone(p_phone) order by created_at desc limit 50) m)
  ) end;
$$;

-- contacts list for admin filters (same filter shape as campaigns, but ignores opt-in so the whole database is browsable)
create or replace function public.contacts_search(p_filter jsonb, p_limit int default 500) returns setof public.contacts language sql stable security definer set search_path = public as $$
  select c.* from public.contacts c
  where public.is_manager()
    and (coalesce((p_filter->>'opted_in')::boolean, false) = false or c.sms_opt_in)
    and (p_filter->>'q' is null or c.name ilike '%' || (p_filter->>'q') || '%' or c.phone like '%' || regexp_replace(p_filter->>'q', '\D', '', 'g') || '%')
    and (p_filter->'venue_ids' is null or jsonb_array_length(p_filter->'venue_ids') = 0
         or exists (select 1 from public.contact_venues cv where cv.phone = c.phone and cv.venue_id::text in (select jsonb_array_elements_text(p_filter->'venue_ids'))))
    and (p_filter->>'visited_within_days' is null or c.last_seen_at > now() - make_interval(days => (p_filter->>'visited_within_days')::int))
    and (p_filter->>'lapsed_days' is null or c.last_seen_at < now() - make_interval(days => (p_filter->>'lapsed_days')::int))
    and (coalesce((p_filter->>'first_time')::boolean, false) = false or c.visits = 1)
    and (p_filter->>'min_visits' is null or c.visits >= (p_filter->>'min_visits')::int)
    and (coalesce((p_filter->>'has_unredeemed_prize')::boolean, false) = false
         or exists (select 1 from public.prizes p where p.phone = c.phone and p.redeemed_at is null and p.voided_at is null and p.expires_at > now()))
    and (p_filter->>'not_texted_days' is null
         or not exists (select 1 from public.messages m where m.phone = c.phone and m.purpose = 'campaign' and m.created_at > now() - make_interval(days => (p_filter->>'not_texted_days')::int)))
  order by c.last_seen_at desc limit greatest(1, least(p_limit, 5000));
$$;

-- ---------- grants ----------
grant execute on function public.wallet_by_token(text) to anon, authenticated;
grant execute on function public.wallet_request_code(text) to anon, authenticated;
grant execute on function public.wallet_verify(text, text) to anon, authenticated;
grant execute on function public.contact_detail(text) to authenticated;
grant execute on function public.contacts_search(jsonb, int) to authenticated;
grant execute on function public.campaign_preview(jsonb) to authenticated;
grant execute on function public.campaign_send(uuid, timestamptz) to authenticated;
grant execute on function public.wallet_token_for(text) to authenticated;   -- staff can hand a guest their link
grant execute on function public.norm_phone(text) to anon, authenticated;
grant execute on function public.bar_night(timestamptz) to anon, authenticated;
