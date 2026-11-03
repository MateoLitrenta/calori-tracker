\set ON_ERROR_STOP on
-- OPERATIONAL ROLLBACK: read-only maintenance. Never restore vulnerable grants/policies.
-- Requires an authorized operator. Preserves all data, constraints and SELECT isolation.
begin;
set local lock_timeout='5s';
lock table public.profiles,public.daily_logs,public.meals,public.workouts in access exclusive mode;
do $$
declare tbl regclass; cols text;
begin
 foreach tbl in array array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  execute format('revoke insert,update,delete,truncate,references,trigger,maintain on table %s from public,anon,authenticated',tbl);
  select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=tbl and attnum>0 and not attisdropped;
  execute format('revoke insert (%s),update (%s),references (%s) on table %s from public,anon,authenticated',cols,cols,cols,tbl);
 end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
