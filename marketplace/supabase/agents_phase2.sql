-- Agents phase 2 (applied 2026-11-02 as migration "agents_phase2").
-- Puts the owner's 4 decisions in force and gives the agents a server-side runtime:
--   1) Messages without approval: routine notices (job offers, booking updates, reminders) and support answers.
--      Campaigns and anything about money always wait for the owner.
--   2) AI: Anthropic, Claude Haiku 5.5, capped at $10 per calendar month (Miami time). At the cap the app falls back
--      to its built-in replies. Every AI call is recorded in ai_usage and checked against the cap first.
--   3) Agents go live in 3 steps: step 1 now (orchestrator, dispatch, operations), step 2 after 3 days
--      (support, security, compliance), step 3 after 7 days (finance, quality, growth, pricing). Pausing an agent still wins.
--   4) Retention: audit and agent logs 1 year, chat transcripts 90 days.
-- The orchestrator runs every 5 minutes (pg_cron). It never moves money, changes prices, approves or suspends
-- cleaners, or assigns jobs: it re-offers stale requests to more cleaners, reminds late cleaners, and alerts the owner.

-- ── settings: one row ──
create table if not exists public.agent_settings (
  id int primary key default 1 check (id = 1),
  auto_send text[] not null default '{routine,support}',
  ai_provider text not null default 'anthropic' check (ai_provider in ('anthropic')),
  ai_model text not null default 'claude-haiku-5-5' check (ai_model ~ '^claude-[a-z0-9-]{3,50}$'),
  ai_monthly_cap_usd numeric(8,2) not null default 10 check (ai_monthly_cap_usd between 0 and 1000),
  audit_retention_days int not null default 365 check (audit_retention_days between 30 and 3650),
  chat_retention_days int not null default 90 check (chat_retention_days between 7 and 3650),
  rollout_started_at timestamptz not null default now(),
  rollout_days int[] not null default '{0,3,7}',
  messaging_on boolean not null default false,
  updated_at timestamptz not null default now(),
  check (auto_send <@ array['routine','support']::text[])
);
insert into public.agent_settings(id) values (1) on conflict (id) do nothing;
alter table public.agent_settings enable row level security;
revoke all on public.agent_settings from public, anon, authenticated;

-- ── registry: rollout step, limits and allowed actions per the owner's decisions (an owner action) ──
alter table public.agent_registry add column if not exists rollout_step int not null default 1 check (rollout_step between 1 and 3);
update public.agent_registry r set rollout_step = v.step, max_class = v.cls, allowed_actions = v.acts, updated_at = now()
  from (values
    ('orchestrator', 1, 'B', array['daily_briefing','route_task']),
    ('dispatch',     1, 'C', array['redispatch_stale','recommend_workers']),
    ('operations',   1, 'C', array['flag_late_job','flag_unassigned','remind_cleaner']),
    ('support',      2, 'C', array['answer_question','draft_reply']),
    ('security',     2, 'A', array['scan_audit']),
    ('compliance',   2, 'A', array['flag_pending_worker']),
    ('finance',      3, 'A', array['daily_revenue']),
    ('quality',      3, 'A', array['flag_low_rating']),
    ('growth',       3, 'B', array['draft_campaign']),
    ('pricing',      3, 'B', array['suggest_price'])
  ) as v(agent, step, cls, acts)
 where r.agent = v.agent;

-- Live = not paused by the owner, and its rollout day has come.
create or replace function public.agent_is_live(p_agent text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agent_registry r, public.agent_settings s
     where r.agent = p_agent and r.status = 'active'
       and now() >= s.rollout_started_at + make_interval(days => s.rollout_days[r.rollout_step]));
$$;

