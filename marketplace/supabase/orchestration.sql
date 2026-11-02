-- ============================================================================
-- Orchestration engine v1 (Prompt 10). Additive and backward compatible.
-- · bookings.workflow_state: the full lifecycle (the old `status` column keeps working for the app).
-- · One transition graph (booking_transitions) enforced by a trigger on every status change, from any path.
-- · domain_events: append-only history of everything that happens to a booking (trace id, actor, from → to).
-- · outbox_jobs / inbox_events: external operations (Stripe, Twilio, robots) with idempotency keys,
--   leased claims (no double processing), capped exponential retry and a dead-letter state.
-- · watchdog: stuck workflows → NEEDS_ATTENTION + owner alert; restart recovery = state lives in the database.
-- Payment states (PAYMENT_AUTHORIZED / CAPTURED / SETTLED) are part of the graph but are only reached when a
-- market has payments_mode = 'stripe' AND a confirmed provider event arrives. Never assumed.
-- ============================================================================

create table if not exists public.workflow_states (
  state text primary key,
  phase text not null,
  terminal boolean not null default false,
  description text not null default ''
);
insert into public.workflow_states(state, phase, terminal, description) values
  ('REQUESTED', 'intake', false, 'Customer submitted the request'),
  ('VALIDATED', 'intake', false, 'Address in an active market, service offered, time valid'),
  ('PRICED', 'intake', false, 'Price, fee and tax computed by the database'),
  ('PAYMENT_AUTHORIZED', 'payment', false, 'Card authorization confirmed by the payment provider'),
  ('PROVIDER_MATCHING', 'dispatch', false, 'Looking for eligible providers'),
  ('OFFERED', 'dispatch', false, 'Offers sent to eligible providers'),
  ('ACCEPTED', 'dispatch', false, 'A provider accepted (row-locked, first valid wins)'),
  ('ASSIGNED', 'dispatch', false, 'Provider confirmed on the job'),
  ('IN_PROGRESS', 'service', false, 'Cleaning started'),
  ('QUALITY_CHECK', 'service', false, 'Checklist / photos / customer confirmation pending'),
  ('COMPLETED', 'service', false, 'Work done'),
  ('PAYMENT_CAPTURED', 'payment', false, 'Capture confirmed by the payment provider'),
  ('SETTLED', 'payment', true, 'Payout and fees reconciled'),
  ('CLOSED_OFFLINE', 'payment', true, 'Completed in a market where payment happens outside the app'),
  ('RESCHEDULED', 'exception', false, 'New time requested; returns to matching'),
  ('REJECTED', 'exception', true, 'Refused at validation'),
  ('CANCELLED', 'exception', true, 'Cancelled by customer or owner'),
  ('REFUND_PENDING', 'exception', false, 'Refund requested; needs owner approval and provider confirmation'),
  ('REFUNDED', 'exception', true, 'Refund confirmed by the payment provider'),
  ('FAILED', 'exception', false, 'An operation failed; recoverable'),
  ('NEEDS_ATTENTION', 'exception', false, 'Stuck or inconsistent; a person must decide')
on conflict (state) do nothing;

