\set ON_ERROR_STOP on
-- REVIEW CANDIDATE ONLY. Not in supabase/migrations. No automatic deployment.
-- Prepare is additive: legacy writers remain usable until 002_activate.sql.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
\ir ../security-rls-v9-1/030_postflight.sql
do $$
declare t regclass;spec record;
begin
 if to_regnamespace('calori_records_private') is not null
  or exists(select 1 from pg_roles where rolname='calori_record_writer')
  or exists(select 1 from pg_attribute where attrelid='public.daily_logs'::regclass and attname='version' and not attisdropped) then
  raise exception 'Unknown/existing transactional-record state; manual reconciliation required';
 end if;
 if (select count(*) from pg_constraint where contype='f'
   and conrelid=any(array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass]))<>8
  or exists(select 1 from pg_constraint where contype='f' and confdeltype<>'c'
   and conrelid=any(array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass])) then
  raise exception 'Expected eight existing CASCADE foreign keys';
 end if;
 for spec in select * from (values
  ('profiles',array['id'],'auth.users',array['id']),
  ('profiles',array['user_id'],'auth.users',array['id']),
  ('daily_logs',array['user_id'],'auth.users',array['id']),
  ('daily_logs',array['profile_id','user_id'],'public.profiles',array['id','user_id']),
  ('meals',array['user_id'],'auth.users',array['id']),
  ('meals',array['daily_log_id','user_id'],'public.daily_logs',array['id','user_id']),
  ('workouts',array['user_id'],'auth.users',array['id']),
  ('workouts',array['daily_log_id','user_id'],'public.daily_logs',array['id','user_id'])
 ) s(child,child_columns,parent,parent_columns) loop
  if (select count(*) from pg_constraint c where c.contype='f' and c.convalidated and c.confdeltype='c'
   and c.conrelid=('public.'||spec.child)::regclass and c.confrelid=spec.parent::regclass
   and c.conkey=array(select a.attnum from unnest(spec.child_columns) with ordinality k(name,pos)
    join pg_attribute a on a.attrelid=c.conrelid and a.attname=k.name order by k.pos)::smallint[]
   and c.confkey=array(select a.attnum from unnest(spec.parent_columns) with ordinality k(name,pos)
    join pg_attribute a on a.attrelid=c.confrelid and a.attname=k.name order by k.pos)::smallint[])<>1 then
   raise exception 'Unexpected V9.1 foreign-key topology: %',spec.child;
  end if;
 end loop;
 foreach t in array array['public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass] loop
  if not (select relrowsecurity from pg_class where oid=t)
   or not exists(select 1 from pg_policy where polrelid=t and polname='security_owner_gate' and not polpermissive)
   or not has_table_privilege('authenticated',t,'SELECT')
   or has_table_privilege('anon',t,'SELECT')
   or has_table_privilege('authenticated',t,'TRUNCATE,TRIGGER,REFERENCES') then
   raise exception 'V9.1 isolation/grants prerequisite failed: %',t;
  end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.daily_logs'::regclass and conname='security_day_identity' and convalidated)
  or not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='security_profiles_identity' and convalidated)
  or to_regclass('storage.objects') is null then raise exception 'V9.1 schema prerequisites missing'; end if;
 if exists(select 1 from pg_roles where rolname in('anon','authenticated') and (rolsuper or rolbypassrls)) then
  raise exception 'Client roles must not bypass RLS';
 end if;
end;
$$;

create role calori_record_writer nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant authenticated to calori_record_writer;
-- Only the trusted migration operator may SET this role; never grant it to clients.
do $$ begin execute format('grant calori_record_writer to %I',current_user); end $$;
create schema calori_records_private;
revoke all on schema calori_records_private from public,anon,authenticated;
grant usage on schema calori_records_private to calori_record_writer;
create sequence calori_records_private.record_versions as bigint start with 2;
revoke all on sequence calori_records_private.record_versions from public,anon,authenticated;
grant usage on sequence calori_records_private.record_versions to calori_record_writer;
-- Literal default remains usable by legacy inserts in the prepared phase.
alter table public.daily_logs add column version bigint not null default 1 check(version>0);

