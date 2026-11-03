-- Admin Command Center v1. Read models + a few audited owner actions over the EXISTING tables (no new data copies).
-- Every function: security definer, `is_admin()` checked first (2-step owner), search/filter/pagination where lists.
-- Additive only. Staging first; production only with owner approval.

create or replace function public._cc_page(p_page int, p_size int) returns int[] language sql immutable as $$
  select array[greatest(1, least(coalesce(p_size, 25), 100)), (greatest(1, coalesce(p_page, 1)) - 1) * greatest(1, least(coalesce(p_size, 25), 100))];
$$;

-- 1 Executive overview (optionally one market)
create or replace function public.cc_overview(p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := now() - interval '30 days'; v_today date := (now() at time zone 'America/New_York')::date;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'market', p_market,
    'bookings', (select jsonb_build_object(
        'today', count(*) filter (where (coalesce(scheduled_at, created_at) at time zone 'America/New_York')::date = v_today and status <> 'cancelled'),
        'open', count(*) filter (where status in ('requested', 'offered')),
        'assigned', count(*) filter (where status = 'assigned'),
        'in_progress', count(*) filter (where status = 'in_progress'),
        'awaiting_payment', count(*) filter (where payment_status = 'requires_payment' and status <> 'cancelled'),
        'created_30d', count(*) filter (where created_at > d),
        'completed_30d', count(*) filter (where status = 'completed' and completed_at > d),
        'cancelled_30d', count(*) filter (where status = 'cancelled' and cancelled_at > d))
      from public.bookings where p_market is null or market_id = p_market),
    'revenue', jsonb_build_object(
        'gmv_30d', (select coalesce(sum(budget), 0) from public.bookings where status = 'completed' and completed_at > d and (p_market is null or market_id = p_market)),
        'fees_booked_30d', (select coalesce(sum(service_fee), 0) from public.bookings where status = 'completed' and completed_at > d and (p_market is null or market_id = p_market)),
        'fees_collected_cents', (select coalesce(sum(l.amount_cents), 0) from public.ledger_entries l join public.bookings b on b.id = l.booking_id
                                  where l.account = 'platform_fee' and (p_market is null or b.market_id = p_market)),
        'unbalanced_ledger_groups', (select count(*) from (select entry_group from public.ledger_entries group by entry_group having sum(amount_cents) <> 0) x)),
    'customers', jsonb_build_object(
        'total', (select count(*) from public.profiles where role = 'customer' and email <> ''),
        'guests', (select count(*) from public.profiles where role = 'customer' and email = ''),
        'new_30d', (select count(*) from public.profiles where role = 'customer' and created_at > d),
        'with_booking', (select count(distinct customer_id) from public.bookings where p_market is null or market_id = p_market),
        'repeat', (select count(*) from (select customer_id from public.bookings where status = 'completed' and (p_market is null or market_id = p_market) group by customer_id having count(*) > 1) x)),
    'providers', jsonb_build_object(
        'approved', (select count(*) from public.workers where status = 'approved'),
        'online', (select count(*) from public.workers where status = 'approved' and available),
        'pending', (select count(*) from public.workers where status = 'pending'),
        'incomplete_profiles', (select count(*) from public.workers where status = 'approved' and (cardinality(services) = 0 or cardinality(zips) = 0)),
        'payout_ready', (select count(*) from public.workers w where w.status = 'approved' and public.payout_block_reason(w.id, false) is null)),
    'commercial', (select jsonb_build_object('accounts', count(*), 'active', count(*) filter (where status = 'active'),
        'pipeline', count(*) filter (where status in ('prospect', 'proposal'))) from public.commercial_accounts),
    'alerts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'agent', agent, 'title', title, 'at', created_at) order by created_at desc), '[]')
                 from (select id, agent, title, created_at from public.agent_tasks where status = 'open' order by created_at desc limit 8) t),
    'open_alerts', (select count(*) from public.agent_tasks where status = 'open'),
    'payments_mode', (select coalesce(jsonb_object_agg(id, payments_mode), '{}') from public.markets where status = 'active'),
    'as_of', now());
end $$;

