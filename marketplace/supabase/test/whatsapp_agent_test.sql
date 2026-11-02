-- ============================================================================
-- WhatsApp agent database rules (whatsapp_agent.sql). Safe on the real project:
-- ends with RAISE EXCEPTION on purpose, so everything it writes is rolled back.
-- Read the result from the error message:  DRYRUN_RESULT failures=0 total=N | ...
-- ============================================================================

create or replace function pg_temp.val_as(p_role text, p_claims text, p_sql text) returns text
language plpgsql as $f$
declare v_out text;
begin
  begin
    execute format('set local role %I', p_role);
    perform set_config('request.jwt.claims', p_claims, true);
    execute p_sql into v_out;
  exception when others then
    v_out := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $f$;

do $do$
declare
  res text[] := '{}'; fails int := 0; j jsonb; r text; b boolean;
  v_admin uuid; v_owner text;
  u_c uuid := gen_random_uuid(); u_w uuid := gen_random_uuid(); u_d1 uuid := gen_random_uuid(); u_d2 uuid := gen_random_uuid();
  v_bk uuid; v_bk2 uuid; v_code text; h text := 'dryrun_hash_' || replace(gen_random_uuid()::text, '-', '');
  c_admin2 text; c_admin1 text; c_user text; c_anon text := '{"role":"anon"}';
  procedure_ok boolean;
