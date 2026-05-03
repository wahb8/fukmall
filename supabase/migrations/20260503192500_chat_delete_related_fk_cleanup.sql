alter table public.generated_posts
drop constraint if exists generated_posts_source_message_fk;

alter table public.generated_posts
add constraint generated_posts_source_message_fk
foreign key (source_message_id, user_id)
references public.chat_messages(id, user_id)
on delete set null (source_message_id);

alter table public.generated_posts
drop constraint if exists generated_posts_previous_post_fk;

alter table public.generated_posts
add constraint generated_posts_previous_post_fk
foreign key (previous_post_id, user_id)
references public.generated_posts(id, user_id)
on delete set null (previous_post_id);

alter table public.generation_jobs
drop constraint if exists generation_jobs_source_message_fk;

alter table public.generation_jobs
add constraint generation_jobs_source_message_fk
foreign key (source_message_id, user_id)
references public.chat_messages(id, user_id)
on delete set null (source_message_id);

alter table public.generation_jobs
drop constraint if exists generation_jobs_output_post_fk;

alter table public.generation_jobs
add constraint generation_jobs_output_post_fk
foreign key (output_post_id, user_id)
references public.generated_posts(id, user_id)
on delete set null (output_post_id);