-- 2 Booking management
create or replace function public.cc_bookings(p_q text default '', p_status text default '', p_market text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg int[] := public._cc_page(p_page, p_size); q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (with f as (
      select b.*, cp.full_name cust_name, wp.full_name worker_name from public.bookings b
        left join public.profiles cp on cp.id = b.customer_id left join public.profiles wp on wp.id = b.worker_id
       where (coalesce(p_status, '') = '' or b.status = p_status or b.workflow_state = upper(p_status) or b.payment_status = p_status)
         and (coalesce(p_market, '') = '' or b.market_id = p_market)
         and (q is null or b.code ilike '%' || q || '%' or b.zip = q or cp.full_name ilike '%' || q || '%' or wp.full_name ilike '%' || q || '%'))
    select jsonb_build_object('total', (select count(*) from f), 'page', greatest(1, coalesce(p_page, 1)), 'size', pg[1],
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'created_at', created_at, 'scheduled_at', scheduled_at, 'urgency', urgency,
          'service', service, 'segment', segment, 'zip', zip, 'city', city, 'market', market_id, 'status', status, 'state', workflow_state,
          'payment', payment_status, 'total', coalesce(total, budget), 'budget', budget, 'customer', split_part(coalesce(cust_name, ''), ' ', 1), 'worker', worker_name) order by created_at desc)
        from (select * from f order by created_at desc limit pg[1] offset pg[2]) x), '[]')));
end $$;

create or replace function public.cc_booking_detail(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'booking', to_jsonb(b) - 'worker_lat' - 'worker_lng',
    'customer', (select jsonb_build_object('name', full_name, 'phone', phone, 'email', email, 'language', language) from public.profiles where id = b.customer_id),
    'worker', (select jsonb_build_object('id', id, 'name', full_name, 'phone', phone) from public.profiles where id = b.worker_id),
    'history', public.admin_booking_history(p_booking),
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('worker', p.full_name, 'status', o.status, 'score', o.score, 'sent_at', o.sent_at) order by o.score desc), '[]')
                 from public.job_offers o join public.profiles p on p.id = o.worker_id where o.booking_id = p_booking),
    'payment', (select to_jsonb(x) - 'checkout_session_id' from public.payments x where x.booking_id = p_booking),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('group', entry_group, 'account', account, 'cents', amount_cents, 'at', at) order by id), '[]') from public.ledger_entries where booking_id = p_booking));
end $$;

-- Owner reschedule: new time, keeps the cleaner if one is assigned, records history, tells both sides.
create or replace function public.cc_reschedule(p_booking uuid, p_when timestamptz, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_when is null or p_when < now() then raise exception 'invalid_time'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'reason_required'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.status not in ('requested', 'offered', 'assigned') then raise exception 'not_allowed'; end if;
  update public.bookings set scheduled_at = p_when, urgency = 'scheduled' where id = p_booking;
  insert into public.domain_events(aggregate, aggregate_id, event, from_state, to_state, actor_type, actor_id, data)
    values ('booking', p_booking::text, 'booking.rescheduled', b.workflow_state, b.workflow_state, 'admin', auth.uid(),
            jsonb_build_object('from', b.scheduled_at, 'to', p_when, 'reason', left(p_reason, 200)));
  perform public._notify(b.customer_id, 'booking_rescheduled', jsonb_build_object('booking_id', b.id, 'code', b.code, 'scheduled_at', p_when));
  if b.worker_id is not null then perform public._notify(b.worker_id, 'booking_rescheduled', jsonb_build_object('booking_id', b.id, 'code', b.code, 'scheduled_at', p_when)); end if;
  perform public._audit('booking_rescheduled', 'booking', p_booking::text, jsonb_build_object('from', b.scheduled_at, 'to', p_when, 'reason', p_reason));
  return 'rescheduled';
end $$;

-- Owner cancel with a reason (uses the existing cancel path, so offers, card holds and history all follow).
create or replace function public.cc_cancel(p_booking uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'reason_required'; end if;
  perform public.cancel_booking(p_booking);
  perform public._audit('booking_cancel_reason', 'booking', p_booking::text, jsonb_build_object('reason', left(p_reason, 200)));
  return 'cancelled';
end $$;

-- 3 AI dispatch center: ranked eligible cleaners + why each other cleaner is blocked. The owner approves with admin_assign.
create or replace function public.cc_dispatch(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'booking', jsonb_build_object('id', b.id, 'code', b.code, 'service', b.service, 'zip', b.zip, 'market', b.market_id, 'status', b.status,
                                  'state', b.workflow_state, 'payment', b.payment_status, 'scheduled_at', b.scheduled_at, 'urgency', b.urgency),
    'recommended', public.admin_candidates(p_booking),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object('worker_id', w.id, 'name', p.full_name, 'reason', public.provider_block_reason(w.id, b.id)) order by p.full_name), '[]')
                  from public.workers w join public.profiles p on p.id = w.id
                 where public.provider_block_reason(w.id, b.id) is not null),
    'basis', 'RECOMMENDATION: score from service area, rating, experience, acceptance rate, language, team size, past jobs with this customer. Eligibility is enforced by the database; the owner approves.');
