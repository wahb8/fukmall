create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 160),
  constraint profiles_email_length check (email is null or char_length(email) <= 320)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  description text,
  lemon_squeezy_variant_id text unique,
  monthly_generation_limit integer not null default 0,
  monthly_storage_limit_bytes bigint not null default 0,
  monthly_asset_upload_limit integer not null default 0,
  feature_flags jsonb not null default '{}'::jsonb,
  price_cents integer not null default 0,
  currency_code text not null default 'USD',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plans_generation_limit_non_negative check (monthly_generation_limit >= 0),
  constraint plans_storage_limit_non_negative check (monthly_storage_limit_bytes >= 0),
  constraint plans_asset_upload_limit_non_negative check (monthly_asset_upload_limit >= 0),
  constraint plans_price_non_negative check (price_cents >= 0),
  constraint plans_feature_flags_object check (jsonb_typeof(feature_flags) = 'object')
);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  business_type text not null,
  brand_description text,
  tone_preferences text[] not null default '{}',
  style_preferences text[] not null default '{}',
  brand_colors jsonb not null default '[]'::jsonb,
  reference_links jsonb not null default '[]'::jsonb,
  logo_asset_id uuid,
  is_default boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint business_profiles_owner_key unique (id, user_id),
  constraint business_profiles_brand_colors_array check (jsonb_typeof(brand_colors) = 'array'),
  constraint business_profiles_reference_links_array check (jsonb_typeof(reference_links) = 'array')
);

create unique index business_profiles_one_default_per_user
on public.business_profiles (user_id)
where is_default = true;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active',
  lemon_squeezy_customer_id text,
  lemon_squeezy_subscription_id text unique,
  renewal_date timestamptz,
  canceled_at timestamptz,
  expired_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_status_check check (status in ('trialing', 'active', 'canceled', 'expired', 'past_due')),
  constraint subscriptions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index subscriptions_one_current_per_user
on public.subscriptions (user_id)
where status in ('trialing', 'active', 'past_due');

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid,
  title text not null default 'Untitled chat',
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chats_owner_key unique (id, user_id),
  constraint chats_status_check check (status in ('active', 'archived')),
  constraint chats_business_profile_fk
    foreign key (business_profile_id, user_id)
    references public.business_profiles(id, user_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  message_type text not null default 'text',
  content_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint chat_messages_owner_key unique (id, user_id),
  constraint chat_messages_role_check check (role in ('user', 'assistant', 'system')),
  constraint chat_messages_type_check check (message_type in ('text', 'generation_request', 'generation_result', 'edit_request', 'error', 'system')),
  constraint chat_messages_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint chat_messages_content_or_metadata check (
    nullif(btrim(coalesce(content_text, '')), '') is not null
    or metadata <> '{}'::jsonb
  ),
  constraint chat_messages_chat_fk
    foreign key (chat_id, user_id)
    references public.chats(id, user_id)
    on delete cascade
);

create table public.uploaded_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_profile_id uuid,
  chat_id uuid,
  asset_kind text not null,
  bucket_name text not null,
  storage_path text not null,
  original_file_name text,
  mime_type text not null,
  file_size_bytes bigint not null,
  width integer,
  height integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uploaded_assets_owner_key unique (id, user_id),
  constraint uploaded_assets_asset_kind_check check (asset_kind in ('logo', 'brand_reference', 'prompt_attachment', 'chat_attachment', 'generated_input', 'other')),
  constraint uploaded_assets_object_unique unique (bucket_name, storage_path),
  constraint uploaded_assets_file_size_non_negative check (file_size_bytes >= 0),
  constraint uploaded_assets_width_check check (width is null or width > 0),
  constraint uploaded_assets_height_check check (height is null or height > 0),
  constraint uploaded_assets_business_profile_fk
    foreign key (business_profile_id, user_id)
    references public.business_profiles(id, user_id),
  constraint uploaded_assets_chat_fk
    foreign key (chat_id, user_id)
    references public.chats(id, user_id)
);

alter table public.business_profiles
add constraint business_profiles_logo_asset_fk
foreign key (logo_asset_id, user_id)
references public.uploaded_assets(id, user_id);

