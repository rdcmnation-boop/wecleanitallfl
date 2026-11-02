-- ============================================================================
-- Live-safe version of agents_phase1_test.sql, for the real project.
-- Differences: uses the existing owner (the single-owner lock allows only one
-- admins row), does not assume agents are paused (the owner may have switched
-- them on), counts only audit rows written by this test, and also checks the
-- "remember this device" rule (trusted_device.sql).
-- Ends with RAISE EXCEPTION on purpose: everything it writes is rolled back.
-- Read the result from the error message:  DRYRUN_RESULT failures=0 total=N | ...
-- ============================================================================

create or replace function pg_temp.run_as(p_role text, p_claims text, p_sql text, p_headers text default '') returns text
language plpgsql as $f$
declare v_out text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    perform set_config('request.headers', p_headers, true);
    execute p_sql;
    v_out := 'ok';
  exception when others then
    v_out := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  return v_out;
end $f$;

-- Run a query that returns one value, as a role. Returns the value as text, or the error text.
create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text, p_headers text default '') returns text
language plpgsql as $f$
declare v_out text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    perform set_config('request.headers', p_headers, true);
    execute p_sql into v_out;
  exception when others then
    v_out := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '', true);
  return v_out;
end $f$;

create or replace function pg_temp.count_as(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $f$
begin
  return pg_temp.val_as(p_role, p_claims, 'select count(*)::text from (' || p_sql || ') q');
end $f$;

do $do$
declare
  res text[] := '{}';
  fails int := 0;
  r text;
  v_admin uuid;
  v_user uuid := gen_random_uuid();
  v_a1 uuid; v_a2 uuid;
  v_tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_pending_before int; v_log_before int;
  c_admin2 text; c_admin1 text; c_user text; c_anon text := '{"role":"anon"}';
  h_tok text;
begin
  select user_id into v_admin from public.admins limit 1;
  if v_admin is null then
    v_admin := gen_random_uuid();
    insert into auth.users(id, aud, role, email) values (v_admin, 'authenticated', 'authenticated', 'dryrun-admin-' || v_admin || '@example.invalid');
    insert into public.admins(user_id) values (v_admin);
  end if;
  insert into auth.users(id, aud, role, email) values (v_user, 'authenticated', 'authenticated', 'dryrun-user-' || v_user || '@example.invalid');

  c_admin2 := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_admin1 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_admin);
  c_user   := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_user);
  h_tok    := json_build_object('x-device-token', v_tok)::text;
  select count(*) into v_pending_before from public.approvals where status = 'pending';
  select count(*) into v_log_before from public.agent_actions;

  -- ── registry ──
  select count(*) into r from public.agent_registry;
  res := res || ('registry_has_ten: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);
  select count(*) into r from public.agent_registry where max_class in ('A','B','C');
  res := res || ('registry_classes_within_limit: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$update public.agent_registry set max_class = 'D' where agent = 'finance'$q$);
  res := res || ('max_class_D_rejected: ' || case when r like '%check constraint%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$update public.agent_registry set max_class = 'E' where agent = 'finance'$q$);
  res := res || ('max_class_E_rejected: ' || case when r like '%check constraint%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── single-owner lock ──
  r := pg_temp.run_as('postgres', '', format($q$insert into public.admins(user_id) values (%L)$q$, v_user));
  res := res || ('second_owner_blocked: ' || case when r like '%admins_single_owner%' or r like '%duplicate key%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── append-only log ──
  insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
    values ('operations', 'summarize_open_bookings', 'A', 'abc123', 'dry-run row');
  r := pg_temp.run_as('postgres', '', $q$update public.agent_actions set output_summary = 'changed'$q$);
  res := res || ('log_update_blocked: ' || case when r like 'append_only%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$delete from public.agent_actions$q$);
  res := res || ('log_delete_blocked: ' || case when r like 'append_only%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$truncate public.agent_actions$q$);
  res := res || ('log_truncate_blocked: ' || case when r like 'append_only%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$insert into public.agent_actions(agent, action, approval_class) values ('finance', 'pay_worker', 'D')$q$);
  res := res || ('log_class_D_needs_approval: ' || case when r like '%check constraint%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$insert into public.agent_actions(agent, action, approval_class) values ('nobody', 'x_action', 'A')$q$);
  res := res || ('log_unknown_agent_rejected: ' || case when r like '%foreign key%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── approvals are immutable ──
  insert into public.approvals(agent, action, payload) values ('support', 'send_message', '{"to":"x"}') returning id into v_a1;
  r := pg_temp.run_as('postgres', '', format($q$update public.approvals set payload = '{"to":"y"}' where id = %L$q$, v_a1));
  res := res || ('approval_payload_frozen: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', format($q$update public.approvals set action = 'other_action' where id = %L$q$, v_a1));
  res := res || ('approval_action_frozen: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', format($q$delete from public.approvals where id = %L$q$, v_a1));
  res := res || ('approval_delete_blocked: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── a signed-in customer ──
  r := pg_temp.count_as('authenticated', c_user, 'select * from public.agent_registry');
  res := res || ('user_sees_no_registry_rows: ' || case when r = '0' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_user, 'select * from public.approvals');
  res := res || ('user_sees_no_approvals: ' || case when r = '0' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_user, 'select * from public.agent_actions');
  res := res || ('user_sees_no_actions: ' || case when r = '0' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, $q$insert into public.approvals(agent, action) values ('finance', 'refund_all')$q$);
  res := res || ('user_cannot_insert_approval: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, format($q$update public.approvals set status = 'approved' where id = %L$q$, v_a1));
  res := res || ('user_cannot_update_approval: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, $q$update public.agent_registry set status = 'active'$q$);
  res := res || ('user_cannot_activate_agent: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, format($q$select public.admin_decide_approval(%L, 'approved', null)$q$, v_a1));
  res := res || ('user_rpc_decide_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, $q$select * from public.admin_agent_log(10)$q$);
  res := res || ('user_rpc_log_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, $q$select public.admin_set_agent_status('finance', 'active')$q$);
  res := res || ('user_rpc_set_status_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_user, $q$select public.admin_log_agent_action('finance','revenue_report','A','','x')$q$);
  res := res || ('user_rpc_log_action_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── anonymous visitor ──
  r := pg_temp.count_as('anon', c_anon, 'select * from public.agent_registry');
  res := res || ('anon_registry_denied: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('anon', c_anon, $q$select * from public.admin_pending_approvals()$q$);
  res := res || ('anon_rpc_denied: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner without the 2-step code ──
  r := pg_temp.run_as('authenticated', c_admin1, format($q$select public.admin_decide_approval(%L, 'approved', null)$q$, v_a1));
  res := res || ('owner_no_2step_decide_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin1, 'select * from public.agent_registry');
  res := res || ('owner_no_2step_sees_nothing: ' || case when r = '0' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── remember this device (owner): a trusted-device token stands in for the 2-step code ──
  insert into public.trusted_devices(user_id, token_hash, label) values (v_admin, sha256(convert_to(v_tok, 'utf8')), 'dry-run');
  r := pg_temp.val_as('authenticated', c_admin1, 'select public.is_admin()::text', h_tok);
  res := res || ('trusted_device_counts_as_2step: ' || case when r = 'true' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.val_as('authenticated', c_admin1, 'select public.is_admin()::text', json_build_object('x-device-token', 'x' || v_tok)::text);
  res := res || ('wrong_device_token_rejected: ' || case when r = 'false' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.val_as('authenticated', c_user, 'select public.is_admin()::text', h_tok);
  res := res || ('device_token_useless_for_others: ' || case when r = 'false' then 'PASS' else 'FAIL (' || r || ')' end);
  update public.trusted_devices set revoked_at = now() where user_id = v_admin and label = 'dry-run';
  r := pg_temp.val_as('authenticated', c_admin1, 'select public.is_admin()::text', h_tok);
  res := res || ('revoked_device_rejected: ' || case when r = 'false' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin1, $q$select public.admin_trust_device('x')$q$);
  res := res || ('trust_device_needs_2step: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner with the 2-step code ──
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.agent_registry');
  res := res || ('owner_sees_registry: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.admin_pending_approvals()');
  res := res || ('owner_sees_pending: ' || case when r = (v_pending_before + 1)::text then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.admin_agent_log(500)');
  res := res || ('owner_reads_log: ' || case when r = least(v_log_before + 1, 500)::text then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'maybe', null)$q$, v_a1));
  res := res || ('decide_bad_status: ' || case when r = 'bad_status' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', '')$q$, v_a1));
  res := res || ('reject_needs_reason: ' || case when r = 'reason_required' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'approved', null)$q$, v_a1));
  res := res || ('owner_can_approve: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', 'changed my mind')$q$, v_a1));
  res := res || ('cannot_decide_twice: ' || case when r = 'not_pending' then 'PASS' else 'FAIL (' || r || ')' end);
  select count(*) into r from public.approvals where id = v_a1 and status = 'approved' and decided_by = v_admin and decided_at is not null;
  res := res || ('approval_records_decider: ' || case when r = '1' then 'PASS' else 'FAIL (' || r || ')' end);
  insert into public.approvals(agent, action) values ('pricing', 'raise_prices') returning id into v_a2;
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', 'not now')$q$, v_a2));
  res := res || ('owner_can_reject_with_reason: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('operations', 'paused')$q$);
  res := res || ('owner_pauses_agent: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_log_agent_action('operations','ops_report','A','','x')$q$);
  res := res || ('paused_agent_cannot_log: ' || case when r = 'agent_paused' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('operations', 'active')$q$);
  res := res || ('owner_activates_agent: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_log_agent_action('operations','ops_report','B','','x')$q$);
  res := res || ('class_above_limit_rejected: ' || case when r = 'class_above_limit' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('ghost', 'active')$q$);
  res := res || ('unknown_agent_rejected: ' || case when r = 'unknown_agent' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$update public.agent_registry set max_class = 'C'$q$);
  res := res || ('owner_cannot_raise_class_directly: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner decisions leave an audit trail (only rows written by this test) ──
  select count(*) into r from public.audit_log
   where action in ('approval_approved','approval_rejected','agent_active','agent_paused') and actor = v_admin and created_at = now();
  res := res || ('decisions_audited: ' || case when r = '4' then 'PASS' else 'FAIL (' || r || ')' end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
