-- Apply on the verified Calori project before enabling the protected endpoint.
-- No browser grants. Limits/identity come only from the authenticated server.
create schema if not exists ai_private;
revoke all on schema ai_private from public, anon, authenticated;

create table ai_private.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_day date not null,
  category text not null check (category in ('text', 'image', 'audio')),
  used integer not null check (used >= 0),
  daily_limit integer not null check (daily_limit >= 0),
  last_allowed boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_day, category)
);
alter table ai_private.daily_usage enable row level security;
revoke all on ai_private.daily_usage from public, anon, authenticated;

create or replace function public.reserve_ai_quota(p_user_id uuid, p_category text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket date := (statement_timestamp() at time zone 'UTC')::date;
  reset_at timestamptz := ((bucket + 1)::timestamp at time zone 'UTC');
  retry_seconds integer := greatest(1, ceil(extract(epoch from reset_at - statement_timestamp()))::integer);
  allowed boolean;
begin
  if p_user_id is null or p_category is null or p_category not in ('text', 'image', 'audio')
    or p_limit is null or p_limit < 0 then
    raise exception 'Invalid quota reservation';
  end if;
  -- A single UPSERT locks the conflicting row. Concurrent callers cannot
  -- all pass a separate read-before-write check and exceed the daily limit.
  insert into ai_private.daily_usage as usage (user_id, quota_day, category, used, daily_limit, last_allowed)
    values (p_user_id, bucket, p_category, case when p_limit > 0 then 1 else 0 end, p_limit, p_limit > 0)
  on conflict (user_id, quota_day, category) do update
    set used = usage.used + case when usage.used < least(usage.daily_limit, p_limit) then 1 else 0 end,
      daily_limit = least(usage.daily_limit, p_limit),
      last_allowed = usage.used < least(usage.daily_limit, p_limit),
      updated_at = statement_timestamp()
  returning last_allowed into allowed;

  -- Pin the strictest limit seen today across old/new serverless deployments.
  -- Increases take effect with the next UTC bucket; decreases cannot undo usage.
  return jsonb_build_object('allowed', allowed, 'retry_after_seconds', retry_seconds);
end;
$$;

revoke all on function public.reserve_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_quota(uuid, text, integer) to service_role;
