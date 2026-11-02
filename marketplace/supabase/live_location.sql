-- Live location for an active job. Additive and re-runnable. NOT applied yet.
-- The assigned cleaner shares GPS only while the job is in progress. The customer of that booking sees the last point.
-- Coordinates are rounded to ~1 m. Nothing is kept after the job is completed (cleared on completion).

alter table public.bookings add column if not exists worker_lat numeric(9,5);
alter table public.bookings add column if not exists worker_lng numeric(9,5);
alter table public.bookings add column if not exists location_at timestamptz;

-- Cleaner: share my current point for one of my jobs that is in progress.
create or replace function public.share_location(p_booking uuid, p_lat numeric, p_lng numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'check_violation'; end if;
  update public.bookings
     set worker_lat = round(p_lat, 5), worker_lng = round(p_lng, 5), location_at = now()
   where id = p_booking and worker_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- Clear the point when the job ends, so no location is kept afterwards.
create or replace function public._clear_location() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('completed', 'cancelled') then new.worker_lat := null; new.worker_lng := null; new.location_at := null; end if;
  return new;
end $$;
drop trigger if exists z_clear_location on public.bookings;
create trigger z_clear_location before update of status on public.bookings for each row execute function public._clear_location();

revoke all on function public.share_location(uuid, numeric, numeric) from public, anon;
grant execute on function public.share_location(uuid, numeric, numeric) to authenticated;

-- The trigger function is never called over RPC, so nobody needs execute on it. Also applied live as revoke_clear_location_anon.
revoke execute on function public._clear_location() from public, anon;
