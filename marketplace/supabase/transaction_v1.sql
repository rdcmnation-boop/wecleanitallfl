-- Transaction v1: the job itself, start to finish, as one connected record.
--   Cleaner: secure check-in (assigned cleaner, time window, location recorded) → timestamped checklist →
--            before/after photos (private storage) → check-out (only when checklist + photos are done).
--   The database refuses "in progress" without a check-in and "completed" without a check-out, so no screen can skip a step.
--   Quality: customer review, issue reporting (customer or cleaner), owner escalation; an open issue holds the cleaner payout.
--   Completion report: one function returns service, times, cleaner, checklist, photos, payment, issues and review.
--   Recurring: weekly / biweekly / monthly series. Exactly one upcoming visit is kept; the next is created when the current
--   one is done or skipped. Customers can change frequency/next time, pause or cancel.
-- Staging first. Additive: new tables, new columns, new functions; two existing functions get one extra condition.

-- ───────── columns ─────────
alter table public.bookings
  add column if not exists checked_in_at timestamptz,
  add column if not exists checkin_lat numeric(9,6),
  add column if not exists checkin_lng numeric(9,6),
  add column if not exists checkin_flag text,
  add column if not exists checked_out_at timestamptz,
  add column if not exists checkout_lat numeric(9,6),
  add column if not exists checkout_lng numeric(9,6),
  add column if not exists series_id uuid;

-- ───────── checklist ─────────
create table if not exists public.checklist_templates (
  id bigint generated always as identity primary key,
  service text not null,            -- '*' = every service
  position int not null,
  label_en text not null,
  label_es text not null,
  required boolean not null default true,
  unique (service, position)
);
create table if not exists public.job_checklist_items (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id),
  position int not null,
  label_en text not null,
  label_es text not null,
  required boolean not null default true,
  done_at timestamptz,
  done_by uuid,
  note text not null default '',
  unique (booking_id, position)
);
insert into public.checklist_templates(service, position, label_en, label_es, required) values
  ('*', 10, 'Walk-through with photos of every room before starting', 'Recorrido con fotos de cada área antes de empezar', true),
  ('*', 20, 'Dust surfaces, shelves and fixtures', 'Sacudir superficies, repisas y accesorios', true),
  ('*', 30, 'Clean and disinfect bathrooms', 'Limpiar y desinfectar baños', true),
  ('*', 40, 'Clean kitchen counters, sink and appliance fronts', 'Limpiar mesones, fregadero y frente de electrodomésticos', true),
  ('*', 50, 'Vacuum and mop floors', 'Aspirar y trapear pisos', true),
  ('*', 60, 'Empty trash and replace liners', 'Vaciar basura y cambiar bolsas', true),
  ('*', 90, 'Final walk-through: nothing left behind, doors locked', 'Recorrido final: nada olvidado, puertas cerradas', true),
  ('deep', 70, 'Inside oven, fridge and microwave', 'Dentro de horno, nevera y microondas', true),
  ('deep', 75, 'Baseboards, door frames and vents', 'Zócalos, marcos de puertas y rejillas', true),
  ('move', 70, 'Inside all cabinets, drawers and closets', 'Dentro de gabinetes, cajones y closets', true),
  ('move', 75, 'Inside oven, fridge and microwave', 'Dentro de horno, nevera y microondas', true),
  ('office', 70, 'Desks, phones and keyboards wiped', 'Escritorios, teléfonos y teclados limpios', true),
  ('office', 75, 'Break room and restrooms restocked', 'Cocina y baños reabastecidos', false),
  ('restaurant', 70, 'Degrease kitchen surfaces and hood exterior', 'Desengrasar superficies de cocina y exterior de campana', true),
  ('restaurant', 75, 'Dining tables, chairs and floors', 'Mesas, sillas y pisos del comedor', true),
  ('airbnb', 70, 'Fresh linens and towels, bed made', 'Sábanas y toallas limpias, cama tendida', true),
  ('airbnb', 75, 'Restock guest supplies', 'Reponer artículos para huéspedes', false)
on conflict (service, position) do nothing;

-- ───────── photos (private bucket; customer, assigned cleaner and owner can view) ─────────
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.job_photos (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id),
  kind text not null check (kind in ('before', 'after', 'issue')),
  path text not null unique,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);

