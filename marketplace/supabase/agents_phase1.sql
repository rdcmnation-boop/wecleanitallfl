-- ============================================================================
-- Agent system, Phase 1: registry, approvals, append-only action log.
-- Additive only. Touches no existing table or function.
-- Agents start PAUSED with the lowest permission class (A = read-only).
-- Nothing here lets an agent act; it only records and gates.
-- ============================================================================

-- ───────────────────────── agent registry ─────────────────────────
create table if not exists public.agent_registry (
  agent text primary key check (agent ~ '^[a-z_]{3,40}$'),
  role_description text not null default '' check (char_length(role_description) <= 500),
  allowed_actions text[] not null default '{}',
  -- Highest class an agent may ever reach through this table. D and E are
  -- deliberately not allowed: class D always needs a per-action owner approval.
  max_class text not null default 'A' check (max_class in ('A','B','C')),
  status text not null default 'paused' check (status in ('active','paused')),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── approvals ─────────────────────────
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  agent text not null references public.agent_registry(agent),
  action text not null check (char_length(action) between 3 and 80),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 500)
);
create index if not exists approvals_status_idx on public.approvals(status, requested_at desc);

-- ───────────────────────── append-only action log ─────────────────────────
create table if not exists public.agent_actions (
  id bigint generated always as identity primary key,
  agent text not null references public.agent_registry(agent),
  action text not null check (char_length(action) between 3 and 80),
  approval_class text not null check (approval_class in ('A','B','C','D')),
  input_hash text,
  output_summary text check (output_summary is null or char_length(output_summary) <= 2000),
  approval_id uuid references public.approvals(id),
  created_at timestamptz not null default now(),
  -- Class D actions must point to an approved decision.
  check (approval_class <> 'D' or approval_id is not null)
);
create index if not exists agent_actions_agent_idx on public.agent_actions(agent, created_at desc);

-- ───────────────────────── RLS: owner only ─────────────────────────
alter table public.agent_registry enable row level security;
alter table public.approvals enable row level security;
alter table public.agent_actions enable row level security;

drop policy if exists agent_registry_admin_read on public.agent_registry;
create policy agent_registry_admin_read on public.agent_registry for select to authenticated using (public.is_admin());
drop policy if exists approvals_admin_read on public.approvals;
create policy approvals_admin_read on public.approvals for select to authenticated using (public.is_admin());
drop policy if exists agent_actions_admin_read on public.agent_actions;
create policy agent_actions_admin_read on public.agent_actions for select to authenticated using (public.is_admin());

revoke all on public.agent_registry, public.approvals, public.agent_actions from public, anon, authenticated;
grant select on public.agent_registry, public.approvals, public.agent_actions to authenticated;

-- ───────────────────────── immutability triggers ─────────────────────────
create or replace function public._agent_actions_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only: agent_actions cannot be changed or deleted';
end $$;

drop trigger if exists agent_actions_no_update on public.agent_actions;
create trigger agent_actions_no_update before update or delete on public.agent_actions
  for each row execute function public._agent_actions_append_only();
drop trigger if exists agent_actions_no_truncate on public.agent_actions;
create trigger agent_actions_no_truncate before truncate on public.agent_actions
  for each statement execute function public._agent_actions_append_only();

create or replace function public._approvals_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
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

drop trigger if exists approvals_guard on public.approvals;
create trigger approvals_guard before update or delete on public.approvals
  for each row execute function public._approvals_guard();

-- ───────────────────────── owner RPCs (aal2 admin only) ─────────────────────────
create or replace function public.admin_agent_log(p_limit int default 100)
returns setof public.agent_actions
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query select * from public.agent_actions order by id desc limit greatest(1, least(coalesce(p_limit,100), 500));
end $$;

create or replace function public.admin_pending_approvals()
returns setof public.approvals
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  return query select * from public.approvals where status = 'pending' order by requested_at;
end $$;

create or replace function public.admin_decide_approval(p_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.approvals;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('approved','rejected') then raise exception 'bad_status'; end if;
  if p_status = 'rejected' and coalesce(char_length(btrim(p_reason)),0) < 3 then raise exception 'reason_required'; end if;
  select * into v_row from public.approvals where id = p_id for update;
  if not found or v_row.status <> 'pending' then raise exception 'not_pending'; end if;
  update public.approvals
     set status = p_status, decided_by = auth.uid(), decided_at = now(), reason = p_reason
   where id = p_id;
  perform public._audit('approval_' || p_status, 'approval', p_id::text,
    jsonb_build_object('agent', v_row.agent, 'action', v_row.action, 'reason', p_reason));
end $$;

create or replace function public.admin_set_agent_status(p_agent text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('active','paused') then raise exception 'bad_status'; end if;
  update public.agent_registry set status = p_status, updated_at = now() where agent = p_agent;
  if not found then raise exception 'unknown_agent'; end if;
  perform public._audit('agent_' || p_status, 'agent', p_agent, '{}'::jsonb);
end $$;

revoke all on function public._agent_actions_append_only(), public._approvals_guard(),
  public.admin_agent_log(int), public.admin_pending_approvals(),
  public.admin_decide_approval(uuid,text,text), public.admin_set_agent_status(text,text)
  from public, anon, authenticated;
grant execute on function public.admin_agent_log(int), public.admin_pending_approvals(),
  public.admin_decide_approval(uuid,text,text), public.admin_set_agent_status(text,text) to authenticated;

-- ───────────────────────── seed: ten agents, all paused, read-only ─────────────────────────
insert into public.agent_registry(agent, role_description) values
  ('orchestrator', 'Routes work between agents and prepares owner summaries.'),
  ('operations',   'Watches bookings, late jobs and open requests. Read-only.'),
  ('finance',      'Summarizes revenue, commissions and payouts. Read-only.'),
  ('dispatch',     'Suggests cleaner matches for open bookings.'),
  ('pricing',      'Suggests price changes. Never applies them.'),
  ('support',      'Drafts replies to customers and cleaners.'),
  ('quality',      'Reviews ratings and flags problem patterns.'),
  ('growth',       'Drafts campaigns and tracks leads.'),
  ('compliance',   'Tracks worker documents and expiry dates.'),
  ('security',     'Reviews audit entries for unusual activity.')
on conflict (agent) do nothing;
