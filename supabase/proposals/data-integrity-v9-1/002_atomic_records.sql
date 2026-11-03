-- REVIEW PROPOSAL ONLY. Apply locally AFTER 001 + all existing migrations.
-- NOT compatible with the current client's multi-request writer: do not deploy.
-- Must be reconciled against the authorized remote catalog before promotion.
begin;
alter table public.daily_logs add column version bigint not null default 1 check (version > 0);
create schema integrity_private;
revoke all on schema integrity_private from public,anon,authenticated;
-- Never reuse a revision after reset/recreation (prevents an ABA stale save).
create sequence integrity_private.record_versions as bigint;
select setval('integrity_private.record_versions',coalesce((select max(version) from public.daily_logs),0)+1,false);
alter table public.daily_logs alter column version set default nextval('integrity_private.record_versions');
revoke all on sequence integrity_private.record_versions from public,anon,authenticated;
create table integrity_private.record_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null, request_hash bytea not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,operation_id)
);
alter table integrity_private.record_operations enable row level security;
revoke all on integrity_private.record_operations from public,anon,authenticated;

-- SECURITY DEFINER is deliberate: direct day/child writes are revoked below so
-- even an old client cannot bypass versions. No user ID is accepted from client.
-- This function must be owned by the trusted migration role, never a login role.
create function public.save_daily_record_v1(p_operation_id uuid, p_date date,
  p_expected_version bigint, p_day jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  log_row public.daily_logs;
  prior integrity_private.record_operations;
  request_hash bytea;
  result jsonb;
  item jsonb;
  meal public.meals;
  workout public.workouts;
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id) then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  -- READ COMMITTED gets a fresh snapshot after the lock. Higher isolation is
  -- rejected rather than relying on a stale idempotency/absence snapshot.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Record writes require read committed isolation' using errcode='25000';
  end if;
  if p_operation_id is null or p_date is null or not isfinite(p_date) or p_expected_version <= 0
    or jsonb_typeof(p_day) is distinct from 'object'
    or (p_day - array['steps','water_ml','weight','meals','workouts']) <> '{}'::jsonb
    or jsonb_typeof(p_day->'steps') is distinct from 'number'
    or jsonb_typeof(p_day->'water_ml') is distinct from 'number'
    or jsonb_typeof(p_day->'meals') is distinct from 'array'
    or jsonb_typeof(p_day->'workouts') is distinct from 'array' then
    raise exception 'Invalid record payload' using errcode='22023';
  end if;
  if (p_day->>'steps')::numeric < 0 or (p_day->>'water_ml')::numeric < 0
    or (p_day ? 'weight' and p_day->'weight' <> 'null'::jsonb and
      (jsonb_typeof(p_day->'weight') <> 'number' or (p_day->>'weight')::numeric <= 0))
    or jsonb_array_length(p_day->'meals') > 500 or jsonb_array_length(p_day->'workouts') > 500 then
    raise exception 'Invalid record values' using errcode='22023';
  end if;
  -- Also serializes reset against a save; hash collisions only reduce concurrency.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,911));
  request_hash := sha256(convert_to(jsonb_build_object('date',p_date,'version',p_expected_version,'day',p_day)::text,'UTF8'));
  select * into prior from integrity_private.record_operations
    where user_id=owner_id and operation_id=p_operation_id;
  if found then
    if prior.request_hash <> request_hash then
      raise exception 'Operation ID reused with different input' using errcode='22023';
    end if;
    return prior.result; -- Original receipt, not a statement about current state.
  end if;
  select * into log_row from public.daily_logs where user_id=owner_id and date=p_date for update;
  if (found and log_row.version is distinct from p_expected_version)
     or (not found and p_expected_version is not null) then
    raise exception 'Record changed; reload before saving' using errcode='40001';
  end if;
  if log_row.id is null then
    insert into public.daily_logs(id,user_id,profile_id,date,steps,water_ml,weight)
      values(gen_random_uuid(),owner_id,owner_id,p_date,(p_day->>'steps')::numeric,
        (p_day->>'water_ml')::numeric,(p_day->>'weight')::numeric) returning * into log_row;
  else
    update public.daily_logs set steps=(p_day->>'steps')::numeric, water_ml=(p_day->>'water_ml')::numeric,
      weight=(p_day->>'weight')::numeric, version=nextval('integrity_private.record_versions') where id=log_row.id returning * into log_row;
  end if;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_day->'meals'))
    or (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_day->'workouts')) then
    raise exception 'Missing or repeated entry IDs' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_day->'meals') loop
    meal := jsonb_populate_record(null::public.meals,item);
    if exists(select 1 from public.meals where id=meal.id and
      (user_id<>owner_id or daily_log_id<>log_row.id or date<>p_date)) then
      raise exception 'Entry identity conflict' using errcode='40001';
    end if;
    if meal.calories is null or not (meal.calories >= 0 and meal.calories < 'Infinity'::numeric) then
      raise exception 'Invalid meal calories' using errcode='22023';
    end if;
    insert into public.meals(id,user_id,daily_log_id,date,description,meal_type,calories,time_str,meal_details,photo_path)
      values(meal.id,owner_id,log_row.id,p_date,meal.description,meal.meal_type,meal.calories,meal.time_str,meal.meal_details,meal.photo_path)
      on conflict(id) do update set description=excluded.description,meal_type=excluded.meal_type,
        calories=excluded.calories,time_str=excluded.time_str,meal_details=excluded.meal_details,photo_path=excluded.photo_path
        where public.meals.user_id=owner_id and public.meals.daily_log_id=log_row.id and public.meals.date=p_date;
    if not found then raise exception 'Entry identity conflict' using errcode='40001'; end if;
  end loop;
  delete from public.meals where daily_log_id=log_row.id and user_id=owner_id
    and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_day->'meals'));
  for item in select value from jsonb_array_elements(p_day->'workouts') loop
    workout := jsonb_populate_record(null::public.workouts,item);
    if exists(select 1 from public.workouts where id=workout.id and
      (user_id<>owner_id or daily_log_id<>log_row.id or date<>p_date)) then
      raise exception 'Entry identity conflict' using errcode='40001';
    end if;
    if workout.duration_min is null or not (workout.duration_min >= 0 and workout.duration_min < 'Infinity'::numeric)
      or workout.calories_burned is null or not (workout.calories_burned >= 0 and workout.calories_burned < 'Infinity'::numeric) then
      raise exception 'Invalid workout values' using errcode='22023';
    end if;
    insert into public.workouts(id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned,workout_details,time_str,distance_km,pace_str)
      values(workout.id,owner_id,log_row.id,p_date,workout.activity_name,workout.duration_min,workout.calories_burned,
        workout.workout_details,workout.time_str,workout.distance_km,workout.pace_str)
      on conflict(id) do update set activity_name=excluded.activity_name,duration_min=excluded.duration_min,
        calories_burned=excluded.calories_burned,workout_details=excluded.workout_details,
        time_str=excluded.time_str,distance_km=excluded.distance_km,pace_str=excluded.pace_str
        where public.workouts.user_id=owner_id and public.workouts.daily_log_id=log_row.id and public.workouts.date=p_date;
    if not found then raise exception 'Entry identity conflict' using errcode='40001'; end if;
  end loop;
  delete from public.workouts where daily_log_id=log_row.id and user_id=owner_id
    and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_day->'workouts'));
  result := jsonb_build_object('operation_id',p_operation_id,'id',log_row.id,'version',log_row.version);
  insert into integrity_private.record_operations(user_id,operation_id,request_hash,result)
    values(owner_id,p_operation_id,request_hash,result);
  return result;
