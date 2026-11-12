\set ON_ERROR_STOP on
-- MANUAL REVIEW CANDIDATE ONLY. Resume only after the fault and its fix are verified.
-- Never rerun 002_activate.sql or restore legacy write grants as recovery.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(18072026,92001);
\ir ../security-rls-v9-1/030_postflight.sql
do $$
declare t regclass;f regprocedure;writer oid;
begin
 if (select mode from calori_records_private.protocol_config where singleton) is distinct from 'read_only' then
  raise exception 'Protocol is not read_only; do not rerun resume';
 end if;
 select oid into writer from pg_roles where rolname='calori_record_writer'
  and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication;
 if writer is null or pg_has_role('authenticated','calori_record_writer','MEMBER')
  or not pg_has_role('calori_record_writer','authenticated','USAGE') then
  raise exception 'Unsafe writer-role configuration';
 end if;
 foreach t in array array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  if not (select relrowsecurity from pg_class where oid=t)
   or not exists(select 1 from pg_policy where polrelid=t and polname='security_owner_gate' and not polpermissive) then
   raise exception 'V9.1 isolation prerequisite failed: %',t;
  end if;
 end loop;
 foreach t in array array['public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  if has_table_privilege('authenticated',t,'INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',t,'INSERT,UPDATE')
   or has_table_privilege('anon',t,'INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',t,'INSERT,UPDATE') then
   raise exception 'Legacy writes remain effective: %',t;
  end if;
 end loop;
 if to_regprocedure('public.delete_my_daily_records()') is not null
  and (has_function_privilege('authenticated','public.delete_my_daily_records()','EXECUTE')
   or has_function_privilege('anon','public.delete_my_daily_records()','EXECUTE')) then
  raise exception 'Legacy reset remains executable';
 end if;
 foreach f in array array['public.calori_record_snapshot_v1()'::regprocedure,
  'public.calori_save_daily_record_v1(uuid,date,bigint,uuid,jsonb)'::regprocedure,
  'public.calori_reset_daily_records_v1(uuid,uuid)'::regprocedure] loop
  if not exists(select 1 from pg_proc where oid=f and proowner=writer and prosecdef and proconfig=array['search_path=""'])
   or not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') then
   raise exception 'Unsafe or inaccessible record RPC: %',f;
  end if;
 end loop;
 if has_schema_privilege('authenticated','calori_records_private','USAGE,CREATE')
  or has_schema_privilege('anon','calori_records_private','USAGE,CREATE') then
  raise exception 'Private protocol schema is accessible to clients';
 end if;
end;
$$;
-- Require a fresh canonical read after the pause. Do not change any day version,
-- receipt, payload or photograph reference; exact historical replays still work.
update calori_records_private.owner_state set generation=gen_random_uuid();
update calori_records_private.protocol_config set mode='atomic' where singleton;
notify pgrst,'reload schema';
commit;
