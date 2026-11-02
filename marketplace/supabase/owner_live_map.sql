-- Owner live map: jobs in progress with the cleaner's last point, filtered by ZIP (empty = all). Additive, re-runnable. NOT applied yet.
-- Owner-only: is_admin() must be true (2-step code or trusted device). Customers and cleaners cannot call it.
create or replace function public.admin_live_jobs(p_zip text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'code', b.code, 'service', b.service, 'zip', b.zip, 'city', b.city,
             'lat', b.worker_lat, 'lng', b.worker_lng, 'location_at', b.location_at, 'worker', p.full_name)
           order by b.location_at desc)
      from public.bookings b
      left join public.profiles p on p.id = b.worker_id
     where b.status = 'in_progress' and b.worker_lat is not null
       and (coalesce(p_zip, '') = '' or b.zip = p_zip)
  ), '[]'::jsonb) else null end;
$$;
revoke all on function public.admin_live_jobs(text) from public, anon;
grant execute on function public.admin_live_jobs(text) to authenticated;