-- Path is "<booking id>/<before|after|issue>/<file>". Upload: the assigned cleaner while the job is in progress
-- (or the customer for an issue photo). Read: that booking's customer, its cleaner, or the owner.
create or replace function public._job_photo_can_upload(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
     where b.id::text = split_part(p_name, '/', 1)
       and ((split_part(p_name, '/', 2) in ('before', 'after') and b.worker_id = auth.uid() and b.status = 'in_progress')
         or (split_part(p_name, '/', 2) = 'issue' and (b.customer_id = auth.uid() or b.worker_id = auth.uid()) and b.status in ('in_progress', 'completed')))
       and split_part(p_name, '/', 3) ~ '^[A-Za-z0-9_.-]{1,120}$');
$$;
create or replace function public._job_photo_can_read(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.bookings b where b.id::text = split_part(p_name, '/', 1)
                                      and (b.customer_id = auth.uid() or b.worker_id = auth.uid()));
$$;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'job photos upload') then
    create policy "job photos upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'job-photos' and (select public._job_photo_can_upload(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'job photos read') then
    create policy "job photos read" on storage.objects for select to authenticated
      using (bucket_id = 'job-photos' and (select public._job_photo_can_read(name)));
  end if;
end $p$;

-- ───────── issues ─────────
create table if not exists public.job_issues (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id),
  reporter_id uuid,
  reporter_role text not null check (reporter_role in ('customer', 'provider', 'system')),
  kind text not null check (kind in ('quality', 'damage', 'missed_items', 'no_show', 'safety', 'other')),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text,
  resolution_note text,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists job_issues_open on public.job_issues(booking_id) where status = 'open';

-- ───────── recurring ─────────
create table if not exists public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  template jsonb not null,
  next_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists recurring_series_customer on public.recurring_series(customer_id);
create index if not exists bookings_series on public.bookings(series_id) where series_id is not null;

alter table public.checklist_templates enable row level security;
alter table public.job_checklist_items enable row level security;
alter table public.job_photos enable row level security;
alter table public.job_issues enable row level security;
alter table public.recurring_series enable row level security;
revoke all on public.checklist_templates, public.job_checklist_items, public.job_photos, public.job_issues, public.recurring_series from public, anon, authenticated;
-- (read and write only through the functions below)

-- ───────── proof rule: no "in progress" without check-in, no "completed" without check-out ─────────
create or replace function public._require_job_proof()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;   -- the owner can still force a status (recorded in history + audit)
  if new.status = 'in_progress' and old.status = 'assigned' and new.checked_in_at is null then raise exception 'check_in_required'; end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and (new.checked_in_at is null or new.checked_out_at is null) then
    raise exception 'check_out_required';
  end if;
  return new;
end $$;
create or replace trigger a5_require_job_proof before update of status on public.bookings for each row execute function public._require_job_proof();