end $$;

-- 4 Customer management
create or replace function public.cc_customers(p_q text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg int[] := public._cc_page(p_page, p_size); q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (with f as (
      select p.id, p.full_name, p.email, p.phone, p.language, p.created_at, p.sms_consent_at, p.sms_opt_out_at,
             (select count(*) from public.bookings b where b.customer_id = p.id) n,
             (select count(*) from public.bookings b where b.customer_id = p.id and b.status = 'completed') done,
             (select coalesce(sum(b.total), 0) from public.bookings b where b.customer_id = p.id and b.status = 'completed') spent,
             (select max(b.created_at) from public.bookings b where b.customer_id = p.id) last_at
        from public.profiles p
       where p.role = 'customer' and (p.email <> '' or exists (select 1 from public.bookings b where b.customer_id = p.id))
         and (q is null or p.full_name ilike '%' || q || '%' or p.email ilike '%' || q || '%' or (regexp_replace(q, '\D', '', 'g') <> '' and regexp_replace(p.phone, '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%')))
    select jsonb_build_object('total', (select count(*) from f), 'page', greatest(1, coalesce(p_page, 1)), 'size', pg[1],
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'email', email, 'phone_last4', right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 4),
          'language', language, 'guest', email = '', 'created_at', created_at, 'bookings', n, 'completed', done, 'spent', spent, 'last_booking', last_at,
          'texts', case when sms_opt_out_at is not null then 'opted_out' when sms_consent_at is not null then 'consented' else 'none' end) order by coalesce(last_at, created_at) desc)
        from (select * from f order by coalesce(last_at, created_at) desc limit pg[1] offset pg[2]) x), '[]')));
end $$;

create or replace function public.cc_customer_detail(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'name', full_name, 'email', email, 'phone', phone, 'language', language, 'created_at', created_at,
                   'sms_consent_at', sms_consent_at, 'sms_opt_out_at', sms_opt_out_at) from public.profiles where id = p_customer and role = 'customer'),
    'addresses', (select coalesce(jsonb_agg(distinct jsonb_build_object('address', address, 'city', city, 'zip', zip)), '[]') from public.bookings where customer_id = p_customer and coalesce(address, '') <> ''),
    'bookings', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'service', service, 'status', status, 'total', coalesce(total, budget), 'created_at', created_at, 'frequency', frequency) order by created_at desc), '[]')
                   from (select * from public.bookings where customer_id = p_customer order by created_at desc limit 50) x),
    'recurring', (select coalesce(jsonb_agg(distinct frequency), '[]') from public.bookings where customer_id = p_customer and coalesce(frequency, 'once') <> 'once'),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'template', template, 'status', status, 'at', created_at) order by created_at desc), '[]')
                   from (select * from public.notifications where user_id = p_customer and channel <> 'inapp' order by created_at desc limit 20) n),
    'support', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'status', status, 'at', created_at) order by created_at desc), '[]')
                  from public.agent_tasks where kind = 'wa_handoff' and detail ->> 'phone' = (select regexp_replace(phone, '\D', '', 'g') from public.profiles where id = p_customer)));
end $$;

-- 5 Workforce (individual cleaners and the WCIA team) and 6 companies — one provider record, filtered by type.
create or replace function public.cc_providers(p_q text default '', p_status text default '', p_type text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg int[] := public._cc_page(p_page, p_size); q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (with f as (
      select w.*, p.full_name, p.phone, p.email from public.workers w join public.profiles p on p.id = w.id
       where (coalesce(p_status, '') = '' or w.status = p_status)
         and (coalesce(p_type, '') = '' or w.provider_type = p_type)
         and (q is null or p.full_name ilike '%' || q || '%' or w.company_name ilike '%' || q || '%' or q = any(w.zips)))
    select jsonb_build_object('total', (select count(*) from f), 'page', greatest(1, coalesce(p_page, 1)), 'size', pg[1],
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'company', company_name, 'type', provider_type, 'status', status, 'available', available,
          'services', services, 'zips', zips, 'languages', languages, 'team_size', team_size, 'rating', rating_avg, 'ratings', rating_count, 'jobs_done', jobs_done,
          'insurance_valid', exists (select 1 from public.insurance_policies i where i.worker_id = x.id and i.status = 'verified' and i.expires_on >= current_date),
          'insurance_expiring', (select min(expires_on) from public.insurance_policies i where i.worker_id = x.id and i.status = 'verified' and i.expires_on >= current_date),
          'documents_verified', (select count(*) from public.provider_compliance c where c.worker_id = x.id and c.status = 'verified'),
          'coverage', (select coalesce(jsonb_agg(jsonb_build_object('market', market_id, 'status', status)), '[]') from public.provider_coverage c where c.worker_id = x.id),
          'active_jobs', (select count(*) from public.bookings b where b.worker_id = x.id and b.status in ('assigned', 'in_progress')),
          'earned_cents', (select coalesce(sum(amount_cents), 0) from public.ledger_entries l join public.bookings b on b.id = l.booking_id where b.worker_id = x.id and l.account = 'provider_payable' and l.amount_cents > 0),
          'paid_cents', (select coalesce(sum(amount_cents), 0) from public.ledger_entries l join public.bookings b on b.id = l.booking_id where b.worker_id = x.id and l.account = 'provider_paid'),
          'payout_block', public.payout_block_reason(x.id, false),
          'profile_gap', case when cardinality(services) = 0 and cardinality(zips) = 0 then 'services_and_zips' when cardinality(services) = 0 then 'services' when cardinality(zips) = 0 then 'zips' end
        ) order by (status = 'pending') desc, full_name) from (select * from f order by (status = 'pending') desc, full_name limit pg[1] offset pg[2]) x), '[]')));
