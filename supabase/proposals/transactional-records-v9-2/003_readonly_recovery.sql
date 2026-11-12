\set ON_ERROR_STOP on
-- MANUAL SAFE RECOVERY ONLY. Never restores legacy writes or vulnerable grants.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(18072026,92001);
do $$ begin
 if (select mode from calori_records_private.protocol_config where singleton) not in('atomic','read_only') then
  raise exception 'Atomic protocol must be activated before recovery';
 end if;
end $$;
update calori_records_private.protocol_config set mode='read_only' where singleton;
notify pgrst,'reload schema';
commit;