-- ───────── cleaner: check-in ─────────
create or replace function public.check_in(p_booking uuid, p_lat numeric default null, p_lng numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings; v_flag text;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.worker_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if b.status = 'in_progress' and b.checked_in_at is not null then return jsonb_build_object('status', 'already_checked_in', 'at', b.checked_in_at); end if;
  if b.status <> 'assigned' then raise exception 'not_allowed'; end if;
  if b.urgency = 'scheduled' and b.scheduled_at is not null and now() < b.scheduled_at - interval '60 minutes' then raise exception 'too_early'; end if;
  if p_lat is null or p_lng is null then v_flag := 'no_location';
  elsif p_lat not between 24.3 and 27.5 or p_lng not between -82.0 and -79.8 then v_flag := 'outside_area';
  end if;
  update public.bookings set checked_in_at = now(), checkin_lat = p_lat, checkin_lng = p_lng, checkin_flag = v_flag where id = p_booking;
  perform public.start_job(p_booking);
  insert into public.job_checklist_items(booking_id, position, label_en, label_es, required)
    select p_booking, t.position, t.label_en, t.label_es, t.required from public.checklist_templates t
     where t.service = '*' or t.service = b.service
    on conflict (booking_id, position) do nothing;
  if v_flag is not null then
    perform public._agent_alert('operations', 'flag_late_job', 'checkin_flag:' || p_booking, b.code || ': check-in ' || replace(v_flag, '_', ' '),
      jsonb_build_object('booking_id', p_booking, 'flag', v_flag));
  end if;
  perform public._audit('job_check_in', 'booking', p_booking::text, jsonb_build_object('flag', v_flag));
  return jsonb_build_object('status', 'checked_in', 'flag', v_flag, 'items', (select count(*) from public.job_checklist_items where booking_id = p_booking));
end $$;

create or replace function public.checklist_mark(p_item bigint, p_done boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.job_checklist_items; b public.bookings;
begin
  select * into i from public.job_checklist_items where id = p_item for update;
  select * into b from public.bookings where id = i.booking_id;
  if i.id is null or b.worker_id is distinct from auth.uid() or b.status <> 'in_progress' then raise exception 'not_allowed'; end if;
  update public.job_checklist_items set done_at = case when p_done then coalesce(done_at, now()) end, done_by = case when p_done then auth.uid() end,
         note = left(coalesce(p_note, ''), 300) where id = p_item returning * into i;
  return jsonb_build_object('id', i.id, 'done_at', i.done_at);
end $$;

-- After the file is uploaded to storage, the app records it here (the object must exist and belong to the caller).
create or replace function public.register_job_photo(p_booking uuid, p_kind text, p_path text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if split_part(p_path, '/', 1) <> p_booking::text or split_part(p_path, '/', 2) <> p_kind then raise exception 'bad_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'job-photos' and o.name = p_path and o.owner_id = auth.uid()::text) then raise exception 'photo_not_uploaded'; end if;
  if (select count(*) from public.job_photos where booking_id = p_booking and kind = p_kind) >= 12 then raise exception 'too_many_photos'; end if;
  insert into public.job_photos(booking_id, kind, path, uploaded_by) values (p_booking, p_kind, p_path, auth.uid())
    on conflict (path) do nothing returning id into v_id;
  return coalesce(v_id, (select id from public.job_photos where path = p_path));
end $$;

-- ───────── cleaner: check-out ─────────
create or replace function public.check_out(p_booking uuid, p_lat numeric default null, p_lng numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bookings; v_missing int; v_before int; v_after int;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.worker_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if b.status = 'completed' then return jsonb_build_object('status', 'already_checked_out', 'at', b.checked_out_at); end if;
  if b.status <> 'in_progress' or b.checked_in_at is null then raise exception 'not_allowed'; end if;
  select count(*) into v_missing from public.job_checklist_items where booking_id = p_booking and required and done_at is null;
  select count(*) filter (where kind = 'before'), count(*) filter (where kind = 'after') into v_before, v_after from public.job_photos where booking_id = p_booking;
  if v_missing > 0 then raise exception 'checklist_incomplete'; end if;
  if v_before < 1 then raise exception 'before_photo_required'; end if;
  if v_after < 1 then raise exception 'after_photo_required'; end if;
  update public.bookings set checked_out_at = now(), checkout_lat = p_lat, checkout_lng = p_lng where id = p_booking;
  perform public.complete_job(p_booking);
  perform public._audit('job_check_out', 'booking', p_booking::text, jsonb_build_object('before', v_before, 'after', v_after));
  select * into b from public.bookings where id = p_booking;
  return jsonb_build_object('status', 'checked_out', 'workflow_state', b.workflow_state, 'payment_status', b.payment_status);
end $$;

-- ───────── completion report (customer, assigned cleaner, owner) ─────────
create or replace function public.job_report(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or not (b.customer_id = auth.uid() or b.worker_id = auth.uid() or public.is_admin()) then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'booking', jsonb_build_object('id', b.id, 'code', b.code, 'service', b.service, 'segment', b.segment, 'frequency', b.frequency, 'series_id', b.series_id,
       'address', case when b.customer_id = auth.uid() or public.is_admin() or b.status in ('assigned', 'in_progress') then b.address else '' end,
       'zip', b.zip, 'city', b.city, 'status', b.status, 'workflow_state', b.workflow_state, 'payment_status', b.payment_status,
       'price', b.budget, 'service_fee', b.service_fee, 'tax', b.tax_amount, 'total', b.total, 'hours_est', b.hours_est),
    'times', jsonb_build_object('created', b.created_at, 'scheduled', b.scheduled_at, 'assigned', b.assigned_at, 'on_way', b.on_way_at,
       'checked_in', b.checked_in_at, 'checked_out', b.checked_out_at, 'completed', b.completed_at, 'cancelled', b.cancelled_at,
       'worked_minutes', case when b.checked_in_at is not null and b.checked_out_at is not null
                              then round(extract(epoch from (b.checked_out_at - b.checked_in_at)) / 60 - coalesce(b.paused_seconds, 0) / 60.0) end),
    'checkin', jsonb_build_object('flag', b.checkin_flag, 'has_location', b.checkin_lat is not null),
    'cleaner', (select jsonb_build_object('name', p.full_name, 'company', w.company_name, 'rating', w.rating_avg)
                  from public.workers w join public.profiles p on p.id = w.id where w.id = b.worker_id),
    'checklist', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'label_en', i.label_en, 'label_es', i.label_es, 'required', i.required,
                                   'done_at', i.done_at, 'note', i.note) order by i.position), '[]') from public.job_checklist_items i where i.booking_id = b.id),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.path, 'at', ph.created_at) order by ph.created_at), '[]')
                 from public.job_photos ph where ph.booking_id = b.id),
    'payment', (select jsonb_build_object('status', pay.status, 'amount_cents', pay.amount_cents, 'authorized_at', pay.authorized_at,
                                          'captured_at', pay.captured_at, 'refunded_at', pay.refunded_at, 'test_mode', not pay.livemode)
                  from public.payments pay where pay.booking_id = b.id),
    'issues', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'reporter', x.reporter_role,
                                  'description', x.description, 'resolution', x.resolution, 'at', x.created_at, 'resolved_at', x.resolved_at) order by x.created_at), '[]')
                 from public.job_issues x where x.booking_id = b.id),
    'review', (select jsonb_build_object('rating', r.rating, 'comment', r.comment, 'at', r.created_at) from public.reviews r where r.booking_id = b.id limit 1));
