-- Fair pay for cleaners (applied). A request can't be sent below $100, or below $35 for each estimated hour.
-- The app suggests more ($45/h standard, $55/h heavy work, $120 minimum job; see app/config.js); this is the safety net.
create or replace function public.guard_booking_price() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.budget is not null and new.budget < greatest(100, coalesce(new.hours_est, 0) * 35) then
    raise exception 'price_too_low';
  end if;
  return new;
end $$;
revoke all on function public.guard_booking_price() from public, anon, authenticated;
create or replace trigger b_guard_booking_price before insert on public.bookings for each row execute function public.guard_booking_price();
