-- DoorDash-style flow (applied 2026-11-02 as migration "doordash_flow").
-- 1) "On my way": the cleaner taps it, the customer gets an alert, and live location may be shared on the way.
-- 2) The customer also gets an alert when cleaning starts (assigned and completed alerts already existed).
-- 3) worker_demand(): jobs waiting by ZIP (no addresses or names) for the cleaner's Home screen.
-- 4) worker_scorecard(): the cleaner's own numbers for the Ratings screen (points and tiers are computed in the app).

alter table public.bookings add column if not exists on_way_at timestamptz;

create or replace function public.on_my_way(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings
   where id = p_booking and worker_id = auth.uid() and status = 'assigned' for update;
  if v_b.id is null then raise exception 'not_allowed'; end if;
  if v_b.on_way_at is not null then return; end if; -- tapping twice sends one alert
  update public.bookings set on_way_at = now() where id = v_b.id;
  perform public._notify(v_b.customer_id, 'cleaner_on_way', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._audit('cleaner_on_way', 'booking', v_b.id::text, '{}'::jsonb);
end $$;

create or replace function public.start_job(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_code text;
begin
  update public.bookings set status = 'in_progress', started_at = now()
   where id = p_booking and worker_id = auth.uid() and status = 'assigned'
   returning customer_id, code into v_c, v_code;
  if v_c is null then raise exception 'not_allowed'; end if;
  perform public._notify(v_c, 'job_started', jsonb_build_object('booking_id', p_booking, 'code', v_code));
end $$;

-- Live location: while cleaning, and on the way once "On my way" was tapped. Cleared when the job ends (_clear_location).
create or replace function public.share_location(p_booking uuid, p_lat numeric, p_lng numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'check_violation'; end if;
  update public.bookings
     set worker_lat = round(p_lat, 5), worker_lng = round(p_lng, 5), location_at = now()
   where id = p_booking and worker_id = auth.uid()
     and (status = 'in_progress' or (status = 'assigned' and on_way_at is not null));
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- Open demand by ZIP in the last 24 hours, for approved cleaners only. Aggregates only: ZIP, city, count.
create or replace function public.worker_demand()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.workers where id = auth.uid() and status = 'approved') then return null; end if;
  return jsonb_build_object(
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('zip', z.zip, 'city', z.city, 'n', z.n) order by z.n desc, z.zip)
        from (select b.zip, max(nullif(b.city, '')) as city, count(*) as n
                from public.bookings b
               where b.status in ('requested', 'offered') and b.created_at > now() - interval '24 hours'
               group by b.zip order by count(*) desc, b.zip limit 12) z), '[]'::jsonb),
    'avg_wait_min', (
      select round(extract(epoch from percentile_cont(0.5) within group (order by b.assigned_at - b.created_at)) / 60)
        from public.bookings b where b.assigned_at is not null and b.created_at > now() - interval '30 days'));
end $$;

-- The caller's own scorecard (last 90 days; jobs in the last 30 days). Only the caller's rows are read.
create or replace function public.worker_scorecard()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from public.workers where id = auth.uid()) then null else jsonb_build_object(
    'offers_answered', (select count(*) from public.job_offers o where o.worker_id = auth.uid() and o.status in ('accepted', 'declined') and o.sent_at > now() - interval '90 days'),
    'accepted', (select count(*) from public.job_offers o where o.worker_id = auth.uid() and o.status = 'accepted' and o.sent_at > now() - interval '90 days'),
    'started', (select count(*) from public.bookings b where b.worker_id = auth.uid() and b.started_at > now() - interval '90 days'),
    'on_time', (select count(*) from public.bookings b where b.worker_id = auth.uid() and b.started_at > now() - interval '90 days'
                  and ((b.urgency = 'scheduled' and b.scheduled_at is not null and b.started_at <= b.scheduled_at + interval '15 minutes')
                    or (b.urgency = 'asap' and b.assigned_at is not null and b.started_at <= b.assigned_at + interval '90 minutes'))),
    'rating_avg', (select round(avg(r.rating)::numeric, 2) from public.reviews r where r.worker_id = auth.uid()),
    'rating_count', (select count(*) from public.reviews r where r.worker_id = auth.uid()),
    'good_reviews', (select count(*) from public.reviews r where r.worker_id = auth.uid() and r.rating >= 4),
    'jobs_30d', (select count(*) from public.bookings b where b.worker_id = auth.uid() and b.status = 'completed' and b.completed_at > now() - interval '30 days'),
    'jobs_done', (select w.jobs_done from public.workers w where w.id = auth.uid())) end;
$$;

revoke all on function public.on_my_way(uuid), public.worker_demand(), public.worker_scorecard() from public, anon;
grant execute on function public.on_my_way(uuid), public.worker_demand(), public.worker_scorecard() to authenticated;
revoke all on function public.start_job(uuid), public.share_location(uuid, numeric, numeric) from public, anon;
grant execute on function public.start_job(uuid), public.share_location(uuid, numeric, numeric) to authenticated;