end $$;

-- ───────── issues and escalation ─────────
create or replace function public._open_issue(p_booking uuid, p_reporter uuid, p_role text, p_kind text, p_text text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_code text;
begin
  select id into v_id from public.job_issues where booking_id = p_booking and kind = p_kind and status = 'open' and reporter_role = p_role;
  if v_id is not null then return v_id; end if;             -- the same open issue twice is one issue
  insert into public.job_issues(booking_id, reporter_id, reporter_role, kind, description)
    values (p_booking, p_reporter, p_role, p_kind, left(coalesce(p_text, ''), 2000)) returning id into v_id;
  select code into v_code from public.bookings where id = p_booking;
  -- hold the cleaner payout while the issue is open (a queued payout simply waits)
  update public.outbox_jobs set next_attempt_at = 'infinity' where kind = 'stripe.transfer' and aggregate_id = p_booking::text and status in ('queued', 'failed');
  insert into public.domain_events(aggregate, aggregate_id, event, actor_type, actor_id, data)
    values ('booking', p_booking::text, 'booking.issue_reported', p_role, p_reporter, jsonb_build_object('issue', v_id, 'kind', p_kind));
  perform public._agent_alert('quality', 'flag_low_rating', 'issue:' || v_id, v_code || ': ' || replace(p_kind, '_', ' ') || ' reported by ' || p_role,
    jsonb_build_object('booking_id', p_booking, 'issue_id', v_id, 'kind', p_kind, 'text', left(coalesce(p_text, ''), 300)));
  perform public._audit('issue_reported', 'booking', p_booking::text, jsonb_build_object('issue', v_id, 'kind', p_kind, 'role', p_role));
  return v_id;
end $$;

create or replace function public.report_issue(p_booking uuid, p_kind text, p_text text)
returns bigint language plpgsql security definer set search_path = public as $$
declare b public.bookings; v_role text;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null then raise exception 'not_allowed'; end if;
  if b.customer_id = auth.uid() then v_role := 'customer'; elsif b.worker_id = auth.uid() then v_role := 'provider'; else raise exception 'not_allowed'; end if;
  if p_kind not in ('quality', 'damage', 'missed_items', 'no_show', 'safety', 'other') then raise exception 'invalid_kind'; end if;
  if coalesce(char_length(btrim(p_text)), 0) < 5 then raise exception 'describe_issue'; end if;
  if b.status not in ('assigned', 'in_progress', 'completed') then raise exception 'not_allowed'; end if;
  if b.status = 'completed' and b.completed_at < now() - interval '7 days' then raise exception 'too_late_contact_support'; end if;
  return public._open_issue(p_booking, auth.uid(), v_role, p_kind, p_text);
end $$;

-- A low review (1-2 stars) opens a quality issue automatically, so the owner sees it.
create or replace function public._review_escalate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rating <= 2 then perform public._open_issue(new.booking_id, new.customer_id, 'customer', 'quality', 'Low rating (' || new.rating || '★): ' || coalesce(new.comment, '')); end if;
  return null;
end $$;
create or replace trigger z_review_escalate after insert on public.reviews for each row execute function public._review_escalate();

create or replace function public.admin_resolve_issue(p_issue bigint, p_resolution text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare x public.job_issues; pay public.payments; b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_resolution not in ('resolved_no_action', 'reclean_scheduled', 'refund_approved_separately', 'cleaner_coached', 'dismissed') then raise exception 'invalid_resolution'; end if;
  if coalesce(char_length(btrim(p_note)), 0) < 3 then raise exception 'reason_required'; end if;
  select * into x from public.job_issues where id = p_issue for update;
  if x.id is null or x.status <> 'open' then raise exception 'not_open'; end if;
  update public.job_issues set status = case when p_resolution = 'dismissed' then 'dismissed' else 'resolved' end, resolution = p_resolution,
         resolution_note = left(p_note, 1000), resolved_by = auth.uid(), resolved_at = now() where id = p_issue;
  update public.agent_tasks set status = 'done', closed_at = now() where dedupe_key = 'issue:' || p_issue and status = 'open';
  if not exists (select 1 from public.job_issues where booking_id = x.booking_id and status = 'open') then
    -- release the held payout, or queue it now if it was never queued because of the issue
    update public.outbox_jobs set next_attempt_at = now() where kind = 'stripe.transfer' and aggregate_id = x.booking_id::text and next_attempt_at = 'infinity';
    select * into pay from public.payments where booking_id = x.booking_id;
    select * into b from public.bookings where id = x.booking_id;
    if pay.status = 'captured' and not exists (select 1 from public.outbox_jobs where idempotency_key = 'transfer:' || x.booking_id)
       and exists (select 1 from public.payment_accounts a where a.worker_id = b.worker_id and a.payouts_enabled) then
      perform public.outbox_enqueue('stripe.transfer', b.id::text, 'transfer:' || b.id,
        jsonb_build_object('booking_id', b.id, 'amount_cents', round(b.budget * 100)::int,
          'destination', (select stripe_account_id from public.payment_accounts where worker_id = b.worker_id)));
    end if;
  end if;
  if x.reporter_id is not null then perform public._notify(x.reporter_id, 'issue_resolved', jsonb_build_object('booking_id', x.booking_id, 'issue', p_issue, 'resolution', p_resolution)); end if;
  perform public._audit('issue_resolved', 'booking', x.booking_id::text, jsonb_build_object('issue', p_issue, 'resolution', p_resolution, 'note', p_note));
  return 'resolved';
end $$;

create or replace function public.admin_open_issues()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'booking_id', x.booking_id, 'code', b.code, 'kind', x.kind, 'reporter', x.reporter_role,
            'description', x.description, 'at', x.created_at, 'payment_status', b.payment_status) order by x.created_at), '[]')
            from public.job_issues x join public.bookings b on b.id = x.booking_id where x.status = 'open');
