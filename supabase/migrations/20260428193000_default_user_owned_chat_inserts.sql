alter table public.chats
alter column user_id set default auth.uid();

alter table public.chat_messages
alter column user_id set default auth.uid();
