-- Orchestration engine + booking lifecycle + duplicate protection + retries + AI permissions.
-- Synthetic people only. Ends with RAISE EXCEPTION, so everything is rolled back (safe on any project).
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


-- Job proof for suites that are not about the job itself: the checklist is ticked and two photo files are recorded
-- (a SIMULATED upload: rows in storage.objects; the real upload through the Storage API is proven by the end-to-end run).
create or replace function pg_temp.job_proof(p_b uuid) returns void language plpgsql as $f$
declare w text := (select worker_id::text from public.bookings where id = p_b);
begin
  update public.job_checklist_items set done_at = now() where booking_id = p_b;
  insert into storage.objects(bucket_id, name, owner_id) values ('job-photos', p_b || '/before/t1.jpg', w), ('job-photos', p_b || '/after/t2.jpg', w);
  insert into public.job_photos(booking_id, kind, path, uploaded_by) values (p_b, 'before', p_b || '/before/t1.jpg', w::uuid), (p_b, 'after', p_b || '/after/t2.jpg', w::uuid);
end $f$;

do $do$
declare res text[] := '{}'; fails int; r text; r2 text; n int; j bigint; j2 bigint; s text;
  v_admin uuid; u_c uuid := gen_random_uuid(); u_c2 uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_w2 uuid := gen_random_uuid();
  b1 uuid; b2 uuid; b3 uuid; b4 uuid;
  c_admin text; c_user text; c_user2 text; c_w text; c_w2 text;
  ins text := $q$insert into public.bookings(segment,service,zip,urgency,budget,hours_est) values ('residential','%s','%s','asap',%s,3) returning id::text$q$;
