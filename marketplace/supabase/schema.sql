-- We Clean It All — Marketplace, Phase 1
-- Live project: we-clean-it-all (fqajygzjteauxornipva). Re-runnable on a fresh project: SQL Editor → paste → Run.
-- Security model: every table has Row Level Security ON. Users only ever see their own rows.
-- Anything that changes money, status, approval or assignment goes through the functions below,
-- which check who is calling. The browser never gets the service key.

create extension if not exists pgcrypto;

-- ───────────────────────── helpers ─────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- No policies on admins: nobody can read or write it from the app. Add admins in the SQL editor only.

-- Is this login an owner account? (used only to ask for the 2-step code)
create or replace function public.is_admin_account() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
-- Owner powers require 2-step verification (authenticator app) on this session: aal2.
-- A stolen owner password alone opens nothing.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer','worker')),
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '',
  language text not null default 'es' check (language in ('es','en','pt','ht')),
  created_at timestamptz not null default now()
);

create table if not exists public.workers (
  id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null default 'individual' check (kind in ('individual','company')),
  company_name text not null default '' check (char_length(company_name) <= 120),
  bio text not null default '' check (char_length(bio) <= 600),
  zips text[] not null default '{}',
  services text[] not null default '{}',
  languages text[] not null default '{es}',
  years_experience int not null default 0 check (years_experience between 0 and 60),
  team_size int not null default 1 check (team_size between 1 and 500),
  has_transport boolean not null default false,
  has_equipment boolean not null default false,
  has_insurance boolean not null default false,
  rate_type text not null default 'hourly' check (rate_type in ('hourly','fixed')),
  hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate between 0 and 1000),
  whatsapp_opt_in boolean not null default true,
  available boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  jobs_done int not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create sequence if not exists public.booking_code_seq start 1001;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('WC-' || nextval('public.booking_code_seq')),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  segment text not null check (segment in ('residential','commercial')),
  service text not null check (service in ('standard','deep','move','post_construction','office','restaurant','bank','hotel','building','airbnb','windows','carpet')),
  property_type text not null default '' check (char_length(property_type) <= 60),
  bedrooms int check (bedrooms is null or bedrooms between 0 and 20),
  bathrooms int check (bathrooms is null or bathrooms between 0 and 20),
  sqft int check (sqft is null or sqft between 0 and 1000000),
  frequency text not null default 'once' check (frequency in ('once','daily','weekly','biweekly','monthly')),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  city text not null default '' check (char_length(city) <= 80),
  address text not null default '' check (char_length(address) <= 200),  -- private: only the assigned cleaner sees it
  urgency text not null default 'scheduled' check (urgency in ('asap','scheduled')),
  scheduled_at timestamptz,
  hours_est numeric(4,1) check (hours_est is null or hours_est between 0 and 200),
  budget numeric(10,2) check (budget is null or budget between 0 and 100000),
  notes text not null default '' check (char_length(notes) <= 1000),
  preferred_worker_id uuid references public.workers(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','offered','assigned','in_progress','completed','cancelled')),
  worker_id uuid references public.workers(id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists bookings_customer_idx on public.bookings(customer_id);
create index if not exists bookings_worker_idx on public.bookings(worker_id);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_preferred_idx on public.bookings(preferred_worker_id);

create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  score numeric(6,1) not null default 0,
  status text not null default 'sent' check (status in ('sent','accepted','declined','lost','withdrawn')),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (booking_id, worker_id)
);
create index if not exists offers_worker_idx on public.job_offers(worker_id, status);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists reviews_customer_idx on public.reviews(customer_id);
create index if not exists reviews_worker_idx on public.reviews(worker_id);

-- Outbox: the app writes here; the "notify" connector (Phase 2) sends WhatsApp / SMS / email from it.
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'inapp' check (channel in ('inapp','whatsapp','sms','email')),
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  read_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_queue_idx on public.notifications(status, channel) where status = 'queued';

create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ───────────────────────── internal helpers ─────────────────────────
create or replace function public._audit(p_action text, p_entity text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(actor, action, entity, entity_id, details) values (auth.uid(), p_action, p_entity, p_id, coalesce(p_details,'{}'));
$$;

create or replace function public._notify(p_user uuid, p_template text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_opt boolean;
begin
  insert into public.notifications(user_id, channel, template, payload) values (p_user, 'inapp', p_template, p_payload);
  -- Queue a WhatsApp copy for cleaners who opted in. It stays 'queued' until the connector is switched on.
  select whatsapp_opt_in into v_opt from public.workers where id = p_user;
  if coalesce(v_opt,false) then
    insert into public.notifications(user_id, channel, template, payload) values (p_user, 'whatsapp', p_template, p_payload);
  end if;
end $$;

-- ───────────────────────── signup → profile ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role','customer');
  v_lang text := coalesce(new.raw_user_meta_data->>'language','es');
begin
  if v_role not in ('customer','worker') then v_role := 'customer'; end if;
  if v_lang not in ('es','en','pt','ht') then v_lang := 'es'; end if;
  insert into public.profiles(id, role, full_name, phone, email, language)
  values (new.id, v_role,
          left(coalesce(new.raw_user_meta_data->>'full_name',''),120),
          left(coalesce(new.raw_user_meta_data->>'phone',''),30),
          coalesce(new.email,''), v_lang)
  on conflict (id) do nothing;
  if v_role = 'worker' then
    insert into public.workers(id, kind, company_name)
    values (new.id,
            case when new.raw_user_meta_data->>'kind' = 'company' then 'company' else 'individual' end,
            left(coalesce(new.raw_user_meta_data->>'company_name',''),120))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── guard triggers (stop self-promotion) ─────────────────────────
-- Guards run with the caller's rights (security invoker) so current_user tells us who is really writing.
create or replace function public.guard_profiles() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    new.id := old.id; new.role := old.role; new.email := old.email; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles before update on public.profiles for each row execute function public.guard_profiles();

create or replace function public.guard_workers() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() and current_user not in ('postgres','service_role','supabase_admin') then
      new.status := 'pending'; new.rating_avg := 0; new.rating_count := 0; new.jobs_done := 0;
      new.approved_at := null; new.available := false;
    end if;
    return new;
  end if;
  if not public.is_admin() and current_user not in ('postgres','service_role','supabase_admin') then
    new.id := old.id; new.status := old.status; new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
    new.jobs_done := old.jobs_done; new.approved_at := old.approved_at; new.created_at := old.created_at;
    if old.status <> 'approved' then new.available := false; end if;
  end if;
  new.zips := array(select distinct z from unnest(new.zips) z where z ~ '^[0-9]{5}$' limit 60);
  return new;
end $$;
drop trigger if exists guard_workers on public.workers;
create trigger guard_workers before insert or update on public.workers for each row execute function public.guard_workers();

create or replace function public.guard_bookings_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.customer_id := auth.uid();
    new.status := 'requested'; new.worker_id := null;
    new.assigned_at := null; new.started_at := null; new.completed_at := null; new.cancelled_at := null;
    new.created_at := now();
  end if;
  if new.urgency = 'scheduled' and new.scheduled_at is null then
    raise exception 'scheduled_at required';
  end if;
  if new.scheduled_at is not null and new.scheduled_at > now() + interval '180 days' then
    raise exception 'date_too_far';
  end if;
  -- Anti-spam: protects cleaners from floods of fake requests.
  if not public.is_admin() then
    if (select count(*) from public.bookings where customer_id = new.customer_id
          and status in ('requested','offered','assigned','in_progress')) >= 5 then
      raise exception 'too_many_open';
    end if;
    if (select count(*) from public.bookings where customer_id = new.customer_id
          and created_at > now() - interval '24 hours') >= 15 then
      raise exception 'rate_limited';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_bookings_insert on public.bookings;
create trigger guard_bookings_insert before insert on public.bookings for each row execute function public.guard_bookings_insert();

-- ───────────────────────── matching engine ─────────────────────────
-- Score = ZIP fit (40 exact / 15 nearby prefix) + experience (≤20) + rating (≤30, new cleaners get 15)
--       + returning customer (15) + language (10) + price fits budget (10) + insurance (5) + requested cleaner (100).
-- Required: approved, available, offers the service, covers the ZIP area.
create or replace function public.rank_workers(p_booking uuid, p_limit int default 5)
returns table(worker_id uuid, score numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select bk.*, p.language as cust_lang from public.bookings bk join public.profiles p on p.id = bk.customer_id where bk.id = p_booking
  )
  select w.id,
    ( case when b.zip = any(w.zips) then 40
           when exists (select 1 from unnest(w.zips) z where left(z,4) = left(b.zip,4)) then 15 else 0 end
    + least(w.years_experience,10) * 2
    + case when w.rating_count > 0 then w.rating_avg * 6 else 15 end
    + case when exists (select 1 from public.bookings o where o.customer_id = b.customer_id and o.worker_id = w.id and o.status = 'completed') then 15 else 0 end
    + case when b.cust_lang = any(w.languages) then 10 else 0 end
    + case when b.budget is null or w.rate_type = 'fixed' or w.hourly_rate is null
                or w.hourly_rate * coalesce(b.hours_est, 3) <= b.budget * 1.1 then 10 else 0 end
    + case when w.has_insurance then 5 else 0 end
    + case when w.id = b.preferred_worker_id then 100 else 0 end
    )::numeric(6,1) as score
  from public.workers w, b
  where w.status = 'approved' and w.available
    and b.service = any(w.services)
    and (b.zip = any(w.zips) or exists (select 1 from unnest(w.zips) z where left(z,4) = left(b.zip,4)) or w.id = b.preferred_worker_id)
    and w.id <> b.customer_id
  order by 2 desc, w.rating_count desc
  limit greatest(1, least(p_limit, 20));
$$;
revoke all on function public.rank_workers(uuid,int) from public, anon, authenticated;

create or replace function public.dispatch_booking(p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking;
  if v_b.id is null or v_b.status not in ('requested','offered') then return 0; end if;
  for r in select * from public.rank_workers(p_booking, case when v_b.urgency = 'asap' then 8 else 5 end) loop
    insert into public.job_offers(booking_id, worker_id, score) values (p_booking, r.worker_id, r.score)
      on conflict (booking_id, worker_id) do nothing;
    if found then
      n := n + 1;
      perform public._notify(r.worker_id, 'job_offer', jsonb_build_object(
        'booking_id', v_b.id, 'code', v_b.code, 'service', v_b.service, 'segment', v_b.segment,
        'zip', v_b.zip, 'city', v_b.city, 'scheduled_at', v_b.scheduled_at, 'hours_est', v_b.hours_est, 'budget', v_b.budget));
    end if;
  end loop;
  if n > 0 then update public.bookings set status = 'offered' where id = p_booking and status = 'requested'; end if;
  return n;
end $$;
revoke all on function public.dispatch_booking(uuid) from public, anon, authenticated;

create or replace function public.after_booking_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._audit('booking_created','booking',new.id::text, jsonb_build_object('code',new.code));
  perform public.dispatch_booking(new.id);
  return null;
end $$;
drop trigger if exists after_booking_insert on public.bookings;
create trigger after_booking_insert after insert on public.bookings for each row execute function public.after_booking_insert();

-- ───────────────────────── actions (RPC) ─────────────────────────
-- Cleaner: list my open offers (no street address, no customer contact until assigned).
create or replace function public.my_offers()
returns table(offer_id uuid, booking_id uuid, code text, segment text, service text, property_type text,
              bedrooms int, bathrooms int, sqft int, frequency text, zip text, city text, urgency text,
              scheduled_at timestamptz, hours_est numeric, budget numeric, notes text, score numeric,
              offer_status text, sent_at timestamptz, booking_status text)
language sql stable security definer set search_path = public as $$
  select o.id, b.id, b.code, b.segment, b.service, b.property_type, b.bedrooms, b.bathrooms, b.sqft, b.frequency,
         b.zip, b.city, b.urgency, b.scheduled_at, b.hours_est, b.budget, b.notes, o.score, o.status, o.sent_at, b.status
  from public.job_offers o join public.bookings b on b.id = o.booking_id
  where o.worker_id = auth.uid() and o.status = 'sent' and b.status in ('requested','offered')
  order by b.urgency = 'asap' desc, o.sent_at desc;
$$;

-- Cleaner: accept. First qualified cleaner to accept wins; everyone else's offer closes.
create or replace function public.accept_offer(p_offer uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_o public.job_offers; v_b public.bookings; v_w public.workers;
begin
  select * into v_o from public.job_offers where id = p_offer and worker_id = auth.uid();
  if v_o.id is null then raise exception 'not_found'; end if;
  select * into v_w from public.workers where id = auth.uid();
  if v_w.status <> 'approved' then raise exception 'not_approved'; end if;
  select * into v_b from public.bookings where id = v_o.booking_id for update;  -- lock: no double booking
  if v_b.status not in ('requested','offered') or v_o.status <> 'sent' then
    update public.job_offers set status = 'lost', responded_at = now() where id = p_offer and status = 'sent';
    return 'taken';
  end if;
  update public.bookings set status = 'assigned', worker_id = auth.uid(), assigned_at = now() where id = v_b.id;
  update public.job_offers set status = 'accepted', responded_at = now() where id = p_offer;
  update public.job_offers set status = 'lost', responded_at = now() where booking_id = v_b.id and id <> p_offer and status = 'sent';
  perform public._notify(v_b.customer_id, 'booking_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._audit('offer_accepted','booking',v_b.id::text, jsonb_build_object('worker',auth.uid()));
  return 'assigned';
end $$;

create or replace function public.decline_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b uuid;
begin
  update public.job_offers set status = 'declined', responded_at = now()
   where id = p_offer and worker_id = auth.uid() and status = 'sent' returning booking_id into v_b;
  if v_b is null then return; end if;
  -- If nobody is left holding an offer, widen the search to the next best cleaners.
  if not exists (select 1 from public.job_offers where booking_id = v_b and status = 'sent') then
    perform public.dispatch_booking(v_b);
  end if;
end $$;

create or replace function public.start_job(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'in_progress', started_at = now()
   where id = p_booking and worker_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'not_allowed'; end if;
end $$;

create or replace function public.complete_job(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_code text;
begin
  update public.bookings set status = 'completed', completed_at = now()
   where id = p_booking and worker_id = auth.uid() and status in ('assigned','in_progress')
   returning customer_id, code into v_c, v_code;
  if v_c is null then raise exception 'not_allowed'; end if;
  update public.workers set jobs_done = jobs_done + 1 where id = auth.uid();
  perform public._notify(v_c, 'booking_completed', jsonb_build_object('booking_id', p_booking, 'code', v_code));
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_w uuid; v_code text;
begin
  update public.bookings set status = 'cancelled', cancelled_at = now()
   where id = p_booking and (customer_id = auth.uid() or public.is_admin()) and status in ('requested','offered','assigned')
   returning worker_id, code into v_w, v_code;
  if not found then raise exception 'not_allowed'; end if;
  update public.job_offers set status = 'withdrawn', responded_at = now() where booking_id = p_booking and status = 'sent';
  if v_w is not null then perform public._notify(v_w, 'booking_cancelled', jsonb_build_object('booking_id', p_booking, 'code', v_code)); end if;
  perform public._audit('booking_cancelled','booking',p_booking::text);
end $$;

-- Customer: public cleaner directory (no phone, no email, first name + last initial only).
create or replace function public.list_workers(p_zip text default null, p_service text default null)
returns table(id uuid, display_name text, kind text, company_name text, bio text, services text[], languages text[],
              years_experience int, team_size int, has_insurance boolean, has_equipment boolean,
              rate_type text, hourly_rate numeric, rating_avg numeric, rating_count int, jobs_done int, available boolean, covers_zip boolean)
language sql stable security definer set search_path = public as $$
  select w.id,
         split_part(p.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(p.full_name,' ',2),1),'') || '.', ''),
         w.kind, w.company_name, w.bio, w.services, w.languages, w.years_experience, w.team_size, w.has_insurance, w.has_equipment,
         w.rate_type, w.hourly_rate, w.rating_avg, w.rating_count, w.jobs_done, w.available,
         coalesce(p_zip = any(w.zips), false)
  from public.workers w join public.profiles p on p.id = w.id
  where w.status = 'approved' and auth.uid() is not null
    and (p_service is null or p_service = any(w.services))
    and (p_zip is null or p_zip = any(w.zips) or exists (select 1 from unnest(w.zips) z where left(z,4) = left(p_zip,4)))
  order by coalesce(p_zip = any(w.zips), false) desc, w.available desc, w.rating_avg desc, w.jobs_done desc
  limit 50;
$$;

-- Customer: who is my cleaner (name + phone appear only after assignment).
create or replace function public.my_bookings()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) || jsonb_build_object(
    'worker', case when b.worker_id is not null then jsonb_build_object(
        'id', w.id, 'name', p.full_name, 'phone', p.phone, 'company_name', w.company_name,
        'rating_avg', w.rating_avg, 'rating_count', w.rating_count) end,
    'offers_sent', (select count(*) from public.job_offers o where o.booking_id = b.id),
    'reviewed', exists (select 1 from public.reviews r where r.booking_id = b.id))
  from public.bookings b
  left join public.workers w on w.id = b.worker_id
  left join public.profiles p on p.id = b.worker_id
  where b.customer_id = auth.uid()
  order by b.created_at desc;
$$;

-- Cleaner: my assigned jobs with address and customer contact.
create or replace function public.my_jobs()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) || jsonb_build_object('customer', jsonb_build_object('name', p.full_name, 'phone', p.phone),
     'review', (select jsonb_build_object('rating', r.rating, 'comment', r.comment) from public.reviews r where r.booking_id = b.id))
  from public.bookings b join public.profiles p on p.id = b.customer_id
  where b.worker_id = auth.uid() and b.status in ('assigned','in_progress','completed')
  order by (b.status = 'completed'), coalesce(b.scheduled_at, b.created_at);
$$;

create or replace function public.review_booking(p_booking uuid, p_rating int, p_comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_w uuid;
begin
  select worker_id into v_w from public.bookings where id = p_booking and customer_id = auth.uid() and status = 'completed';
  if v_w is null then raise exception 'not_allowed'; end if;
  insert into public.reviews(booking_id, customer_id, worker_id, rating, comment)
    values (p_booking, auth.uid(), v_w, greatest(1,least(5,p_rating)), left(coalesce(p_comment,''),600));
  update public.workers w set rating_count = s.c, rating_avg = s.a
    from (select count(*) c, round(avg(rating)::numeric,2) a from public.reviews where worker_id = v_w) s where w.id = v_w;
end $$;

-- Admin
create or replace function public.admin_set_worker_status(p_worker uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending','approved','rejected','suspended') then raise exception 'bad_status'; end if;
  update public.workers set status = p_status,
         approved_at = case when p_status = 'approved' then now() else approved_at end,
         available = case when p_status = 'approved' then available else false end
   where id = p_worker;
  perform public._notify(p_worker, 'worker_' || p_status, '{}'::jsonb);
  perform public._audit('worker_' || p_status, 'worker', p_worker::text);
end $$;

create or replace function public.admin_assign(p_booking uuid, p_worker uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if not exists (select 1 from public.workers where id = p_worker and status = 'approved') then raise exception 'worker_not_approved'; end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if v_b.status not in ('requested','offered','assigned') then raise exception 'not_allowed'; end if;
  update public.bookings set worker_id = p_worker, status = 'assigned', assigned_at = now() where id = p_booking;
  update public.job_offers set status = 'lost', responded_at = now() where booking_id = p_booking and status = 'sent' and worker_id <> p_worker;
  perform public._notify(p_worker, 'job_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._notify(v_b.customer_id, 'booking_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._audit('admin_assign','booking',p_booking::text, jsonb_build_object('worker',p_worker));
end $$;

create or replace function public.admin_redispatch(p_booking uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return public.dispatch_booking(p_booking);
end $$;

create or replace function public.admin_workers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(w) || jsonb_build_object('full_name', p.full_name, 'phone', p.phone, 'email', p.email, 'language', p.language)
  from public.workers w join public.profiles p on p.id = w.id
  where public.is_admin()
  order by (w.status = 'pending') desc, w.created_at desc;
$$;

create or replace function public.admin_bookings()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) || jsonb_build_object(
     'customer', jsonb_build_object('name', pc.full_name, 'phone', pc.phone, 'email', pc.email),
     'worker', case when b.worker_id is not null then jsonb_build_object('name', pw.full_name, 'phone', pw.phone) end,
     'offers', coalesce((select jsonb_agg(jsonb_build_object('worker_id', o.worker_id, 'name', px.full_name, 'phone', px.phone, 'status', o.status, 'score', o.score) order by o.score desc)
                from public.job_offers o join public.profiles px on px.id = o.worker_id where o.booking_id = b.id), '[]'::jsonb))
  from public.bookings b
  join public.profiles pc on pc.id = b.customer_id
  left join public.profiles pw on pw.id = b.worker_id
  where public.is_admin()
  order by b.created_at desc
  limit 300;
$$;

create or replace function public.admin_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'customers', (select count(*) from public.profiles where role = 'customer'),
    'workers_total', (select count(*) from public.workers),
    'workers_pending', (select count(*) from public.workers where status = 'pending'),
    'workers_approved', (select count(*) from public.workers where status = 'approved'),
    'workers_online', (select count(*) from public.workers where status = 'approved' and available),
    'bookings_open', (select count(*) from public.bookings where status in ('requested','offered')),
    'bookings_unmatched', (select count(*) from public.bookings b where b.status = 'requested'),
    'bookings_active', (select count(*) from public.bookings where status in ('assigned','in_progress')),
    'bookings_completed_30d', (select count(*) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'bookings_cancelled_30d', (select count(*) from public.bookings where status = 'cancelled' and cancelled_at > now() - interval '30 days'),
    'gmv_30d', (select coalesce(sum(budget),0) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
    'avg_rating', (select round(avg(rating)::numeric,2) from public.reviews),
    'low_reviews_30d', (select count(*) from public.reviews where rating <= 2 and created_at > now() - interval '30 days'),
    'top_zips_open', (select coalesce(jsonb_agg(z),'[]') from (select zip, count(*) n from public.bookings where status in ('requested','offered') group by zip order by n desc limit 5) z),
    'top_services_30d', (select coalesce(jsonb_agg(s),'[]') from (select service, count(*) n from public.bookings where created_at > now() - interval '30 days' group by service order by n desc limit 5) s),
    'whatsapp_queued', (select count(*) from public.notifications where channel = 'whatsapp' and status = 'queued')
  ) end;
$$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and channel = 'inapp' and read_at is null;
$$;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.bookings enable row level security;
alter table public.job_offers enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid()) or (select public.is_admin())) with check (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists workers_self_read on public.workers;
create policy workers_self_read on public.workers for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists workers_self_update on public.workers;
create policy workers_self_update on public.workers for update to authenticated using (id = (select auth.uid()) or (select public.is_admin())) with check (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using (customer_id = (select auth.uid()) or worker_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists bookings_customer_insert on public.bookings;
create policy bookings_customer_insert on public.bookings for insert to authenticated with check (
  customer_id = (select auth.uid()) and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'customer'));
drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update on public.bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists offers_read on public.job_offers;
create policy offers_read on public.job_offers for select to authenticated using (worker_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select to authenticated using (customer_id = (select auth.uid()) or worker_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using ((user_id = (select auth.uid()) and channel = 'inapp') or (select public.is_admin()));
drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using ((select public.is_admin()));

-- Lock down: anonymous visitors get nothing; signed-in users get only what the policies above allow.
-- (Supabase grants everything to anon/authenticated by default, so start from zero and add back.)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on sequence public.booking_code_seq, public.notifications_id_seq, public.audit_log_id_seq to authenticated;
grant select, update on public.profiles, public.workers to authenticated;
grant select, insert, update on public.bookings to authenticated;  -- update limited to admins by policy
grant select on public.job_offers, public.reviews, public.notifications, public.audit_log to authenticated;
grant execute on function public.is_admin(), public.is_admin_account(), public.my_offers(), public.accept_offer(uuid), public.decline_offer(uuid),
  public.start_job(uuid), public.complete_job(uuid), public.cancel_booking(uuid), public.list_workers(text,text),
  public.my_bookings(), public.my_jobs(), public.review_booking(uuid,int,text), public.admin_set_worker_status(uuid,text),
  public.admin_assign(uuid,uuid), public.admin_redispatch(uuid), public.admin_workers(), public.admin_bookings(),
  public.admin_stats(), public.mark_notifications_read() to authenticated;
-- Future tables/functions stay private unless granted on purpose.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Keep-alive: Supabase pauses free projects after a week without activity.
-- A GitHub Action calls this twice a week (see .github/workflows/supabase-keepalive.yml). Returns nothing private.
create or replace function public.ping() returns boolean language sql stable set search_path = public as $$ select true $$;
grant execute on function public.ping() to anon, authenticated;

-- Live updates in the app (new job offers pop up for cleaners without refreshing).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.job_offers; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
  end if;
end $$;