end $$;

-- Same as payments v1, plus: no payout is queued while an issue is open on the booking (released on resolution).
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
  insert into public.ledger_entries(booking_id, entry_group, account, amount_cents, external_ref) values
    (b.id, g, 'customer', -p_amount, p_charge),
    (b.id, g, 'provider_payable', round(b.budget * 100)::bigint, p_charge),
    (b.id, g, 'platform_fee', p_amount - round(b.budget * 100)::bigint - round(coalesce(b.tax_amount, 0) * 100)::bigint, p_charge),
    (b.id, g, 'tax_payable', round(coalesce(b.tax_amount, 0) * 100)::bigint, p_charge);
  update public.payments set status = 'captured', captured_at = now(), updated_at = now() where booking_id = b.id;
  perform public._record_transition(b.id, 'COMPLETED', 'PAYMENT_CAPTURED', 'payment', 'charged ' || p_amount || ' cents', 'capture:' || p_intent);
  update public.bookings set payment_status = 'captured', workflow_state = 'PAYMENT_CAPTURED', state_changed_at = now() where id = b.id;
  if exists (select 1 from public.job_issues where booking_id = b.id and status = 'open') then
    perform public._agent_alert('finance', 'daily_revenue', 'payout_held:' || b.id, b.code || ': paid; cleaner payout held until the open issue is resolved');
  elsif exists (select 1 from public.payment_accounts a where a.worker_id = b.worker_id and a.payouts_enabled) then
    perform public.outbox_enqueue('stripe.transfer', b.id::text, 'transfer:' || b.id,
      jsonb_build_object('booking_id', b.id, 'amount_cents', round(b.budget * 100)::int, 'charge', p_charge,
        'destination', (select stripe_account_id from public.payment_accounts where worker_id = b.worker_id)));
  else
    perform public._agent_alert('finance', 'daily_revenue', 'no_payout_account:' || b.id, b.code || ': paid, but the cleaner has not connected a payout account yet');
  end if;
  return 'captured';
