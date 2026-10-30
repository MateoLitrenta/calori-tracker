-- REVIEW PROPOSAL, NOT A DEPLOYMENT MIGRATION.
-- Reconstructed from db.ts, not an export of Production. Clean database only.
-- Supabase owns auth/storage; the local test supplies minimal stand-ins.
-- Existing installations must first be inventoried and reconciled manually.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null, age integer not null, gender text not null,
  height_cm numeric not null, weight_kg numeric not null, goal text not null,
  created_at timestamptz not null default now(),
  constraint profiles_identity check (id = user_id)
);
create table public.daily_logs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null, steps numeric not null default 0, water_ml numeric not null default 0,
  weight numeric, created_at timestamptz not null default now(),
  constraint daily_logs_identity check (profile_id = user_id),
  unique (user_id, date), unique (id, user_id, date)
);
create table public.meals (
  id uuid primary key, user_id uuid not null, daily_log_id uuid not null, date date not null,
  description text not null, meal_type text not null, calories numeric not null,
  time_str text, meal_details text,
  foreign key (daily_log_id,user_id,date) references public.daily_logs(id,user_id,date) on delete cascade
);
create table public.workouts (
  id uuid primary key, user_id uuid not null, daily_log_id uuid not null, date date not null,
  activity_name text not null, duration_min numeric not null, calories_burned numeric not null,
  workout_details text, time_str text, distance_km numeric, pace_str text,
  foreign key (daily_log_id,user_id,date) references public.daily_logs(id,user_id,date) on delete cascade
);
create index meals_log_idx on public.meals(daily_log_id);
create index workouts_log_idx on public.workouts(daily_log_id);
create index meals_owner_idx on public.meals(user_id);
create index workouts_owner_idx on public.workouts(user_id);
-- Explicit ACLs also neutralize permissive default privileges in a clean project.
revoke all on public.profiles,public.daily_logs,public.meals,public.workouts from public,anon,authenticated;
grant select,insert,update,delete on public.profiles,public.daily_logs,public.meals,public.workouts to authenticated;
alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.meals enable row level security;
alter table public.workouts enable row level security;
create policy profiles_owner on public.profiles to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy daily_logs_owner on public.daily_logs to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meals_owner on public.meals to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workouts_owner on public.workouts to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
