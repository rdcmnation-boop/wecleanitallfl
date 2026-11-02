-- Guest (anonymous) booking limits. Additive and re-runnable. NOT applied yet.
-- Anonymous Supabase users are real auth users, so a bot could create many. These limits are the safety net behind the
-- email-code check in the app: contact details are required, one open request per guest, two open requests per phone,
-- and a global cap per hour. Verified (non-anonymous) customers are not affected.
create or replace function public.guard_guest_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_anon boolean := coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true';
        v_p public.profiles; v_phone text;
begin
  if not v_anon then return new; end if;
  select * into v_p from public.profiles where id = auth.uid();
  v_phone := regexp_replace(coalesce(v_p.phone, ''), '\D', '', 'g');
  if char_length(coalesce(v_p.full_name, '')) < 2 or char_length(v_phone) < 10 then raise exception 'guest_contact_required'; end if;
  if (select count(*) from public.bookings where customer_id = auth.uid() and status in ('requested','offered','assigned','in_progress')) >= 1 then
    raise exception 'guest_one_open_request'; end if;
  if (select count(*) from public.bookings b join public.profiles p on p.id = b.customer_id
       where regexp_replace(p.phone, '\D', '', 'g') = v_phone and b.status in ('requested','offered','assigned','in_progress')) >= 2 then
    raise exception 'guest_phone_limit'; end if;
  if (select count(*) from public.bookings where created_at > now() - interval '1 hour'
        and customer_id in (select id from public.profiles where email = '')) >= 30 then
    raise exception 'guest_rate_limited'; end if;
  return new;
end $$;
revoke all on function public.guard_guest_booking() from public, anon, authenticated;
drop trigger if exists a_guard_guest_booking on public.bookings;
create trigger a_guard_guest_booking before insert on public.bookings for each row execute function public.guard_guest_booking();
