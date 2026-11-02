-- Customers get booking updates outside the app: email when they have one, otherwise a text (guest bookings give a phone).
-- New "booking_received" confirmation the moment a booking is made. Cleaners keep WhatsApp (opt-in). In-app always.
-- Nothing is sent until the channel's keys exist (RESEND_API_KEY + EMAIL_FROM, or Twilio); messages wait in the outbox.
-- Staging: applied 2026-11-02, tests 11/11 (see DEPLOYMENT_LOG.md). Production: NOT applied — waiting for owner approval.
-- Rollback: re-apply the previous _notify (in-app + worker WhatsApp only) and after_booking_insert (audit + dispatch).
create or replace function public._notify(p_user uuid, p_template text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_opt boolean; p public.profiles;
begin
  insert into public.notifications(user_id, channel, template, payload) values (p_user, 'inapp', p_template, p_payload);
  select whatsapp_opt_in into v_opt from public.workers where id = p_user;
  if coalesce(v_opt, false) then
    insert into public.notifications(user_id, channel, template, payload) values (p_user, 'whatsapp', p_template, p_payload);
  end if;
  if p_template in ('booking_received', 'booking_assigned', 'cleaner_on_way', 'booking_completed', 'booking_cancelled', 'booking_reassigning') then
    select * into p from public.profiles where id = p_user;
    if p.role = 'customer' then
      if coalesce(p.email, '') <> '' then
        insert into public.notifications(user_id, channel, template, payload) values (p_user, 'email', p_template, p_payload);
      elsif char_length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 10 then
        insert into public.notifications(user_id, channel, template, payload) values (p_user, 'sms', p_template, p_payload);
      end if;
    end if;
  end if;
end $$;
revoke all on function public._notify(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.after_booking_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._audit('booking_created', 'booking', new.id::text, jsonb_build_object('code', new.code));
  perform public._notify(new.customer_id, 'booking_received', jsonb_build_object(
    'booking_id', new.id, 'code', new.code, 'service', new.service, 'urgency', new.urgency,
    'scheduled_at', new.scheduled_at, 'total', coalesce(new.total, new.budget), 'zip', new.zip));
  perform public.dispatch_booking(new.id);
  return null;
end $$;
