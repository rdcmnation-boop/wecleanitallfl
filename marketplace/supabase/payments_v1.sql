-- Payments v1 (Stripe, test mode first). Additive. Only active in markets with payments_mode = 'stripe'.
-- Flow: book → PRICED (no cleaner sees it yet) → customer pays on Stripe Checkout (card AUTHORIZED, not charged)
--       → signed webhook → PAYMENT_AUTHORIZED → matching/dispatch → job done → capture (charged) → signed webhook
--       → PAYMENT_CAPTURED + ledger → transfer to the cleaner's Stripe account → SETTLED.
-- No card data is stored or seen: Stripe hosts the card form. Money states change ONLY from confirmed Stripe events.
-- Ledger is double-entry: every booking's entries sum to zero.

alter table public.bookings add column if not exists payment_status text
  check (payment_status in ('requires_payment', 'authorized', 'captured', 'cancelled', 'refund_pending', 'refunded', 'failed'));

create table if not exists public.payment_accounts (
  worker_id uuid primary key references public.workers(id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  livemode boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.payments (
  booking_id uuid primary key references public.bookings(id),
  checkout_session_id text unique,
  payment_intent_id text unique,
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'requires_payment'
    check (status in ('requires_payment', 'authorized', 'captured', 'cancelled', 'refund_pending', 'refunded', 'failed')),
  livemode boolean not null default false,
  authorized_at timestamptz, captured_at timestamptz, cancelled_at timestamptz, refunded_at timestamptz,
  transfer_id text unique,
  updated_at timestamptz not null default now()
);
create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  booking_id uuid references public.bookings(id),
  entry_group text not null,                  -- one money event, e.g. 'capture:<booking>'
  account text not null check (account in ('customer', 'platform_fee', 'provider_payable', 'provider_paid', 'tax_payable', 'refunds')),
  amount_cents bigint not null,               -- credit +, debit −; each entry_group sums to 0
  currency text not null default 'usd',
  external_ref text,                          -- Stripe object id
  unique (entry_group, account)
);
create table if not exists public.refund_requests (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id),
  amount_cents int not null check (amount_cents > 0),
  reason text not null check (char_length(reason) between 3 and 300),
  requested_by uuid not null,
  status text not null default 'approved' check (status in ('approved', 'sent', 'done', 'failed')),
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['payment_accounts', 'payments', 'ledger_entries', 'refund_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
create or replace function public._ledger_append_only() returns trigger language plpgsql as $$
begin raise exception 'append_only: ledger entries cannot be changed or deleted'; end $$;
create or replace trigger ledger_no_update before update or delete on public.ledger_entries for each row execute function public._ledger_append_only();

-- Unpaid bookings in Stripe markets are invisible to dispatch (one rule, used by offers, acceptance and owner assignment).
create or replace function public.provider_block_reason(p_worker uuid, p_booking uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare w public.workers; b public.bookings; m public.markets; req text;
begin
  select * into w from public.workers where id = p_worker;
  select * into b from public.bookings where id = p_booking;
  if w.id is null or b.id is null then return 'not_found'; end if;
  if b.payment_status = 'requires_payment' then return 'awaiting_payment'; end if;
  if w.status <> 'approved' then return 'not_approved'; end if;
  if not w.available then return 'not_available'; end if;
  if not (b.service = any(w.services)) then return 'not_qualified'; end if;
  if w.id = b.customer_id then return 'own_booking'; end if;
  select * into m from public.markets where id = b.market_id;
  if m.id is null then return 'no_market'; end if;
  if exists (select 1 from public.provider_coverage c where c.worker_id = w.id and c.market_id = m.id and c.status = 'suspended') then return 'suspended_in_market'; end if;
  if not (exists (select 1 from public.provider_coverage c where c.worker_id = w.id and c.market_id = m.id and c.status = 'approved')
          or exists (select 1 from unnest(w.zips) z where public._market_of_zip(z) = m.id)) then
    return 'outside_service_area';
  end if;
  if m.requires_insurance and not exists (select 1 from public.insurance_policies i where i.worker_id = w.id
       and i.kind = 'general_liability' and i.status = 'verified' and i.expires_on >= current_date) then
    return 'insurance_missing';
  end if;
  foreach req in array m.required_compliance loop
    if not exists (select 1 from public.provider_compliance pc where pc.worker_id = w.id and pc.requirement = req
         and pc.status = 'verified' and (pc.expires_on is null or pc.expires_on >= current_date)) then
      return 'compliance_missing:' || req;
    end if;
  end loop;
  return null;
end $$;

-- Intake: in Stripe markets the booking stops at PRICED until the payment is authorized.
create or replace function public._booking_workflow_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text := case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'customer' end;
        v_mode text := coalesce((select payments_mode from public.markets where id = new.market_id), 'offline');
begin
  insert into public.domain_events(aggregate, aggregate_id, event, to_state, actor_type, actor_id, data)
    values ('booking', new.id::text, 'booking.requested', 'REQUESTED', a, auth.uid(), jsonb_build_object('code', new.code, 'market', new.market_id, 'service', new.service));
  perform public._record_transition(new.id, 'REQUESTED', 'VALIDATED', 'system', 'market ' || coalesce(new.market_id, '?') || ' open; service and time valid');
  perform public._record_transition(new.id, 'VALIDATED', 'PRICED', 'system', 'price ' || coalesce(new.budget::text, '-') || ', fee ' || coalesce(new.service_fee::text, '-') || ', total ' || coalesce(new.total::text, '-'));
  if v_mode = 'stripe' then
    insert into public.payments(booking_id, amount_cents) values (new.id, round(coalesce(new.total, new.budget) * 100)::int);
    update public.bookings set payment_status = 'requires_payment', workflow_state = 'PRICED', state_changed_at = now() where id = new.id;
  else
    perform public._record_transition(new.id, 'PRICED', 'PROVIDER_MATCHING', 'system', 'payments offline');
  end if;
  return null;
end $$;

-- Close-out: offline markets close; Stripe markets queue the capture (the charge happens only after the work is done).
create or replace function public._booking_close_offline() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mode text := coalesce((select payments_mode from public.markets where id = new.market_id), 'offline');
begin
  if new.workflow_state <> 'COMPLETED' then return null; end if;
  if v_mode = 'stripe' and new.payment_status = 'authorized' then
    perform public.outbox_enqueue('stripe.capture', new.id::text, 'capture:' || new.id,
      jsonb_build_object('booking_id', new.id, 'payment_intent', (select payment_intent_id from public.payments where booking_id = new.id)));
  elsif v_mode = 'offline' then
    perform public._record_transition(new.id, 'COMPLETED', 'CLOSED_OFFLINE', 'system', 'payment outside the app (no Stripe in this market)');
    update public.bookings set workflow_state = 'CLOSED_OFFLINE', state_changed_at = now() where id = new.id;
  end if;
  return null;
end $$;

-- Cancelling a paid-but-not-charged booking releases the card hold.
create or replace function public._booking_cancel_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.payment_status in ('authorized', 'requires_payment') then
    if new.payment_status = 'authorized' then
      perform public.outbox_enqueue('stripe.cancel', new.id::text, 'cancel:' || new.id,
        jsonb_build_object('booking_id', new.id, 'payment_intent', (select payment_intent_id from public.payments where booking_id = new.id)));
    else
      update public.payments set status = 'cancelled', cancelled_at = now(), updated_at = now() where booking_id = new.id;
      update public.bookings set payment_status = 'cancelled' where id = new.id;
    end if;
  end if;
  return null;
end $$;
create or replace trigger z_booking_cancel_payment after update of status on public.bookings for each row execute function public._booking_cancel_payment();

-- ── called ONLY by the signed Stripe webhook (service role) ──
create or replace function public.payment_authorized(p_booking uuid, p_session text, p_intent text, p_amount int, p_livemode boolean)
returns text language plpgsql security definer set search_path = public as $$
declare b public.bookings; pay public.payments;
begin
  select * into b from public.bookings where id = p_booking for update;
  select * into pay from public.payments where booking_id = p_booking for update;
  if b.id is null or pay.booking_id is null then return 'unknown_booking'; end if;
  if pay.status <> 'requires_payment' then return 'already_' || pay.status; end if;
  if p_amount <> pay.amount_cents then
    perform public._agent_alert('finance', 'daily_revenue', 'amount_mismatch:' || p_booking, b.code || ': Stripe authorized ' || p_amount || ' cents but the booking total is ' || pay.amount_cents);
    return 'amount_mismatch';
  end if;
  if b.status = 'cancelled' then
    perform public.outbox_enqueue('stripe.cancel', b.id::text, 'cancel:' || b.id, jsonb_build_object('booking_id', b.id, 'payment_intent', p_intent));
    update public.payments set checkout_session_id = p_session, payment_intent_id = p_intent, status = 'authorized', authorized_at = now(), livemode = p_livemode, updated_at = now() where booking_id = p_booking;
    return 'cancelled_release';
  end if;
  update public.payments set checkout_session_id = p_session, payment_intent_id = p_intent, status = 'authorized',
         authorized_at = now(), livemode = p_livemode, updated_at = now() where booking_id = p_booking;
  perform public._record_transition(b.id, 'PRICED', 'PAYMENT_AUTHORIZED', 'payment', 'card authorized ' || p_amount || ' cents', 'auth:' || p_intent);
  perform public._record_transition(b.id, 'PAYMENT_AUTHORIZED', 'PROVIDER_MATCHING', 'system', 'payment confirmed');
  update public.bookings set payment_status = 'authorized', workflow_state = 'PROVIDER_MATCHING', state_changed_at = now() where id = b.id;
  perform public._notify(b.customer_id, 'payment_authorized', jsonb_build_object('booking_id', b.id, 'code', b.code, 'total', p_amount / 100.0));
  perform public.dispatch_booking(b.id);
  return 'authorized';
end $$;

create or replace function public.payment_captured(p_intent text, p_amount int, p_charge text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments; b public.bookings; g text;
begin
  select * into pay from public.payments where payment_intent_id = p_intent for update;
  if pay.booking_id is null then return 'unknown_intent'; end if;
  if pay.status = 'captured' then return 'already_captured'; end if;
  if pay.status <> 'authorized' then return 'bad_state_' || pay.status; end if;
  select * into b from public.bookings where id = pay.booking_id for update;
  g := 'capture:' || b.id;
  -- double-entry: customer paid (−) = cleaner's price + platform fee + tax (+)
  insert into public.ledger_entries(booking_id, entry_group, account, amount_cents, external_ref) values
    (b.id, g, 'customer', -p_amount, p_charge),
    (b.id, g, 'provider_payable', round(b.budget * 100)::bigint, p_charge),
    (b.id, g, 'platform_fee', p_amount - round(b.budget * 100)::bigint - round(coalesce(b.tax_amount, 0) * 100)::bigint, p_charge),
    (b.id, g, 'tax_payable', round(coalesce(b.tax_amount, 0) * 100)::bigint, p_charge);
  update public.payments set status = 'captured', captured_at = now(), updated_at = now() where booking_id = b.id;
  perform public._record_transition(b.id, 'COMPLETED', 'PAYMENT_CAPTURED', 'payment', 'charged ' || p_amount || ' cents', 'capture:' || p_intent);
  update public.bookings set payment_status = 'captured', workflow_state = 'PAYMENT_CAPTURED', state_changed_at = now() where id = b.id;
  if exists (select 1 from public.payment_accounts a where a.worker_id = b.worker_id and a.payouts_enabled) then
    perform public.outbox_enqueue('stripe.transfer', b.id::text, 'transfer:' || b.id,
      jsonb_build_object('booking_id', b.id, 'amount_cents', round(b.budget * 100)::int, 'charge', p_charge,
        'destination', (select stripe_account_id from public.payment_accounts where worker_id = b.worker_id)));
  else
    perform public._agent_alert('finance', 'daily_revenue', 'no_payout_account:' || b.id, b.code || ': paid, but the cleaner has not connected a payout account yet');
  end if;
  return 'captured';
end $$;

create or replace function public.payment_transferred(p_booking uuid, p_transfer text, p_amount int)
returns text language plpgsql security definer set search_path = public as $$
declare g text := 'transfer:' || p_booking;
begin
  if exists (select 1 from public.ledger_entries where entry_group = g) then return 'already_transferred'; end if;
  insert into public.ledger_entries(booking_id, entry_group, account, amount_cents, external_ref) values
    (p_booking, g, 'provider_payable', -p_amount, p_transfer), (p_booking, g, 'provider_paid', p_amount, p_transfer);
  update public.payments set transfer_id = p_transfer, updated_at = now() where booking_id = p_booking;
  perform public._record_transition(p_booking, 'PAYMENT_CAPTURED', 'SETTLED', 'payment', 'cleaner paid ' || p_amount || ' cents', 'transfer:' || p_transfer);
  update public.bookings set workflow_state = 'SETTLED', state_changed_at = now() where id = p_booking;
  return 'settled';
end $$;

create or replace function public.payment_released(p_intent text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments;
begin
  select * into pay from public.payments where payment_intent_id = p_intent for update;
  if pay.booking_id is null then return 'unknown_intent'; end if;
  if pay.status = 'cancelled' then return 'already_cancelled'; end if;
  update public.payments set status = 'cancelled', cancelled_at = now(), updated_at = now() where booking_id = pay.booking_id;
  update public.bookings set payment_status = 'cancelled' where id = pay.booking_id;
  return 'released';
end $$;

create or replace function public.payment_refunded(p_intent text, p_amount int, p_refund text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments; g text;
begin
  select * into pay from public.payments where payment_intent_id = p_intent for update;
  if pay.booking_id is null then return 'unknown_intent'; end if;
  g := 'refund:' || p_refund;
  if exists (select 1 from public.ledger_entries where entry_group = g) then return 'already_recorded'; end if;
  insert into public.ledger_entries(booking_id, entry_group, account, amount_cents, external_ref) values
    (pay.booking_id, g, 'customer', p_amount, p_refund), (pay.booking_id, g, 'refunds', -p_amount, p_refund);
  update public.payments set status = 'refunded', refunded_at = now(), updated_at = now() where booking_id = pay.booking_id;
  update public.refund_requests set status = 'done' where booking_id = pay.booking_id and status in ('approved', 'sent');
  perform public._record_transition(pay.booking_id, 'REFUND_PENDING', 'REFUNDED', 'payment', 'refunded ' || p_amount || ' cents', 'refund:' || p_refund);
  update public.bookings set payment_status = 'refunded', workflow_state = 'REFUNDED', state_changed_at = now() where id = pay.booking_id;
  return 'refunded';
end $$;

create or replace function public.payment_failed(p_booking uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null then return 'unknown_booking'; end if;
  perform public._agent_alert('finance', 'daily_revenue', 'payment_failed:' || p_booking || ':' || left(coalesce(p_reason, ''), 40), b.code || ': payment problem: ' || left(coalesce(p_reason, ''), 120));
  return 'flagged';
end $$;

create or replace function public.payment_account_update(p_worker uuid, p_account text, p_details boolean, p_charges boolean, p_payouts boolean, p_livemode boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_accounts(worker_id, stripe_account_id, details_submitted, charges_enabled, payouts_enabled, livemode)
    values (p_worker, p_account, p_details, p_charges, p_payouts, p_livemode)
    on conflict (worker_id) do update set stripe_account_id = excluded.stripe_account_id, details_submitted = excluded.details_submitted,
      charges_enabled = excluded.charges_enabled, payouts_enabled = excluded.payouts_enabled, livemode = excluded.livemode, updated_at = now();
end $$;

-- Owner-only refund (2-step). Records the decision and queues it; the money state changes when Stripe confirms.
create or replace function public.admin_refund(p_booking uuid, p_amount_cents int, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare pay public.payments; b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into pay from public.payments where booking_id = p_booking for update;
  if pay.booking_id is null or pay.status <> 'captured' then raise exception 'not_refundable'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > pay.amount_cents then raise exception 'invalid_amount'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'reason_required'; end if;
  select * into b from public.bookings where id = p_booking;
  insert into public.refund_requests(booking_id, amount_cents, reason, requested_by) values (p_booking, p_amount_cents, p_reason, auth.uid());
  perform public._record_transition(p_booking, b.workflow_state, 'REFUND_PENDING', 'admin', left(p_reason, 200));
  update public.payments set status = 'refund_pending', updated_at = now() where booking_id = p_booking;
  update public.bookings set payment_status = 'refund_pending', workflow_state = 'REFUND_PENDING', state_changed_at = now() where id = p_booking;
  perform public.outbox_enqueue('stripe.refund', p_booking::text, 'refund:' || p_booking || ':' || p_amount_cents,
    jsonb_build_object('booking_id', p_booking, 'payment_intent', pay.payment_intent_id, 'amount_cents', p_amount_cents));
  perform public._audit('refund_approved', 'booking', p_booking::text, jsonb_build_object('amount_cents', p_amount_cents, 'reason', p_reason));
  return 'refund_queued';
end $$;

-- What the customer's app needs to show "Pay now"; what the owner sees.
create or replace function public.my_payment(p_booking uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', p.status, 'amount_cents', p.amount_cents)
    from public.payments p join public.bookings b on b.id = p.booking_id
   where p.booking_id = p_booking and (b.customer_id = auth.uid() or public.is_admin());
$$;
create or replace function public.admin_ledger_check()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'unbalanced_groups', (select count(*) from (select entry_group from public.ledger_entries group by entry_group having sum(amount_cents) <> 0) x),
    'platform_fees_cents', (select coalesce(sum(amount_cents), 0) from public.ledger_entries where account = 'platform_fee'),
    'owed_to_cleaners_cents', (select coalesce(sum(amount_cents), 0) from public.ledger_entries where account = 'provider_payable'),
    'paid_to_cleaners_cents', (select coalesce(sum(amount_cents), 0) from public.ledger_entries where account = 'provider_paid'),
    'refunded_cents', (select coalesce(-sum(amount_cents), 0) from public.ledger_entries where account = 'refunds'),
    'livemode_payments', (select count(*) from public.payments where livemode));
end $$;

-- new transitions used by payments
insert into public.booking_transitions(from_state, to_state, actors) values
  ('PRICED', 'CANCELLED', '{customer,admin}'), ('SETTLED', 'REFUND_PENDING', '{admin}')
on conflict (from_state, to_state) do nothing;
update public.workflow_states set terminal = false where state = 'SETTLED';

do $$ declare f text; begin
  foreach f in array array['payment_authorized(uuid,text,text,int,boolean)', 'payment_captured(text,int,text)', 'payment_transferred(uuid,text,int)',
    'payment_released(text)', 'payment_refunded(text,int,text)', 'payment_failed(uuid,text)',
    'payment_account_update(uuid,text,boolean,boolean,boolean,boolean)', '_booking_cancel_payment()', '_ledger_append_only()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['payment_authorized(uuid,text,text,int,boolean)', 'payment_captured(text,int,text)', 'payment_transferred(uuid,text,int)',
    'payment_released(text)', 'payment_refunded(text,int,text)', 'payment_failed(uuid,text)', 'payment_account_update(uuid,text,boolean,boolean,boolean,boolean)'] loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function public.admin_refund(uuid,int,text), public.my_payment(uuid), public.admin_ledger_check() from public, anon;
grant execute on function public.admin_refund(uuid,int,text), public.my_payment(uuid), public.admin_ledger_check() to authenticated;
