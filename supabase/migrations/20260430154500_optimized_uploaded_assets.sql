alter table public.uploaded_assets
  add column if not exists optimized_bucket_name text,
  add column if not exists optimized_storage_path text,
  add column if not exists optimized_mime_type text,
  add column if not exists optimized_file_size_bytes bigint,
  add column if not exists optimized_width integer,
  add column if not exists optimized_height integer;

alter table public.uploaded_assets
  add constraint uploaded_assets_optimized_object_pair_check check (
    (optimized_bucket_name is null and optimized_storage_path is null)
    or (optimized_bucket_name is not null and optimized_storage_path is not null)
  ),
  add constraint uploaded_assets_optimized_mime_type_check check (
    optimized_mime_type is null
    or optimized_mime_type = 'image/webp'
  ),
  add constraint uploaded_assets_optimized_file_size_check check (
    optimized_file_size_bytes is null
    or optimized_file_size_bytes > 0
  ),
  add constraint uploaded_assets_optimized_width_check check (
    optimized_width is null
    or optimized_width > 0
  ),
  add constraint uploaded_assets_optimized_height_check check (
    optimized_height is null
    or optimized_height > 0
  ),
  add constraint uploaded_assets_optimized_dimension_pair_check check (
    (optimized_width is null and optimized_height is null)
    or (optimized_width is not null and optimized_height is not null)
  );

create unique index if not exists uploaded_assets_optimized_object_unique
  on public.uploaded_assets (optimized_bucket_name, optimized_storage_path)
  where optimized_bucket_name is not null and optimized_storage_path is not null;