end $$;

-- 9 Financial management
create or replace function public.cc_finance(p_status text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg int[] := public._cc_page(p_page, p_size);
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return jsonb_build_object(
    'settings', public.pay_info(),
    'ledger', public.admin_ledger_check(),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.payments group by status) s),
    'held_payouts', (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id where p.status = 'captured' and p.transfer_id is null),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'cents', r.amount_cents, 'reason', r.reason, 'status', r.status, 'at', r.created_at) order by r.created_at desc), '[]')
                  from (select * from public.refund_requests order by created_at desc limit 20) r join public.bookings b on b.id = r.booking_id),
    'payments', (with f as (select p.*, b.code, b.service, b.budget from public.payments p join public.bookings b on b.id = p.booking_id
                             where coalesce(p_status, '') = '' or p.status = p_status)
      select jsonb_build_object('total', (select count(*) from f), 'rows', coalesce((select jsonb_agg(jsonb_build_object('booking_id', booking_id, 'code', code, 'service', service,
          'status', status, 'amount_cents', amount_cents, 'cleaner_cents', round(budget * 100), 'livemode', livemode, 'paid_out', transfer_id is not null, 'updated_at', updated_at) order by updated_at desc)
        from (select * from f order by updated_at desc limit pg[1] offset pg[2]) x), '[]'))),
    'outbox', (select coalesce(jsonb_object_agg(kind || ':' || status, n), '{}') from (select kind, status, count(*) n from public.outbox_jobs where kind like 'stripe.%' group by kind, status) o),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('action', action, 'entity', entity, 'at', created_at, 'details', details) order by created_at desc), '[]')
                from (select * from public.audit_log where action in ('refund_approved', 'set_fees', 'booking_cancel_reason') order by created_at desc limit 20) a));
end $$;

-- 10 Commercial sales (accounts table already exists: prospect → proposal → active)
create or replace function public.cc_sales(p_q text default '', p_status text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg int[] := public._cc_page(p_page, p_size); q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (with f as (select a.* from public.commercial_accounts a where (coalesce(p_status, '') = '' or a.status = p_status) and (q is null or a.name ilike '%' || q || '%'))
    select jsonb_build_object('total', (select count(*) from f),
      'stages', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.commercial_accounts group by status) s),
      'recurring_cents_30d', (select coalesce(round(sum(b.total) * 100), 0) from public.bookings b join public.commercial_locations l on l.id = b.commercial_location_id where b.status = 'completed' and b.completed_at > now() - interval '30 days'),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'terms', terms, 'billing_email', billing_email, 'notes', notes, 'created_at', created_at,
          'locations', (select count(*) from public.commercial_locations l where l.account_id = x.id)) order by created_at desc)
        from (select * from f order by created_at desc limit pg[1] offset pg[2]) x), '[]')));
end $$;

