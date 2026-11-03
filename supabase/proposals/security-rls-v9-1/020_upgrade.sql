\set ON_ERROR_STOP on
-- PROPOSAL ONLY. Not in the automatic migration chain. Requires reviewed preflight,
-- backup and maintenance window. No dependency on the atomic-record RPC.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local row_security=off;
lock table public.profiles,public.daily_logs,public.meals,public.workouts in access exclusive mode;
\ir 010_checks.sql

alter table public.profiles alter column user_id set not null;
alter table public.profiles add constraint security_profiles_identity check(id=user_id);
alter table public.profiles add constraint security_profiles_id_owner unique(id,user_id);
alter table public.daily_logs alter column user_id set not null;
alter table public.daily_logs add constraint security_day_identity check(profile_id is null or profile_id=user_id);
alter table public.daily_logs add constraint security_day_id_owner unique(id,user_id);
alter table public.meals alter column user_id set not null;
alter table public.meals alter column daily_log_id set not null;
alter table public.workouts alter column user_id set not null;
alter table public.workouts alter column daily_log_id set not null;

-- Replace, do not duplicate, the existing relationship. Two FKs between the same
-- tables make PostgREST's meals(*) / workouts(*) embedding ambiguous (PGRST201).
-- Preserve the original constraint names, update/delete actions and deferrability.
do $$
declare spec record; fk record; actions text[]:=array['NO ACTION','RESTRICT','CASCADE'];
 update_action text; delete_action text; deferred text;
begin
 for spec in select * from (values
  ('daily_logs','profile_id','profiles','profile_id,user_id','id,user_id'),
  ('meals','daily_log_id','daily_logs','daily_log_id,user_id','id,user_id'),
  ('workouts','daily_log_id','daily_logs','daily_log_id,user_id','id,user_id')
 ) s(child,old_col,parent,new_cols,parent_cols) loop
  select c.* into strict fk from pg_constraint c where c.conrelid=('public.'||spec.child)::regclass and c.contype='f'
   and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname=spec.old_col)]::smallint[]
   and c.confrelid=('public.'||spec.parent)::regclass;
  update_action:=case fk.confupdtype when 'a' then actions[1] when 'r' then actions[2] when 'c' then actions[3] end;
  delete_action:=case fk.confdeltype when 'a' then actions[1] when 'r' then actions[2] when 'c' then actions[3] end;
  deferred:=case when not fk.condeferrable then 'NOT DEFERRABLE' when fk.condeferred then 'DEFERRABLE INITIALLY DEFERRED' else 'DEFERRABLE INITIALLY IMMEDIATE' end;
  execute format('alter table public.%I drop constraint %I',spec.child,fk.conname);
  execute format('alter table public.%I add constraint %I foreign key (%s) references public.%I (%s) on update %s on delete %s %s',
   spec.child,fk.conname,spec.new_cols,spec.parent,spec.parent_cols,update_action,delete_action,deferred);
 end loop;
end;
$$;

do $$
declare spec record; cols text;
begin
 for spec in select * from (values
  ('profiles','auth.uid()=id and auth.uid()=user_id',
   'id,user_id,name,age,gender,height_cm,weight_kg,goal,activity_level,avatar_path,onboarding_completed',
   'id,user_id,name,age,gender,height_cm,weight_kg,goal,activity_level,avatar_path,onboarding_completed'),
  ('daily_logs','auth.uid()=user_id and (profile_id is null or auth.uid()=profile_id)',
   'id,user_id,profile_id,date,steps,water_ml,weight','steps,water_ml,weight'),
  ('meals','auth.uid()=user_id',
   'id,user_id,daily_log_id,date,description,meal_type,calories,time_str,meal_details,photo_path',
   'description,meal_type,calories,time_str,meal_details,photo_path'),
  ('workouts','auth.uid()=user_id',
   'id,user_id,daily_log_id,date,activity_name,duration_min,calories_burned,workout_details,time_str,distance_km,pace_str',
   'activity_name,duration_min,calories_burned,workout_details,time_str,distance_km,pace_str')
 ) s(name,predicate,insert_cols,update_cols) loop
  -- Keep legacy policies for traceability; a PUBLIC restrictive gate is ANDed
  -- with every permissive policy. An additional permissive policy cannot bypass it.
  execute format('create policy security_owner_gate on public.%I as restrictive for all to public using (%s) with check (%s)',spec.name,spec.predicate,spec.predicate);
  execute format('create policy security_select on public.%I for select to authenticated using (%s)',spec.name,spec.predicate);
  execute format('create policy security_insert on public.%I for insert to authenticated with check (%s)',spec.name,spec.predicate);
  execute format('create policy security_update on public.%I for update to authenticated using (%s) with check (%s)',spec.name,spec.predicate,spec.predicate);
  execute format('create policy security_delete on public.%I for delete to authenticated using (%s)',spec.name,spec.predicate);
  execute format('revoke all on table public.%I from public,anon,authenticated',spec.name);
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
   where attrelid=('public.'||spec.name)::regclass and attnum>0 and not attisdropped;
  execute format('revoke all (%s) on table public.%I from public,anon,authenticated',cols,spec.name);
  execute format('grant select on table public.%I to authenticated',spec.name);
  -- Legacy profile ON CONFLICT DO UPDATE needs UPDATE(id,user_id), even for
  -- INSERTs/no-op assignments. Strict RLS + CHECK fix both identities to auth.uid:
  -- changing either to any other value is impossible. Dates remain ungrantable.
  execute format('grant insert (%s),update (%s) on table public.%I to authenticated',spec.insert_cols,spec.update_cols,spec.name);
  if spec.name<>'profiles' then execute format('grant delete on table public.%I to authenticated',spec.name); end if;
 end loop;
end;
$$;
\ir 030_postflight.sql
notify pgrst,'reload schema';
commit;
