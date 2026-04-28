insert into public.plans (
  code,
  name,
  description,
  lemon_squeezy_variant_id,
  monthly_generation_limit,
  monthly_edit_limit,
  monthly_storage_limit_bytes,
  monthly_asset_upload_limit,
  feature_flags,
  price_cents,
  currency_code,
  is_active
)
values
  (
    'free',
    'Free',
    'A lightweight starter tier for trying the workflow.',
    null,
    5,
    10,
    52428800,
    10,
    '{"onboarding": true, "brand_profile": true}'::jsonb,
    0,
    'KWD',
    true
  ),
  (
    'business',
    'Business',
    'A steady weekly plan for repeatable content workflows.',
    null,
    30,
    60,
    262144000,
    60,
    '{"onboarding": true, "brand_profile": true}'::jsonb,
    2900,
    'KWD',
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'A higher-capacity tier for larger content operations.',
    null,
    50,
    120,
    524288000,
    100,
    '{"onboarding": true, "brand_profile": true}'::jsonb,
    4900,
    'KWD',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  lemon_squeezy_variant_id = coalesce(public.plans.lemon_squeezy_variant_id, excluded.lemon_squeezy_variant_id),
  monthly_generation_limit = excluded.monthly_generation_limit,
  monthly_edit_limit = excluded.monthly_edit_limit,
  monthly_storage_limit_bytes = excluded.monthly_storage_limit_bytes,
  monthly_asset_upload_limit = excluded.monthly_asset_upload_limit,
  feature_flags = excluded.feature_flags,
  price_cents = excluded.price_cents,
  currency_code = excluded.currency_code,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

alter table public.usage_periods
add column asset_upload_count integer not null default 0;

alter table public.usage_periods
add constraint usage_periods_asset_upload_count_non_negative
check (asset_upload_count >= 0);

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
    asset_upload_count = asset_upload_count + case
      when p_event_type = 'storage_upload' and p_resource_type = 'uploaded_asset' then p_quantity
      else 0
    end,
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'brand-assets',
    'brand-assets',
    false,
    12582912,
    array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml'
    ]::text[]
  ),
  (
    'chat-assets',
    'chat-assets',
    false,
    12582912,
    array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif'
    ]::text[]
  ),
  (
    'generated-posts',
    'generated-posts',
    false,
    20971520,
    array[
      'image/png',
      'image/jpeg',
      'image/webp'
    ]::text[]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_allowed_storage_object_path(
  p_bucket_name text,
  p_object_name text,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    split_part(p_object_name, '/', 1) = p_user_id::text
    and case
      when p_bucket_name = 'brand-assets' then split_part(p_object_name, '/', 2) in ('logos', 'references')
      when p_bucket_name = 'chat-assets' then split_part(p_object_name, '/', 2) in ('attachments')
      when p_bucket_name = 'generated-posts' then split_part(p_object_name, '/', 2) in ('renders')
      else false
    end;
$$;

drop policy if exists storage_objects_select_owned on storage.objects;
drop policy if exists storage_objects_delete_owned on storage.objects;

create policy storage_objects_select_owned
on storage.objects
for select
to authenticated
using (
  public.is_allowed_storage_object_path(bucket_id, name, auth.uid())
);

create policy storage_objects_delete_owned
on storage.objects
for delete
to authenticated
using (
  public.is_allowed_storage_object_path(bucket_id, name, auth.uid())
);
