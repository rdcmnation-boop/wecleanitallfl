-- Payments v1 state machine + ledger + payout gate + messaging consent/retries.
-- Uses SIMULATED Stripe events (the same database calls the signed webhook makes). It tests OUR rules, not Stripe.
-- The real Stripe test-mode run is separate (see TEST_REPORT.md). Synthetic people only; rolled back at the end.
create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text) returns text language plpgsql as $f$
declare v_out text; begin begin execute format('set local role %I', p_role); perform set_config('request.jwt.claims', p_claims, true); execute p_sql into v_out;
exception when others then v_out := sqlerrm; end; reset role; perform set_config('request.jwt.claims', '', true); return v_out; end $f$;


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
declare res text[] := '{}'; fails int; r text; s text; n int; j bigint;
  v_admin uuid := gen_random_uuid(); u_c uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_g uuid := gen_random_uuid();
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; c_admin text; c_user text; c_w text;
  ins text := $q$insert into public.bookings(segment,service,zip,urgency,budget,hours_est) values ('residential','%s','%s','asap',%s,3) returning id::text$q$;
begin
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (v_admin,'authenticated','authenticated','t-o-'||v_admin||'@example.invalid','{"role":"customer","full_name":"Owner","phone":"3055550300"}'),
    (u_c,'authenticated','authenticated','t-c-'||u_c||'@example.invalid','{"role":"customer","full_name":"Pay Customer","phone":"3055550301"}'),
    (u_w,'authenticated','authenticated','t-w-'||u_w||'@example.invalid','{"role":"worker","full_name":"Pay Cleaner","phone":"3055550302"}');
  if not exists (select 1 from public.admins) then insert into public.admins(user_id) values (v_admin); else select user_id into v_admin from public.admins limit 1; end if;
  update public.workers set status='approved', available=true, services='{standard,deep}', zips='{33101}' where id=u_w;
  update public.markets set payments_mode='stripe' where id='miami-dade';
  c_admin := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_user := format('{"sub":"%s","role":"authenticated"}', u_c);
  c_w := format('{"sub":"%s","role":"authenticated"}', u_w);

  -- A. booking waits for payment; nobody is offered the job
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33101', 160)); b1 := r::uuid;
  res := res || ('unpaid_stops_at_priced: ' || case when (select workflow_state='PRICED' and payment_status='requires_payment' from public.bookings where id=b1) then 'PASS' else 'FAIL '||r end);
  res := res || ('unpaid_no_offers: ' || case when not exists (select 1 from public.job_offers where booking_id=b1) then 'PASS' else 'FAIL' end);
  res := res || ('payment_row_amount: ' || case when (select amount_cents from public.payments where booking_id=b1)=17920 then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_assign('%s','%s')::text$q$, b1, u_w));
  res := res || ('owner_cannot_assign_unpaid: ' || case when r like '%awaiting_payment%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.my_payment('%s')->>'status'$q$, b1));
  res := res || ('customer_sees_pay_now: ' || case when r='requires_payment' then 'PASS' else 'FAIL '||coalesce(r,'null') end);

  -- B. declined / failed card: nothing changes, owner told
  r := public.payment_failed(b1, 'card_declined');
  res := res || ('declined_keeps_unpaid: ' || case when r='flagged' and (select payment_status from public.bookings where id=b1)='requires_payment' then 'PASS' else 'FAIL '||r end);
  res := res || ('declined_alert: ' || case when exists (select 1 from public.agent_tasks where dedupe_key like 'payment_failed:'||b1||'%') then 'PASS' else 'FAIL' end);

  -- C. wrong amount and live-mode events are refused
  r := public.payment_authorized(b1, 'cs_test_x', 'pi_test_bad', 100, false);
  res := res || ('amount_mismatch_refused: ' || case when r='amount_mismatch' and (select payment_status from public.bookings where id=b1)='requires_payment' then 'PASS' else 'FAIL '||r end);
  r := public.payment_authorized(b1, 'cs_live_x', 'pi_live_x', 17920, true);
  res := res || ('live_mode_blocked: ' || case when r='live_mode_blocked' and (select status from public.payments where booking_id=b1)='requires_payment' then 'PASS' else 'FAIL '||r end);

  -- D. successful authorization → dispatch; duplicate webhook is a no-op
  r := public.payment_authorized(b1, 'cs_test_1', 'pi_test_1', 17920, false);
  res := res || ('authorized_then_dispatched: ' || case when r='authorized' and (select workflow_state from public.bookings where id=b1)='OFFERED' and exists (select 1 from public.job_offers where booking_id=b1) then 'PASS' else 'FAIL '||r end);
  r := public.payment_authorized(b1, 'cs_test_1', 'pi_test_1', 17920, false);
  res := res || ('duplicate_authorization_noop: ' || case when r='already_authorized' and (select count(*) from public.domain_events where aggregate_id=b1::text and to_state='PAYMENT_AUTHORIZED')=1 then 'PASS' else 'FAIL '||r end);
  res := res || ('customer_told_paid: ' || case when exists (select 1 from public.notifications where user_id=u_c and template='payment_authorized' and channel='email') then 'PASS' else 'FAIL' end);
  res := res || ('no_charge_before_work: ' || case when not exists (select 1 from public.ledger_entries where booking_id=b1) then 'PASS' else 'FAIL' end);

  -- E. job done → capture queued once; capture confirmed → ledger balanced; duplicate capture webhook no-op
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.accept_offer((select id from public.job_offers where booking_id='%s' and worker_id=auth.uid()))$q$, b1));
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_in('%s', 25.77, -80.19)::text$q$, b1));
  perform pg_temp.job_proof(b1);
  r := pg_temp.val_as('authenticated', c_w, format($q$select public.check_out('%s')::text$q$, b1));
  res := res || ('completion_queues_capture: ' || case when (select count(*) from public.outbox_jobs where idempotency_key='capture:'||b1)=1 and (select workflow_state from public.bookings where id=b1)='COMPLETED' then 'PASS' else 'FAIL '||coalesce(r,'') end);
  r := public.payment_captured('pi_test_1', 17920, 'ch_test_1');
  res := res || ('capture_recorded: ' || case when r='captured' and (select payment_status from public.bookings where id=b1)='captured' then 'PASS' else 'FAIL '||r end);
  res := res || ('ledger_balanced: ' || case when (select sum(amount_cents) from public.ledger_entries where entry_group='capture:'||b1)=0 then 'PASS' else 'FAIL' end);
  res := res || ('ledger_split_correct: ' || case when (select amount_cents from public.ledger_entries where entry_group='capture:'||b1 and account='provider_payable')=16000
       and (select amount_cents from public.ledger_entries where entry_group='capture:'||b1 and account='platform_fee')=1920 then 'PASS' else 'FAIL' end);
  r := public.payment_captured('pi_test_1', 17920, 'ch_test_1');
  res := res || ('duplicate_capture_noop: ' || case when r='already_captured' and (select count(*) from public.ledger_entries where booking_id=b1)=4 then 'PASS' else 'FAIL '||r end);

  -- F. payout gate: no transfer until approved + onboarded + payouts enabled + same mode
  res := res || ('payout_held_no_account: ' || case when not exists (select 1 from public.outbox_jobs where idempotency_key='transfer:'||b1) and exists (select 1 from public.agent_tasks where dedupe_key='payout_held:'||b1) then 'PASS' else 'FAIL' end);
  perform public.payment_account_update(u_w, 'acct_test123', false, false, false, false);
  res := res || ('gate_onboarding: ' || case when public.payout_block_reason(u_w, false)='onboarding_incomplete' then 'PASS' else 'FAIL' end);
  perform public.payment_account_update(u_w, 'acct_test123', true, true, false, false);
  res := res || ('gate_payouts_enabled: ' || case when public.payout_block_reason(u_w, false)='payouts_not_enabled' then 'PASS' else 'FAIL' end);
  perform public.payment_account_update(u_w, 'acct_test123', true, true, true, true);
  res := res || ('gate_mode_mismatch: ' || case when public.payout_block_reason(u_w, false)='mode_mismatch' then 'PASS' else 'FAIL' end);
  perform public.payment_account_update(u_w, 'acct_test123', true, true, true, false);
  update public.workers set status='suspended' where id=u_w;
  res := res || ('gate_owner_approval: ' || case when public.payout_block_reason(u_w, false)='cleaner_not_approved' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_release_payouts()::text$q$);
  res := res || ('release_refused_while_suspended: ' || case when r='0' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.workers set status='approved' where id=u_w;
  res := res || ('gate_all_pass: ' || case when public.payout_block_reason(u_w, false) is null then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.admin_release_payouts()::text$q$);
  res := res || ('customer_cannot_release: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL' end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_release_payouts()::text$q$);
  r := pg_temp.val_as('authenticated', c_admin, $q$select public.admin_release_payouts()::text$q$);
  res := res || ('release_queues_once: ' || case when (select count(*) from public.outbox_jobs where idempotency_key='transfer:'||b1)=1 then 'PASS' else 'FAIL' end);
  r := public.payment_transferred(b1, 'tr_test_1', 16000);
  res := res || ('transfer_settles: ' || case when r='settled' and (select workflow_state from public.bookings where id=b1)='SETTLED' and (select sum(amount_cents) from public.ledger_entries where entry_group='transfer:'||b1)=0 then 'PASS' else 'FAIL '||r end);
  r := public.payment_transferred(b1, 'tr_test_1', 16000);
  res := res || ('duplicate_transfer_noop: ' || case when r='already_transferred' then 'PASS' else 'FAIL '||r end);

  -- G. refunds: owner only, with reason, ledger reverses
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.admin_refund('%s', 17920, 'unhappy')$q$, b1));
  res := res || ('customer_cannot_refund: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_refund('%s', 99999, 'too much')$q$, b1));
  res := res || ('refund_over_total_refused: ' || case when r like '%invalid_amount%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.admin_refund('%s', 5000, 'missed bathroom')$q$, b1));
  res := res || ('owner_refund_queued: ' || case when r='refund_queued' and (select workflow_state from public.bookings where id=b1)='REFUND_PENDING' and exists (select 1 from public.outbox_jobs where idempotency_key='refund:'||b1||':5000') then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  res := res || ('refund_not_final_until_stripe: ' || case when not exists (select 1 from public.ledger_entries where booking_id=b1 and account='refunds') then 'PASS' else 'FAIL' end);
  r := public.payment_refunded('pi_test_1', 5000, 're_test_1');
  res := res || ('refund_recorded: ' || case when r='refunded' and (select sum(amount_cents) from public.ledger_entries where entry_group='refund:re_test_1')=0 then 'PASS' else 'FAIL '||r end);
  r := public.payment_refunded('pi_test_1', 5000, 're_test_1');
  res := res || ('duplicate_refund_noop: ' || case when r='already_recorded' then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_admin, $q$select (public.admin_ledger_check()->>'unbalanced_groups')$q$);
  res := res || ('reconciliation_all_balanced: ' || case when r='0' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  begin update public.ledger_entries set amount_cents = 0 where booking_id=b1; res := res || 'ledger_append_only: FAIL';
  exception when others then res := res || ('ledger_append_only: ' || case when sqlerrm like '%append_only%' then 'PASS' else 'FAIL' end); end;

  -- H. cancellations: unpaid cancel; paid-not-charged cancel releases the hold; pay-after-cancel releases
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'deep', '33101', 220)); b2 := r::uuid;
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.cancel_booking('%s')::text$q$, b2));
  res := res || ('cancel_unpaid: ' || case when (select payment_status from public.bookings where id=b2)='cancelled' and (select workflow_state from public.bookings where id=b2)='CANCELLED' then 'PASS' else 'FAIL '||coalesce(r,'') end);
  r := public.payment_authorized(b2, 'cs_test_2', 'pi_test_2', (select amount_cents from public.payments where booking_id=b2), false);
  res := res || ('pay_after_cancel_released: ' || case when r in ('cancelled_release', 'already_cancelled') and not exists (select 1 from public.job_offers where booking_id=b2) then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', c_user, format(ins, 'standard', '33130', 160)); b3 := r::uuid;
  r := public.payment_authorized(b3, 'cs_test_3', 'pi_test_3', 17920, false);
  r := pg_temp.val_as('authenticated', c_user, format($q$select public.cancel_booking('%s')::text$q$, b3));
  res := res || ('cancel_paid_releases_hold: ' || case when exists (select 1 from public.outbox_jobs where idempotency_key='cancel:'||b3) then 'PASS' else 'FAIL '||coalesce(r,'') end);
  r := public.payment_released('pi_test_3');
  res := res || ('hold_released_recorded: ' || case when r='released' and (select payment_status from public.bookings where id=b3)='cancelled' and not exists (select 1 from public.ledger_entries where booking_id=b3) then 'PASS' else 'FAIL '||r end);

  -- I. recovery: capture call fails → retried; webhooks for unknown objects are harmless
  update public.outbox_jobs set status='running', attempts=1 where idempotency_key='cancel:'||b3;
  r := public.outbox_finish((select id from public.outbox_jobs where idempotency_key='cancel:'||b3), false, 'stripe 503');
  res := res || ('stripe_outage_retries: ' || case when r='retry' then 'PASS' else 'FAIL '||r end);
  res := res || ('unknown_intent_harmless: ' || case when public.payment_captured('pi_unknown', 100, 'ch_x')='unknown_intent' then 'PASS' else 'FAIL' end);

  -- J. permissions: nobody but the webhook can move money states
  r := pg_temp.val_as('authenticated', c_admin, format($q$select public.payment_captured('pi_test_1', 1, 'x')$q$));
  res := res || ('owner_cannot_fake_capture: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select count(*)::text from public.payments$q$);
  res := res || ('payments_table_closed: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  r := pg_temp.val_as('anon', '{"role":"anon"}', $q$select count(*)::text from public.ledger_entries$q$);
  res := res || ('ledger_closed_to_anon: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL '||coalesce(r,'null') end);
  update public.markets set payments_mode='offline' where id='miami-dade';

  -- K. messaging: SMS consent, opt-out, retries
  insert into auth.users(id, aud, role, is_anonymous, raw_user_meta_data) values (u_g,'authenticated','authenticated',true,'{"role":"customer"}');
  update public.profiles set full_name='Guest NoConsent', phone='3055550303', email='' where id=u_g;
  r := pg_temp.val_as('authenticated', format('{"sub":"%s","role":"authenticated","is_anonymous":true}', u_g), format(ins, 'standard', '33101', 160)); b4 := r::uuid;
  res := res || ('no_sms_without_consent: ' || case when b4 is not null and not exists (select 1 from public.notifications where user_id=u_g and channel='sms') then 'PASS' else 'FAIL '||r end);
  r := pg_temp.val_as('authenticated', format('{"sub":"%s","role":"authenticated","is_anonymous":true}', u_g), $q$select public.set_sms_consent(true)::text$q$);
  perform public._notify(u_g, 'booking_assigned', jsonb_build_object('code', 'WC-T'));
  res := res || ('sms_with_consent: ' || case when exists (select 1 from public.notifications where user_id=u_g and channel='sms' and template='booking_assigned') then 'PASS' else 'FAIL '||coalesce(r,'') end);
  perform public.sms_opted_out(u_g);
  res := res || ('stop_drops_queued: ' || case when not exists (select 1 from public.notifications where user_id=u_g and channel='sms' and status='queued') then 'PASS' else 'FAIL' end);
  perform public._notify(u_g, 'booking_completed', jsonb_build_object('code', 'WC-T'));
  res := res || ('no_sms_after_stop: ' || case when not exists (select 1 from public.notifications where user_id=u_g and channel='sms' and template='booking_completed') then 'PASS' else 'FAIL' end);
  select id into j from public.notifications where user_id=u_c and channel='email' and status='queued' order by id limit 1;
  r := public.notification_result(j, false, 'resend 500');
  res := res || ('email_failure_retries: ' || case when r='retry' and (select next_attempt_at > now() and attempts=1 from public.notifications where id=j) then 'PASS' else 'FAIL '||r end);
  update public.notifications set attempts = 4 where id=j;
  r := public.notification_result(j, false, 'resend 500');
  res := res || ('email_gives_up_after_5: ' || case when r='failed' and exists (select 1 from public.agent_tasks where dedupe_key='msg_failed:'||j) then 'PASS' else 'FAIL '||r end);
  r := public.notification_result(j, true, null);
  res := res || ('result_after_final_ignored: ' || case when r='ignored' then 'PASS' else 'FAIL '||r end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
