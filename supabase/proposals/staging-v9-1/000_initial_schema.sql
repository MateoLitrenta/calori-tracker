-- PROPOSAL FOR AN EMPTY, SYNTHETIC STAGING ONLY. NOT A PRODUCTION MIGRATION.
-- Intentionally reproduces legacy ownership/grants so 020_upgrade can be rehearsed.
-- Auth, Storage and their roles/functions MUST already be installed by Supabase.
-- This file NEVER creates managed auth/storage stand-ins or imports user data.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$
begin
 if current_setting('calori.staging_bootstrap',true) is distinct from 'empty-synthetic-only' then
  raise exception 'Explicit empty synthetic staging acknowledgement required';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where (n.nspname='public' and c.relname in('profiles','daily_logs','meals','workouts','coach_goals'))
   or (n.nspname='ai_private' and c.relname='daily_usage')) then
  raise exception 'Calori objects already exist: refusing bootstrap; no drop or reconciliation';
 end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null
  or to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
  raise exception 'Managed Supabase Auth/Storage prerequisites missing';
 end if;
 if (select count(*) from pg_roles where rolname in('anon','authenticated','service_role'))<>3 then
  raise exception 'Managed Supabase roles missing';
 end if;
 if exists(select 1 from pg_roles where rolname in('anon','authenticated') and (rolsuper or rolbypassrls)) then
  raise exception 'Client roles must not bypass RLS';
 end if;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
  raise exception 'Managed Storage RLS prerequisite missing';
 end if;
end;
$$;

-- Types/defaults not established by the supplied catalog are a proposed contract,
-- not a claim that this is an exact remote schema dump. See staging-security-v9-1.md.
create table public.profiles (
 id uuid primary key references auth.users(id),
 user_id uuid not null references auth.users(id),
 name text not null, age integer, gender text, height_cm numeric, weight_kg numeric,
 goal text, created_at timestamptz default now()
);
create table public.daily_logs (
 id uuid primary key, user_id uuid not null references auth.users(id),
 profile_id uuid references public.profiles(id), date date not null,
 steps numeric default 0, water_ml numeric default 0, weight numeric,
 unique(user_id,date)
);
create table public.meals (
 id uuid primary key, user_id uuid not null references auth.users(id),
 daily_log_id uuid not null references public.daily_logs(id), date date,
 description text not null, meal_type text, calories numeric, time_str text, meal_details text
);
create table public.workouts (
 id uuid primary key, user_id uuid not null references auth.users(id),
 daily_log_id uuid not null references public.daily_logs(id), date date,
 activity_name text not null, duration_min numeric, calories_burned numeric,
 workout_details text, time_str text, distance_km numeric, pace_str text
);
alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.meals enable row level security;
alter table public.workouts enable row level security;
create policy staging_legacy_profiles on public.profiles for all to public
 using(auth.uid()=user_id or auth.uid()=id) with check(auth.uid()=user_id or auth.uid()=id);
create policy staging_legacy_days on public.daily_logs for all to public
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy staging_legacy_meals on public.meals for all to public
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy staging_legacy_workouts on public.workouts for all to public
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant usage on schema public to anon,authenticated,service_role;
-- Legacy excess privileges are intentional ONLY for the isolated rehearsal.
-- Do not expose this staging to external users before hardening/postflight.
grant all on public.profiles,public.daily_logs,public.meals,public.workouts to anon,authenticated,service_role;
commit;
