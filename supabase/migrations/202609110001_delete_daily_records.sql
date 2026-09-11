-- Atomic deletion: preserve profiles and Auth. Inspect actual FK actions instead
-- of assuming that the deployment has ON DELETE CASCADE.
create or replace function public.delete_my_daily_records()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  child_name text;
  cascades boolean;
  remaining boolean;
begin
  if owner_id is null then
    raise exception 'Authentication required';
  end if;

  foreach child_name in array array['meals', 'workouts'] loop
    select exists (
      select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid
        and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.convalidated
        and c.conrelid = pg_catalog.to_regclass('public.' || child_name)
        and c.confrelid = 'public.daily_logs'::regclass
        and c.confdeltype = 'c' and a.attname = 'daily_log_id'
        and pg_catalog.array_length(c.conkey, 1) = 1
    ) into cascades;

    -- With a cascade, only independently stored rows need explicit deletion.
    -- Without one, delete children before parents, within this same transaction.
    execute pg_catalog.format(
      'delete from public.%I c where (c.user_id = $1 or c.daily_log_id in
        (select id from public.daily_logs where user_id = $1 or profile_id = $1))
       and (not $2 or not exists
        (select 1 from public.daily_logs d where d.id = c.daily_log_id
          and (d.user_id = $1 or d.profile_id = $1)))', child_name)
      using owner_id, cascades;
  end loop;

  delete from public.daily_logs where user_id = owner_id or profile_id = owner_id;

  -- A DELETE can return OK with zero rows under RLS. Do not report success
  -- when records visible to this user remain.
  if exists (select 1 from public.daily_logs where user_id = owner_id or profile_id = owner_id) then
    raise exception 'Daily records were not deleted';
  end if;
  foreach child_name in array array['meals', 'workouts'] loop
    execute pg_catalog.format('select exists (select 1 from public.%I where user_id = $1)', child_name)
      into remaining using owner_id;
    if remaining then raise exception 'Related records were not deleted'; end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.delete_my_daily_records() from public, anon;
grant execute on function public.delete_my_daily_records() to authenticated;
