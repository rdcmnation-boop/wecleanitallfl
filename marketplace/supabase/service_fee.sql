-- Owner revenue (owner decision: option 1 + 4). Additive and re-runnable.
-- 1) Clients pay a service fee on top of the cleaner's price; the cleaner keeps 100% of the price and tips.
-- 4) Weekly payout to cleaners is free; an instant (same-day) payout costs the cleaner a small flat fee.
-- Nothing is charged until card payments are switched on (Stripe Connect). Until then the fee is shown to the owner
-- as "would have earned" and is not shown to clients. Every request records the fee at the rate in force when it was made.

create table if not exists public.pay_settings (
  id int primary key default 1 check (id = 1),
  service_fee_pct numeric(5,2) not null default 12 check (service_fee_pct between 0 and 30),
  instant_payout_fee numeric(6,2) not null default 1.99 check (instant_payout_fee between 0 and 10),
  payments_on boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.pay_settings(id) values (1) on conflict (id) do nothing;
alter table public.pay_settings enable row level security;
revoke all on public.pay_settings from public, anon, authenticated;

alter table public.bookings add column if not exists fee_pct numeric(5,2);
alter table public.bookings add column if not exists service_fee numeric(10,2);
alter table public.bookings add column if not exists total numeric(10,2);

-- The fee is always computed here; whatever the app sends for these columns is ignored.
create or replace function public._booking_fee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.fee_pct is null then
    select service_fee_pct into new.fee_pct from public.pay_settings where id = 1;
  else
    new.fee_pct := old.fee_pct;
  end if;
  if new.budget is null then
    new.service_fee := null; new.total := null;
  else
    new.service_fee := round(new.budget * coalesce(new.fee_pct, 0) / 100, 2);
    new.total := new.budget + new.service_fee;
  end if;
  return new;
end $$;
revoke all on function public._booking_fee() from public, anon, authenticated;
create or replace trigger c_booking_fee before insert or update of budget, fee_pct, service_fee, total on public.bookings
  for each row execute function public._booking_fee();

-- What the app needs to show the price (no secrets): fee rate, instant payout fee, whether card payments are on.
create or replace function public.pay_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('fee_pct', service_fee_pct, 'instant_fee', instant_payout_fee, 'payments_on', payments_on)
    from public.pay_settings where id = 1;
$$;
revoke all on function public.pay_info() from public;
grant execute on function public.pay_info() to anon, authenticated;

-- Owner: revenue summary and changing the fees (2-step session required).
create or replace function public.admin_money()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.pay_settings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into s from public.pay_settings where id = 1;
  return jsonb_build_object(
    'fee_pct', s.service_fee_pct, 'instant_fee', s.instant_payout_fee, 'payments_on', s.payments_on,
    'jobs_30d', (select count(*) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'cleaners_30d', (select coalesce(sum(budget), 0) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'fees_30d', (select coalesce(sum(service_fee), 0) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'fees_at_rate_30d', (select coalesce(round(sum(budget) * s.service_fee_pct / 100, 2), 0) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'open_fees', (select coalesce(sum(service_fee), 0) from public.bookings where status in ('requested', 'offered', 'assigned', 'in_progress')));
end $$;
revoke all on function public.admin_money() from public, anon;
grant execute on function public.admin_money() to authenticated;

create or replace function public.admin_set_fees(p_fee_pct numeric, p_instant_fee numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_fee_pct is not null and (p_fee_pct < 0 or p_fee_pct > 30) then raise exception 'invalid_fee'; end if;
  if p_instant_fee is not null and (p_instant_fee < 0 or p_instant_fee > 10) then raise exception 'invalid_fee'; end if;
  update public.pay_settings set service_fee_pct = coalesce(p_fee_pct, service_fee_pct),
         instant_payout_fee = coalesce(p_instant_fee, instant_payout_fee), updated_at = now() where id = 1;
  insert into public.audit_log(actor, action, entity, entity_id, details)
    values (auth.uid(), 'set_fees', 'pay_settings', '1', jsonb_build_object('fee_pct', p_fee_pct, 'instant_fee', p_instant_fee));
  return public.pay_info();
end $$;
revoke all on function public.admin_set_fees(numeric, numeric) from public, anon;
grant execute on function public.admin_set_fees(numeric, numeric) to authenticated;
