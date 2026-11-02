-- National markets + dispatch rules (national_markets.sql). Safe on the real project: ends with RAISE EXCEPTION,
-- so everything is rolled back. Result on 2026-11-02: DRYRUN_RESULT failures=0 total=26.
create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $f$
declare v_out text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    execute p_sql into v_out;
  exception when others then v_out := sqlerrm; end;
  reset role; perform set_config('request.jwt.claims', '', true);
  return v_out;
end $f$;

do $do$
declare res text[] := '{}'; fails int; r text;
  v_admin uuid; u_c uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_w2 uuid := gen_random_uuid();
  b1 uuid; b_c text; c_admin text; c_user text; c_w text;
  ins text := $q$insert into public.bookings(customer_id,segment,service,zip,urgency,budget,hours_est) values (auth.uid(),'residential','standard','%s','asap',160,3.5) returning id::text$q$;
begin
  select user_id into v_admin from public.admins limit 1;
  c_admin := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_user := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_c);
  c_w := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_w);
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (u_c,'authenticated','authenticated','dryrun-nc-'||u_c||'@example.invalid','{"role":"customer","full_name":"Nat C","phone":"3055550170"}'),
    (u_w,'authenticated','authenticated','dryrun-nw-'||u_w||'@example.invalid','{"role":"worker","full_name":"Nat W","phone":"3055550171"}'),
    (u_w2,'authenticated','authenticated','dryrun-nw2-'||u_w2||'@example.invalid','{"role":"worker","full_name":"Far W","phone":"3055550172"}');
  update public.workers set status='approved', available=true, services='{standard,deep}', zips='{33101}' where id=u_w;
  update public.workers set status='approved', available=true, services='{standard}', zips='{32801}' where id=u_w2;
  res := res || ('zip_miami: ' || case when public.market_for_zip('33101')->>'market_id'='miami-dade' and (public.market_for_zip('33101')->>'open')::boolean then 'PASS' else 'FAIL' end);
  res := res || ('zip_broward_exact: ' || case when public.market_for_zip('33019')->>'market_id'='broward' then 'PASS' else 'FAIL' end);
  res := res || ('zip_broward_prefix: ' || case when public.market_for_zip('33301')->>'market_id'='broward' then 'PASS' else 'FAIL' end);
  res := res || ('zip_orlando_closed: ' || case when public.market_for_zip('32801')->>'open'='false' then 'PASS' else 'FAIL' end);
  res := res || ('zip_california_none: ' || case when public.market_for_zip('90210')->>'found'='false' then 'PASS' else 'FAIL' end);
  res := res || ('anon_can_check_zip: ' || case when pg_temp.val_as('anon','{"role":"anon"}',$q$select public.market_for_zip('33101')->>'market_id'$q$)='miami-dade' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_user, format(ins,'33101'));
  begin b1 := r::uuid; exception when others then b1 := null; end;
  res := res || ('book_miami_ok: ' || case when b1 is not null then 'PASS' else 'FAIL '||r end);
  select market_id||'/'||local_tz into b_c from public.bookings where id=b1;
  res := res || ('booking_market_tz: ' || case when b_c='miami-dade/America/New_York' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_user, format(ins,'32801'));
  res := res || ('book_orlando_blocked: ' || case when r like '%market_not_open%' then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_user, format(ins,'90210'));
  res := res || ('book_outside_blocked: ' || case when r like '%not_in_service_area%' then 'PASS' else 'FAIL '||r end);
  res := res || ('offer_to_local_worker: ' || case when exists(select 1 from public.job_offers where booking_id=b1 and worker_id=u_w) then 'PASS' else 'FAIL' end);
  res := res || ('no_offer_to_orlando_worker: ' || case when not exists(select 1 from public.job_offers where booking_id=b1 and worker_id=u_w2) then 'PASS' else 'FAIL' end);
  res := res || ('reason_outside: ' || case when public.provider_block_reason(u_w2,b1)='outside_service_area' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_assign('%s','%s')::text$q$, b1, u_w2));
  res := res || ('admin_cannot_assign_out_of_area: ' || case when r like '%not_eligible: outside_service_area%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.workers set available=false where id=u_w;
  res := res || ('reason_unavailable: ' || case when public.provider_block_reason(u_w,b1)='not_available' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id='%s'))$q$, b1, u_w));
  res := res || ('offline_worker_cannot_accept: ' || case when r like '%not_eligible: not_available%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.workers set available=true where id=u_w;
  update public.markets set requires_insurance=true where id='miami-dade';
  res := res || ('insurance_required: ' || case when public.provider_block_reason(u_w,b1)='insurance_missing' then 'PASS' else 'FAIL' end);
  insert into public.insurance_policies(worker_id,kind,expires_on,status) values (u_w,'general_liability',current_date+30,'verified');
  res := res || ('insurance_verified_ok: ' || case when public.provider_block_reason(u_w,b1) is null then 'PASS' else 'FAIL' end);
  update public.markets set requires_insurance=false where id='miami-dade';
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id='%s'))$q$, b1, u_w));
  res := res || ('eligible_accept_wins: ' || case when r='assigned' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.markets set dispatch_mode='admin' where id='broward';
  r := pg_temp.val_as('authenticated', c_user, format(ins,'33301'));
  res := res || ('admin_mode_no_offers: ' || case when not exists(select 1 from public.job_offers where booking_id=r::uuid) and exists(select 1 from public.agent_tasks where dedupe_key='needs_assign:'||r) then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_set_market_status('orlando','active')$q$);
  res := res || ('activation_needs_checklist: ' || case when r like '%checklist_incomplete%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.market_launch_checklists set done=true where market_id='orlando';
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_set_market_status('orlando','active')$q$);
  res := res || ('activation_after_checklist: ' || case when r='active' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.admin_set_market_status('tampa','active')$q$);
  res := res || ('user_cannot_activate: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select count(*)::text from public.markets$q$);
  res := res || ('tables_closed_to_users: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select jsonb_array_length(public.admin_markets())::text$q$);
  res := res || ('owner_sees_markets: ' || case when r='5' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w, $q$update public.workers set provider_type='wcia_team' where id=auth.uid() returning provider_type$q$);
  res := res || ('worker_cannot_self_promote: ' || case when coalesce(r,'') <> 'wcia_team' then 'PASS' else 'FAIL' end);
  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res,1), array_to_string(res,' | ');
end $do$;