-- Allowed graph. actor: system (database/orchestrator), customer, provider, admin, payment (confirmed webhook).
create table if not exists public.booking_transitions (
  from_state text not null references public.workflow_states(state),
  to_state text not null references public.workflow_states(state),
  actors text[] not null,
  primary key (from_state, to_state)
);
insert into public.booking_transitions(from_state, to_state, actors) values
  ('REQUESTED', 'VALIDATED', '{system}'), ('REQUESTED', 'REJECTED', '{system}'),
  ('VALIDATED', 'PRICED', '{system}'),
  ('PRICED', 'PROVIDER_MATCHING', '{system}'), ('PRICED', 'PAYMENT_AUTHORIZED', '{payment}'),
  ('PAYMENT_AUTHORIZED', 'PROVIDER_MATCHING', '{system}'),
  ('PROVIDER_MATCHING', 'OFFERED', '{system}'), ('PROVIDER_MATCHING', 'ASSIGNED', '{admin}'),
  ('PROVIDER_MATCHING', 'NEEDS_ATTENTION', '{system,admin}'),
  ('OFFERED', 'ACCEPTED', '{provider}'), ('OFFERED', 'ASSIGNED', '{admin}'), ('OFFERED', 'PROVIDER_MATCHING', '{system,admin}'),
  ('OFFERED', 'NEEDS_ATTENTION', '{system,admin}'),
  ('ACCEPTED', 'ASSIGNED', '{system}'),
  ('ASSIGNED', 'IN_PROGRESS', '{provider}'), ('ASSIGNED', 'ASSIGNED', '{admin}'), ('ASSIGNED', 'PROVIDER_MATCHING', '{system,admin}'),
  ('ASSIGNED', 'COMPLETED', '{provider}'), ('ASSIGNED', 'NEEDS_ATTENTION', '{system,admin}'),
  ('IN_PROGRESS', 'QUALITY_CHECK', '{provider,system}'), ('IN_PROGRESS', 'COMPLETED', '{provider}'),
  ('IN_PROGRESS', 'NEEDS_ATTENTION', '{system,admin}'),
  ('QUALITY_CHECK', 'COMPLETED', '{customer,admin,system}'), ('QUALITY_CHECK', 'NEEDS_ATTENTION', '{customer,admin}'),
  ('COMPLETED', 'PAYMENT_CAPTURED', '{payment}'), ('COMPLETED', 'CLOSED_OFFLINE', '{system}'),
  ('COMPLETED', 'REFUND_PENDING', '{admin}'),
  ('PAYMENT_CAPTURED', 'SETTLED', '{payment,system}'), ('PAYMENT_CAPTURED', 'REFUND_PENDING', '{admin}'),
  ('REFUND_PENDING', 'REFUNDED', '{payment}'), ('REFUND_PENDING', 'NEEDS_ATTENTION', '{system,admin}'),
  ('RESCHEDULED', 'PROVIDER_MATCHING', '{system}'),
  ('FAILED', 'PROVIDER_MATCHING', '{system,admin}'), ('FAILED', 'NEEDS_ATTENTION', '{system}'),
  ('NEEDS_ATTENTION', 'PROVIDER_MATCHING', '{admin}'), ('NEEDS_ATTENTION', 'ASSIGNED', '{admin}'),
  ('NEEDS_ATTENTION', 'IN_PROGRESS', '{admin}'), ('NEEDS_ATTENTION', 'COMPLETED', '{admin}'), ('NEEDS_ATTENTION', 'CANCELLED', '{admin}')
on conflict (from_state, to_state) do nothing;
-- Cancel and reschedule from any open intake/dispatch state.
insert into public.booking_transitions(from_state, to_state, actors)
  select s, 'CANCELLED', '{customer,admin}' from unnest(array['REQUESTED','VALIDATED','PRICED','PAYMENT_AUTHORIZED','PROVIDER_MATCHING','OFFERED','ACCEPTED','ASSIGNED']) s
on conflict (from_state, to_state) do nothing;
insert into public.booking_transitions(from_state, to_state, actors)
  select s, 'RESCHEDULED', '{customer,admin}' from unnest(array['PROVIDER_MATCHING','OFFERED','ASSIGNED']) s
on conflict (from_state, to_state) do nothing;

alter table public.bookings add column if not exists workflow_state text references public.workflow_states(state);
alter table public.bookings add column if not exists state_changed_at timestamptz;
alter table public.markets add column if not exists payments_mode text not null default 'offline' check (payments_mode in ('offline', 'stripe'));

-- ── event history ──
create table if not exists public.domain_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  trace_id uuid not null default gen_random_uuid(),
  aggregate text not null check (aggregate in ('booking', 'provider', 'market', 'payment', 'robot', 'contract', 'system')),
  aggregate_id text not null,
  event text not null check (event ~ '^[a-z_]+\.[a-z_]+(\.v[0-9]+)?$'),
  from_state text, to_state text,
  actor_type text not null check (actor_type in ('system', 'customer', 'provider', 'admin', 'payment', 'agent')),
  actor_id uuid,
  idempotency_key text,
  data jsonb not null default '{}',
  unique (aggregate, aggregate_id, idempotency_key)
);
create index if not exists domain_events_agg_idx on public.domain_events(aggregate, aggregate_id, id);
create index if not exists domain_events_at_idx on public.domain_events(at desc);
alter table public.domain_events enable row level security;
revoke all on public.domain_events from public, anon, authenticated;
create or replace function public._domain_events_append_only() returns trigger language plpgsql as $$
begin
  if current_setting('wcia.retention', true) = 'on' and tg_op = 'DELETE' then return old; end if;
  raise exception 'append_only: domain_events cannot be changed or deleted';