create table calori_records_private.protocol_config(
 singleton boolean primary key default true check(singleton),
 mode text not null check(mode in('prepared','atomic','read_only'))
);
insert into calori_records_private.protocol_config values(true,'prepared');
create table calori_records_private.owner_state(
 user_id uuid primary key references auth.users(id) on delete cascade,
 generation uuid not null default gen_random_uuid()
);
create table calori_records_private.record_operations(
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null, request_hash bytea not null, result jsonb not null,
 created_at timestamptz not null default now(),primary key(user_id,operation_id)
);
revoke all on all tables in schema calori_records_private from public,anon,authenticated;
alter table calori_records_private.protocol_config enable row level security;
alter table calori_records_private.owner_state enable row level security;
alter table calori_records_private.record_operations enable row level security;
create policy writer_config on calori_records_private.protocol_config for select to calori_record_writer using(true);
create policy writer_state on calori_records_private.owner_state for all to calori_record_writer using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy writer_receipts on calori_records_private.record_operations for all to calori_record_writer using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on calori_records_private.protocol_config to calori_record_writer;
grant select,insert,update on calori_records_private.owner_state to calori_record_writer;
grant select,insert on calori_records_private.record_operations to calori_record_writer;
grant select,insert,update,delete on public.daily_logs,public.meals,public.workouts to calori_record_writer;
grant usage on schema auth,storage to calori_record_writer;
grant select on storage.objects to calori_record_writer;

create function calori_records_private.lock_owner() returns uuid
language plpgsql set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'READ_COMMITTED_REQUIRED' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock_shared(18072026,92001);
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,9201));
 begin
  insert into calori_records_private.owner_state(user_id) values(owner_id) on conflict(user_id) do nothing;
 exception when foreign_key_violation then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end;
 return owner_id;
end;
$$;
create function calori_records_private.assert_write_mode() returns void
language plpgsql set search_path='' as $$
declare m text;
begin
 select mode into strict m from calori_records_private.protocol_config where singleton;
 if m='prepared' then raise exception 'RECORD_PROTOCOL_NOT_ACTIVE' using errcode='PT503'; end if;
 if m='read_only' then raise exception 'RECORD_WRITES_PAUSED' using errcode='PT503'; end if;
end;
$$;
create function calori_records_private.validate_day(p_day jsonb) returns void
language plpgsql set search_path='' as $$
declare item jsonb;k text;v jsonb;
begin
 if jsonb_typeof(p_day) is distinct from 'object'
  or (p_day-array['steps','water_ml','weight','meals','workouts'])<>'{}'::jsonb
  or not(p_day ?& array['steps','water_ml','weight','meals','workouts'])
  or jsonb_typeof(p_day->'meals') is distinct from 'array'
  or jsonb_typeof(p_day->'workouts') is distinct from 'array' then
  raise exception 'INVALID_RECORD_PAYLOAD' using errcode='22023';
 end if;
 foreach k in array array['steps','water_ml','weight'] loop
  v:=p_day->k;
  if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0
    or (k in('steps','water_ml') and ((v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric>2147483647))
    or (k='weight' and (v::text)::numeric=0)) then
   raise exception 'INVALID_RECORD_VALUE' using errcode='22023';
  end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_day->'meals'))
  or (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_day->'workouts')) then
  raise exception 'MISSING_OR_DUPLICATE_ENTRY_ID' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_day->'meals') loop
  if jsonb_typeof(item) is distinct from 'object'
   or (item-array['id','description','meal_type','calories','time_str','meal_details','photo_path'])<>'{}'::jsonb
   or jsonb_typeof(item->'id') is distinct from 'string' then
   raise exception 'INVALID_MEAL_PAYLOAD' using errcode='22023';
  end if;
  foreach k in array array['description','meal_type','time_str','meal_details','photo_path'] loop
   if item ? k and item->k<>'null'::jsonb and jsonb_typeof(item->k)<>'string' then raise exception 'INVALID_MEAL_VALUE' using errcode='22023'; end if;
  end loop;
  v:=item->'calories';
  if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric>2147483647) then
   raise exception 'INVALID_MEAL_VALUE' using errcode='22023';
  end if;
 end loop;
 for item in select value from jsonb_array_elements(p_day->'workouts') loop
  if jsonb_typeof(item) is distinct from 'object'
   or (item-array['id','activity_name','duration_min','calories_burned','workout_details','time_str','distance_km','pace_str'])<>'{}'::jsonb
   or jsonb_typeof(item->'id') is distinct from 'string' then raise exception 'INVALID_WORKOUT_PAYLOAD' using errcode='22023'; end if;
  foreach k in array array['activity_name','workout_details','time_str','pace_str'] loop
   if item ? k and item->k<>'null'::jsonb and jsonb_typeof(item->k)<>'string' then raise exception 'INVALID_WORKOUT_VALUE' using errcode='22023'; end if;
  end loop;
  foreach k in array array['duration_min','calories_burned','distance_km'] loop
   v:=item->k;
   if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)::numeric<0
    or (k<>'distance_km' and ((v::text)::numeric<>trunc((v::text)::numeric) or (v::text)::numeric>2147483647))) then
    raise exception 'INVALID_WORKOUT_VALUE' using errcode='22023';
   end if;
  end loop;
 end loop;
