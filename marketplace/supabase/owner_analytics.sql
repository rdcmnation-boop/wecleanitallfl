-- Owner panel data (admin-only, 2-step verified). Run after schema.sql.

create or replace function public.admin_analytics(p_days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select greatest(7, least(coalesce(p_days,30), 365)) as n),
  days as (
    select generate_series((current_date - ((select n from d) - 1)), current_date, interval '1 day')::date as day
  ),
  b as (select * from public.bookings where created_at >= current_date - ((select n from d) - 1)),
  o as (select o.* from public.job_offers o join b on b.id = o.booking_id)
  select case when not public.is_admin() then null else jsonb_build_object(
    'days', (select n from d),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', days.day,
        'created', (select count(*) from b where b.created_at::date = days.day),
        'completed', (select count(*) from public.bookings x where x.completed_at::date = days.day),
        'gmv', (select coalesce(sum(budget),0) from public.bookings x where x.status = 'completed' and x.completed_at::date = days.day),
        'signups', (select count(*) from public.profiles p where p.created_at::date = days.day)
      ) order by days.day), '[]') from days),
    'funnel', jsonb_build_object(
        'created', (select count(*) from b),
        'offered', (select count(*) from b where exists (select 1 from public.job_offers z where z.booking_id = b.id)),
        'assigned', (select count(*) from b where b.assigned_at is not null),
        'completed', (select count(*) from b where b.status = 'completed'),
        'cancelled', (select count(*) from b where b.status = 'cancelled')),
    'avg_minutes_to_assign', (select round(avg(extract(epoch from (assigned_at - created_at)) / 60)::numeric, 1) from b where assigned_at is not null),
    'acceptance_rate', (select case when count(*) filter (where status in ('accepted','declined')) = 0 then null
                         else round(100.0 * count(*) filter (where status = 'accepted') / count(*) filter (where status in ('accepted','declined')), 1) end from o),
    'avg_ticket', (select round(avg(budget)::numeric, 0) from b where budget is not null),
    'repeat_customers', (select count(*) from (select customer_id from public.bookings where status = 'completed' group by customer_id having count(*) > 1) r),
    'ratings', (select jsonb_build_object('1',count(*) filter (where rating=1),'2',count(*) filter (where rating=2),'3',count(*) filter (where rating=3),
                  '4',count(*) filter (where rating=4),'5',count(*) filter (where rating=5)) from public.reviews),
    'services', (select coalesce(jsonb_agg(s order by s.n desc), '[]') from (
        select service, segment, count(*) n, round(avg(budget)::numeric,0) avg_budget from b group by service, segment) s),
    'zips', (select coalesce(jsonb_agg(z order by z.demand desc), '[]') from (
        select b.zip, count(*) demand,
               count(*) filter (where b.status = 'requested') unmatched,
               (select count(*) from public.workers w where w.status = 'approved' and b.zip = any(w.zips)) cleaners
        from b group by b.zip limit 12) z),
    'top_workers', (select coalesce(jsonb_agg(t order by t.done desc, t.rating desc), '[]') from (
        select w.id, p.full_name name, w.company_name, w.rating_avg rating, w.rating_count, w.jobs_done done, w.available,
               (select case when count(*) filter (where z.status in ('accepted','declined')) = 0 then null
                  else round(100.0 * count(*) filter (where z.status = 'accepted') / count(*) filter (where z.status in ('accepted','declined')), 0) end
                from public.job_offers z where z.worker_id = w.id) acceptance,
               (select count(*) from public.job_offers z where z.worker_id = w.id and z.status = 'sent') pending_offers
        from public.workers w join public.profiles p on p.id = w.id where w.status = 'approved'
        order by w.jobs_done desc, w.rating_avg desc limit 10) t)
  ) end;
$$;

create or replace function public.admin_customers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'email', p.email, 'language', p.language, 'created_at', p.created_at,
     'bookings', (select count(*) from public.bookings b where b.customer_id = p.id),
     'completed', (select count(*) from public.bookings b where b.customer_id = p.id and b.status = 'completed'),
     'spent', (select coalesce(sum(budget),0) from public.bookings b where b.customer_id = p.id and b.status = 'completed'),
     'last_booking', (select max(created_at) from public.bookings b where b.customer_id = p.id))
  from public.profiles p
  where public.is_admin() and p.role = 'customer'
  order by p.created_at desc
  limit 500;
$$;

create or replace function public.admin_activity()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', a.id, 'action', a.action, 'entity', a.entity, 'entity_id', a.entity_id, 'details', a.details,
     'created_at', a.created_at, 'actor', coalesce(p.full_name, 'Sistema'))
  from public.audit_log a left join public.profiles p on p.id = a.actor
  where public.is_admin()
  order by a.id desc
  limit 60;
$$;

revoke all on function public.admin_analytics(int), public.admin_customers(), public.admin_activity() from public, anon;
grant execute on function public.admin_analytics(int), public.admin_customers(), public.admin_activity() to authenticated;
