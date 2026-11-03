-- READ-ONLY checks shared by preflight and the locked upgrade. No row values in errors.
do $$
declare spec record; tbl regclass; col text; allowed text[]; bad bigint; role_name text;
begin
 for spec in select * from (values
  ('profiles',array['id','user_id','name','age','gender','height_cm','weight_kg','goal','activity_level','avatar_path','onboarding_completed','created_at','updated_at']),
  ('daily_logs',array['id','user_id','profile_id','date','steps','water_ml','weight','created_at','updated_at']),
  ('meals',array['id','user_id','daily_log_id','date','description','meal_type','calories','time_str','meal_details','photo_path','created_at','updated_at']),
  ('workouts',array['id','user_id','daily_log_id','date','activity_name','duration_min','calories_burned','workout_details','time_str','distance_km','pace_str','created_at','updated_at'])
 ) s(name,cols) loop
  tbl:=to_regclass('public.'||spec.name); allowed:=spec.cols;
  if tbl is null or not exists(select 1 from pg_class where oid=tbl and relkind='r' and relrowsecurity and not relforcerowsecurity) then
   raise exception 'Unsupported table/RLS shape: %',spec.name;
  end if;
  if not exists(select 1 from pg_class c join pg_roles r on r.rolname=current_user
    where c.oid=tbl and (r.rolsuper or r.rolbypassrls or c.relowner=r.oid)) then
   raise exception 'Preflight requires an unfiltered migration owner';
  end if;
  if exists(select 1 from pg_inherits where inhrelid=tbl or inhparent=tbl)
    or exists(select 1 from pg_trigger where tgrelid=tbl and not tgisinternal)
    or exists(select 1 from pg_policy where polrelid=tbl and not polpermissive) then
   raise exception 'Unsupported inheritance, trigger or restrictive policy: %',spec.name;
  end if;
  if exists(select 1 from pg_attribute where attrelid=tbl and attnum>0 and not attisdropped
    and (not attname=any(allowed) or attgenerated<>'' or attidentity<>'')) then
   raise exception 'Unknown/generated column: %',spec.name;
  end if;
  foreach col in array array['id','user_id'] loop
   if not exists(select 1 from pg_attribute where attrelid=tbl and attname=col and atttypid='uuid'::regtype) then
    raise exception 'Unsupported identity column: %.%',spec.name,col;
   end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid=tbl and contype='p' and conkey=array[(select attnum from pg_attribute where attrelid=tbl and attname='id')]::smallint[]) then
   raise exception 'Expected primary key missing: %',spec.name;
  end if;
  foreach role_name in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=role_name and (rolsuper or rolbypassrls))
     or pg_has_role(role_name,(select relowner from pg_class where oid=tbl),'MEMBER') then
    raise exception 'Client role can bypass/own RLS: %',role_name;
   end if;
  end loop;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.daily_logs'::regclass and contype='u'
   and conkey=array[(select attnum from pg_attribute where attrelid='public.daily_logs'::regclass and attname='user_id'),
    (select attnum from pg_attribute where attrelid='public.daily_logs'::regclass and attname='date')]::smallint[]) then
  raise exception 'Expected unique user/day key missing';
 end if;
 for spec in select * from (values
  ('profiles','id','auth.users'),('profiles','user_id','auth.users'),
  ('daily_logs','profile_id','public.profiles'),('meals','daily_log_id','public.daily_logs'),('workouts','daily_log_id','public.daily_logs')
 ) s(child,col,parent) loop
  if (select count(*) from pg_constraint c where c.conrelid=('public.'||spec.child)::regclass and c.contype='f'
   and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname=spec.col)]::smallint[]
   and c.confrelid=spec.parent::regclass and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')]::smallint[]
   and c.convalidated and c.confdeltype in ('a','r','c') and c.confupdtype in ('a','r','c')) <> 1 then
   raise exception 'Unsupported or missing validated FK: %.%',spec.child,spec.col;
  end if;
 end loop;
 if exists(select 1 from pg_constraint c where c.contype='f' and c.conrelid in('public.profiles'::regclass,'public.daily_logs'::regclass,'public.meals'::regclass,'public.workouts'::regclass)
   and (cardinality(c.conkey)<>1 or c.confrelid not in('auth.users'::regclass,'public.profiles'::regclass,'public.daily_logs'::regclass))) then
  raise exception 'Unknown FK topology; review before upgrading';
 end if;
 select count(*) into bad from public.profiles where user_id is null or id is distinct from user_id;
 if bad>0 then raise exception 'Legacy profile identity inconsistencies: %; no data changed',bad; end if;
 select count(*) into bad from public.daily_logs d left join public.profiles p on p.id=d.profile_id
  where d.user_id is null or (d.profile_id is not null and
   (p.id is null or d.user_id is distinct from p.user_id or d.profile_id is distinct from d.user_id));
 if bad>0 then raise exception 'Legacy day/profile inconsistencies: %; no data changed',bad; end if;
 for spec in select unnest(array['meals','workouts']) as name loop
  execute format('select count(*) from public.%I c left join public.daily_logs d on d.id=c.daily_log_id
    where c.user_id is null or c.daily_log_id is null or d.id is null
    or c.user_id is distinct from d.user_id',spec.name) into bad;
  if bad>0 then raise exception 'Legacy % ownership inconsistencies: %; no data changed',spec.name,bad; end if;
 end loop;
end;
$$;