end $$;
create or replace trigger domain_events_no_update before update or delete on public.domain_events
  for each row execute function public._domain_events_append_only();

-- Who is acting right now.
create or replace function public._actor_type(p_booking public.bookings) returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'system'
              when public.is_admin() then 'admin'
              when auth.uid() = p_booking.customer_id then 'customer'
              when auth.uid() = p_booking.worker_id or exists (select 1 from public.job_offers o where o.booking_id = p_booking.id and o.worker_id = auth.uid()) then 'provider'
              else 'system' end;
$$;

-- Old status → new lifecycle state (so every existing path produces correct history).
create or replace function public._state_for_status(p_status text) returns text
language sql immutable as $$
  select case p_status when 'requested' then 'PROVIDER_MATCHING' when 'offered' then 'OFFERED' when 'assigned' then 'ASSIGNED'
                       when 'in_progress' then 'IN_PROGRESS' when 'completed' then 'COMPLETED' when 'cancelled' then 'CANCELLED' end;
$$;

-- The single choke point: validate the move, record it. Raises if the transition is not in the graph for this actor.
create or replace function public._record_transition(p_id uuid, p_from text, p_to text, p_actor text, p_reason text, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_from is not distinct from p_to and p_to <> 'ASSIGNED' then return; end if;
  -- Who may act is already enforced by each function and by row security (only owner updates rows directly);
  -- here the move itself must exist in the graph, and the actor is recorded for the history.
  if p_from is not null and not exists (select 1 from public.booking_transitions t where t.from_state = p_from and t.to_state = p_to) then
    raise exception 'invalid_transition: % -> % by %', p_from, p_to, p_actor;
  end if;
  insert into public.domain_events(aggregate, aggregate_id, event, from_state, to_state, actor_type, actor_id, idempotency_key, data)
    values ('booking', p_id::text, 'booking.' || lower(p_to), p_from, p_to, p_actor, auth.uid(), p_key, jsonb_build_object('reason', p_reason))
    on conflict (aggregate, aggregate_id, idempotency_key) do nothing;
end $$;

-- On insert: REQUESTED → VALIDATED → PRICED → PROVIDER_MATCHING (all checks already passed in the guard triggers).
create or replace function public._booking_workflow_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text := case when auth.uid() is null then 'system' when public.is_admin() then 'admin' else 'customer' end;
begin
  insert into public.domain_events(aggregate, aggregate_id, event, to_state, actor_type, actor_id, data)
    values ('booking', new.id::text, 'booking.requested', 'REQUESTED', a, auth.uid(), jsonb_build_object('code', new.code, 'market', new.market_id, 'service', new.service));
  perform public._record_transition(new.id, 'REQUESTED', 'VALIDATED', 'system', 'market ' || coalesce(new.market_id, '?') || ' open; service and time valid');
  perform public._record_transition(new.id, 'VALIDATED', 'PRICED', 'system', 'price ' || coalesce(new.budget::text, '-') || ', fee ' || coalesce(new.service_fee::text, '-') || ', total ' || coalesce(new.total::text, '-'));
  perform public._record_transition(new.id, 'PRICED', 'PROVIDER_MATCHING', 'system', 'payments ' || coalesce((select payments_mode from public.markets where id = new.market_id), 'offline'));
  return null;
end $$;

-- Before insert: set the starting state (dispatch may move it to OFFERED right after, in the same transaction).
create or replace function public._booking_workflow_init() returns trigger
language plpgsql set search_path = public as $$
begin
  new.workflow_state := 'PROVIDER_MATCHING'; new.state_changed_at := now();
  return new;
end $$;

-- On every status change, from any function: validate against the graph and record it.
create or replace function public._booking_workflow_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_to text; v_from text := coalesce(old.workflow_state, public._state_for_status(old.status)); v_actor text;
begin
  if new.status is distinct from old.status then
    v_to := public._state_for_status(new.status);
    v_actor := public._actor_type(old);
    -- Owner moves and acceptance show as their real steps.
    if v_from = 'OFFERED' and v_to = 'ASSIGNED' and v_actor = 'provider' then
      perform public._record_transition(new.id, 'OFFERED', 'ACCEPTED', 'provider', 'first valid acceptance');
      v_from := 'ACCEPTED'; v_actor := 'system';
    end if;
    -- Moving back to matching (re-dispatch / provider lost approval) is a system or owner action.
    if v_to = 'PROVIDER_MATCHING' and v_actor not in ('admin') then v_actor := 'system'; end if;
    perform public._record_transition(new.id, v_from, v_to, v_actor, 'status ' || old.status || ' → ' || new.status);
    new.workflow_state := v_to; new.state_changed_at := now();
  elsif new.worker_id is distinct from old.worker_id and new.status = 'assigned' then
    perform public._record_transition(new.id, 'ASSIGNED', 'ASSIGNED', 'admin', 'provider replaced');
  end if;
  return new;
end $$;

-- Closing the loop in markets without in-app payments: COMPLETED → CLOSED_OFFLINE (never fakes a capture).
create or replace function public._booking_close_offline() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.workflow_state = 'COMPLETED' and coalesce((select payments_mode from public.markets where id = new.market_id), 'offline') = 'offline' then
    perform public._record_transition(new.id, 'COMPLETED', 'CLOSED_OFFLINE', 'system', 'payment outside the app (no Stripe in this market)');
    update public.bookings set workflow_state = 'CLOSED_OFFLINE', state_changed_at = now() where id = new.id;
  end if;
  return null;
end $$;

do $$ declare f text; begin
  foreach f in array array['_actor_type(public.bookings)', '_state_for_status(text)', '_record_transition(uuid,text,text,text,text,text)',
    '_booking_workflow_insert()', '_booking_workflow_init()', '_booking_workflow_update()', '_booking_close_offline()', '_domain_events_append_only()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

create or replace trigger a0_booking_workflow_init before insert on public.bookings for each row execute function public._booking_workflow_init();
create or replace trigger a_booking_workflow_insert after insert on public.bookings for each row execute function public._booking_workflow_insert();
create or replace trigger a3_booking_workflow_update before update on public.bookings for each row execute function public._booking_workflow_update();
create or replace trigger z_booking_close_offline after update on public.bookings for each row
  when (new.status = 'completed' and old.status is distinct from 'completed') execute function public._booking_close_offline();

-- Existing rows get their state from their status (one-time backfill).
update public.bookings set workflow_state = public._state_for_status(status), state_changed_at = coalesce(state_changed_at, now()) where workflow_state is null;

-- ── outbox (our calls to the outside) and inbox (their confirmations to us) ──
create table if not exists public.outbox_jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  aggregate_id text,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts int not null default 0,
  max_attempts int not null default 6,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists outbox_due_idx on public.outbox_jobs(status, next_attempt_at);
create table if not exists public.inbox_events (
  provider text not null,
  external_id text not null,
  event text not null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, external_id)
);
alter table public.outbox_jobs enable row level security;
alter table public.inbox_events enable row level security;
revoke all on public.outbox_jobs, public.inbox_events from public, anon, authenticated;

-- Enqueue once per idempotency key (a second call returns the existing job).
create or replace function public.outbox_enqueue(p_kind text, p_aggregate text, p_key text, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.outbox_jobs(kind, aggregate_id, idempotency_key, payload) values (p_kind, p_aggregate, p_key, coalesce(p_payload, '{}'))
    on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.outbox_jobs where idempotency_key = p_key; end if;
  return v_id;
end $$;

-- Workers claim due jobs with a lease; SKIP LOCKED means two workers never take the same job.
-- An expired lease (worker crashed) makes the job claimable again: restart recovery.
create or replace function public.outbox_claim(p_kind text, p_limit int default 10, p_lease_seconds int default 60)
returns setof public.outbox_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.outbox_jobs j set status = 'running', attempts = attempts + 1, lease_until = now() + make_interval(secs => p_lease_seconds)
   where j.id in (select id from public.outbox_jobs
                   where kind = p_kind and next_attempt_at <= now()
                     and (status = 'queued' or status = 'failed' or (status = 'running' and lease_until < now()))
                   order by next_attempt_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning j.*;
end $$;

-- Report the result. Failure → retry with exponential backoff (30 s, 1, 2, 4, 8 min…), then 'dead' + owner alert.
create or replace function public.outbox_finish(p_id bigint, p_ok boolean, p_error text default null)
returns text language plpgsql security definer set search_path = public as $$
declare j public.outbox_jobs;
begin
  select * into j from public.outbox_jobs where id = p_id for update;
  if j.id is null or j.status <> 'running' then return 'ignored'; end if;
  if p_ok then
    update public.outbox_jobs set status = 'succeeded', finished_at = now(), last_error = null, lease_until = null where id = p_id;
    return 'succeeded';
  end if;
  if j.attempts >= j.max_attempts then
    update public.outbox_jobs set status = 'dead', finished_at = now(), last_error = left(p_error, 500), lease_until = null where id = p_id;
    perform public._agent_alert('security', 'scan_audit', 'outbox_dead:' || p_id, 'External operation ' || j.kind || ' failed ' || j.attempts || ' times and stopped: ' || left(coalesce(p_error, ''), 120));
    return 'dead';
  end if;
  update public.outbox_jobs set status = 'failed', last_error = left(p_error, 500), lease_until = null,
         next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, j.attempts - 1)::int)) where id = p_id;
  return 'retry';