exception when data_exception then raise exception 'INVALID_RECORD_PAYLOAD' using errcode='22023';
end;
$$;

create function public.calori_record_snapshot_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;g uuid;m text;records jsonb;
begin
 owner_id:=calori_records_private.lock_owner();
 select generation into strict g from calori_records_private.owner_state where user_id=owner_id;
 select mode into strict m from calori_records_private.protocol_config where singleton;
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('version',d.version::text,
  'meals',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.meals x where x.daily_log_id=d.id and x.user_id=owner_id),
  'workouts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.workouts x where x.daily_log_id=d.id and x.user_id=owner_id)) order by d.date,d.id),'[]'::jsonb)
 into records from public.daily_logs d where d.user_id=owner_id;
 return jsonb_build_object('protocol',m,'generation',g,'records',records);
end;
$$;

create function public.calori_save_daily_record_v1(p_operation_id uuid,p_date date,p_expected_version bigint,p_generation uuid,p_day jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;g uuid;next_g uuid;h bytea;prior calori_records_private.record_operations;
 d public.daily_logs;item jsonb;meal public.meals;workout public.workouts;existing_day uuid;existing_date date;r jsonb;
begin
 if p_operation_id is null or p_generation is null or p_date is null or not isfinite(p_date) or p_expected_version<=0 then
  raise exception 'INVALID_RECORD_REQUEST' using errcode='22023';
 end if;
 owner_id:=calori_records_private.lock_owner();
 h:=sha256(convert_to(jsonb_build_object('kind','save','generation',p_generation,'date',p_date,'expected_version',p_expected_version,'day',p_day)::text,'UTF8'));
 select * into prior from calori_records_private.record_operations where user_id=owner_id and operation_id=p_operation_id;
 if found then
  if prior.request_hash<>h then raise exception 'OPERATION_ID_REUSED' using errcode='22023'; end if;
  return prior.result;
 end if;
 perform calori_records_private.assert_write_mode();
 select generation into strict g from calori_records_private.owner_state where user_id=owner_id;
 if g<>p_generation then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end if;
 select * into d from public.daily_logs where user_id=owner_id and date=p_date for update;
 if (found and d.version is distinct from p_expected_version) or (not found and p_expected_version is not null) then
  raise exception 'RECORD_CONFLICT' using errcode='PT409';
 end if;
 perform calori_records_private.validate_day(p_day);
 if not exists(select 1 from public.profiles where id=owner_id and user_id=owner_id) then raise exception 'PROFILE_REQUIRED' using errcode='22023'; end if;
 if d.id is null then
  insert into public.daily_logs(id,user_id,profile_id,date,steps,water_ml,weight,version)
  values(gen_random_uuid(),owner_id,owner_id,p_date,(p_day->>'steps')::integer,(p_day->>'water_ml')::integer,(p_day->>'weight')::numeric,nextval('calori_records_private.record_versions')) returning * into d;
 else
  update public.daily_logs set steps=(p_day->>'steps')::integer,water_ml=(p_day->>'water_ml')::integer,
   weight=(p_day->>'weight')::numeric,version=nextval('calori_records_private.record_versions')
   where id=d.id and user_id=owner_id returning * into d;
  if not found then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end if;
 end if;
 for item in select value from jsonb_array_elements(p_day->'meals') loop
  begin meal:=jsonb_populate_record(null::public.meals,item);exception when data_exception then raise exception 'INVALID_MEAL_VALUE' using errcode='22023';end;
  if meal.id is null then raise exception 'INVALID_MEAL_ID' using errcode='22023'; end if;
  if meal.photo_path is not null and (left(meal.photo_path,length(owner_id::text)+1)<>owner_id::text||'/'
   or meal.photo_path~'(^|/)\.\.?(/|$)' or meal.photo_path~'//|\\'
   or not exists(select 1 from storage.objects where bucket_id='meal-photos' and name=meal.photo_path)) then
   raise exception 'INVALID_MEAL_PHOTO' using errcode='22023';
  end if;
  select daily_log_id,date into existing_day,existing_date from public.meals where id=meal.id and user_id=owner_id for update;
  if found then
   if existing_day<>d.id then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end if;
   update public.meals set description=meal.description,meal_type=meal.meal_type,calories=meal.calories,
    time_str=meal.time_str,meal_details=meal.meal_details,photo_path=meal.photo_path where id=meal.id and user_id=owner_id;
  else
   begin
    insert into public.meals(id,user_id,daily_log_id,date,description,meal_type,calories,time_str,meal_details,photo_path)
    values(meal.id,owner_id,d.id,p_date,meal.description,meal.meal_type,meal.calories,meal.time_str,meal.meal_details,meal.photo_path);
   exception when unique_violation then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end;
  end if;
 end loop;
 delete from public.meals where daily_log_id=d.id and user_id=owner_id and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_day->'meals'));
 for item in select value from jsonb_array_elements(p_day->'workouts') loop
  begin workout:=jsonb_populate_record(null::public.workouts,item);exception when data_exception then raise exception 'INVALID_WORKOUT_VALUE' using errcode='22023';end;
  if workout.id is null then raise exception 'INVALID_WORKOUT_ID' using errcode='22023'; end if;
  select daily_log_id,date into existing_day,existing_date from public.workouts where id=workout.id and user_id=owner_id for update;
  if found then
   if existing_day<>d.id then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end if;
   update public.workouts set activity_name=workout.activity_name,duration_min=workout.duration_min,calories_burned=workout.calories_burned,
    workout_details=workout.workout_details,time_str=workout.time_str,distance_km=workout.distance_km,pace_str=workout.pace_str where id=workout.id and user_id=owner_id;
  else
   begin
    insert into public.workouts(id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned,workout_details,time_str,distance_km,pace_str)
    values(workout.id,owner_id,d.id,p_date,workout.activity_name,workout.duration_min,workout.calories_burned,workout.workout_details,workout.time_str,workout.distance_km,workout.pace_str);
   exception when unique_violation then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end;
  end if;
 end loop;
 delete from public.workouts where daily_log_id=d.id and user_id=owner_id and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_day->'workouts'));
 next_g:=gen_random_uuid();
 update calori_records_private.owner_state set generation=next_g where user_id=owner_id;
 r:=jsonb_build_object('operation_id',p_operation_id,'day_id',d.id,'version',d.version::text,'generation',next_g);
 insert into calori_records_private.record_operations(user_id,operation_id,request_hash,result) values(owner_id,p_operation_id,h,r);
 return r;
