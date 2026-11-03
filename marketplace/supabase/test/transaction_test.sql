-- Transaction v1: check-in → checklist → photos → check-out → capture → report → review/issue → payout hold → recurring.
-- Stripe events are SIMULATED here (same database calls the signed webhook makes); photo files are SIMULATED rows in
-- storage.objects (the real Storage API upload is proven by the end-to-end run). Synthetic people; rolled back at the end.
create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text) returns text language plpgsql as $f$
declare v_out text; begin begin execute format('set local role %I', p_role); perform set_config('request.jwt.claims', p_claims, true); execute p_sql into v_out;
exception when others then v_out := sqlerrm; end; reset role; perform set_config('request.jwt.claims', '', true); return v_out; end $f$;
create or replace function pg_temp.fake_upload(p_name text, p_owner uuid) returns void language sql as $f$
  insert into storage.objects(bucket_id, name, owner_id) values ('job-photos', p_name, p_owner::text);
$f$;

do $do$
declare res text[] := '{}'; fails int; r text; j jsonb; n int;
  v_admin uuid := gen_random_uuid(); u_c uuid := gen_random_uuid(); u_c2 uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_w2 uuid := gen_random_uuid();
  b1 uuid; b2 uuid; b3 uuid; s1 uuid; v1 uuid; v2 uuid; v3 uuid; iss bigint; iss2 bigint; c_admin text; c_c text; c_c2 text; c_w text; c_w2 text;
  ins_asap text := $q$insert into public.bookings(segment,service,zip,urgency,budget,hours_est) values ('residential','%s','%s','asap',%s,3) returning id::text$q$;
  accept text := $q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id=auth.uid()))::text$q$;
