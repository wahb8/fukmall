alter table public.plans
add column monthly_edit_limit integer not null default 0;

alter table public.plans
add constraint plans_edit_limit_non_negative
check (monthly_edit_limit >= 0);

create table public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  generation_count integer not null default 0,
  edit_count integer not null default 0,
  storage_bytes_used bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint usage_periods_owner_key unique (id, user_id),
  constraint usage_periods_user_window_unique unique (user_id, period_start, period_end),
  constraint usage_periods_period_order check (period_end > period_start),
  constraint usage_periods_generation_count_non_negative check (generation_count >= 0),
  constraint usage_periods_edit_count_non_negative check (edit_count >= 0),
  constraint usage_periods_storage_bytes_non_negative check (storage_bytes_used >= 0)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_period_id uuid not null,
  event_type text not null,
  resource_type text,
  resource_id uuid,
  quantity integer not null default 1,
  storage_bytes_delta bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint usage_events_period_owner_fk
    foreign key (usage_period_id, user_id)
    references public.usage_periods(id, user_id)
    on delete cascade,
  constraint usage_events_event_type_check check (event_type in ('generation', 'edit', 'storage_upload', 'storage_delete', 'manual_adjustment')),
  constraint usage_events_quantity_non_negative check (quantity >= 0),
  constraint usage_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemon_squeezy',
  event_name text not null,
  event_hash text not null unique,
  provider_object_id text,
  status text not null default 'received',
  processing_attempts integer not null default 0,
  last_error text,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_webhook_events_status_check check (status in ('received', 'processed', 'ignored', 'failed')),
  constraint billing_webhook_events_attempts_non_negative check (processing_attempts >= 0),
  constraint billing_webhook_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index usage_periods_user_id_period_end_idx
on public.usage_periods (user_id, period_end desc);

create index usage_events_user_id_created_at_idx
on public.usage_events (user_id, created_at desc);

create index usage_events_period_id_idx
on public.usage_events (usage_period_id, created_at desc);

create index billing_webhook_events_provider_status_idx
on public.billing_webhook_events (provider, status, created_at desc);

create or replace function public.record_usage_event(
  p_user_id uuid,
  p_usage_period_id uuid,
  p_event_type text,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_quantity integer default 1,
  p_storage_bytes_delta bigint default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns public.usage_events
language plpgsql
set search_path = public
as $$
declare
  v_event public.usage_events;
begin
  if p_quantity < 0 then
    raise exception 'usage event quantity must be non-negative';
  end if;

  insert into public.usage_events (
    user_id,
    usage_period_id,
    event_type,
    resource_type,
    resource_id,
    quantity,
    storage_bytes_delta,
    metadata
  )
  values (
    p_user_id,
    p_usage_period_id,
    p_event_type,
    p_resource_type,
    p_resource_id,
    p_quantity,
    p_storage_bytes_delta,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  update public.usage_periods
  set
    generation_count = generation_count + case when p_event_type = 'generation' then p_quantity else 0 end,
    edit_count = edit_count + case when p_event_type = 'edit' then p_quantity else 0 end,
    storage_bytes_used = greatest(
      0,
      storage_bytes_used + case
        when p_event_type in ('storage_upload', 'storage_delete', 'manual_adjustment') then p_storage_bytes_delta
        else 0
      end
    ),
    updated_at = timezone('utc', now())
  where id = p_usage_period_id
    and user_id = p_user_id;

  if not found then
    raise exception 'usage period not found for user';
  end if;

  return v_event;
end;
$$;

create trigger usage_periods_set_updated_at
before update on public.usage_periods
for each row
execute function public.set_updated_at();

create trigger billing_webhook_events_set_updated_at
before update on public.billing_webhook_events
for each row
execute function public.set_updated_at();

alter table public.usage_periods enable row level security;
alter table public.usage_events enable row level security;
alter table public.billing_webhook_events enable row level security;

create policy usage_periods_select_own
on public.usage_periods
for select
to authenticated
using (auth.uid() = user_id);

create policy usage_events_select_own
on public.usage_events
for select
to authenticated
using (auth.uid() = user_id);