end $$;

-- ───────── recurring ─────────
create or replace function public._series_step(p_freq text)
returns interval language sql immutable as $$
  select case p_freq when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month' end;
$$;

-- Create the next visit of a series AS the customer (same price, area, market and duplicate checks as a booking they make).
create or replace function public._series_spawn(p_series uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.recurring_series; v_claims text := current_setting('request.jwt.claims', true); v_at timestamptz; v_id uuid; t jsonb;
begin
  select * into s from public.recurring_series where id = p_series for update;
  if s.id is null or s.status <> 'active' then return null; end if;
  if exists (select 1 from public.bookings where series_id = s.id and status in ('requested', 'offered', 'assigned', 'in_progress')) then return null; end if;
  v_at := s.next_at;
  while v_at < now() + interval '2 hours' loop v_at := v_at + public._series_step(s.frequency); end loop;
  t := s.template;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', s.customer_id, 'role', 'authenticated')::text, true);
    insert into public.bookings(segment, service, property_type, bedrooms, bathrooms, sqft, frequency, zip, city, address, urgency, scheduled_at,
                                hours_est, budget, notes, preferred_worker_id, series_id, commercial_location_id)
    values (t->>'segment', t->>'service', coalesce(t->>'property_type', ''), (t->>'bedrooms')::int, (t->>'bathrooms')::int, (t->>'sqft')::int, s.frequency,
            t->>'zip', coalesce(t->>'city', ''), coalesce(t->>'address', ''), 'scheduled', v_at, (t->>'hours_est')::numeric, (t->>'budget')::numeric,
            coalesce(t->>'notes', ''), (t->>'preferred_worker_id')::uuid, s.id, (t->>'commercial_location_id')::uuid)
    returning id into v_id;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    update public.recurring_series set next_at = v_at + public._series_step(s.frequency), last_error = null, updated_at = now() where id = s.id;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    update public.recurring_series set last_error = left(sqlerrm, 200), updated_at = now() where id = s.id;
    perform public._agent_alert('operations', 'flag_unassigned', 'series_error:' || s.id || ':' || to_char(v_at, 'YYYYMMDD'),
      'Recurring visit could not be created: ' || left(sqlerrm, 120), jsonb_build_object('series_id', s.id, 'at', v_at));
    return null;
  end;
  return v_id;
end $$;

-- A booking made with weekly/biweekly/monthly starts a series (the booking is its first visit).
create or replace function public._series_from_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.series_id is not null or new.frequency not in ('weekly', 'biweekly', 'monthly') or new.customer_id is null then return null; end if;
  insert into public.recurring_series(customer_id, frequency, template, next_at)
  values (new.customer_id, new.frequency,
          jsonb_build_object('segment', new.segment, 'service', new.service, 'property_type', new.property_type, 'bedrooms', new.bedrooms, 'bathrooms', new.bathrooms,
                             'sqft', new.sqft, 'zip', new.zip, 'city', new.city, 'address', new.address, 'hours_est', new.hours_est, 'budget', new.budget,
                             'notes', new.notes, 'preferred_worker_id', new.preferred_worker_id, 'commercial_location_id', new.commercial_location_id),
          coalesce(new.scheduled_at, now()) + public._series_step(new.frequency))
  returning id into v_id;
  update public.bookings set series_id = v_id where id = new.id;
  return null;
end $$;
create or replace trigger z_series_from_booking after insert on public.bookings for each row execute function public._series_from_booking();

-- When a visit is done or skipped (cancelled), the next one is created.
create or replace function public._series_continue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.series_id is not null and new.status in ('completed', 'cancelled') and old.status not in ('completed', 'cancelled') then
    perform public._series_spawn(new.series_id);
  end if;
  return null;
end $$;
create or replace trigger z_series_continue after update of status on public.bookings for each row execute function public._series_continue();

create or replace function public.my_series()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'frequency', s.frequency, 'status', s.status, 'next_at', s.next_at, 'service', s.template->>'service',
           'zip', s.template->>'zip', 'price', (s.template->>'budget')::numeric, 'last_error', s.last_error,
           'upcoming', (select jsonb_build_object('id', b.id, 'code', b.code, 'status', b.status, 'scheduled_at', b.scheduled_at, 'payment_status', b.payment_status)
                          from public.bookings b where b.series_id = s.id and b.status in ('requested', 'offered', 'assigned', 'in_progress') order by b.scheduled_at limit 1),
           'visits_done', (select count(*) from public.bookings b where b.series_id = s.id and b.status = 'completed')) order by s.created_at desc), '[]')
    from public.recurring_series s where s.customer_id = auth.uid() and s.status <> 'cancelled';
