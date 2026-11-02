-- Agents retention (owner decision: audit and agent logs 1 year, chat questions 90 days).
-- NOT APPLIED YET: the confirmation for this change was cancelled from the phone app. Nothing is old enough to delete
-- until November 2027. Apply it from a computer: Supabase → SQL Editor → paste this file → Run.

-- ── retention: audit and agent logs 1 year, chat questions 90 days. Only rows past the period can be deleted. ──
create or replace function public._agent_actions_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and current_setting('wcia.retention', true) = 'on'
     and old.created_at < now() - make_interval(days => (select audit_retention_days from public.agent_settings where id = 1)) then
    return old;
  end if;
  raise exception 'append_only: agent_actions cannot be changed or deleted';
end $$;

create or replace function public._approvals_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('wcia.retention', true) = 'on' and old.status <> 'pending'
       and coalesce(old.decided_at, old.requested_at) < now() - make_interval(days => (select audit_retention_days from public.agent_settings where id = 1)) then
      return old;
    end if;
    raise exception 'approvals_immutable: approvals cannot be deleted';
  end if;
  if old.status <> 'pending' then
    raise exception 'approvals_immutable: a decided approval cannot change';
  end if;
  if new.id <> old.id or new.agent <> old.agent or new.action <> old.action
     or new.payload <> old.payload or new.requested_at <> old.requested_at then
    raise exception 'approvals_immutable: request details cannot change';
  end if;
  return new;
end $$;

create or replace function public.agents_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.agent_settings; a int; b int; c int; d int; e int; f int;
begin
  select * into s from public.agent_settings where id = 1;
  perform set_config('wcia.retention', 'on', true);
  delete from public.agent_actions where created_at < now() - make_interval(days => s.audit_retention_days)
     and (approval_id is null or approval_id in (select id from public.approvals where status <> 'pending'
          and coalesce(decided_at, requested_at) < now() - make_interval(days => s.audit_retention_days)));
  get diagnostics a = row_count;
  delete from public.approvals where status <> 'pending' and coalesce(decided_at, requested_at) < now() - make_interval(days => s.audit_retention_days)
     and not exists (select 1 from public.agent_actions x where x.approval_id = approvals.id);
  get diagnostics b = row_count;
  perform set_config('wcia.retention', 'off', true);
  delete from public.audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics c = row_count;
  delete from public.agent_tasks where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics d = row_count;
  delete from public.ai_usage where at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics e = row_count;
  delete from public.brain_questions where created_at < now() - make_interval(days => s.chat_retention_days);
  get diagnostics f = row_count;
  return jsonb_build_object('agent_actions', a, 'approvals', b, 'audit_log', c, 'agent_tasks', d, 'ai_usage', e, 'chat', f);
end $$;


revoke all on function public.agents_retention() from public, anon, authenticated;
select cron.schedule('agents-retention', '23 8 * * *', $$select public.agents_retention()$$);
