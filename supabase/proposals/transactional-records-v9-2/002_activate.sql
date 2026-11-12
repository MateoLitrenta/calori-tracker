\set ON_ERROR_STOP on
-- MANUAL CANDIDATE ONLY. Requires coordinated client rollout, backup and approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Acquire protocol gate BEFORE any base-table lock (same order as every RPC).
select pg_advisory_xact_lock(18072026,92001);
lock table public.daily_logs,public.meals,public.workouts in access exclusive mode;
do $$ begin
 if (select mode from calori_records_private.protocol_config where singleton) is distinct from 'prepared' then
  raise exception 'Protocol is not prepared; do not rerun activation';
 end if;
 if exists(select 1 from pg_roles where rolname='calori_record_writer' and (rolcanlogin or rolsuper or rolbypassrls))
  or pg_has_role('authenticated','calori_record_writer','MEMBER') then raise exception 'Unsafe writer-role configuration'; end if;
end $$;
-- Invalidate every snapshot issued while legacy writers were still possible.
update calori_records_private.owner_state set generation=gen_random_uuid();
update public.daily_logs set version=nextval('calori_records_private.record_versions');
revoke insert,update,delete on public.daily_logs,public.meals,public.workouts from public,anon,authenticated;
do $$ declare t regclass;cols text;begin
 foreach t in array array['public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=t and attnum>0 and not attisdropped;
  execute format('revoke insert (%s),update (%s) on table %s from public,anon,authenticated',cols,cols,t);
  if has_table_privilege('authenticated',t,'INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',t,'INSERT,UPDATE')
   or has_table_privilege('anon',t,'INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',t,'INSERT,UPDATE') then
   raise exception 'Legacy writes remain effective: %',t;
  end if;
 end loop;
 if to_regprocedure('public.delete_my_daily_records()') is not null then
  revoke all on function public.delete_my_daily_records() from public,anon,authenticated;
  if has_function_privilege('authenticated','public.delete_my_daily_records()','EXECUTE') then raise exception 'Legacy reset remains executable'; end if;
 end if;
end $$;
update calori_records_private.protocol_config set mode='atomic' where singleton;
notify pgrst,'reload schema';
commit;