end;
$$;
revoke all on function public.save_daily_record_v1(uuid,date,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_daily_record_v1(uuid,date,bigint,jsonb) to authenticated;
revoke insert,update,delete on public.daily_logs,public.meals,public.workouts from public,anon,authenticated;
-- Table-level REVOKE does not remove pre-existing column-level grants.
do $$
declare target regclass; columns text;
begin
  foreach target in array array['public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
    select string_agg(quote_ident(attname),',') into columns from pg_catalog.pg_attribute
      where attrelid=target and attnum>0 and not attisdropped;
    execute format('revoke insert (%s),update (%s) on table %s from public,anon,authenticated',columns,columns,target);
  end loop;
end;
$$;

-- Reset must use the same serialization boundary after direct writes are closed.
create or replace function public.delete_my_daily_records() returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id) then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Record writes require read committed isolation' using errcode='25000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,911));
  delete from public.meals where user_id=owner_id;
  delete from public.workouts where user_id=owner_id;
  delete from public.daily_logs where user_id=owner_id;
  if exists(select 1 from public.daily_logs where user_id=owner_id)
    or exists(select 1 from public.meals where user_id=owner_id)
    or exists(select 1 from public.workouts where user_id=owner_id) then
    raise exception 'Records were not deleted';
  end if;
  -- Receipts deliberately survive reset: a lost-response retry cannot recreate data.
  return true;
end;
$$;
revoke all on function public.delete_my_daily_records() from public,anon;
grant execute on function public.delete_my_daily_records() to authenticated;
commit;