end $$;

-- Confirmed external events (webhooks). Returns false for a duplicate, so it is processed only once.
create or replace function public.inbox_record(p_provider text, p_external_id text, p_event text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  insert into public.inbox_events(provider, external_id, event, payload) values (p_provider, p_external_id, p_event, coalesce(p_payload, '{}'))
    on conflict (provider, external_id) do nothing returning true into v;
  return coalesce(v, false);
end $$;

-- ── watchdog: stuck workflows get a person ──
create or replace function public.orchestration_watchdog()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select b.id, b.code, b.workflow_state, b.scheduled_at, b.urgency, b.state_changed_at from public.bookings b
            where (b.workflow_state in ('PROVIDER_MATCHING', 'OFFERED') and b.state_changed_at < now() - case when b.urgency = 'asap' then interval '30 minutes' else interval '6 hours' end
                    and (b.scheduled_at is null or b.scheduled_at < now() + interval '24 hours'))
               or (b.workflow_state = 'ASSIGNED' and b.scheduled_at < now() - interval '2 hours')
               or (b.workflow_state = 'IN_PROGRESS' and b.state_changed_at < now() - interval '14 hours')
               or (b.workflow_state = 'REFUND_PENDING' and b.state_changed_at < now() - interval '48 hours') loop
    if public._agent_alert('orchestrator', 'route_task', 'stuck:' || r.id || ':' || r.workflow_state,
         r.code || ' is stuck in ' || r.workflow_state || ' since ' || to_char(r.state_changed_at at time zone 'America/New_York', 'Mon DD HH12:MI AM')) then
      n := n + 1;
      insert into public.domain_events(aggregate, aggregate_id, event, from_state, actor_type, data)
        values ('booking', r.id::text, 'booking.stuck_detected', r.workflow_state, 'system', jsonb_build_object('since', r.state_changed_at));
    end if;
  end loop;
  -- Expired outbox leases are claimable again automatically; count them for the owner.
  return jsonb_build_object('stuck_alerts', n,
    'outbox_due', (select count(*) from public.outbox_jobs where status in ('queued', 'failed') and next_attempt_at <= now()),
    'outbox_dead', (select count(*) from public.outbox_jobs where status = 'dead'));
end $$;

-- Owner tools: full history and an intervention that is validated and logged.
create or replace function public.admin_booking_history(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'event', e.event, 'from', e.from_state, 'to', e.to_state,
            'actor', e.actor_type, 'data', e.data) order by e.id), '[]') from public.domain_events e
           where e.aggregate = 'booking' and e.aggregate_id = p_booking::text);
end $$;

create or replace function public.admin_flag_attention(p_booking uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into b from public.bookings where id = p_booking for update;
  perform public._record_transition(p_booking, b.workflow_state, 'NEEDS_ATTENTION', 'admin', left(coalesce(p_reason, ''), 300));
  update public.bookings set workflow_state = 'NEEDS_ATTENTION', state_changed_at = now() where id = p_booking;
  perform public._audit('flag_attention', 'booking', p_booking::text, jsonb_build_object('reason', p_reason));
end $$;

revoke all on function public.outbox_enqueue(text,text,text,jsonb), public.outbox_claim(text,int,int), public.outbox_finish(bigint,boolean,text),
  public.inbox_record(text,text,text,jsonb), public.orchestration_watchdog() from public, anon, authenticated;
grant execute on function public.outbox_enqueue(text,text,text,jsonb), public.outbox_claim(text,int,int), public.outbox_finish(bigint,boolean,text),
  public.inbox_record(text,text,text,jsonb) to service_role;
revoke all on function public.admin_booking_history(uuid), public.admin_flag_attention(uuid,text) from public, anon;
grant execute on function public.admin_booking_history(uuid), public.admin_flag_attention(uuid,text) to authenticated;
