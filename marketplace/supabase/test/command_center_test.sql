-- Admin Command Center (cc_* functions): who can call them, that filters/search/paging return the right rows,
-- that personal data is masked in lists, and that owner actions are validated, audited and notify people.
-- Synthetic people only. Everything is rolled back by the final RAISE (DRYRUN_RESULT ...).
create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text) returns text language plpgsql as $f$
declare v_out text; begin begin execute format('set local role %I', p_role); perform set_config('request.jwt.claims', p_claims, true); execute p_sql into v_out;
exception when others then v_out := sqlerrm; end; reset role; perform set_config('request.jwt.claims', '', true); return v_out; end $f$;

do $do$
declare res text[] := '{}'; fails int; r text; j jsonb;
  v_admin uuid := gen_random_uuid(); u_c uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_w2 uuid := gen_random_uuid();
  b1 uuid; b2 uuid; b3 uuid; acct uuid; c_admin text; c_admin_aal1 text; c_user text;
  ins text := $q$insert into public.bookings(segment,service,zip,urgency,budget,hours_est,scheduled_at) values ('%s','%s','%s','scheduled',%s,3, now() + interval '2 days') returning id::text$q$;
begin
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (v_admin,'authenticated','authenticated','t-o-'||v_admin||'@example.invalid','{"role":"customer","full_name":"CC Owner","phone":"3055550400"}'),
    (u_c,'authenticated','authenticated','t-c-'||u_c||'@example.invalid','{"role":"customer","full_name":"CC Zeta Customer","phone":"3055557788"}'),
    (u_w,'authenticated','authenticated','t-w-'||u_w||'@example.invalid','{"role":"worker","full_name":"CC Cleaner","phone":"3055550402"}'),
    (u_w2,'authenticated','authenticated','t-w2-'||u_w2||'@example.invalid','{"role":"worker","full_name":"CC Company Lead","phone":"3055550403"}');
  if not exists (select 1 from public.admins) then insert into public.admins(user_id) values (v_admin); else select user_id into v_admin from public.admins limit 1; end if;
  update public.workers set status='approved', available=true, services='{standard,deep}', zips='{33101}' where id=u_w;
  update public.workers set status='approved', available=true, services='{office}', zips='{33301}', provider_type='company', company_name='CC Test Co', team_size=3 where id=u_w2;
  c_admin := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_admin_aal1 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_admin);
  c_user := format('{"sub":"%s","role":"authenticated"}', u_c);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'residential', 'standard', '33101', 160)); b1 := r::uuid;
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'commercial', 'office', '33301', 360)); b2 := r::uuid;

  -- A. access control
  r := pg_temp.val_as('anon', '{"role":"anon"}', $q$select public.cc_overview(null)::text$q$);
  res := res || ('anon_refused: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.cc_overview(null)::text$q$);
  res := res || ('customer_refused: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.cc_customers('',1,25)::text$q$);
  res := res || ('customer_cannot_list_customers: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_admin_aal1, $q$select public.cc_finance('',1,25)::text$q$);
  res := res || ('owner_without_2step_refused: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.cc_cancel('%s','because')$q$, b1));
  res := res || ('customer_cannot_owner_cancel: ' || case when r like '%admin_only%' and (select status from public.bookings where id=b1)<>'cancelled' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);

  -- B. overview and lists
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_overview(null)::text$q$)::jsonb;
  res := res || ('overview_counts_open: ' || case when (j->'bookings'->>'open')::int >= 1 and j ? 'revenue' and j ? 'payments_mode' then 'PASS' else 'FAIL' end);
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_bookings('', '', '', 1, 1)::text$q$)::jsonb;
  res := res || ('bookings_paging: ' || case when jsonb_array_length(j->'rows')=1 and (j->>'total')::int >= 2 and (j->>'size')::int=1 then 'PASS' else 'FAIL '||left(j::text,80) end);
  j := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_bookings('%s', '', '', 1, 25)::text$q$, (select code from public.bookings where id=b2)))::jsonb;
  res := res || ('bookings_search_by_code: ' || case when (j->>'total')::int=1 and j->'rows'->0->>'id'=b2::text then 'PASS' else 'FAIL '||left(j::text,80) end);
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_bookings('', '', 'broward', 1, 50)::text$q$)::jsonb;
  res := res || ('bookings_market_filter: ' || case when not exists (select 1 from jsonb_array_elements(j->'rows') x where x->>'market' <> 'broward') and exists (select 1 from jsonb_array_elements(j->'rows') x where x->>'id'=b2::text) then 'PASS' else 'FAIL' end);
  j := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_booking_detail('%s')::text$q$, b1))::jsonb;
  res := res || ('detail_has_history: ' || case when jsonb_array_length(j->'history') >= 1 and j->'customer'->>'name'='CC Zeta Customer' then 'PASS' else 'FAIL' end);

  -- C. customers: masked list, search
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_customers('CC Zeta', 1, 25)::text$q$)::jsonb;
  res := res || ('customer_search_by_name: ' || case when (j->>'total')::int=1 then 'PASS' else 'FAIL '||left(j::text,80) end);
  res := res || ('customer_list_masks_phone: ' || case when not (j->'rows'->0 ? 'phone') and j->'rows'->0->>'phone_last4'='7788' then 'PASS' else 'FAIL '||left(j::text,120) end);
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_customers('5557788', 1, 25)::text$q$)::jsonb;
  res := res || ('customer_search_by_phone: ' || case when (j->>'total')::int=1 then 'PASS' else 'FAIL '||left(j::text,80) end);
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_customers('zz-no-such-person', 1, 25)::text$q$)::jsonb;
  res := res || ('non_digit_query_no_phone_match: ' || case when (j->>'total')::int=0 then 'PASS' else 'FAIL total='||(j->>'total') end);

  -- D. dispatch recommendation and providers
  j := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_dispatch('%s')::text$q$, b2))::jsonb;
  res := res || ('dispatch_labeled_recommendation: ' || case when j->>'basis' like 'RECOMMENDATION:%' then 'PASS' else 'FAIL' end);
  res := res || ('dispatch_recommends_eligible: ' || case when exists (select 1 from jsonb_array_elements(j->'recommended') x where x->>'worker_id'=u_w2::text) and not exists (select 1 from jsonb_array_elements(j->'recommended') x where x->>'worker_id'=u_w::text) then 'PASS' else 'FAIL '||left((j->'recommended')::text,120) end);
  res := res || ('dispatch_explains_blocked: ' || case when exists (select 1 from jsonb_array_elements(j->'blocked') x where x->>'worker_id'=u_w::text and x->>'reason' is not null) then 'PASS' else 'FAIL '||left((j->'blocked')::text,120) end);
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_providers('', '', 'company', 1, 50)::text$q$)::jsonb;
  res := res || ('providers_company_filter: ' || case when not exists (select 1 from jsonb_array_elements(j->'rows') x where x->>'type' <> 'company') and exists (select 1 from jsonb_array_elements(j->'rows') x where x->>'id'=u_w2::text) then 'PASS' else 'FAIL' end);
  res := res || ('providers_payout_gate_shown: ' || case when (select x->>'payout_block' from jsonb_array_elements(j->'rows') x where x->>'id'=u_w2::text) is not null then 'PASS' else 'FAIL' end);

  -- E. owner actions: validated, audited, people told
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_reschedule('%s', now() - interval '1 hour', 'customer asked')$q$, b1));
  res := res || ('reschedule_past_refused: ' || case when r like '%invalid_time%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_reschedule('%s', now() + interval '3 days', '')$q$, b1));
  res := res || ('reschedule_needs_reason: ' || case when r like '%reason_required%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_reschedule('%s', now() + interval '3 days', 'customer asked by phone')$q$, b1));
  res := res || ('reschedule_ok_event_audit: ' || case when r='rescheduled' and exists (select 1 from public.domain_events where aggregate_id=b1::text and event='booking.rescheduled')
      and exists (select 1 from public.audit_log where action='booking_rescheduled' and entity_id=b1::text) then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  res := res || ('reschedule_emails_customer: ' || case when exists (select 1 from public.notifications where user_id=u_c and template='booking_rescheduled' and channel='email') then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_cancel('%s','duplicate request')$q$, b1));
  res := res || ('owner_cancel_with_reason: ' || case when r='cancelled' and (select status from public.bookings where id=b1)='cancelled' and exists (select 1 from public.audit_log where action='booking_cancel_reason' and entity_id=b1::text) then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_reschedule('%s', now() + interval '3 days', 'too late now')$q$, b1));
  res := res || ('cancelled_cannot_reschedule: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);

  -- F. commercial pipeline
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_save_account(null, 'CC Test Tower', 'signed', 'monthly', 'a@example.invalid', '')::text$q$);
  res := res || ('account_bad_stage_refused: ' || case when r like '%invalid_status%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),80) end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_save_account(null, 'CC Test Tower', 'prospect', 'monthly', 'a@example.invalid', 'walkthrough')::text$q$); acct := r::uuid;
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.cc_save_account('%s', 'CC Test Tower', 'proposal', 'monthly', 'a@example.invalid', 'sent')::text$q$, acct));
  res := res || ('account_stage_change_audited: ' || case when (select status from public.commercial_accounts where id=acct)='proposal' and (select count(*) from public.audit_log where action='commercial_account_saved' and entity_id=acct::text)=2 then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- G. reports are counted from records
  j := pg_temp.val_as('authenticated', c_admin, $q$select public.cc_reports(30, null)::text$q$)::jsonb;
  res := res || ('reports_count_from_records: ' || case when (j->>'created')::int = (select count(*) from public.bookings where created_at > now() - interval '30 days') then 'PASS' else 'FAIL '||(j->>'created') end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
