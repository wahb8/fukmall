alter table public.uploaded_assets
drop constraint if exists uploaded_assets_chat_fk;

alter table public.uploaded_assets
add constraint uploaded_assets_chat_fk
foreign key (chat_id, user_id)
references public.chats(id, user_id)
on delete set null (chat_id);

