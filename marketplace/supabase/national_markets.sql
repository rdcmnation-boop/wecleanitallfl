-- ============================================================================
-- National marketplace foundation (Phase 2 + 11 of the master directive). Additive and re-runnable.
-- One national marketplace, many service markets. Nothing opens automatically:
-- a booking is accepted only inside a market whose status is 'active', and a market becomes active only
-- by the owner (2-step session) after every required launch-checklist item is done.
-- Jurisdiction rules (tax, insurance, compliance) are data, not code: no Florida assumptions in functions.
-- ============================================================================

-- ── geography ──
create table if not exists public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$')
);
create table if not exists public.states (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries(code),
  code text not null check (code ~ '^[A-Z]{2}$'),
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'onboarding', 'ready', 'active', 'paused', 'closed')),
  notes text not null default '',
  unique (country_code, code)
);
create table if not exists public.cities (
  id bigint generated always as identity primary key,
  state_id bigint not null references public.states(id),
  name text not null,
  county text not null default '',
  timezone text not null default 'America/New_York',
  unique (state_id, name)
);
create table if not exists public.markets (
  id text primary key check (id ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  state_id bigint not null references public.states(id),
  metro text not null default '',
  timezone text not null default 'America/New_York',
  status text not null default 'planned' check (status in ('planned', 'onboarding', 'ready', 'active', 'paused', 'closed')),
  dispatch_mode text not null default 'hybrid' check (dispatch_mode in ('auto', 'hybrid', 'admin')),
  dispatch_paused boolean not null default false,
  dispatch_radius_miles int not null default 25 check (dispatch_radius_miles between 1 and 200),
  requires_insurance boolean not null default false,
  required_compliance text[] not null default '{}',
  languages text[] not null default '{en,es}',
  launched_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);
-- A ZIP belongs to one market. Exact ZIPs win over 3-digit prefixes.
create table if not exists public.service_areas (
  id bigint generated always as identity primary key,
  market_id text not null references public.markets(id),
  kind text not null check (kind in ('zip', 'zip3')),
  value text not null check ((kind = 'zip' and value ~ '^[0-9]{5}$') or (kind = 'zip3' and value ~ '^[0-9]{3}$')),
  unique (kind, value)
);
create table if not exists public.market_pricing (
  market_id text not null references public.markets(id),
  service text not null,
  hourly_rate numeric(8,2) not null check (hourly_rate between 10 and 500),
  min_job numeric(8,2) not null check (min_job between 0 and 5000),
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (market_id, service)
);
create table if not exists public.tax_configurations (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries(code),
  state_code text not null,
  county text not null default '',
  segment text not null check (segment in ('residential', 'commercial', 'all')),
  rate_pct numeric(6,3) not null check (rate_pct between 0 and 20),
  applies_to text not null default 'service' check (applies_to in ('service', 'service_and_fee')),
  active boolean not null default false,
  source_note text not null default '',
  updated_at timestamptz not null default now()
);

-- ── providers ──
alter table public.workers add column if not exists provider_type text not null default 'individual'
  check (provider_type in ('wcia_team', 'individual', 'company'));
update public.workers set provider_type = 'company' where kind = 'company' and provider_type = 'individual';

create table if not exists public.provider_coverage (
  worker_id uuid not null references public.workers(id) on delete cascade,
  market_id text not null references public.markets(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  approved_at timestamptz,
  approved_by uuid,
  primary key (worker_id, market_id)
);
create table if not exists public.provider_compliance (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.workers(id) on delete cascade,
  requirement text not null check (requirement in ('id_verification', 'background_check', 'business_license', 'contractor_agreement', 'w9', 'other')),
  state_code text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected', 'expired')),
  document_path text not null default '',
  expires_on date,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.insurance_policies (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.workers(id) on delete cascade,
  kind text not null check (kind in ('general_liability', 'workers_comp', 'bond', 'auto')),
  carrier text not null default '',
  policy_number text not null default '',
  coverage_usd numeric(12,2),
  starts_on date,
  expires_on date not null,
  status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  document_path text not null default '',
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── market launch checklist ──
create table if not exists public.market_launch_checklists (
  market_id text not null references public.markets(id),
  item_key text not null,
  label text not null,
  required boolean not null default true,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid,
  note text not null default '',
  primary key (market_id, item_key)
);

-- ── commercial accounts ──
create table if not exists public.commercial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  owner_id uuid references public.profiles(id) on delete set null,
  billing_email text not null default '',
  terms text not null default 'per_job' check (terms in ('per_job', 'monthly', 'net30')),
  status text not null default 'prospect' check (status in ('prospect', 'proposal', 'active', 'paused', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.commercial_locations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.commercial_accounts(id) on delete cascade,
  name text not null default '',
  property_type text not null default '' check (char_length(property_type) <= 60),
  address text not null default '' check (char_length(address) <= 200),
  city text not null default '',
  state_code text not null default '',
  zip text not null check (zip ~ '^[0-9]{5}$'),
  market_id text references public.markets(id),
  sqft int check (sqft is null or sqft between 0 and 10000000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── bookings know their market, local time zone and tax ──
alter table public.bookings add column if not exists market_id text references public.markets(id);
alter table public.bookings add column if not exists local_tz text;
alter table public.bookings add column if not exists tax_pct numeric(6,3);
alter table public.bookings add column if not exists tax_amount numeric(10,2);
alter table public.bookings add column if not exists commercial_location_id uuid references public.commercial_locations(id);

-- Everything here is read and changed only through the functions below.
do $$ declare t text; begin
  foreach t in array array['countries','states','cities','markets','service_areas','market_pricing','tax_configurations',
    'provider_coverage','provider_compliance','insurance_policies','market_launch_checklists','commercial_accounts','commercial_locations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ── seeds: US, Florida, the two launch markets and the next three (planned, closed to bookings) ──
insert into public.countries(code, name) values ('US', 'United States') on conflict (code) do nothing;
insert into public.states(country_code, code, name, status) values ('US', 'FL', 'Florida', 'active') on conflict (country_code, code) do nothing;
insert into public.cities(state_id, name, county)
  select s.id, c.name, c.county from public.states s,
    (values ('Miami', 'Miami-Dade'), ('Fort Lauderdale', 'Broward'), ('West Palm Beach', 'Palm Beach'), ('Orlando', 'Orange'), ('Tampa', 'Hillsborough')) c(name, county)
   where s.code = 'FL' on conflict (state_id, name) do nothing;
insert into public.markets(id, name, state_id, metro, status, launched_at, notes)
  select m.id, m.name, s.id, m.metro, m.status, case when m.status = 'active' then now() end, m.notes from public.states s,
    (values ('miami-dade', 'Miami-Dade', 'South Florida', 'active', 'Initial launch market (operating before the checklist existed).'),
            ('broward', 'Broward', 'South Florida', 'active', 'Initial launch market (operating before the checklist existed).'),
            ('palm-beach', 'Palm Beach', 'South Florida', 'planned', 'Next Florida expansion.'),
            ('orlando', 'Orlando', 'Central Florida', 'planned', 'Subsequent expansion.'),
            ('tampa', 'Tampa Bay', 'West Florida', 'planned', 'Subsequent expansion.')) m(id, name, metro, status, notes)
   where s.code = 'FL' on conflict (id) do nothing;

-- ZIP coverage (prefix level, with Broward's 330xx/334xx ZIPs listed one by one). The owner can edit these.
insert into public.service_areas(market_id, kind, value) values
  ('miami-dade', 'zip3', '330'), ('miami-dade', 'zip3', '331'), ('miami-dade', 'zip3', '332'),
  ('broward', 'zip3', '333'), ('palm-beach', 'zip3', '334'),
  ('orlando', 'zip3', '327'), ('orlando', 'zip3', '328'), ('tampa', 'zip3', '335'), ('tampa', 'zip3', '336')
on conflict (kind, value) do nothing;
insert into public.service_areas(market_id, kind, value)
  select 'broward', 'zip', z from unnest(array['33004','33009','33019','33020','33021','33022','33023','33024','33025','33026','33027','33028',
    '33029','33060','33061','33062','33063','33064','33065','33066','33067','33068','33069','33071','33072','33073','33074','33075','33076',
    '33077','33081','33082','33083','33084','33093','33097','33441','33442','33443']) z
on conflict (kind, value) do nothing;

-- Prices per market (same as today's app prices to start; each market can differ).
insert into public.market_pricing(market_id, service, hourly_rate, min_job)
  select m.id, s.service, s.rate, 120 from public.markets m,
    (values ('standard', 45), ('airbnb', 45), ('office', 45), ('restaurant', 45), ('bank', 45), ('hotel', 45), ('building', 45),
            ('deep', 55), ('move', 55), ('post_construction', 55), ('windows', 55), ('carpet', 55)) s(service, rate)
on conflict (market_id, service) do nothing;

-- Florida taxes nonresidential (commercial) cleaning; residential cleaning is generally not taxed. Seeded OFF until an
-- accountant confirms rates and registration (state 6% + county discretionary surtax).
insert into public.tax_configurations(country_code, state_code, county, segment, rate_pct, active, source_note)
  select 'US', 'FL', c.county, 'commercial', c.rate, false, 'Florida nonresidential cleaning: 6% state + county surtax. Verify with an accountant and register with the Florida Department of Revenue before turning on.'
    from (values ('Miami-Dade', 7.0), ('Broward', 7.0), ('Palm Beach', 7.0), ('Orange', 6.5), ('Hillsborough', 7.5)) c(county, rate)
   where not exists (select 1 from public.tax_configurations t where t.state_code = 'FL' and t.county = c.county and t.segment = 'commercial');

-- The launch checklist every market gets.
create or replace function public._market_checklist(p_market text)
returns void language sql security definer set search_path = public as $$
  insert into public.market_launch_checklists(market_id, item_key, label) values
    (p_market, 'providers', 'Enough approved providers cover this market'),
    (p_market, 'operations', 'Operational readiness: dispatch tested, response times, supplies'),
    (p_market, 'insurance', 'Required insurance reviewed and verified'),
    (p_market, 'legal', 'Licensing, contractor classification and legal review for this state/county'),
    (p_market, 'tax', 'Tax rules reviewed (and turned on if they apply)'),
    (p_market, 'pricing', 'Local prices set'),
    (p_market, 'payments', 'Payment configuration reviewed'),
    (p_market, 'support', 'Customer support ready (language, hours, contact)')
  on conflict (market_id, item_key) do nothing;
$$;
select public._market_checklist(id) from public.markets;

-- ── which market serves a ZIP (public: shown before booking, no private data) ──
create or replace function public._market_of_zip(p_zip text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select market_id from public.service_areas where kind = 'zip' and value = p_zip),
    (select market_id from public.service_areas where kind = 'zip3' and value = left(p_zip, 3)));
$$;

create or replace function public.market_for_zip(p_zip text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when m.id is null then jsonb_build_object('found', false)
    else jsonb_build_object('found', true, 'market_id', m.id, 'name', m.name, 'state', s.code, 'timezone', m.timezone,
      'open', m.status = 'active', 'status', m.status,
      'pricing', (select coalesce(jsonb_object_agg(p.service, jsonb_build_object('hourly', p.hourly_rate, 'min', p.min_job)), '{}')
                    from public.market_pricing p where p.market_id = m.id and p.available)) end
    from (select public._market_of_zip(regexp_replace(coalesce(p_zip, ''), '\D', '', 'g')) id) x
    left join public.markets m on m.id = x.id left join public.states s on s.id = m.state_id;
$$;
revoke all on function public._market_of_zip(text) from public, anon, authenticated;
revoke all on function public._market_checklist(text) from public, anon, authenticated;
revoke all on function public.market_for_zip(text) from public;
grant execute on function public.market_for_zip(text) to anon, authenticated;

-- Each market names its main county (used to find county tax rules).
alter table public.markets add column if not exists county text not null default '';
update public.markets set county = x.c from (values ('miami-dade', 'Miami-Dade'), ('broward', 'Broward'), ('palm-beach', 'Palm Beach'),
  ('orlando', 'Orange'), ('tampa', 'Hillsborough')) x(id, c) where markets.id = x.id and markets.county = '';

-- ── every booking: market, local time zone, availability of the service, tax ──
create or replace function public._booking_market() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.markets; v_state text; v_tax numeric;
begin
  select * into m from public.markets where id = public._market_of_zip(new.zip);
  if m.id is null then raise exception 'not_in_service_area'; end if;
  -- Only active markets take bookings. The owner may place test bookings while a market is onboarding or ready.
  if m.status <> 'active' and not (public.is_admin() and m.status in ('onboarding', 'ready')) then raise exception 'market_not_open'; end if;
  if exists (select 1 from public.market_pricing p where p.market_id = m.id and p.service = new.service and not p.available) then
    raise exception 'service_not_offered_here';
  end if;
  new.market_id := m.id; new.local_tz := m.timezone;
  select s.code into v_state from public.states s where s.id = m.state_id;
  select t.rate_pct into v_tax from public.tax_configurations t
   where t.active and t.state_code = v_state and (t.county = '' or t.county = m.county)
     and t.segment in (new.segment, 'all')
   order by (t.county <> '') desc limit 1;
  new.tax_pct := v_tax;
  return new;
end $$;
revoke all on function public._booking_market() from public, anon, authenticated;
create or replace trigger a1_booking_market before insert on public.bookings for each row execute function public._booking_market();

-- Fee trigger now also computes tax (when a tax rule is on for this market).
create or replace function public._booking_fee() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_applies text;
begin
  if tg_op = 'INSERT' or new.fee_pct is null then
    select service_fee_pct into new.fee_pct from public.pay_settings where id = 1;
  else
    new.fee_pct := old.fee_pct; new.tax_pct := old.tax_pct;
  end if;
  if new.budget is null then
    new.service_fee := null; new.total := null; new.tax_amount := null;
  else
    new.service_fee := round(new.budget * coalesce(new.fee_pct, 0) / 100, 2);
    new.tax_amount := case when new.tax_pct is null then null else round(new.budget * new.tax_pct / 100, 2) end;
    new.total := new.budget + new.service_fee + coalesce(new.tax_amount, 0);
  end if;
  return new;
end $$;

-- ── dispatch rules: who may ever receive or be given a job ──
-- Returns null when the provider is eligible, otherwise the reason. Used by offers, acceptance and manual assignment,
-- so neither AI ranking nor the owner can hand a job to someone unapproved, unavailable, unqualified or out of area.
create or replace function public.provider_block_reason(p_worker uuid, p_booking uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare w public.workers; b public.bookings; m public.markets; req text;
begin
  select * into w from public.workers where id = p_worker;
  select * into b from public.bookings where id = p_booking;
  if w.id is null or b.id is null then return 'not_found'; end if;
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
revoke all on function public.provider_block_reason(uuid, uuid) from public, anon, authenticated;

-- Ranking (AI-assisted score). Only eligible providers are ranked. Factors: service area (exact ZIP > nearby),
-- rating, reliability (offer acceptance and completed jobs), experience, repeat customer, language,
-- team capacity for big commercial jobs, fit with the price, insurance, and the customer's preferred cleaner.
-- Distance/travel time use ZIP proximity until provider locations are stored (Phase 6).
create or replace function public.rank_workers(p_booking uuid, p_limit integer default 5)
returns table(worker_id uuid, score numeric) language sql stable security definer set search_path = public as $$
  with b as (
    select bk.*, p.language as cust_lang from public.bookings bk join public.profiles p on p.id = bk.customer_id where bk.id = p_booking
  ), acc as (
    select o.worker_id, count(*) filter (where o.status = 'accepted')::numeric / nullif(count(*) filter (where o.status in ('accepted', 'declined')), 0) as rate
      from public.job_offers o where o.sent_at > now() - interval '60 days' group by o.worker_id
  )
  select w.id,
    ( case when b.zip = any(w.zips) then 40
           when exists (select 1 from unnest(w.zips) z where left(z, 4) = left(b.zip, 4)) then 15 else 0 end
    + least(w.years_experience, 10) * 2
    + case when w.rating_count > 0 then w.rating_avg * 6 else 15 end
    + coalesce(acc.rate, 0.7) * 15
    + least(w.jobs_done, 50) * 0.2
    + case when exists (select 1 from public.bookings o where o.customer_id = b.customer_id and o.worker_id = w.id and o.status = 'completed') then 15 else 0 end
    + case when b.cust_lang = any(w.languages) then 10 else 0 end
    + case when b.segment = 'commercial' and coalesce(b.sqft, 0) > 3000 then least(coalesce(w.team_size, 1), 5) * 3 else 0 end
    + case when b.budget is null or w.rate_type = 'fixed' or w.hourly_rate is null
                or w.hourly_rate * coalesce(b.hours_est, 3) <= b.budget * 1.1 then 10 else 0 end
    + case when w.has_insurance then 5 else 0 end
    + case when w.id = b.preferred_worker_id then 100 else 0 end
    )::numeric(6,1) as score
  from public.workers w cross join b left join acc on acc.worker_id = w.id
  where public.provider_block_reason(w.id, b.id) is null
  order by 2 desc, w.rating_count desc
  limit greatest(1, least(p_limit, 20));
$$;

-- Dispatch modes per market: auto (offers go out, first acceptance wins), hybrid (same, owner can override and is
-- alerted when nobody takes it), admin (no automatic offers; the owner assigns). Paused dispatch sends nothing.
create or replace function public.dispatch_booking(p_booking uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_b public.bookings; m public.markets;
begin
  select * into v_b from public.bookings where id = p_booking;
  if v_b.id is null or v_b.status not in ('requested', 'offered') then return 0; end if;
  select * into m from public.markets where id = v_b.market_id;
  if m.id is not null and (m.dispatch_paused or m.dispatch_mode = 'admin') then
    perform public._agent_alert('dispatch', 'flag_unassigned', 'needs_assign:' || v_b.id,
      v_b.code || ' needs a cleaner: ' || case when m.dispatch_paused then 'dispatch is paused in ' else 'manual dispatch in ' end || m.name);
    return 0;
  end if;
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

-- Acceptance re-checks the rules at that moment; the row lock makes the first valid acceptance win.
create or replace function public.accept_offer(p_offer uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_o public.job_offers; v_b public.bookings; v_why text;
begin
  select * into v_o from public.job_offers where id = p_offer and worker_id = auth.uid();
  if v_o.id is null then raise exception 'not_found'; end if;
  select * into v_b from public.bookings where id = v_o.booking_id for update;
  if v_b.status not in ('requested', 'offered') or v_o.status <> 'sent' then
    update public.job_offers set status = 'lost', responded_at = now() where id = p_offer and status = 'sent';
    return 'taken';
  end if;
  v_why := public.provider_block_reason(auth.uid(), v_b.id);
  if v_why is not null then raise exception 'not_eligible: %', v_why; end if;
  update public.bookings set status = 'assigned', worker_id = auth.uid(), assigned_at = now() where id = v_b.id;
  update public.job_offers set status = 'accepted', responded_at = now() where id = p_offer;
  update public.job_offers set status = 'lost', responded_at = now() where booking_id = v_b.id and id <> p_offer and status = 'sent';
  perform public._notify(v_b.customer_id, 'booking_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._audit('offer_accepted', 'booking', v_b.id::text, jsonb_build_object('worker', auth.uid()));
  return 'assigned';
end $$;

-- Owner override: assign or replace a provider. The same rules apply (no exceptions for ineligible providers).
create or replace function public.admin_assign(p_booking uuid, p_worker uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_b public.bookings; v_why text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if v_b.status not in ('requested', 'offered', 'assigned') then raise exception 'not_allowed'; end if;
  v_why := public.provider_block_reason(p_worker, p_booking);
  if v_why is not null then raise exception 'not_eligible: %', v_why; end if;
  if v_b.worker_id is not null and v_b.worker_id <> p_worker then
    perform public._notify(v_b.worker_id, 'booking_cancelled', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  end if;
  update public.bookings set worker_id = p_worker, status = 'assigned', assigned_at = now(), on_way_at = null where id = p_booking;
  update public.job_offers set status = 'lost', responded_at = now() where booking_id = p_booking and status = 'sent' and worker_id <> p_worker;
  perform public._notify(p_worker, 'job_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._notify(v_b.customer_id, 'booking_assigned', jsonb_build_object('booking_id', v_b.id, 'code', v_b.code));
  perform public._audit('admin_assign', 'booking', p_booking::text, jsonb_build_object('worker', p_worker, 'replaced', v_b.worker_id));
end $$;

-- Owner: the providers who could take this booking right now, best first (for manual assignment).
create or replace function public.admin_candidates(p_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('worker_id', r.worker_id, 'score', r.score, 'name', p.full_name,
            'provider_type', w.provider_type, 'rating', w.rating_avg, 'jobs_done', w.jobs_done) order by r.score desc), '[]')
            from public.rank_workers(p_booking, 20) r join public.workers w on w.id = r.worker_id join public.profiles p on p.id = w.id);
end $$;

-- ── owner: national command center ──
create or replace function public.admin_markets()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'state', s.code, 'state_name', s.name, 'metro', m.metro, 'timezone', m.timezone, 'status', m.status,
      'dispatch_mode', m.dispatch_mode, 'dispatch_paused', m.dispatch_paused, 'requires_insurance', m.requires_insurance,
      'required_compliance', m.required_compliance, 'notes', m.notes, 'launched_at', m.launched_at,
      'zips', (select count(*) from public.service_areas a where a.market_id = m.id),
      'areas', (select coalesce(jsonb_agg(a.value order by a.kind desc, a.value), '[]') from public.service_areas a where a.market_id = m.id),
      'providers', (select count(*) from public.workers w where w.status = 'approved'
                      and (exists (select 1 from public.provider_coverage c where c.worker_id = w.id and c.market_id = m.id and c.status = 'approved')
                           or exists (select 1 from unnest(w.zips) z where public._market_of_zip(z) = m.id))),
      'bookings_30d', (select count(*) from public.bookings b where b.market_id = m.id and b.created_at > now() - interval '30 days'),
      'completed_30d', (select count(*) from public.bookings b where b.market_id = m.id and b.status = 'completed' and b.completed_at > now() - interval '30 days'),
      'open_now', (select count(*) from public.bookings b where b.market_id = m.id and b.status in ('requested', 'offered')),
      'checklist', (select coalesce(jsonb_agg(jsonb_build_object('key', c.item_key, 'label', c.label, 'required', c.required, 'done', c.done, 'note', c.note)
                      order by c.item_key), '[]') from public.market_launch_checklists c where c.market_id = m.id),
      'pricing', (select coalesce(jsonb_agg(jsonb_build_object('service', p.service, 'hourly', p.hourly_rate, 'min', p.min_job, 'available', p.available)
                      order by p.service), '[]') from public.market_pricing p where p.market_id = m.id),
      'county', m.county,
      'tax', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'segment', t.segment, 'county', t.county, 'rate', t.rate_pct, 'active', t.active, 'note', t.source_note)), '[]')
                from public.tax_configurations t where t.state_code = s.code and (t.county = '' or t.county = m.county))
    ) order by case m.status when 'active' then 0 when 'ready' then 1 when 'onboarding' then 2 when 'paused' then 3 when 'planned' then 4 else 5 end, m.name), '[]')
    from public.markets m join public.states s on s.id = m.state_id);
end $$;

create or replace function public.admin_set_market_status(p_market text, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.markets; v_missing text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('planned', 'onboarding', 'ready', 'active', 'paused', 'closed') then raise exception 'invalid_status'; end if;
  select * into m from public.markets where id = p_market for update;
  if m.id is null then raise exception 'not_found'; end if;
  if p_status in ('ready', 'active') and m.status <> 'active' then
    select string_agg(label, '; ') into v_missing from public.market_launch_checklists where market_id = p_market and required and not done;
    if v_missing is not null then raise exception 'checklist_incomplete: %', v_missing; end if;
  end if;
  update public.markets set status = p_status, launched_at = case when p_status = 'active' then coalesce(launched_at, now()) else launched_at end where id = p_market;
  perform public._audit('market_status', 'market', p_market, jsonb_build_object('from', m.status, 'to', p_status));
  return p_status;
end $$;

create or replace function public.admin_set_checklist(p_market text, p_item text, p_done boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.market_launch_checklists set done = p_done, done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end,
         note = coalesce(left(p_note, 300), note) where market_id = p_market and item_key = p_item;
  if not found then raise exception 'not_found'; end if;
  perform public._audit('market_checklist', 'market', p_market, jsonb_build_object('item', p_item, 'done', p_done));
end $$;

create or replace function public.admin_set_market(p_market text, p_dispatch_mode text, p_dispatch_paused boolean, p_requires_insurance boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_dispatch_mode is not null and p_dispatch_mode not in ('auto', 'hybrid', 'admin') then raise exception 'invalid_mode'; end if;
  update public.markets set dispatch_mode = coalesce(p_dispatch_mode, dispatch_mode), dispatch_paused = coalesce(p_dispatch_paused, dispatch_paused),
         requires_insurance = coalesce(p_requires_insurance, requires_insurance) where id = p_market;
  if not found then raise exception 'not_found'; end if;
  perform public._audit('market_settings', 'market', p_market, jsonb_build_object('mode', p_dispatch_mode, 'paused', p_dispatch_paused, 'insurance', p_requires_insurance));
end $$;

create or replace function public.admin_set_market_price(p_market text, p_service text, p_hourly numeric, p_min numeric, p_available boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  insert into public.market_pricing(market_id, service, hourly_rate, min_job, available) values (p_market, p_service, p_hourly, p_min, coalesce(p_available, true))
    on conflict (market_id, service) do update set hourly_rate = excluded.hourly_rate, min_job = excluded.min_job, available = excluded.available, updated_at = now();
  perform public._audit('market_price', 'market', p_market, jsonb_build_object('service', p_service, 'hourly', p_hourly, 'min', p_min, 'available', p_available));
end $$;

create or replace function public.admin_set_tax(p_id bigint, p_rate numeric, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.tax_configurations set rate_pct = coalesce(p_rate, rate_pct), active = coalesce(p_active, active), updated_at = now() where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform public._audit('tax_config', 'tax', p_id::text, jsonb_build_object('rate', p_rate, 'active', p_active));
end $$;

-- New market anywhere in the country (starts as 'planned', so it takes no bookings until launched).
create or replace function public.admin_create_market(p_id text, p_name text, p_state_code text, p_state_name text, p_timezone text, p_zip3 text[])
returns text language plpgsql security definer set search_path = public as $$
declare v_state bigint; z text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'invalid_timezone'; end if;
  insert into public.states(country_code, code, name) values ('US', upper(p_state_code), coalesce(nullif(p_state_name, ''), upper(p_state_code)))
    on conflict (country_code, code) do nothing;
  select id into v_state from public.states where country_code = 'US' and code = upper(p_state_code);
  insert into public.markets(id, name, state_id, timezone) values (lower(p_id), p_name, v_state, p_timezone);
  foreach z in array coalesce(p_zip3, '{}') loop
    insert into public.service_areas(market_id, kind, value) values (lower(p_id), case when length(z) = 5 then 'zip' else 'zip3' end, z);
  end loop;
  insert into public.market_pricing(market_id, service, hourly_rate, min_job)
    select lower(p_id), service, hourly_rate, min_job from public.market_pricing where market_id = 'miami-dade';
  perform public._market_checklist(lower(p_id));
  perform public._audit('market_created', 'market', lower(p_id), jsonb_build_object('name', p_name, 'state', p_state_code));
  return lower(p_id);
end $$;

create or replace function public.admin_set_coverage(p_worker uuid, p_market text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('pending', 'approved', 'suspended') then raise exception 'invalid_status'; end if;
  insert into public.provider_coverage(worker_id, market_id, status, approved_at, approved_by)
    values (p_worker, p_market, p_status, case when p_status = 'approved' then now() end, case when p_status = 'approved' then auth.uid() end)
    on conflict (worker_id, market_id) do update set status = excluded.status, approved_at = excluded.approved_at, approved_by = excluded.approved_by;
  perform public._audit('provider_coverage', 'worker', p_worker::text, jsonb_build_object('market', p_market, 'status', p_status));
end $$;

create or replace function public.admin_set_provider_type(p_worker uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.workers set provider_type = p_type where id = p_worker;
  if not found then raise exception 'not_found'; end if;
  perform public._audit('provider_type', 'worker', p_worker::text, jsonb_build_object('type', p_type));
end $$;

-- Providers keep their own type in sync with individual/company; only the owner can mark a We Clean It All team.
create or replace function public._worker_provider_type() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_admin() or current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if tg_op = 'UPDATE' and old.provider_type = 'wcia_team' then new.provider_type := 'wcia_team'; return new; end if;
  new.provider_type := case when new.kind = 'company' then 'company' else 'individual' end;
  return new;
end $$;
revoke all on function public._worker_provider_type() from public, anon, authenticated;
create or replace trigger b_worker_provider_type before insert or update on public.workers for each row execute function public._worker_provider_type();

do $$ declare f text; begin
  foreach f in array array['admin_candidates(uuid)', 'admin_markets()', 'admin_set_market_status(text,text)', 'admin_set_checklist(text,text,boolean,text)',
    'admin_set_market(text,text,boolean,boolean)', 'admin_set_market_price(text,text,numeric,numeric,boolean)', 'admin_set_tax(bigint,numeric,boolean)',
    'admin_create_market(text,text,text,text,text,text[])', 'admin_set_coverage(uuid,text,text)', 'admin_set_provider_type(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