end;
$$;

create function public.calori_reset_daily_records_v1(p_operation_id uuid,p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;g uuid;next_g uuid;h bytea;prior calori_records_private.record_operations;r jsonb;n bigint;
begin
 if p_operation_id is null or p_generation is null then raise exception 'INVALID_RECORD_REQUEST' using errcode='22023'; end if;
 owner_id:=calori_records_private.lock_owner();
 h:=sha256(convert_to(jsonb_build_object('kind','reset','generation',p_generation)::text,'UTF8'));
 select * into prior from calori_records_private.record_operations where user_id=owner_id and operation_id=p_operation_id;
 if found then
  if prior.request_hash<>h then raise exception 'OPERATION_ID_REUSED' using errcode='22023'; end if;
  return prior.result;
 end if;
 perform calori_records_private.assert_write_mode();
 select generation into strict g from calori_records_private.owner_state where user_id=owner_id;
 if g<>p_generation then raise exception 'RECORD_CONFLICT' using errcode='PT409'; end if;
 delete from public.daily_logs where user_id=owner_id;
 get diagnostics n=row_count;
 next_g:=gen_random_uuid();update calori_records_private.owner_state set generation=next_g where user_id=owner_id;
 r:=jsonb_build_object('operation_id',p_operation_id,'generation',next_g,'deleted_days',n);
 insert into calori_records_private.record_operations(user_id,operation_id,request_hash,result) values(owner_id,p_operation_id,h,r);
 return r;
end;
$$;

-- ALTER OWNER requires CREATE temporarily when the trusted operator is not superuser.
grant create on schema public,calori_records_private to calori_record_writer;
alter function calori_records_private.lock_owner() owner to calori_record_writer;
alter function calori_records_private.assert_write_mode() owner to calori_record_writer;
alter function calori_records_private.validate_day(jsonb) owner to calori_record_writer;
alter function public.calori_record_snapshot_v1() owner to calori_record_writer;
alter function public.calori_save_daily_record_v1(uuid,date,bigint,uuid,jsonb) owner to calori_record_writer;
alter function public.calori_reset_daily_records_v1(uuid,uuid) owner to calori_record_writer;
revoke create on schema public,calori_records_private from calori_record_writer;
revoke all on all functions in schema calori_records_private from public,anon,authenticated;
revoke all on function public.calori_record_snapshot_v1(),public.calori_save_daily_record_v1(uuid,date,bigint,uuid,jsonb),public.calori_reset_daily_records_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.calori_record_snapshot_v1(),public.calori_save_daily_record_v1(uuid,date,bigint,uuid,jsonb),public.calori_reset_daily_records_v1(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
