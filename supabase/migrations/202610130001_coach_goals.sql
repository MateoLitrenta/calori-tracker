-- APPLY MANUALLY in the Calori project, after Preview validation. No service
-- key or public RPC is needed; authenticated requests use the owner's RLS.
begin;
create table public.coach_goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('workout_sessions', 'step_days')),
  target integer not null,
  step_threshold integer,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date < 31),
  check ((type = 'workout_sessions' and target between 1 and 31 and step_threshold is null)
    or (type = 'step_days' and target between 1 and (end_date - start_date + 1) and step_threshold is not null and step_threshold between 100 and 100000))
);
create index coach_goals_owner_period on public.coach_goals (user_id, status, end_date desc);
create unique index coach_goals_no_duplicate_active on public.coach_goals
  (user_id, type, start_date, end_date, target, coalesce(step_threshold, 0)) where status = 'active';
alter table public.coach_goals enable row level security;
alter table public.coach_goals force row level security;
revoke all on public.coach_goals from public, anon, authenticated;
grant select on public.coach_goals to authenticated;
grant insert (id, user_id, type, target, step_threshold, start_date, end_date) on public.coach_goals to authenticated;
grant update (target, step_threshold, status) on public.coach_goals to authenticated;
create policy coach_goals_select_owner on public.coach_goals for select to authenticated using (auth.uid() = user_id);
create policy coach_goals_insert_owner on public.coach_goals for insert to authenticated with check (auth.uid() = user_id);
create policy coach_goals_update_owner on public.coach_goals for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.validate_coach_goal_change() returns trigger language plpgsql
  security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.start_date < current_date - 7 or new.start_date > current_date + 31 then
      raise exception 'Goal start date outside acceptance window' using errcode = '23514';
    end if;
    -- Bound ongoing commitments atomically, including concurrent devices.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
    -- Same-ID retries remain idempotent; other owners are invisible via RLS.
    if not exists (select 1 from public.coach_goals where id = new.id) and
      (select count(*) from public.coach_goals where user_id = new.user_id and status = 'active' and end_date >= current_date - 1) >= 8 then
      raise exception 'Too many ongoing goals' using errcode = '23514';
    end if;
  else
    if old.status = 'cancelled' or new.id <> old.id or new.user_id <> old.user_id or new.type <> old.type
      or new.start_date <> old.start_date or new.end_date <> old.end_date or new.created_at <> old.created_at then
      raise exception 'Immutable goal fields' using errcode = '23514';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.validate_coach_goal_change() from public, anon, authenticated;
create trigger coach_goal_change before insert or update on public.coach_goals
  for each row execute function public.validate_coach_goal_change();
commit;