$$;

-- Change frequency and/or the time of the visits after the upcoming one. (To move the upcoming visit, skip it: cancel it and the next is created.)
create or replace function public.series_update(p_series uuid, p_frequency text, p_next_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.recurring_series;
begin
  select * into s from public.recurring_series where id = p_series for update;
  if s.id is null or s.customer_id is distinct from auth.uid() or s.status = 'cancelled' then raise exception 'not_allowed'; end if;
  if p_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'invalid_frequency'; end if;
  if p_next_at is not null and (p_next_at < now() + interval '2 hours' or p_next_at > now() + interval '180 days') then raise exception 'invalid_time'; end if;
  update public.recurring_series set frequency = p_frequency, next_at = coalesce(p_next_at, next_at), updated_at = now() where id = p_series returning * into s;
  perform public._audit('series_updated', 'recurring_series', p_series::text, jsonb_build_object('frequency', p_frequency, 'next_at', s.next_at));
  return jsonb_build_object('frequency', s.frequency, 'next_at', s.next_at);
end $$;

create or replace function public.series_pause(p_series uuid, p_paused boolean)
returns text language plpgsql security definer set search_path = public as $$
declare s public.recurring_series;
begin
  select * into s from public.recurring_series where id = p_series for update;
  if s.id is null or s.customer_id is distinct from auth.uid() or s.status = 'cancelled' then raise exception 'not_allowed'; end if;
  update public.recurring_series set status = case when p_paused then 'paused' else 'active' end, updated_at = now() where id = p_series;
  if not p_paused then perform public._series_spawn(p_series); end if;
  perform public._audit(case when p_paused then 'series_paused' else 'series_resumed' end, 'recurring_series', p_series::text, '{}'::jsonb);
  return case when p_paused then 'paused' else 'active' end;
end $$;

-- Cancel the plan. The upcoming visit is cancelled too unless a cleaner is already on it (then it stays; the customer can cancel it separately).
create or replace function public.series_cancel(p_series uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.recurring_series; r record; n int := 0;
begin
  select * into s from public.recurring_series where id = p_series for update;
  if s.id is null or s.customer_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if s.status = 'cancelled' then return jsonb_build_object('status', 'already_cancelled'); end if;
  update public.recurring_series set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_series;
  for r in select id from public.bookings where series_id = p_series and status in ('requested', 'offered') loop
    perform public.cancel_booking(r.id); n := n + 1;
  end loop;
  perform public._audit('series_cancelled', 'recurring_series', p_series::text, jsonb_build_object('visits_cancelled', n));
  return jsonb_build_object('status', 'cancelled', 'visits_cancelled', n);
end $$;

-- ───────── grants ─────────
do $g$
declare f text;
begin
  foreach f in array array['check_in(uuid,numeric,numeric)', 'checklist_mark(bigint,boolean,text)', 'register_job_photo(uuid,text,text)',
                           'check_out(uuid,numeric,numeric)', 'job_report(uuid)', 'report_issue(uuid,text,text)', 'admin_resolve_issue(bigint,text,text)',
                           'admin_open_issues()', 'my_series()', 'series_update(uuid,text,timestamptz)', 'series_pause(uuid,boolean)', 'series_cancel(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_open_issue(uuid,uuid,text,text,text)', '_series_spawn(uuid)', '_series_step(text)', '_require_job_proof()',
                           '_review_escalate()', '_series_from_booking()', '_series_continue()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  execute 'revoke all on function public._job_photo_can_upload(text), public._job_photo_can_read(text) from public, anon';
  execute 'grant execute on function public._job_photo_can_upload(text), public._job_photo_can_read(text) to authenticated';
end $g$;
