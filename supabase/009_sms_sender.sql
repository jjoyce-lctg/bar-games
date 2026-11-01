-- 009: what the sms edge function needs on the database side. Safe to re-run.

-- the edge function reads settings through one function that only the service role may call (the private schema itself stays off the API)
create or replace function public.sms_setting(p_key text) returns text language sql security definer set search_path = private, public as $$
  select value from private.settings where key = p_key;
$$;
revoke execute on function public.sms_setting(text) from public, anon, authenticated;
grant execute on function public.sms_setting(text) to service_role;

-- after a drain: campaign counters and completion
create or replace function public.sms_after_drain() returns void language sql security definer set search_path = public as $$
  update public.campaigns c set
    sent_count = (select count(*) from public.messages m where m.campaign_id = c.id and m.status in ('sent', 'delivered')),
    failed_count = (select count(*) from public.messages m where m.campaign_id = c.id and m.status in ('failed', 'undelivered')),
    status = case when exists (select 1 from public.messages m where m.campaign_id = c.id and m.status in ('queued', 'sending')) then c.status else 'sent' end,
    sent_at = coalesce(c.sent_at, now())
  where c.status in ('sending', 'scheduled') and exists (select 1 from public.messages m where m.campaign_id = c.id);
$$;

-- sweep: every minute, if anything is due, nudge the sender (covers scheduled campaigns and anything a nudge missed)
create or replace function public.sms_nudge() returns void language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  if not exists (select 1 from public.messages where status = 'queued' and send_after <= now()) then return; end if;
  select value into url from private.settings where key = 'sms_send_url';
  select value into secret from private.settings where key = 'sms_webhook_secret';
  if coalesce(url, '') = '' then return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-lctg-secret', secret), body := jsonb_build_object('reason', 'sweep'), timeout_milliseconds := 5000);
end $$;
create extension if not exists pg_cron with schema pg_catalog;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'sms-sweep') then perform cron.schedule('sms-sweep', '* * * * *', 'select public.sms_nudge()'); end if;
end $$;
-- also unstick anything left in 'sending' for more than 10 minutes (a crashed drain)
create or replace function public.sms_unstick() returns void language sql security definer set search_path = public as $$
  update public.messages set status = 'queued' where status = 'sending' and sent_at < now() - interval '10 minutes';
$$;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'sms-unstick') then perform cron.schedule('sms-unstick', '*/5 * * * *', 'select public.sms_unstick()'); end if;
end $$;
