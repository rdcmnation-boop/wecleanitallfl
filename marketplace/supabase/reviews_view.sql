-- Reviews for cleaners: a summary + the list, for the customer (any cleaner) and for the cleaner (own).
-- Additive, re-runnable. NOT applied yet. Customers see only the first name of the reviewer.
create or replace function public.worker_reviews(p_worker uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'avg', coalesce((select round(avg(rating)::numeric, 1) from public.reviews where worker_id = p_worker), 0),
    'count', (select count(*) from public.reviews where worker_id = p_worker),
    'dist', coalesce((select jsonb_object_agg(x.r, x.n) from (
              select rating as r, count(*) as n from public.reviews where worker_id = p_worker group by rating) x), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
              'rating', rv.rating, 'comment', rv.comment, 'created_at', rv.created_at,
              'name', split_part(coalesce(p.full_name, ''), ' ', 1)) order by rv.created_at desc)
              from (select * from public.reviews where worker_id = p_worker order by created_at desc limit 50) rv
              left join public.profiles p on p.id = rv.customer_id), '[]'::jsonb)
  );
$$;

create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.worker_reviews(auth.uid());
$$;

revoke all on function public.worker_reviews(uuid), public.my_reviews() from public, anon;
grant execute on function public.worker_reviews(uuid), public.my_reviews() to authenticated;