create or replace function public.cc_save_account(p_id uuid, p_name text, p_status text, p_terms text, p_billing_email text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('prospect', 'proposal', 'active', 'paused', 'closed') then raise exception 'invalid_status'; end if;
  if p_terms not in ('per_job', 'monthly', 'net30') then raise exception 'invalid_terms'; end if;
  if p_id is null then
    insert into public.commercial_accounts(name, status, terms, billing_email, notes) values (btrim(p_name), p_status, p_terms, coalesce(p_billing_email, ''), coalesce(left(p_notes, 1000), '')) returning id into v_id;
  else
    update public.commercial_accounts set name = btrim(p_name), status = p_status, terms = p_terms, billing_email = coalesce(p_billing_email, ''), notes = coalesce(left(p_notes, 1000), '')
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
  end if;
  perform public._audit('commercial_account_saved', 'commercial_account', v_id::text, jsonb_build_object('name', p_name, 'status', p_status, 'terms', p_terms));
  return v_id;
end $$;

-- 12 Reporting (all computed from records; nothing estimated)
create or replace function public.cc_reports(p_days int default 30, p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (with b as (select * from public.bookings where created_at > d and (p_market is null or market_id = p_market))
    select jsonb_build_object('days', p_days, 'market', p_market,
      'created', (select count(*) from b), 'completed', (select count(*) from b where status = 'completed'),
      'cancelled', (select count(*) from b where status = 'cancelled'),
      'conversion_pct', (select round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*), 0), 1) from b),
      'avg_minutes_to_assign', (select round(extract(epoch from avg(assigned_at - created_at)) / 60) from b where assigned_at is not null),
      'gmv', (select coalesce(sum(budget), 0) from b where status = 'completed'),
      'fees', (select coalesce(sum(service_fee), 0) from b where status = 'completed'),
      'by_service', (select coalesce(jsonb_object_agg(service, n), '{}') from (select service, count(*) n from b group by service) s),
      'by_market', (select coalesce(jsonb_object_agg(coalesce(market_id, '?'), n), '{}') from (select market_id, count(*) n from b group by market_id) s),
      'repeat_customers', (select count(*) from (select customer_id from public.bookings where status = 'completed' group by customer_id having count(*) > 1) x),
      'customers_with_completed', (select count(distinct customer_id) from public.bookings where status = 'completed'),
      'avg_rating', (select round(avg(rating)::numeric, 2) from public.reviews where created_at > d),
      'low_ratings', (select count(*) from public.reviews where created_at > d and rating <= 2),
      'providers', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'jobs', x.jobs, 'rating', w.rating_avg,
            'accept_pct', (select round(100.0 * count(*) filter (where o.status = 'accepted') / nullif(count(*) filter (where o.status in ('accepted', 'declined', 'lost')), 0)) from public.job_offers o where o.worker_id = w.id and o.sent_at > d))
            order by x.jobs desc), '[]')
          from (select worker_id, count(*) jobs from b where status = 'completed' and worker_id is not null group by worker_id order by count(*) desc limit 10) x
          join public.workers w on w.id = x.worker_id join public.profiles p on p.id = w.id)));
end $$;

do $$ declare f text; begin
  foreach f in array array['cc_overview(text)', 'cc_bookings(text,text,text,int,int)', 'cc_booking_detail(uuid)', 'cc_reschedule(uuid,timestamptz,text)', 'cc_cancel(uuid,text)',
    'cc_dispatch(uuid)', 'cc_customers(text,int,int)', 'cc_customer_detail(uuid)', 'cc_providers(text,text,text,int,int)', 'cc_finance(text,int,int)',
    'cc_sales(text,text,int,int)', 'cc_save_account(uuid,text,text,text,text,text)', 'cc_reports(int,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public._cc_page(int, int) from public, anon, authenticated;

-- v1b (applied to staging as command_center_v1b_reschedule_notice): customers also get the reschedule by email/SMS.
-- Same _notify as payments_v1, with 'booking_rescheduled' added to the customer list. Nothing else changes.
create or replace function public._notify(p_user uuid, p_template text, p_payload jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_opt boolean; p public.profiles;
begin
  insert into public.notifications(user_id, channel, template, payload) values (p_user, 'inapp', p_template, p_payload);
  select whatsapp_opt_in into v_opt from public.workers where id = p_user;
  if coalesce(v_opt, false) then
    insert into public.notifications(user_id, channel, template, payload) values (p_user, 'whatsapp', p_template, p_payload);
  end if;
  if p_template in ('booking_received', 'payment_authorized', 'booking_assigned', 'cleaner_on_way', 'booking_completed', 'booking_cancelled', 'booking_reassigning', 'booking_rescheduled') then
    select * into p from public.profiles where id = p_user;
    if p.role = 'customer' then
      if coalesce(p.email, '') <> '' then
        insert into public.notifications(user_id, channel, template, payload) values (p_user, 'email', p_template, p_payload);
      elsif char_length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 10
            and p.sms_consent_at is not null and p.sms_opt_out_at is null then
        insert into public.notifications(user_id, channel, template, payload) values (p_user, 'sms', p_template, p_payload);
      end if;
    end if;
  end if;
end $function$;