-- ── AI spend: every call is recorded; the monthly cap is checked before each call ──
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  feature text not null check (char_length(feature) between 2 and 40),
  model text not null check (char_length(model) between 3 and 60),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0)
);
create index if not exists ai_usage_at_idx on public.ai_usage(at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;

create or replace function public._month_start()
returns timestamptz language sql stable set search_path = public as $$
  select date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
$$;

create or replace function public.ai_budget()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('cap', s.ai_monthly_cap_usd, 'spent', round(coalesce(u.spent, 0), 4),
           'left', round(greatest(0, s.ai_monthly_cap_usd - coalesce(u.spent, 0)), 4),
           'ok', coalesce(u.spent, 0) < s.ai_monthly_cap_usd, 'model', s.ai_model, 'calls', coalesce(u.calls, 0))
    from public.agent_settings s,
         lateral (select sum(cost_usd) spent, count(*) calls from public.ai_usage where at >= public._month_start()) u
   where s.id = 1;
$$;

-- Prices per million tokens (Claude API list prices, Nov 2026; prompts under 100k tokens).
create or replace function public.ai_record_usage(p_feature text, p_model text, p_in int, p_out int)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_in numeric; v_out numeric; v_cost numeric;
begin
  select case when p_model like 'claude-haiku-5-5%' then 0.10 when p_model like 'claude-sonnet-5-5%' then 2 when p_model like 'claude-haiku-4-5%' then 1
              when p_model like 'claude-opus-5-5%' then 4 else 2 end,
         case when p_model like 'claude-haiku-5-5%' then 0.50 when p_model like 'claude-sonnet-5-5%' then 10 when p_model like 'claude-haiku-4-5%' then 5
              when p_model like 'claude-opus-5-5%' then 20 else 10 end
    into v_in, v_out;
  v_cost := (greatest(coalesce(p_in, 0), 0) * v_in + greatest(coalesce(p_out, 0), 0) * v_out) / 1000000.0;
  insert into public.ai_usage(feature, model, input_tokens, output_tokens, cost_usd)
    values (left(coalesce(p_feature, 'unknown'), 40), left(coalesce(p_model, 'unknown'), 60), greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0), v_cost);
  return v_cost;
end $$;

