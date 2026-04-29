alter table public.generation_jobs
drop constraint if exists generation_jobs_status_check;

alter table public.generation_jobs
add constraint generation_jobs_status_check
check (status in ('pending', 'processing', 'completed', 'failed', 'canceled'));