create table public.generated_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null,
  source_message_id uuid,
  business_profile_id uuid,
  previous_post_id uuid,
  version_group_id uuid not null default gen_random_uuid(),
  version_number integer not null default 1,
  status text not null default 'draft',
  prompt_text text,
  caption_text text,
  bucket_name text,
  image_storage_path text,
  width integer not null,
  height integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint generated_posts_owner_key unique (id, user_id),
  constraint generated_posts_version_group_unique unique (version_group_id, version_number),
  constraint generated_posts_status_check check (status in ('draft', 'edited', 'final', 'exported', 'failed')),
  constraint generated_posts_version_number_check check (version_number > 0),
  constraint generated_posts_width_check check (width > 0),
  constraint generated_posts_height_check check (height > 0),
  constraint generated_posts_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint generated_posts_image_reference_check check (
    (bucket_name is null and image_storage_path is null)
    or (bucket_name is not null and image_storage_path is not null)
  ),
  constraint generated_posts_chat_fk
    foreign key (chat_id, user_id)
    references public.chats(id, user_id)
    on delete cascade,
  constraint generated_posts_source_message_fk
    foreign key (source_message_id, user_id)
    references public.chat_messages(id, user_id),
  constraint generated_posts_business_profile_fk
    foreign key (business_profile_id, user_id)
    references public.business_profiles(id, user_id),
  constraint generated_posts_previous_post_fk
    foreign key (previous_post_id, user_id)
    references public.generated_posts(id, user_id)
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null,
  source_message_id uuid,
  business_profile_id uuid,
  output_post_id uuid,
  status text not null default 'pending',
  input_prompt text not null,
  requested_width integer,
  requested_height integer,
  provider text not null default 'openai',
  model text,
  error_message text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint generation_jobs_owner_key unique (id, user_id),
  constraint generation_jobs_status_check check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint generation_jobs_requested_width_check check (requested_width is null or requested_width > 0),
  constraint generation_jobs_requested_height_check check (requested_height is null or requested_height > 0),
  constraint generation_jobs_request_payload_object check (jsonb_typeof(request_payload) = 'object'),
  constraint generation_jobs_response_payload_object check (jsonb_typeof(response_payload) = 'object'),
  constraint generation_jobs_chat_fk
    foreign key (chat_id, user_id)
    references public.chats(id, user_id)
    on delete cascade,
  constraint generation_jobs_source_message_fk
    foreign key (source_message_id, user_id)
    references public.chat_messages(id, user_id),
  constraint generation_jobs_business_profile_fk
    foreign key (business_profile_id, user_id)
    references public.business_profiles(id, user_id),
  constraint generation_jobs_output_post_fk
    foreign key (output_post_id, user_id)
    references public.generated_posts(id, user_id)
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index chats_user_id_updated_at_idx on public.chats (user_id, updated_at desc);
create index chat_messages_chat_id_created_at_idx on public.chat_messages (chat_id, created_at asc);
create index uploaded_assets_user_id_kind_idx on public.uploaded_assets (user_id, asset_kind, created_at desc);
create index generated_posts_chat_id_created_at_idx on public.generated_posts (chat_id, created_at desc);
create index generated_posts_version_group_idx on public.generated_posts (version_group_id, version_number desc);
create index generation_jobs_user_id_status_idx on public.generation_jobs (user_id, status, created_at desc);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.touch_chat_last_message_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set
    last_message_at = new.created_at,
    updated_at = timezone('utc', now())
  where id = new.chat_id
    and user_id = new.user_id;

  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

create trigger business_profiles_set_updated_at
before update on public.business_profiles
for each row
execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

create trigger chats_set_updated_at
before update on public.chats
for each row
execute function public.set_updated_at();

create trigger uploaded_assets_set_updated_at
before update on public.uploaded_assets
for each row
execute function public.set_updated_at();

create trigger generated_posts_set_updated_at
before update on public.generated_posts
for each row
execute function public.set_updated_at();

create trigger generation_jobs_set_updated_at
before update on public.generation_jobs
for each row
execute function public.set_updated_at();

create trigger chat_messages_touch_chat
after insert on public.chat_messages
for each row
execute function public.touch_chat_last_message_at();

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.generated_posts enable row level security;
alter table public.uploaded_assets enable row level security;
alter table public.generation_jobs enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy business_profiles_select_own
on public.business_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy business_profiles_insert_own
on public.business_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy business_profiles_update_own
on public.business_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy business_profiles_delete_own
on public.business_profiles
for delete
to authenticated
using (auth.uid() = user_id);

create policy plans_public_read_active
on public.plans
for select
to anon, authenticated
using (is_active = true);

create policy subscriptions_select_own
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy chats_select_own
on public.chats
for select
to authenticated
using (auth.uid() = user_id);

create policy chats_insert_own
on public.chats
for insert
to authenticated
with check (auth.uid() = user_id);

create policy chats_update_own
on public.chats
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy chats_delete_own
on public.chats
for delete
to authenticated
using (auth.uid() = user_id);

create policy chat_messages_select_own
on public.chat_messages
for select
to authenticated
using (auth.uid() = user_id);

create policy chat_messages_insert_user_role_only
on public.chat_messages
for insert
to authenticated
with check (
  auth.uid() = user_id
  and role = 'user'
);

create policy generated_posts_select_own
on public.generated_posts
for select
to authenticated
using (auth.uid() = user_id);

create policy uploaded_assets_select_own
on public.uploaded_assets
for select
to authenticated
using (auth.uid() = user_id);

create policy generation_jobs_select_own
on public.generation_jobs
for select
to authenticated
using (auth.uid() = user_id);