begin
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (v_admin,'authenticated','authenticated','t-o-'||v_admin||'@example.invalid','{"role":"customer","full_name":"TX Owner","phone":"3055550500"}'),
    (u_c,'authenticated','authenticated','t-c-'||u_c||'@example.invalid','{"role":"customer","full_name":"TX Customer","phone":"3055550501"}'),
    (u_c2,'authenticated','authenticated','t-c2-'||u_c2||'@example.invalid','{"role":"customer","full_name":"TX Other Customer","phone":"3055550502"}'),
    (u_w,'authenticated','authenticated','t-w-'||u_w||'@example.invalid','{"role":"worker","full_name":"TX Cleaner","phone":"3055550503"}'),
    (u_w2,'authenticated','authenticated','t-w2-'||u_w2||'@example.invalid','{"role":"worker","full_name":"TX Other Cleaner","phone":"3055550504"}');
  if not exists (select 1 from public.admins) then insert into public.admins(user_id) values (v_admin); else select user_id into v_admin from public.admins limit 1; end if;
  update public.workers set status='approved', available=true, services='{standard,deep}', zips='{33101,33301}' where id=u_w;
  update public.workers set status='approved', available=true, services='{office}', zips='{33190}' where id=u_w2;   -- never offered these jobs
  insert into public.payment_accounts(worker_id, stripe_account_id, details_submitted, payouts_enabled, livemode) values (u_w, 'acct_test_tx', true, true, false);
  update public.markets set payments_mode='stripe' where id='miami-dade';
  c_admin := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_c := format('{"sub":"%s","role":"authenticated"}', u_c);  c_c2 := format('{"sub":"%s","role":"authenticated"}', u_c2);
  c_w := format('{"sub":"%s","role":"authenticated"}', u_w);  c_w2 := format('{"sub":"%s","role":"authenticated"}', u_w2);

  -- booking b1 (Miami, card): pay → offered → accepted
  b1 := pg_temp.val_as('authenticated', c_c, format(ins_asap, 'deep', '33101', 220))::uuid;
  perform public.payment_authorized(b1, 'cs_test_tx1', 'pi_test_tx1', (select amount_cents from public.payments where booking_id=b1), false);
  r := pg_temp.val_as('authenticated', c_w, format(accept, b1));
  res := res || ('setup_assigned_after_payment: ' || case when (select status from public.bookings where id=b1)='assigned' and (select payment_status from public.bookings where id=b1)='authorized' then 'PASS' else 'FAIL '||coalesce(r,'') end);

  -- A. check-in
  r := pg_temp.val_as('anon', '{"role":"anon"}', format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1));
  res := res || ('anon_cannot_check_in: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_w2, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1));
  res := res || ('other_cleaner_cannot_check_in: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.start_job('%s')::text$q$, b1));
  res := res || ('start_without_check_in_refused: ' || case when r like '%check_in_required%' and (select status from public.bookings where id=b1)='assigned' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  j := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1))::jsonb;
  res := res || ('check_in_starts_job: ' || case when j->>'status'='checked_in' and j->>'flag' is null and (select workflow_state from public.bookings where id=b1)='IN_PROGRESS'
      and (j->>'items')::int >= 9 then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);
  res := res || ('check_in_tells_customer: ' || case when exists (select 1 from public.notifications where user_id=u_c and template='job_started') then 'PASS' else 'FAIL' end);
  j := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1))::jsonb;
  res := res || ('check_in_twice_is_safe: ' || case when j->>'status'='already_checked_in' then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);

  -- B. checklist, photos, proof rules
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b1));
  res := res || ('check_out_needs_checklist: ' || case when r like '%checklist_incomplete%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.checklist_mark(%s, true)::text$q$, (select min(id) from public.job_checklist_items where booking_id=b1)));
  res := res || ('customer_cannot_tick_checklist: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  n := 0;
  for r in select id::text from public.job_checklist_items where booking_id=b1 loop
    if pg_temp.val_as('authenticated', c_w, format($q$select public.checklist_mark(%s, true, 'ok')::text$q$, r)) like '%done_at%' then n := n + 1; end if;
  end loop;
  res := res || ('cleaner_ticks_checklist_timestamped: ' || case when n = (select count(*) from public.job_checklist_items where booking_id=b1)
      and not exists (select 1 from public.job_checklist_items where booking_id=b1 and (done_at is null or done_by <> u_w)) then 'PASS' else 'FAIL '||n end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b1));
  res := res || ('check_out_needs_before_photo: ' || case when r like '%before_photo_required%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public._job_photo_can_upload('%s/before/a.jpg')::text$q$, b1));
  res := res || ('storage_cleaner_may_upload: ' || case when r='true' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public._job_photo_can_upload('%s/before/a.jpg')::text$q$, b1));
  res := res || ('storage_customer_no_before_photo: ' || case when r='false' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w2, format($q$select public._job_photo_can_upload('%s/after/a.jpg')::text$q$, b1));
  res := res || ('storage_other_cleaner_refused: ' || case when r='false' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public._job_photo_can_upload('%s/before/../../x.jpg')::text$q$, b1));
  res := res || ('storage_bad_path_refused: ' || case when r='false' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'before', '%s/before/missing.jpg')::text$q$, b1, b1));
  res := res || ('photo_must_be_uploaded_first: ' || case when r like '%photo_not_uploaded%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  perform pg_temp.fake_upload(b1 || '/before/b1.jpg', u_w);
  perform pg_temp.fake_upload(b1 || '/after/a1.jpg', u_w);
  perform pg_temp.fake_upload(b1 || '/after/other.jpg', u_w2);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'after', '%s/after/other.jpg')::text$q$, b1, b1));
  res := res || ('photo_owned_by_someone_else_refused: ' || case when r like '%photo_not_uploaded%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'before', '%s/before/b1.jpg')::text$q$, b1, b1));
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'after', '%s/after/a1.jpg')::text$q$, b1, b1));
  res := res || ('photos_recorded: ' || case when (select count(*) from public.job_photos where booking_id=b1)=2 then 'PASS' else 'FAIL '||coalesce(r,'') end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public._job_photo_can_read('%s/after/a1.jpg')::text$q$, b1));
  res := res || ('customer_can_view_photos: ' || case when r='true' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_c2, format($q$select public._job_photo_can_read('%s/after/a1.jpg')::text$q$, b1));
  res := res || ('stranger_cannot_view_photos: ' || case when r='false' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.complete_job('%s')::text$q$, b1));
  res := res || ('complete_without_check_out_refused: ' || case when r like '%check_out_required%' and (select status from public.bookings where id=b1)='in_progress' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);

  -- D (part 1). customer reports a problem while the job is still in progress → owner escalation, payout will be held
  r := pg_temp.val_as('authenticated', c_c2, format($q$select public.report_issue('%s', 'quality', 'not my booking')::text$q$, b1));
  res := res || ('stranger_cannot_report_issue: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.report_issue('%s', 'missed_items', 'Guest bathroom was skipped')::text$q$, b1)); iss := r::bigint;
  res := res || ('issue_escalated_to_owner: ' || case when exists (select 1 from public.agent_tasks where dedupe_key='issue:'||iss and status='open') then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.report_issue('%s', 'missed_items', 'Guest bathroom was skipped again')::text$q$, b1));
  res := res || ('same_issue_twice_is_one: ' || case when r::bigint = iss and (select count(*) from public.job_issues where booking_id=b1)=1 then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- C. check-out → capture queued once → (simulated) capture → payout held by the open issue
  j := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s', 25.77, -80.19)::text$q$, b1))::jsonb;
  res := res || ('check_out_completes: ' || case when j->>'status'='checked_out' and (select status from public.bookings where id=b1)='completed' then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);
  j := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b1))::jsonb;
  res := res || ('check_out_twice_one_capture: ' || case when j->>'status'='already_checked_out' and (select count(*) from public.outbox_jobs where idempotency_key='capture:'||b1)=1 then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);
  r := public.payment_captured('pi_test_tx1', (select amount_cents from public.payments where booking_id=b1), 'ch_test_tx1');
  res := res || ('capture_recorded_ledger_balanced: ' || case when r='captured' and (select sum(amount_cents) from public.ledger_entries where booking_id=b1)=0 then 'PASS' else 'FAIL '||r end);
  res := res || ('payout_held_while_issue_open: ' || case when not exists (select 1 from public.outbox_jobs where idempotency_key='transfer:'||b1)
      and exists (select 1 from public.agent_tasks where dedupe_key='payout_held:'||b1) then 'PASS' else 'FAIL' end);

  -- completion report
  j := pg_temp.val_as('authenticated', c_c, format($q$select public.job_report('%s')::text$q$, b1))::jsonb;
  res := res || ('report_complete: ' || case when j->'times'->>'checked_in' is not null and j->'times'->>'checked_out' is not null and j->'cleaner'->>'name'='TX Cleaner'
      and jsonb_array_length(j->'checklist') >= 9 and jsonb_array_length(j->'photos')=2 and j->'payment'->>'status'='captured' and (j->'payment'->>'test_mode')::boolean
      and jsonb_array_length(j->'issues')=1 then 'PASS' else 'FAIL '||left(coalesce(j::text,'null'),200) end);
  r := pg_temp.val_as('authenticated', c_c2, format($q$select public.job_report('%s')::text$q$, b1));
  res := res || ('report_private: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_c, $q$select count(*)::text from public.job_photos$q$);
  res := res || ('tables_not_directly_readable: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);

  -- D (part 2). owner resolves → payout released; a low review opens a new quality issue
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.admin_resolve_issue(%s, 'reclean_scheduled', 'coming back Friday')$q$, iss));
  res := res || ('customer_cannot_resolve: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_resolve_issue(%s, 'reclean_scheduled', '')$q$, iss));
  res := res || ('resolve_needs_reason: ' || case when r like '%reason_required%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_resolve_issue(%s, 'reclean_scheduled', 'Ana returns Friday for the bathroom')$q$, iss));
  res := res || ('resolve_releases_payout: ' || case when r='resolved' and (select count(*) from public.outbox_jobs where idempotency_key='transfer:'||b1 and next_attempt_at <= now())=1 then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  res := res || ('reporter_told_resolved: ' || case when exists (select 1 from public.notifications where user_id=u_c and template='issue_resolved') then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.review_booking('%s', 2, 'still not great')::text$q$, b1));
  res := res || ('low_review_opens_issue: ' || case when exists (select 1 from public.job_issues where booking_id=b1 and status='open' and kind='quality') then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- check-in edge cases: too early for a scheduled visit; no location is allowed but flagged to the owner
  insert into public.bookings(customer_id, segment, service, zip, urgency, scheduled_at, budget, hours_est, status)
    values (u_c, 'residential', 'standard', '33101', 'scheduled', now() + interval '2 days', 160, 3, 'assigned') returning id into b2;  -- owner-created
  update public.bookings set worker_id = u_w where id = b2;
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b2));
  res := res || ('check_in_too_early_refused: ' || case when r like '%too_early%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  update public.bookings set scheduled_at = now() + interval '20 minutes' where id = b2;
  j := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', null, null)::text$q$, b2))::jsonb;
  res := res || ('no_location_flagged: ' || case when j->>'flag'='no_location' and exists (select 1 from public.agent_tasks where dedupe_key='checkin_flag:'||b2) then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);

  -- E. recurring (Broward is cash/offline in this test, so visits go straight to cleaners)
  v1 := pg_temp.val_as('authenticated', c_c, $q$insert into public.bookings(segment,service,zip,urgency,scheduled_at,budget,hours_est,frequency) values ('residential','standard','33301','scheduled', now() + interval '1 hour', 160, 3, 'weekly') returning id::text$q$)::uuid;
  s1 := (select series_id from public.bookings where id = v1);
  res := res || ('weekly_booking_starts_series: ' || case when s1 is not null and (select next_at from public.recurring_series where id=s1) = (select scheduled_at from public.bookings where id=v1) + interval '7 days' then 'PASS' else 'FAIL' end);
  j := pg_temp.val_as('authenticated', c_c, $q$select public.my_series()::text$q$)::jsonb;
  res := res || ('customer_sees_series: ' || case when j->0->'upcoming'->>'id' = v1::text then 'PASS' else 'FAIL '||left(coalesce(j::text,'null'),120) end);
  j := pg_temp.val_as('authenticated', c_c2, $q$select public.my_series()::text$q$)::jsonb;
  res := res || ('series_private: ' || case when jsonb_array_length(j)=0 then 'PASS' else 'FAIL' end);
  -- visit 1 done through the real job flow → visit 2 created a week later, same customer and price
  r := pg_temp.val_as('authenticated', c_w, format(accept, v1));
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 26.12, -80.14)::text$q$, v1));
  perform pg_temp.fake_upload(v1 || '/before/b.jpg', u_w); perform pg_temp.fake_upload(v1 || '/after/a.jpg', u_w);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'before', '%s/before/b.jpg')::text$q$, v1, v1));
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.register_job_photo('%s', 'after', '%s/after/a.jpg')::text$q$, v1, v1));
  update public.job_checklist_items set done_at = now(), done_by = u_w where booking_id = v1;
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, v1));
  select id into v2 from public.bookings where series_id = s1 and id <> v1;
  res := res || ('done_visit_creates_next: ' || case when v2 is not null and (select customer_id = u_c and budget = 160 and status in ('requested', 'offered')
      and scheduled_at = (select scheduled_at from public.bookings where id=v1) + interval '7 days' from public.bookings where id=v2) then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_c2, format($q$select public.series_update('%s', 'monthly', null)::text$q$, s1));
  res := res || ('stranger_cannot_change_series: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.series_update('%s', 'daily', null)::text$q$, s1));
  res := res || ('invalid_frequency_refused: ' || case when r like '%invalid_frequency%' then 'PASS' else 'FAIL '||left(coalesce(r,'null'),60) end);
  j := pg_temp.val_as('authenticated', c_c, format($q$select public.series_update('%s', 'biweekly', now() + interval '20 days')::text$q$, s1))::jsonb;
  res := res || ('customer_changes_frequency_and_time: ' || case when j->>'frequency'='biweekly' and (select frequency from public.recurring_series where id=s1)='biweekly' then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);
  -- skip: cancel the upcoming visit → the next one is created at the new time
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.cancel_booking('%s')::text$q$, v2));
  select id into v3 from public.bookings where series_id = s1 and id not in (v1, v2);
  res := res || ('skip_creates_following_visit: ' || case when v3 is not null and (select frequency from public.bookings where id=v3)='biweekly' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  -- pause: skipping while paused creates nothing; resume creates the next
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.series_pause('%s', true)$q$, s1));
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.cancel_booking('%s')::text$q$, v3));
  res := res || ('paused_series_creates_nothing: ' || case when (select count(*) from public.bookings where series_id=s1 and status not in ('completed','cancelled'))=0 then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.series_pause('%s', false)$q$, s1));
  res := res || ('resume_creates_next: ' || case when r='active' and (select count(*) from public.bookings where series_id=s1 and status in ('requested','offered'))=1 then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  -- a visit that can't be created (area closed) does not break the customer's action; the owner is told
  update public.recurring_series set template = jsonb_set(template, '{zip}', '"99999"') where id = s1;
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.cancel_booking('%s')::text$q$, (select id from public.bookings where series_id=s1 and status in ('requested','offered'))));
  res := res || ('spawn_failure_is_contained: ' || case when r is null or r = '' then 'PASS' else case when (select last_error from public.recurring_series where id=s1) is not null
      and exists (select 1 from public.agent_tasks where dedupe_key like 'series_error:'||s1||'%') then 'PASS' else 'FAIL '||coalesce(r,'null') end end);
  res := res || ('spawn_failure_reported: ' || case when (select last_error from public.recurring_series where id=s1) is not null
      and exists (select 1 from public.agent_tasks where dedupe_key like 'series_error:'||s1||'%') then 'PASS' else 'FAIL' end);
  update public.recurring_series set template = jsonb_set(template, '{zip}', '"33301"') where id = s1;
  r := pg_temp.val_as('authenticated', c_c, format($q$select public.series_pause('%s', false)$q$, s1));
  j := pg_temp.val_as('authenticated', c_c, format($q$select public.series_cancel('%s')::text$q$, s1))::jsonb;
  res := res || ('cancel_plan_cancels_upcoming: ' || case when j->>'status'='cancelled' and (j->>'visits_cancelled')::int=1
      and (select count(*) from public.bookings where series_id=s1 and status not in ('completed','cancelled'))=0 then 'PASS' else 'FAIL '||coalesce(j::text,'null') end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
