-- ============================================================================
-- Tests for agents_phase1.sql.
-- Run AFTER the migration, in the same transaction or on a scratch copy.
-- It ends with RAISE EXCEPTION on purpose, so everything it creates (test
-- users, rows) is rolled back. Read the result from the error message:
--   DRYRUN_RESULT failures=0 | name: PASS | ...
-- ============================================================================

-- Run one statement as a role with given JWT claims. Returns 'ok' or the error text.
create function pg_temp.run_as(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $f$
declare v_out text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    execute p_sql;
    v_out := 'ok';
  exception when others then
    v_out := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $f$;

-- Count rows a role can see. Returns the number as text, or the error text.
create function pg_temp.count_as(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $f$
declare v_out text; v_n bigint;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    execute 'select count(*) from (' || p_sql || ') q' into v_n;
    v_out := v_n::text;
  exception when others then
    v_out := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $f$;

do $do$
declare
  res text[] := '{}';
  fails int := 0;
  r text;
  v_admin uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid;
  c_admin2 text; c_admin1 text; c_user text; c_anon text := '{"role":"anon"}';
begin
  c_admin2 := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_admin1 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_admin);
  c_user   := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_user);

  insert into auth.users(id, aud, role, email) values
    (v_admin, 'authenticated', 'authenticated', 'dryrun-admin-' || v_admin || '@example.invalid'),
    (v_user,  'authenticated', 'authenticated', 'dryrun-user-'  || v_user  || '@example.invalid');
  insert into public.admins(user_id) values (v_admin);

  -- ── seed ──
  select count(*) into r from public.agent_registry where status = 'paused' and max_class = 'A';
  res := res || ('seed_ten_paused_class_A: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);
  select count(*) into r from public.agent_registry;
  res := res || ('seed_total_ten: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── max_class can never be D or E ──
  r := pg_temp.run_as('postgres', '', $q$update public.agent_registry set max_class = 'D' where agent = 'finance'$q$);
  res := res || ('max_class_D_rejected: ' || case when r like '%check constraint%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', $q$update public.agent_registry set max_class = 'E' where agent = 'finance'$q$);
  res := res || ('max_class_E_rejected: ' || case when r like '%check constraint%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── append-only log ──
  insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
    values ('operations', 'summarize_open_bookings', 'A', 'abc123', 'test row');
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

  -- ── approvals immutability (direct table access as owner role) ──
  insert into public.approvals(agent, action, payload) values ('support', 'send_message', '{"to":"x"}') returning id into v_a1;
  r := pg_temp.run_as('postgres', '', format($q$update public.approvals set payload = '{"to":"y"}' where id = %L$q$, v_a1));
  res := res || ('approval_payload_frozen: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', format($q$update public.approvals set action = 'other_action' where id = %L$q$, v_a1));
  res := res || ('approval_action_frozen: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('postgres', '', format($q$delete from public.approvals where id = %L$q$, v_a1));
  res := res || ('approval_delete_blocked: ' || case when r like 'approvals_immutable%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── non-admin signed-in user ──
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

  -- ── anonymous ──
  r := pg_temp.count_as('anon', c_anon, 'select * from public.agent_registry');
  res := res || ('anon_registry_denied: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('anon', c_anon, $q$select * from public.admin_pending_approvals()$q$);
  res := res || ('anon_rpc_denied: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner without the 2-step code (aal1) ──
  r := pg_temp.run_as('authenticated', c_admin1, format($q$select public.admin_decide_approval(%L, 'approved', null)$q$, v_a1));
  res := res || ('admin_aal1_decide_blocked: ' || case when r = 'admin_only' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin1, 'select * from public.agent_registry');
  res := res || ('admin_aal1_sees_nothing: ' || case when r = '0' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner with 2-step code (aal2) ──
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.agent_registry');
  res := res || ('admin_aal2_sees_registry: ' || case when r = '10' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.admin_pending_approvals()');
  res := res || ('admin_aal2_sees_pending: ' || case when r = '1' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.count_as('authenticated', c_admin2, 'select * from public.admin_agent_log(10)');
  res := res || ('admin_aal2_reads_log: ' || case when r = '1' then 'PASS' else 'FAIL (' || r || ')' end);

  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'maybe', null)$q$, v_a1));
  res := res || ('decide_bad_status: ' || case when r = 'bad_status' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', '')$q$, v_a1));
  res := res || ('reject_needs_reason: ' || case when r = 'reason_required' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'approved', null)$q$, v_a1));
  res := res || ('admin_can_approve: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', 'changed my mind')$q$, v_a1));
  res := res || ('cannot_decide_twice: ' || case when r = 'not_pending' then 'PASS' else 'FAIL (' || r || ')' end);
  select count(*) into r from public.approvals where id = v_a1 and status = 'approved' and decided_by = v_admin and decided_at is not null;
  res := res || ('approval_records_decider: ' || case when r = '1' then 'PASS' else 'FAIL (' || r || ')' end);

  insert into public.approvals(agent, action) values ('pricing', 'raise_prices') returning id into v_a2;
  r := pg_temp.run_as('authenticated', c_admin2, format($q$select public.admin_decide_approval(%L, 'rejected', 'not now')$q$, v_a2));
  res := res || ('admin_can_reject_with_reason: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);

  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('operations', 'active')$q$);
  res := res || ('admin_activates_agent: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  select status into r from public.agent_registry where agent = 'operations';
  res := res || ('agent_status_is_active: ' || case when r = 'active' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('operations', 'paused')$q$);
  res := res || ('admin_pauses_agent: ' || case when r = 'ok' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('ghost', 'active')$q$);
  res := res || ('unknown_agent_rejected: ' || case when r = 'unknown_agent' then 'PASS' else 'FAIL (' || r || ')' end);
  r := pg_temp.run_as('authenticated', c_admin2, $q$select public.admin_set_agent_status('operations', 'turbo')$q$);
  res := res || ('set_status_bad_value: ' || case when r = 'bad_status' then 'PASS' else 'FAIL (' || r || ')' end);

  -- Even the owner cannot write the tables directly through the app role.
  r := pg_temp.run_as('authenticated', c_admin2, $q$update public.agent_registry set max_class = 'C'$q$);
  res := res || ('admin_cannot_raise_class_directly: ' || case when r like 'permission denied%' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── owner decisions leave an audit trail ──
  select count(*) into r from public.audit_log where action in ('approval_approved','approval_rejected','agent_active','agent_paused')
    and actor = v_admin;
  res := res || ('decisions_audited: ' || case when r = '4' then 'PASS' else 'FAIL (' || r || ')' end);

  -- ── tally ──
  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