begin
  -- people (synthetic)
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (u_c,'authenticated','authenticated','t-c-'||u_c||'@example.invalid','{"role":"customer","full_name":"Test Customer","phone":"3055550101"}'),
    (u_c2,'authenticated','authenticated','t-c2-'||u_c2||'@example.invalid','{"role":"customer","full_name":"Other Customer","phone":"3055550102"}'),
    (u_w,'authenticated','authenticated','t-w-'||u_w||'@example.invalid','{"role":"worker","full_name":"Test Cleaner","phone":"3055550103"}'),
    (u_w2,'authenticated','authenticated','t-w2-'||u_w2||'@example.invalid','{"role":"worker","full_name":"Second Cleaner","phone":"3055550104"}');
  select user_id into v_admin from public.admins limit 1;
  if v_admin is null then
    v_admin := gen_random_uuid();
    insert into auth.users(id, aud, role, email, raw_user_meta_data) values
      (v_admin,'authenticated','authenticated','t-owner-'||v_admin||'@example.invalid','{"role":"customer","full_name":"Test Owner","phone":"3055550100"}');
    insert into public.admins(user_id) values (v_admin);
  end if;
  update public.workers set status='approved', available=true, services='{standard,deep}', zips='{33101,33130}' where id in (u_w, u_w2);
  c_admin := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_user := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_c);
  c_user2 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_c2);
  c_w := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_w);
  c_w2 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_w2);

  -- 1 creation + intake states
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33101', 160));
  begin b1 := r::uuid; exception when others then b1 := null; end;
  res := res || ('create_booking: ' || case when b1 is not null then 'PASS' else 'FAIL '||r end);
  select string_agg(coalesce(to_state,''), '>' order by id) into s from public.domain_events where aggregate_id = b1::text;
  res := res || ('intake_history: ' || case when s like 'REQUESTED>VALIDATED>PRICED>PROVIDER_MATCHING>OFFERED%' then 'PASS' else 'FAIL '||coalesce(s,'') end);
  res := res || ('state_offered: ' || case when (select workflow_state from public.bookings where id=b1)='OFFERED' then 'PASS' else 'FAIL' end);
  res := res || ('market_fee_total: ' || case when (select market_id='miami-dade' and service_fee=19.20 and total=179.20 from public.bookings where id=b1) then 'PASS' else 'FAIL' end);
  res := res || ('offers_to_both: ' || case when (select count(*) from public.job_offers where booking_id=b1)=2 then 'PASS' else 'FAIL' end);

  -- 2 duplicate booking protection
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33101', 160));
  res := res || ('duplicate_booking_blocked: ' || case when r like '%duplicate_booking%' then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'deep', '33101', 200));
  res := res || ('different_service_allowed: ' || case when r ~ '^[0-9a-f-]{36}$' then 'PASS' else 'FAIL '||r end);
  b2 := r::uuid;
  r := pg_temp.val_as('authenticated', c_user2, format(ins, 'standard', '33101', 160));
  res := res || ('other_customer_same_job_allowed: ' || case when r ~ '^[0-9a-f-]{36}$' then 'PASS' else 'FAIL '||r end);
  b3 := r::uuid;
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33130', 90));
  res := res || ('price_floor_enforced: ' || case when r like '%price_too_low%' then 'PASS' else 'FAIL '||r end);

  -- 3 assignment: first valid acceptance wins, second gets "taken"
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id=auth.uid()))$q$, b1));
  r2 := pg_temp.val_as('authenticated', c_w2, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id=auth.uid()))$q$, b1));
  res := res || ('first_accept_wins: ' || case when r='assigned' then 'PASS' else 'FAIL '||r end);
  res := res || ('second_accept_taken: ' || case when r2='taken' then 'PASS' else 'FAIL '||r2 end);
  res := res || ('one_worker_assigned: ' || case when (select worker_id from public.bookings where id=b1)=u_w then 'PASS' else 'FAIL' end);
  select string_agg(to_state, '>' order by id) into s from public.domain_events where aggregate_id=b1::text and id > (select min(id) from public.domain_events where aggregate_id=b1::text and to_state='OFFERED');
  res := res || ('accept_history: ' || case when s='ACCEPTED>ASSIGNED' then 'PASS' else 'FAIL '||coalesce(s,'') end);

  -- 4 service: start, complete, offline close
  r := pg_temp.val_as('authenticated', c_w2, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1));
  res := res || ('other_worker_cannot_start: ' || case when r like '%not_allowed%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1));
  res := res || ('worker_starts: ' || case when (select workflow_state from public.bookings where id=b1)='IN_PROGRESS' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  perform pg_temp.job_proof(b1);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b1));
  res := res || ('complete_closes_offline: ' || case when (select workflow_state from public.bookings where id=b1)='CLOSED_OFFLINE' then 'PASS' else 'FAIL '||coalesce(r,'null')||' '||(select workflow_state from public.bookings where id=b1) end);
  res := res || ('no_fake_payment_state: ' || case when not exists (select 1 from public.domain_events where aggregate_id=b1::text and to_state in ('PAYMENT_AUTHORIZED','PAYMENT_CAPTURED','SETTLED')) then 'PASS' else 'FAIL' end);

  -- 5 invalid transitions blocked, even for the owner
  r := pg_temp.val_as('authenticated', c_admin, format($q$update public.bookings set status='requested' where id='%s' returning status$q$, b1));
  res := res || ('completed_cannot_reopen: ' || case when r like '%invalid_transition%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- 6 cancellation
  r := pg_temp.val_as('authenticated', c_user2, format($q$select public.cancel_booking('%s')::text$q$, b2));
  res := res || ('other_customer_cannot_cancel: ' || case when (select status from public.bookings where id=b2) <> 'cancelled' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.cancel_booking('%s')::text$q$, b2));
  res := res || ('customer_cancels: ' || case when (select workflow_state from public.bookings where id=b2)='CANCELLED' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$update public.bookings set status='offered' where id='%s' returning status$q$, b2));
  res := res || ('cancelled_is_final: ' || case when r like '%invalid_transition%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'deep', '33101', 200));
  res := res || ('rebook_after_cancel_allowed: ' || case when r ~ '^[0-9a-f-]{36}$' then 'PASS' else 'FAIL '||r end);

  -- 7 owner override: needs attention, then assign
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_flag_attention('%s','customer called')::text$q$, b3));
  res := res || ('owner_flags_attention: ' || case when (select workflow_state from public.bookings where id=b3)='NEEDS_ATTENTION' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.admin_flag_attention('%s','x')::text$q$, b3));
  res := res || ('customer_cannot_override: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_assign('%s','%s')::text$q$, b3, u_w2));
  res := res || ('owner_assigns_after_attention: ' || case when (select worker_id=u_w2 and workflow_state='ASSIGNED' from public.bookings where id=b3) then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select jsonb_array_length(public.admin_booking_history('%s'))::text$q$, b3));
  res := res || ('owner_sees_history: ' || case when r::int >= 6 then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_booking_history('%s')->-1->>'actor'$q$, b3));
  res := res || ('override_logged_as_admin: ' || case when r='admin' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.admin_booking_history('%s')::text$q$, b3));
  res := res || ('customer_cannot_read_history: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL' end);

  -- 8 recovery: provider loses approval → back to matching, recorded
  update public.workers set status='suspended' where id=u_w2;
  res := res || ('suspension_redispatches: ' || case when (select status from public.bookings where id=b3) in ('requested','offered') and (select worker_id from public.bookings where id=b3) is null then 'PASS' else 'FAIL' end);
  res := res || ('suspension_in_history: ' || case when exists (select 1 from public.domain_events where aggregate_id=b3::text and from_state='ASSIGNED' and to_state='PROVIDER_MATCHING' and actor_type='system') then 'PASS' else 'FAIL' end);
  update public.workers set status='approved' where id=u_w2;
  -- suspended while a job is in progress: job stays, owner is alerted, the cleaner can no longer act on it
  r := pg_temp.val_as('authenticated', c_user2, format(ins, 'deep', '33130', 220));
  b4 := r::uuid;
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id=auth.uid()))$q$, b4));
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b4));
  update public.workers set status='suspended' where id=u_w;
  res := res || ('in_progress_suspension_alerts_owner: ' || case when exists (select 1 from public.agent_tasks where dedupe_key='in_progress_lost:'||b4) then 'PASS' else 'FAIL' end);
  perform pg_temp.job_proof(b4);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b4));
  res := res || ('suspended_cleaner_cannot_complete: ' || case when r like '%not_approved%' and (select status from public.bookings where id=b4)='in_progress' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.workers set status='approved' where id=u_w;

  -- 9 watchdog: stuck workflows get a person
  update public.bookings set state_changed_at = now() - interval '2 hours' where id=b3;
  perform set_config('test.dummy', 'x', true);
  r := (public.orchestration_watchdog()->>'stuck_alerts');
  res := res || ('watchdog_flags_stuck: ' || case when r::int >= 1 and exists (select 1 from public.agent_tasks where dedupe_key like 'stuck:'||b3||':%') then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := (public.orchestration_watchdog()->>'stuck_alerts');
  res := res || ('watchdog_no_duplicate_alert: ' || case when not exists (select 1 from public.agent_tasks where dedupe_key like 'stuck:'||b3||':%' group by dedupe_key having count(*)>1) then 'PASS' else 'FAIL' end);

  -- 10 duplicate external operations / payments
  j := public.outbox_enqueue('stripe.capture', b1::text, 'capture:'||b1, '{"amount":17920}');
  j2 := public.outbox_enqueue('stripe.capture', b1::text, 'capture:'||b1, '{"amount":17920}');
  res := res || ('payment_job_idempotent: ' || case when j = j2 and (select count(*) from public.outbox_jobs where idempotency_key='capture:'||b1)=1 then 'PASS' else 'FAIL' end);
  res := res || ('webhook_first_accepted: ' || case when public.inbox_record('stripe','evt_test_1','payment_intent.succeeded','{}') then 'PASS' else 'FAIL' end);
  res := res || ('webhook_duplicate_ignored: ' || case when not public.inbox_record('stripe','evt_test_1','payment_intent.succeeded','{}') then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.inbox_record('stripe','evt_fake','payment_intent.succeeded','{}')::text$q$);
  res := res || ('users_cannot_fake_webhook: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public._record_transition('%s','CLOSED_OFFLINE','SETTLED','payment','fake')::text$q$, b1));
  res := res || ('owner_cannot_fake_payment_state: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- 11 retries, backoff, dead letter, no double processing, crash recovery
  select count(*) into n from public.outbox_claim('stripe.capture', 10, 60);
  res := res || ('claim_once: ' || case when n=1 then 'PASS' else 'FAIL '||n end);
  select count(*) into n from public.outbox_claim('stripe.capture', 10, 60);
  res := res || ('no_double_claim: ' || case when n=0 then 'PASS' else 'FAIL '||n end);
  r := public.outbox_finish(j, false, 'timeout');
  res := res || ('failure_retries: ' || case when r='retry' and (select next_attempt_at > now() + interval '25 seconds' from public.outbox_jobs where id=j) then 'PASS' else 'FAIL '||r end);
  update public.outbox_jobs set next_attempt_at = now() - interval '1 second' where id=j;
  select count(*) into n from public.outbox_claim('stripe.capture', 10, 60);
  update public.outbox_jobs set lease_until = now() - interval '1 second' where id=j;
  select count(*) into n from public.outbox_claim('stripe.capture', 10, 60);
  res := res || ('crash_recovery_lease: ' || case when n=1 and (select attempts from public.outbox_jobs where id=j)=3 then 'PASS' else 'FAIL '||n end);
  update public.outbox_jobs set attempts = max_attempts where id=j;
  r := public.outbox_finish(j, false, 'card_declined');
  res := res || ('dead_letter_after_max: ' || case when r='dead' and exists (select 1 from public.agent_tasks where dedupe_key='outbox_dead:'||j) then 'PASS' else 'FAIL '||r end);

  -- 12 history is append-only and private
  begin
    update public.domain_events set to_state='SETTLED' where aggregate_id=b1::text;
    res := res || 'history_append_only: FAIL';
  exception when others then res := res || ('history_append_only: ' || case when sqlerrm like '%append_only%' then 'PASS' else 'FAIL '||sqlerrm end); end;
  r := pg_temp.val_as('authenticated', c_user, $q$select count(*)::text from public.domain_events$q$);
  res := res || ('history_closed_to_users: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('anon', '{"role":"anon"}', $q$select count(*)::text from public.outbox_jobs$q$);
  res := res || ('outbox_closed_to_anon: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- 13 controlled AI permissions
  update public.agent_registry set status='paused' where agent='finance';
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_log_agent_action('finance','daily_revenue','A','x','y')::text$q$);
  res := res || ('paused_agent_cannot_act: ' || case when r like '%agent_paused%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.agent_registry set status='active' where agent='finance';
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_log_agent_action('finance','daily_revenue','C','x','y')::text$q$);
  res := res || ('agent_class_limit: ' || case when r like '%class_above_limit%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.admin_set_agent_status('dispatch','active')::text$q$);
  res := res || ('user_cannot_control_agents: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  begin
    update public.agent_actions set output_summary='edited' where true;
    res := res || 'agent_log_append_only: FAIL';
  exception when others then res := res || ('agent_log_append_only: ' || case when sqlerrm like '%append_only%' then 'PASS' else 'FAIL '||sqlerrm end); end;

  -- 14 markets: only Miami-Dade and Broward take bookings
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33401', 160));
  res := res || ('palm_beach_closed: ' || case when r like '%market_not_open%' then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '32801', 160));
  res := res || ('orlando_closed: ' || case when r like '%market_not_open%' then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33301', 160));
  res := res || ('broward_open: ' || case when r ~ '^[0-9a-f-]{36}$' then 'PASS' else 'FAIL '||r end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
