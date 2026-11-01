-- 007: function privileges made explicit. Postgres grants EXECUTE to PUBLIC on every new function by default; the earlier migrations
-- only added grants. Every function already checks its caller internally, so nothing was exposed, but the grants should say what we mean.
-- Safe to re-run.

alter default privileges in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- guests (anon) and staff: the public doors
grant execute on function public.get_round_public(text) to anon, authenticated;
grant execute on function public.submit_entry(text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.shell_pick(text, text, text) to anon, authenticated;
grant execute on function public.last_marble_pick(text) to anon, authenticated;
grant execute on function public.leaderboard(uuid, text, integer) to anon, authenticated;
grant execute on function public.current_season() to anon, authenticated;

-- signed-in staff only
grant execute on function public.finish_round(uuid, text) to authenticated;
grant execute on function public.finish_round_places(uuid, uuid[]) to authenticated;
grant execute on function public.open_picks(uuid, integer) to authenticated;
grant execute on function public.pick_counts(uuid) to authenticated;
grant execute on function public.redeem_prize(uuid, uuid) to authenticated;
grant execute on function public.lookup_prizes(text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.prize_window(timestamptz) to anon, authenticated;   -- pure helper used by views
grant execute on function public.short_name(text) to anon, authenticated;            -- pure helper used by views

-- the prediction feature was removed from the product; drop its leftover function
drop function if exists public.set_prediction(text, text, uuid);

-- pin search_path on the two helpers the linter flagged
alter function public.prize_window(timestamptz) set search_path = public;
alter function public.short_name(text) set search_path = public;
