-- Refuse an identical open booking from the same customer within 10 minutes (double-tap, retry, back button).
-- Staging: applied 2026-11-02 (tested: duplicate_booking_blocked, different_service_allowed, other_customer_same_job_allowed,
-- rebook_after_cancel_allowed). Production: NOT applied — waiting for owner approval.
-- Rollback: drop trigger a4_guard_duplicate_booking on public.bookings;
create or replace function public._guard_duplicate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_c uuid := coalesce(auth.uid(), new.customer_id);
begin
  if v_c is not null and exists (
       select 1 from public.bookings b
        where b.customer_id = v_c and b.service = new.service and b.zip = new.zip
          and b.urgency = new.urgency
          and b.scheduled_at is not distinct from new.scheduled_at
          and b.status in ('requested', 'offered', 'assigned', 'in_progress')
          and b.created_at > now() - interval '10 minutes') then
    raise exception 'duplicate_booking';
  end if;
  return new;
end $$;
revoke all on function public._guard_duplicate_booking() from public, anon, authenticated;
create or replace trigger a4_guard_duplicate_booking before insert on public.bookings
  for each row execute function public._guard_duplicate_booking();
