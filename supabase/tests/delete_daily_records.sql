-- Run in a disposable PostgreSQL database after creating the test fixture below
-- (see docs/record-deletion.md). Never run fixture setup against production.
select public.delete_my_daily_records();
do $$
begin
  if exists(select 1 from public.daily_logs where user_id = auth.uid())
     or exists(select 1 from public.meals where user_id = auth.uid())
     or exists(select 1 from public.workouts where user_id = auth.uid()) then
    raise exception 'Own records remain';
  end if;
  if (select count(*) from public.profiles) <> 2
     or (select count(*) from public.daily_logs) <> 1
     or (select count(*) from public.meals) <> 1
     or (select count(*) from public.workouts) <> 1 then
    raise exception 'Other user data or profiles changed';
  end if;
end;
$$;