-- ── agent tasks: what the agents found (owner alerts) ──
create table if not exists public.agent_tasks (
  id bigint generated always as identity primary key,
  agent text not null references public.agent_registry(agent),
  kind text not null check (char_length(kind) between 3 and 60),
  dedupe_key text unique,
  title text not null default '' check (char_length(title) <= 200),
  detail jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists agent_tasks_open_idx on public.agent_tasks(status, created_at desc);
alter table public.agent_tasks enable row level security;
revoke all on public.agent_tasks from public, anon, authenticated;

-- One alert per finding (dedupe), shown to the owner in the app (and on WhatsApp once messaging is on).
create or replace function public._agent_alert(p_agent text, p_kind text, p_key text, p_title text, p_detail jsonb default '{}')
returns boolean language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id bigint;
begin
  insert into public.agent_tasks(agent, kind, dedupe_key, title, detail)
    values (p_agent, p_kind, p_key, left(p_title, 200), coalesce(p_detail, '{}'))
    on conflict (dedupe_key) do nothing returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
    values (p_agent, p_kind, 'A', left(p_key, 128), left(p_title, 2000));
  select user_id into v_owner from public.admins limit 1;
  if v_owner is not null then
    perform public._notify(v_owner, 'agent_alert', jsonb_build_object('agent', p_agent, 'title', left(p_title, 200), 'task_id', v_id));
  end if;
  return true;
end $$;

-- ── the orchestrator: runs every 5 minutes ──
create or replace function public.orchestrator_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.agent_settings; r record; w record; v_new int; n_offers int := 0; n_alerts int := 0; n_remind int := 0;
  v_et timestamp := now() at time zone 'America/New_York';
  v_day text := to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD');
  v_routine boolean;
begin
  select * into s from public.agent_settings where id = 1;
  v_routine := 'routine' = any (s.auto_send);

  -- dispatch: requests nobody took (ASAP after 10 min, scheduled after 60 min) go to the next-best cleaners, up to 5 more each run.
  if public.agent_is_live('dispatch') and v_routine then
    for r in select b.* from public.bookings b
              where b.status in ('requested', 'offered')
                and b.created_at < now() - case when b.urgency = 'asap' then interval '10 minutes' else interval '60 minutes' end
                and not exists (select 1 from public.job_offers o where o.booking_id = b.id and o.sent_at > now() - interval '10 minutes')
              order by b.urgency = 'asap' desc, b.created_at limit 30 loop
      v_new := 0;
      for w in select k.worker_id, k.score from public.rank_workers(r.id, 25) k
                where not exists (select 1 from public.job_offers o where o.booking_id = r.id and o.worker_id = k.worker_id) loop
        exit when v_new >= 5;
        insert into public.job_offers(booking_id, worker_id, score) values (r.id, w.worker_id, w.score) on conflict (booking_id, worker_id) do nothing;
        if found then
          v_new := v_new + 1;
          perform public._notify(w.worker_id, 'job_offer', jsonb_build_object('booking_id', r.id, 'code', r.code, 'service', r.service, 'segment', r.segment,
            'zip', r.zip, 'city', r.city, 'scheduled_at', r.scheduled_at, 'hours_est', r.hours_est, 'budget', r.budget));
        end if;
      end loop;
      if v_new > 0 then
        update public.bookings set status = 'offered' where id = r.id and status = 'requested';
        insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
          values ('dispatch', 'redispatch_stale', 'C', r.id::text, r.code || ': offered to ' || v_new || ' more cleaners');
        n_offers := n_offers + v_new;
      elsif r.created_at < now() - interval '30 minutes' and public.agent_is_live('operations') then
        if public._agent_alert('operations', 'flag_unassigned', 'unassigned:' || r.id, r.code || ': no cleaner available in ' || r.zip || '. Assign it by hand in Orders.',
             jsonb_build_object('booking_id', r.id, 'code', r.code, 'zip', r.zip)) then n_alerts := n_alerts + 1; end if;
      end if;
    end loop;
  end if;

  -- operations: a job should have started 15 minutes ago and the cleaner is not on the way.
  if public.agent_is_live('operations') then
    for r in select b.* from public.bookings b
              where b.status = 'assigned' and b.urgency = 'scheduled' and b.on_way_at is null
                and b.scheduled_at < now() - interval '15 minutes' and b.scheduled_at > now() - interval '24 hours' loop
      if public._agent_alert('operations', 'flag_late_job', 'late:' || r.id, r.code || ' is late: the cleaner has not started or said they are on the way.',
           jsonb_build_object('booking_id', r.id, 'code', r.code)) then
        n_alerts := n_alerts + 1;
        if v_routine then
          perform public._notify(r.worker_id, 'job_late_reminder', jsonb_build_object('booking_id', r.id, 'code', r.code));
          insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
            values ('operations', 'remind_cleaner', 'C', r.id::text, r.code || ': late reminder sent to the cleaner');
          n_remind := n_remind + 1;
        end if;
      end if;
    end loop;
  end if;

  -- compliance: cleaners waiting for approval for more than a day.
  if public.agent_is_live('compliance') then
    for r in select w.id, p.full_name, w.company_name from public.workers w join public.profiles p on p.id = w.id
              where w.status = 'pending' and w.created_at < now() - interval '24 hours' loop
      if public._agent_alert('compliance', 'flag_pending_worker', 'pending:' || r.id || ':' || v_day,
           coalesce(nullif(r.company_name, ''), split_part(r.full_name, ' ', 1), 'A cleaner') || ' has been waiting more than a day for approval.',
           jsonb_build_object('worker_id', r.id)) then n_alerts := n_alerts + 1; end if;
    end loop;
  end if;

  -- security: unusual activity in the last 24 hours.
  if public.agent_is_live('security') then
    if (select count(*) from public.bookings where cancelled_at > now() - interval '24 hours') >= 5 then
      if public._agent_alert('security', 'scan_audit', 'cancels:' || v_day, 'Many cancellations in the last 24 hours. Check Orders.', '{}') then n_alerts := n_alerts + 1; end if;
    end if;
    for r in select id, created_at from public.audit_log where action = 'device_trusted' and created_at > now() - interval '1 hour' loop
      if public._agent_alert('security', 'scan_audit', 'device:' || r.id, 'A new device was set to skip your 2-step code. If it was not you, use "Forget all devices" in Account.', '{}') then n_alerts := n_alerts + 1; end if;
    end loop;
  end if;

  -- quality: low ratings.
  if public.agent_is_live('quality') then
    for r in select v.id, v.rating, b.code from public.reviews v join public.bookings b on b.id = v.booking_id
              where v.rating <= 2 and v.created_at > now() - interval '7 days' loop
      if public._agent_alert('quality', 'flag_low_rating', 'review:' || r.id, r.code || ' got ' || r.rating || ' stars. Call the customer today.',
           jsonb_build_object('code', r.code)) then n_alerts := n_alerts + 1; end if;
    end loop;
  end if;

  -- finance + orchestrator: one morning summary (8 AM Miami time).
  if extract(hour from v_et) = 8 then
    if public.agent_is_live('finance') then
      perform public._agent_alert('finance', 'daily_revenue', 'revenue:' || v_day,
        'Yesterday: ' || (select count(*) from public.bookings where status = 'completed' and completed_at >= (date_trunc('day', v_et) - interval '1 day') at time zone 'America/New_York' and completed_at < date_trunc('day', v_et) at time zone 'America/New_York')
        || ' jobs completed, $' || (select coalesce(sum(budget), 0) from public.bookings where status = 'completed' and completed_at >= (date_trunc('day', v_et) - interval '1 day') at time zone 'America/New_York' and completed_at < date_trunc('day', v_et) at time zone 'America/New_York') || ' in sales.', '{}');
    end if;
    if public.agent_is_live('orchestrator') then
      perform public._agent_alert('orchestrator', 'daily_briefing', 'briefing:' || v_day,
        'Good morning. Open orders: ' || (select count(*) from public.bookings where status in ('requested', 'offered'))
        || '. Cleaners online: ' || (select count(*) from public.workers where status = 'approved' and available)
        || '. Agent alerts still open: ' || (select count(*) from public.agent_tasks where status = 'open') || '.', '{}');
    end if;
  end if;

  return jsonb_build_object('offers', n_offers, 'alerts', n_alerts, 'reminders', n_remind);
end $$;

-- ── owner functions (owner + 2-step, like every admin_* function) ──
create or replace function public.admin_agent_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.agent_settings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into s from public.agent_settings where id = 1;
  return jsonb_build_object(
    'settings', jsonb_build_object('auto_send', s.auto_send, 'ai_provider', s.ai_provider, 'ai_model', s.ai_model, 'ai_monthly_cap_usd', s.ai_monthly_cap_usd,
                                   'audit_retention_days', s.audit_retention_days, 'chat_retention_days', s.chat_retention_days, 'messaging_on', s.messaging_on),
    'budget', public.ai_budget(),
    'steps', (select jsonb_agg(jsonb_build_object('step', g, 'at', s.rollout_started_at + make_interval(days => s.rollout_days[g]),
                     'live', now() >= s.rollout_started_at + make_interval(days => s.rollout_days[g]),
                     'agents', (select coalesce(jsonb_agg(r.agent order by r.agent), '[]') from public.agent_registry r where r.rollout_step = g)) order by g)
                from generate_series(1, 3) g),
    'agents', (select jsonb_agg(jsonb_build_object('agent', r.agent, 'role_description', r.role_description, 'max_class', r.max_class, 'status', r.status,
                     'step', r.rollout_step, 'live', public.agent_is_live(r.agent), 'allowed_actions', r.allowed_actions) order by r.rollout_step, r.agent)
                 from public.agent_registry r),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]') from
                (select id, agent, kind, title, status, created_at from public.agent_tasks order by (status = 'open') desc, created_at desc limit 40) x),
    'open_tasks', (select count(*) from public.agent_tasks where status = 'open'));
