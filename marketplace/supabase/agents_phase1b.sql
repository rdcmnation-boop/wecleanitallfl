-- Agent system, Phase 1b: owner-only write paths for the agent console. Additive.
-- Agents can only act while the owner is signed in with the 2-step code (is_admin()).
-- Class D never auto-runs: it only creates a pending approval for the owner.

create or replace function public.admin_log_agent_action(p_agent text, p_action text, p_class text, p_input_hash text, p_summary text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_reg public.agent_registry; v_id bigint;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_class not in ('A','B','C') then raise exception 'bad_class'; end if;
  select * into v_reg from public.agent_registry where agent = p_agent;
  if not found then raise exception 'unknown_agent'; end if;
  if v_reg.status <> 'active' then raise exception 'agent_paused'; end if;
  if p_class > v_reg.max_class then raise exception 'class_above_limit'; end if;
  insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
    values (p_agent, p_action, p_class, left(p_input_hash, 128), left(p_summary, 2000)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_request_approval(p_agent text, p_action text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_reg public.agent_registry; v_id uuid;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into v_reg from public.agent_registry where agent = p_agent;
  if not found then raise exception 'unknown_agent'; end if;
  if v_reg.status <> 'active' then raise exception 'agent_paused'; end if;
  if pg_column_size(coalesce(p_payload, '{}'::jsonb)) > 8000 then raise exception 'payload_too_large'; end if;
  insert into public.approvals(agent, action, payload) values (p_agent, p_action, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  perform public._audit('approval_requested', 'approval', v_id::text, jsonb_build_object('agent', p_agent, 'action', p_action));
  return v_id;
end $$;

revoke all on function public.admin_log_agent_action(text,text,text,text,text), public.admin_request_approval(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_log_agent_action(text,text,text,text,text), public.admin_request_approval(text,text,jsonb) to authenticated;
