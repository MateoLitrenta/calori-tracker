-- Synthetic reconstruction from the user-supplied catalog, NOT a remote dump.
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',
    nullif(current_setting('request.jwt.claim.sub',true),''))::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table public.profiles(
 id uuid primary key references auth.users(id),user_id uuid not null references auth.users(id),
 name text not null,age integer,gender text,height_cm numeric,weight_kg numeric,goal text,
 activity_level text not null default 'Sedentario' check(activity_level in ('Sedentario','Moderado','Activo')),
 avatar_path text check(avatar_path is null or avatar_path in(user_id::text||'/profile.jpg',user_id::text||'/profile.webp')),
 onboarding_completed boolean not null default false,created_at timestamptz default now()
);
create table public.daily_logs(
 id uuid primary key,user_id uuid not null references auth.users(id),profile_id uuid references public.profiles(id),
 date date not null,steps numeric default 0,water_ml numeric default 0,weight numeric,
 unique(user_id,date)
);
create table public.meals(
 id uuid primary key,user_id uuid not null references auth.users(id),
 daily_log_id uuid not null references public.daily_logs(id),date date,
 description text not null,meal_type text,calories numeric,time_str text,meal_details text,
 photo_path text check(photo_path is null or photo_path like user_id::text||'/%')
);
create table public.workouts(
 id uuid primary key,user_id uuid not null references auth.users(id),
 daily_log_id uuid not null references public.daily_logs(id),date date,
 activity_name text not null,duration_min numeric,calories_burned numeric,workout_details text,
 time_str text,distance_km numeric,pace_str text
);
alter table public.profiles enable row level security;
alter table public.daily_logs enable row level security;
alter table public.meals enable row level security;
alter table public.workouts enable row level security;
create policy legacy_profiles on public.profiles for all to public
 using(auth.uid()=user_id or auth.uid()=id) with check(auth.uid()=user_id or auth.uid()=id);
create policy legacy_days on public.daily_logs for all to public using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy legacy_meals on public.meals for all to public using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy legacy_workouts on public.workouts for all to public using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant all on public.profiles,public.daily_logs,public.meals,public.workouts to anon,authenticated,service_role;
-- Minimal managed-Storage stand-ins; the actual versioned policies are loaded by the test.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
