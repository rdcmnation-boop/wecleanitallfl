-- Job timer: pause and resume while a cleaner is working.
-- Additive only: new columns and two new functions. Existing start_job / complete_job are unchanged,
-- so the app keeps working if this file is not applied yet (the pause buttons just fail quietly).
-- Apply once, in the Supabase SQL editor or with a migration, before merging the app change to main.

alter table public.bookings
  add column if not exists paused_at timestamptz,
  add column if not exists paused_seconds integer not null default 0;

create or replace function public.pause_job(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set paused_at = now()
   where id = p_booking and worker_id = auth.uid() and status = 'in_progress' and paused_at is null;
  if not found then raise exception 'not_allowed'; end if;
end $$;

create or replace function public.resume_job(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set paused_seconds = paused_seconds + greatest(0, floor(extract(epoch from (now() - paused_at)))::int),
         paused_at = null
   where id = p_booking and worker_id = auth.uid() and status = 'in_progress' and paused_at is not null;
  if not found then raise exception 'not_allowed'; end if;
end $$;

grant execute on function public.pause_job(uuid) to authenticated;
grant execute on function public.resume_job(uuid) to authenticated;