begin
  select user_id into v_admin from public.admins limit 1;
  select owner_whatsapp into v_owner from public.agent_settings where id = 1;
  c_admin2 := format('{"sub":"%s","role":"authenticated","aal":"aal2"}', v_admin);
  c_admin1 := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', v_admin);
  c_user   := format('{"sub":"%s","role":"authenticated","aal":"aal1"}', u_c);

  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (u_c,  'authenticated', 'authenticated', 'dryrun-c-'  || u_c  || '@example.invalid', '{"role":"customer","full_name":"Ana Test","phone":"(305) 555-0101","language":"es"}'),
    (u_w,  'authenticated', 'authenticated', 'dryrun-w-'  || u_w  || '@example.invalid', '{"role":"worker","full_name":"Mario Test","phone":"305.555.0102","language":"en"}'),
    (u_d1, 'authenticated', 'authenticated', 'dryrun-d1-' || u_d1 || '@example.invalid', '{"role":"customer","full_name":"Dup One","phone":"3055550103"}'),
    (u_d2, 'authenticated', 'authenticated', 'dryrun-d2-' || u_d2 || '@example.invalid', '{"role":"customer","full_name":"Dup Two","phone":"+1 305 555 0103"}');
  update public.workers set status = 'approved', available = true, whatsapp_opt_in = true where id = u_w;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', u_c), true); -- bookings take the customer from the session
  insert into public.bookings(customer_id, segment, service, zip, city, address, scheduled_at)
    values (u_c, 'residential', 'deep', '33101', 'Miami', '1 Test St', now() + interval '3 hours') returning id, code into v_bk, v_code;
  perform set_config('request.jwt.claims', '', true);
  update public.bookings set status = 'assigned', worker_id = u_w, assigned_at = now(), on_way_at = now() where id = v_bk;

  -- client: matched by the typed phone, sees only their own order
  j := public.wa_lookup('13055550101', h);
  res := res || ('client_role: ' || case when j->>'role' = 'customer' and j->>'name' = 'Ana' then 'PASS' else 'FAIL ' || j::text end);
  res := res || ('client_order: ' || case when j#>>'{ctx,order,code}' = v_code and j#>>'{ctx,order,cleaner}' = 'Mario' and (j#>>'{ctx,order,on_way}')::boolean
                                        and j#>'{ctx,order}' ? 'when' and not (j#>'{ctx,order}' ? 'address') then 'PASS' else 'FAIL ' || j::text end);
  res := res || ('client_10_digit_input: ' || case when public.wa_lookup('3055550101', h)->>'role' = 'customer' then 'PASS' else 'FAIL' end);

  -- cleaner: next job, no client details
  j := public.wa_lookup('+1 (305) 555-0102', h);
  res := res || ('cleaner_role: ' || case when j->>'role' = 'worker' and j->>'lang' = 'en' then 'PASS' else 'FAIL ' || j::text end);
  res := res || ('cleaner_next_job: ' || case when j#>>'{ctx,next_job,code}' = v_code and j#>>'{ctx,next_job,city}' = 'Miami'
                                          and not (j::text like '%Test St%') and not (j::text like '%Ana%') then 'PASS' else 'FAIL ' || j::text end);

  -- two accounts with the same number → unknown, nothing shown
  j := public.wa_lookup('13055550103', h);
  res := res || ('duplicate_phone_unknown: ' || case when j->>'role' = 'unknown' and j->'ctx' = '{}'::jsonb and j->>'user_id' is null then 'PASS' else 'FAIL ' || j::text end);
  -- …unless one of them verified that phone at sign-in
  update auth.users set phone = '13055550103', phone_confirmed_at = now() where id = u_d1;
  j := public.wa_lookup('13055550103', h);
  res := res || ('verified_phone_wins: ' || case when j->>'role' = 'customer' and (j->>'user_id')::uuid = u_d1 then 'PASS' else 'FAIL ' || j::text end);

  -- owner mode: only the stored owner number; changing the owner's profile phone does not move owner mode
  j := public.wa_lookup(v_owner, h);
  res := res || ('owner_number_owner_mode: ' || case when length(v_owner) >= 11 and j->>'role' = 'owner' and j->'ctx' ? 'today_jobs' and j->'ctx' ? 'ai' then 'PASS' else 'FAIL ' || coalesce(j::text, 'null') end);
  update public.profiles set phone = '3055550199' where id = v_admin;
  j := public.wa_lookup('13055550199', h);
  res := res || ('profile_phone_change_not_owner: ' || case when j->>'role' <> 'owner' then 'PASS' else 'FAIL ' || j::text end);
  update public.profiles set phone = '3055550101' where id = u_w;  -- a second profile claims the client's number
  j := public.wa_lookup('13055550101', h);
  res := res || ('claimed_number_hides_details: ' || case when j->>'role' = 'unknown' and j->'ctx' = '{}'::jsonb then 'PASS' else 'FAIL ' || j::text end);
  update public.profiles set phone = '305.555.0102' where id = u_w;

  -- chat log: Twilio retries are answered once; counts feed the limits; history is short and ordered
  b := public.wa_log(h, '0101', 'customer', u_c, 'in', '', 'hola', 'SM_DRYRUN_1');
  res := res || ('log_first: ' || case when b then 'PASS' else 'FAIL' end);
  b := public.wa_log(h, '0101', 'customer', u_c, 'in', '', 'hola', 'SM_DRYRUN_1');
  res := res || ('log_retry_rejected: ' || case when not b then 'PASS' else 'FAIL' end);
  perform public.wa_log(h, '0101', 'customer', u_c, 'out', 'menu', 'menu text', null);
  perform public.wa_log(h, '0101', 'customer', u_c, 'in', '', '1', 'SM_DRYRUN_2');
  j := public.wa_lookup('13055550102', h);
  res := res || ('rate_counts: ' || case when (j->>'n_hour')::int = 2 and (j->>'n_day')::int = 2 then 'PASS' else 'FAIL ' || j::text end);
  j := public.wa_history(h);
  res := res || ('history_order: ' || case when jsonb_array_length(j) = 3 and j->0->>'body' = 'hola' and j->2->>'body' = '1' and j->1->>'dir' = 'out' then 'PASS' else 'FAIL ' || j::text end);
  res := res || ('log_last4_digits_only: ' || case when (select phone_last4 from public.wa_messages where message_sid = 'SM_DRYRUN_1') = '0101' then 'PASS' else 'FAIL' end);

  -- talk to a person: one owner alert per person per day, answerable by the last 4 digits
  b := public.wa_handoff(h, '13055550101', 'customer', 'Ana', 'quiero cambiar mi cita');
  res := res || ('handoff_first: ' || case when b and exists (select 1 from public.agent_tasks where kind = 'wa_handoff' and status = 'open' and detail->>'phone' = '13055550101') then 'PASS' else 'FAIL' end);
  b := public.wa_handoff(h, '13055550101', 'customer', 'Ana', 'otra vez');
  res := res || ('handoff_deduped: ' || case when not b then 'PASS' else 'FAIL' end);
  j := public.wa_find_handoff('0101');
  res := res || ('find_handoff: ' || case when j->>'phone' = '13055550101' and j->>'hash' = left(h, 40) then 'PASS' else 'FAIL ' || j::text end);
  res := res || ('handoff_title_no_full_phone: ' || case when not exists (select 1 from public.agent_tasks where kind = 'wa_handoff' and title like '%3055550101%') then 'PASS' else 'FAIL' end);

  -- cleaner STOP
  b := public.wa_set_opt(u_w, false);
  res := res || ('cleaner_stop: ' || case when b and not (select whatsapp_opt_in from public.workers where id = u_w) then 'PASS' else 'FAIL' end);

  -- nobody but the server can call the WhatsApp functions or read the chat log
  r := pg_temp.val_as('anon', c_anon, $q$select public.wa_lookup('13055550101','x')::text$q$);
  res := res || ('anon_lookup_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.wa_lookup('13055550101','x')::text$q$);
  res := res || ('user_lookup_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_admin2, $q$select public.wa_find_handoff('0101')::text$q$);
  res := res || ('owner_session_find_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.wa_log('x0000000000000000','1','customer',null,'in','','x',null)::text$q$);
  res := res || ('user_log_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.wa_set_opt(gen_random_uuid(), true)::text$q$);
  res := res || ('user_opt_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.wa_handoff('x','1','customer','','')::text$q$);
  res := res || ('user_handoff_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.wa_history('x')::text$q$);
  res := res || ('user_history_denied: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_admin2, $q$select count(*)::text from public.wa_messages$q$);
  res := res || ('chat_table_closed_even_to_owner_session: ' || case when r like '%permission denied%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('service_role', '{"role":"service_role"}', $q$select public.wa_lookup('13055550101','x')->>'role'$q$);
  res := res || ('server_can_lookup: ' || case when r in ('customer', 'unknown', 'worker', 'owner') then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);

  -- changing the owner number needs the owner's 2-step session
  r := pg_temp.val_as('authenticated', c_user, $q$select public.admin_set_owner_whatsapp('3055550111')$q$);
  res := res || ('user_cannot_set_owner_number: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_admin1, $q$select public.admin_set_owner_whatsapp('3055550111')$q$);
  res := res || ('owner_without_2step_blocked: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_admin2, $q$select public.admin_set_owner_whatsapp('12')$q$);
  res := res || ('bad_number_rejected: ' || case when r like '%invalid_phone%' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  r := pg_temp.val_as('authenticated', c_admin2, $q$select public.admin_set_owner_whatsapp('(305) 555-0111')$q$);
  res := res || ('owner_2step_sets_number: ' || case when r = '0111' and (select owner_whatsapp from public.agent_settings where id = 1) = '13055550111' then 'PASS' else 'FAIL ' || coalesce(r, 'null') end);
  res := res || ('new_owner_number_owner_mode: ' || case when public.wa_lookup('13055550111', h)->>'role' = 'owner' and public.wa_lookup(v_owner, h)->>'role' <> 'owner' then 'PASS' else 'FAIL' end);

  -- Agents panel shows the last 4 digits and a reply phone only on open handoffs
  r := pg_temp.val_as('authenticated', c_admin2, $q$select public.admin_agent_overview()::text$q$);
  j := r::jsonb;
  res := res || ('overview_whatsapp: ' || case when j#>>'{settings,owner_whatsapp_last4}' = '0111' and j->'whatsapp' ? 'in_today'
                                           and exists (select 1 from jsonb_array_elements(j->'tasks') t where t->>'kind' = 'wa_handoff' and t->>'phone' = '13055550101')
                                           and not exists (select 1 from jsonb_array_elements(j->'tasks') t where t->>'kind' <> 'wa_handoff' and t->>'phone' is not null) then 'PASS' else 'FAIL ' || left(r, 300) end);
  r := pg_temp.val_as('authenticated', c_user, $q$select public.admin_agent_overview()::text$q$);
  res := res || ('overview_user_blocked: ' || case when r like '%admin_only%' then 'PASS' else 'FAIL ' || coalesce(left(r, 100), 'null') end);

  select count(*) into fails from unnest(res) x where x not like '%: PASS';
  raise exception 'DRYRUN_RESULT failures=% total=% | %', fails, array_length(res, 1), array_to_string(res, ' | ');
end $do$;