end $$;

create or replace function public.admin_close_task(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_status not in ('done', 'dismissed') then raise exception 'bad_status'; end if;
  update public.agent_tasks set status = p_status, closed_at = now() where id = p_id and status = 'open';
  if not found then raise exception 'not_open'; end if;
  perform public._audit('agent_task_' || p_status, 'agent_task', p_id::text, '{}'::jsonb);
end $$;

-- The owner can change the cap, the model, what sends alone, and switch messaging on once Twilio is set up.
create or replace function public.admin_save_agent_settings(p_cap numeric, p_auto_send text[], p_model text, p_messaging_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  update public.agent_settings set
    ai_monthly_cap_usd = coalesce(p_cap, ai_monthly_cap_usd),
    auto_send = coalesce(p_auto_send, auto_send),
    ai_model = coalesce(nullif(p_model, ''), ai_model),
    messaging_on = coalesce(p_messaging_on, messaging_on),
    updated_at = now()
   where id = 1;
  perform public._audit('agent_settings_saved', 'agent_settings', '1',
    jsonb_build_object('cap', p_cap, 'auto_send', p_auto_send, 'model', p_model, 'messaging_on', p_messaging_on));
end $$;

-- Shared secret for the outbox sender (notify). Generated here; it never leaves the database and Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'notify_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_cron_secret', 'x-cron-secret for the notify function');
  end if;
end $$;
create or replace function public.check_cron_secret(p text)
returns boolean language sql security definer set search_path = public, vault as $$
  select p is not null and p <> '' and exists (select 1 from vault.decrypted_secrets where name = 'notify_cron_secret' and decrypted_secret = p);
$$;

-- ── grants: runtime functions are for the database and the server only ──
revoke all on function public.agent_is_live(text), public.ai_budget(), public.ai_record_usage(text, text, int, int), public._agent_alert(text, text, text, text, jsonb),
  public.orchestrator_tick(), public.check_cron_secret(text), public._month_start() from public, anon, authenticated;
grant execute on function public.agent_is_live(text), public.ai_budget(), public.ai_record_usage(text, text, int, int), public.check_cron_secret(text) to service_role;
revoke all on function public.admin_agent_overview(), public.admin_close_task(bigint, text), public.admin_save_agent_settings(numeric, text[], text, boolean) from public, anon;
grant execute on function public.admin_agent_overview(), public.admin_close_task(bigint, text), public.admin_save_agent_settings(numeric, text[], text, boolean) to authenticated;

-- ── schedules ──
select cron.schedule('agents-tick', '*/5 * * * *', $$select public.orchestrator_tick()$$);
-- The outbox sender runs every minute only while messaging is on and something is waiting.
select cron.schedule('notify-outbox', '* * * * *', $$
  select net.http_post(
    url := 'https://fqajygzjteauxornipva.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')),
    body := '{}'::jsonb)
  where (select messaging_on from public.agent_settings where id = 1)
    and exists (select 1 from public.notifications where status = 'queued' and channel <> 'inapp');
$$);
