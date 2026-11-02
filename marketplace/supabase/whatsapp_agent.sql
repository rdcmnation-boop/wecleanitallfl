-- WhatsApp agent (Twilio). Additive and re-runnable. Used only by the whatsapp-in edge function (service role).
-- Owner decision: the owner's WhatsApp number gets owner mode; everyone else gets the client / cleaner side.
-- The owner number is stored here (not read from the profile), so a changed profile phone can never unlock owner mode.
-- It can be changed only through admin_set_owner_whatsapp, which needs the owner's 2-step session.
-- Owner mode on WhatsApp is read-only: summaries, alerts and advice. Approvals and money stay in the app (2-step).

alter table public.agent_settings add column if not exists owner_whatsapp text not null default ''
  check (owner_whatsapp ~ '^[0-9]{0,15}$');

-- Start from the phone already on the owner's profile (digits, with the US country code).
update public.agent_settings s
   set owner_whatsapp = x.d
  from (select case when length(d) = 10 then '1' || d else d end as d
          from (select regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') as d
                  from public.admins a join public.profiles p on p.id = a.user_id limit 1) y) x
 where s.id = 1 and s.owner_whatsapp = '' and length(x.d) between 11 and 15;

-- Chat log (owner decision: chats kept 90 days). The phone itself is not stored: a keyed hash for rate limits and the last 4 digits.
create table if not exists public.wa_messages (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  phone_hash text not null check (char_length(phone_hash) between 16 and 128),
  phone_last4 text not null default '' check (phone_last4 ~ '^[0-9]{0,4}$'),
  role text not null check (role in ('owner', 'customer', 'worker', 'unknown')),
  user_id uuid references public.profiles(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  mode text not null default '' check (char_length(mode) <= 20),
  body text not null default '' check (char_length(body) <= 1600),
  message_sid text unique check (message_sid is null or char_length(message_sid) <= 64)
);
create index if not exists wa_messages_phone_idx on public.wa_messages(phone_hash, at desc);
create index if not exists wa_messages_at_idx on public.wa_messages(at desc);
alter table public.wa_messages enable row level security;
revoke all on public.wa_messages from public, anon, authenticated;

update public.agent_registry set allowed_actions = array(select distinct unnest(allowed_actions || array['wa_handoff']))
 where agent = 'orchestrator';

-- Who is writing, and what they may be told. Only an exact, single match counts: a verified sign-in phone first,
-- then the phone typed in a profile. Two accounts with the same number → treated as unknown (no order details).
create or replace function public.wa_lookup(p_phone text, p_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  s public.agent_settings; v_ids uuid[]; v_uid uuid; p public.profiles; w public.workers;
  v_role text := 'unknown'; v_ctx jsonb := '{}'; n_hour int; n_day int; n_all int;
  v_today date := (now() at time zone 'America/New_York')::date;
  fmt constant text := 'Dy Mon DD, HH12:MI AM';
begin
  if length(d) = 10 then d := '1' || d; end if;
  select * into s from public.agent_settings where id = 1;
  select count(*) filter (where at > now() - interval '1 hour'), count(*) into n_hour, n_day
    from public.wa_messages where phone_hash = p_hash and direction = 'in' and at > now() - interval '1 day';
  select count(*) into n_all from public.wa_messages where direction = 'in' and role <> 'owner' and at > now() - interval '1 hour';

  if length(d) >= 11 and d = s.owner_whatsapp then
    v_role := 'owner';
    select user_id into v_uid from public.admins limit 1;
    select * into p from public.profiles where id = v_uid;
    v_ctx := jsonb_build_object(
      'today_jobs', (select count(*) from public.bookings where (scheduled_at at time zone 'America/New_York')::date = v_today and status <> 'cancelled'),
      'in_progress', (select count(*) from public.bookings where status = 'in_progress'),
      'unassigned', (select count(*) from public.bookings where status in ('requested', 'offered')),
      'assigned', (select count(*) from public.bookings where status = 'assigned'),
      'workers_pending', (select count(*) from public.workers where status = 'pending'),
      'workers_online', (select count(*) from public.workers where status = 'approved' and available),
      'workers_approved', (select count(*) from public.workers where status = 'approved'),
      'customers', (select count(*) from public.profiles where role = 'customer'),
      'completed_30d', (select count(*) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
      'cancelled_30d', (select count(*) from public.bookings where status = 'cancelled' and cancelled_at > now() - interval '30 days'),
      'gmv_30d', (select coalesce(sum(budget), 0) from public.bookings where status = 'completed' and completed_at > now() - interval '30 days'),
      'avg_rating', (select round(avg(rating)::numeric, 2) from public.reviews),
      'low_reviews_30d', (select count(*) from public.reviews where rating <= 2 and created_at > now() - interval '30 days'),
      'open_alerts', (select count(*) from public.agent_tasks where status = 'open'),
      'alerts', (select coalesce(jsonb_agg(jsonb_build_object('agent', t.agent, 'title', t.title) order by t.created_at desc), '[]')
                   from (select agent, title, created_at from public.agent_tasks where status = 'open' order by created_at desc limit 5) t),
      'ai', public.ai_budget());
  else
    select array_agg(u.id) into v_ids from auth.users u where length(d) >= 11 and u.phone = d and u.phone_confirmed_at is not null;
    if coalesce(array_length(v_ids, 1), 0) <> 1 then
      select array_agg(pr.id) into v_ids from public.profiles pr
       where length(d) >= 11
         and (case when length(regexp_replace(pr.phone, '\D', '', 'g')) = 10 then '1' else '' end) || regexp_replace(pr.phone, '\D', '', 'g') = d;
    end if;
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      v_uid := v_ids[1];
      select * into p from public.profiles where id = v_uid;
      if p.role = 'worker' then
        v_role := 'worker';
        select * into w from public.workers where id = v_uid;
        v_ctx := jsonb_build_object(
          'status', w.status, 'available', w.available, 'jobs_done', w.jobs_done, 'rating', w.rating_avg, 'whatsapp_opt_in', w.whatsapp_opt_in,
          'offers', (select count(*) from public.job_offers o join public.bookings b on b.id = o.booking_id
                      where o.worker_id = v_uid and o.status = 'sent' and b.status in ('requested', 'offered')),
          'next_job', (select jsonb_build_object('code', b.code, 'service', b.service, 'city', coalesce(nullif(b.city, ''), b.zip), 'status', b.status,
                              'when', to_char(b.scheduled_at at time zone 'America/New_York', fmt), 'on_way', b.on_way_at is not null)
                         from public.bookings b where b.worker_id = v_uid and b.status in ('assigned', 'in_progress')
                         order by (b.status = 'in_progress') desc, b.scheduled_at nulls last limit 1),
          'week_jobs', (select count(*) from public.bookings b where b.worker_id = v_uid and b.status = 'completed'
                         and b.completed_at >= date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York'));
      else
        v_role := 'customer';
        v_ctx := jsonb_build_object(
          'open_orders', (select count(*) from public.bookings where customer_id = v_uid and status in ('requested', 'offered', 'assigned', 'in_progress')),
          'order', (select jsonb_build_object('code', b.code, 'service', b.service, 'status', b.status,
                           'when', to_char(b.scheduled_at at time zone 'America/New_York', fmt),
                           'cleaner', nullif(split_part(coalesce(wp.full_name, ''), ' ', 1), ''),
                           'on_way', b.on_way_at is not null and b.status = 'assigned')
                      from public.bookings b left join public.profiles wp on wp.id = b.worker_id
                     where b.customer_id = v_uid and b.status <> 'cancelled'
                     order by (b.status in ('requested', 'offered', 'assigned', 'in_progress')) desc, b.created_at desc limit 1));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'role', v_role, 'user_id', v_uid,
    'name', nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''),
    'lang', coalesce(p.language, ''),
    'messaging_on', s.messaging_on,
    'support_live', public.agent_is_live('support'),
    'ai_ok', coalesce((public.ai_budget() ->> 'ok')::boolean, false),
    'n_hour', n_hour, 'n_day', n_day, 'n_all', n_all,
    'ctx', v_ctx);
end $$;

-- Append one chat line. A repeated Twilio message id returns false (Twilio retries), so it is answered only once.
create or replace function public.wa_log(p_hash text, p_last4 text, p_role text, p_user uuid, p_dir text, p_mode text, p_body text, p_sid text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.wa_messages(phone_hash, phone_last4, role, user_id, direction, mode, body, message_sid)
  values (p_hash, right(regexp_replace(coalesce(p_last4, ''), '\D', '', 'g'), 4), p_role, p_user, p_dir, left(coalesce(p_mode, ''), 20),
          left(coalesce(p_body, ''), 1600), nullif(p_sid, ''))
  on conflict (message_sid) do nothing returning id into v_id;
  return v_id is not null;
end $$;

-- Cleaner WhatsApp notices on/off (STOP / START from the chat).
create or replace function public.wa_set_opt(p_user uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.workers set whatsapp_opt_in = p_on where id = p_user;
  return found;
end $$;

-- "Talk to a person": one owner alert per person per day. The full number stays in the alert detail (owner only),
-- so the owner can answer from the business number ("R 1234 message") or from the app.
create or replace function public.wa_handoff(p_hash text, p_phone text, p_role text, p_name text, p_text text)
returns boolean language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  return public._agent_alert('orchestrator', 'wa_handoff', 'wa_handoff:' || left(p_hash, 40) || ':' || to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'),
    'WhatsApp: ' || case p_role when 'worker' then 'cleaner' when 'customer' then 'client' else 'new contact' end
      || coalesce(' ' || nullif(p_name, ''), '') || ' asks for a person (…' || right(d, 4) || ')',
    jsonb_build_object('phone', d, 'last4', right(d, 4), 'role', p_role, 'text', left(coalesce(p_text, ''), 300), 'hash', left(p_hash, 40)));
end $$;

-- Owner answers a handoff from WhatsApp: the open handoff of the last 24 hours that ends in those 4 digits.
create or replace function public.wa_find_handoff(p_last4 text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then jsonb_build_object('id', min(id), 'phone', min(detail ->> 'phone'), 'hash', min(detail ->> 'hash'))
              else jsonb_build_object('matches', count(*)) end
    from public.agent_tasks
   where kind = 'wa_handoff' and status = 'open' and created_at > now() - interval '24 hours'
     and detail ->> 'last4' = right(regexp_replace(coalesce(p_last4, ''), '\D', '', 'g'), 4);
$$;

-- The last few lines of this chat (2 hours, at most 6) so the AI answer follows the conversation.
create or replace function public.wa_history(p_hash text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('dir', direction, 'body', body) order by at, id), '[]')
    from (select id, direction, body, at from public.wa_messages
           where phone_hash = p_hash and at > now() - interval '2 hours' order by at desc, id desc limit 6) x;
$$;
revoke all on function public.wa_history(text) from public, anon, authenticated;
grant execute on function public.wa_history(text) to service_role;

revoke all on function public.wa_lookup(text, text), public.wa_log(text, text, text, uuid, text, text, text, text),
  public.wa_set_opt(uuid, boolean), public.wa_handoff(text, text, text, text, text), public.wa_find_handoff(text)
  from public, anon, authenticated;
grant execute on function public.wa_lookup(text, text), public.wa_log(text, text, text, uuid, text, text, text, text),
  public.wa_set_opt(uuid, boolean), public.wa_handoff(text, text, text, text, text), public.wa_find_handoff(text) to service_role;

-- Owner: change the owner WhatsApp number (2-step session required) and see it in the Agents panel.
create or replace function public.admin_set_owner_whatsapp(p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if length(d) = 10 then d := '1' || d; end if;
  if length(d) not between 11 and 15 then raise exception 'invalid_phone'; end if;
  update public.agent_settings set owner_whatsapp = d, updated_at = now() where id = 1;
  insert into public.agent_actions(agent, action, approval_class, input_hash, output_summary)
    values ('orchestrator', 'route_task', 'A', 'owner_whatsapp', 'Owner WhatsApp number changed (…' || right(d, 4) || ')');
  return right(d, 4);
end $$;
revoke all on function public.admin_set_owner_whatsapp(text) from public, anon;
grant execute on function public.admin_set_owner_whatsapp(text) to authenticated;

-- The Agents panel also shows: the owner number's last 4 digits, WhatsApp chats today, and a reply link on handoff alerts.
create or replace function public.admin_agent_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.agent_settings;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  select * into s from public.agent_settings where id = 1;
  return jsonb_build_object(
    'settings', jsonb_build_object('auto_send', s.auto_send, 'ai_provider', s.ai_provider, 'ai_model', s.ai_model, 'ai_monthly_cap_usd', s.ai_monthly_cap_usd,
                                   'audit_retention_days', s.audit_retention_days, 'chat_retention_days', s.chat_retention_days, 'messaging_on', s.messaging_on,
                                   'owner_whatsapp_last4', right(s.owner_whatsapp, 4)),
    'budget', public.ai_budget(),
    'whatsapp', jsonb_build_object(
      'in_today', (select count(*) from public.wa_messages where direction = 'in' and at > date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'),
      'people_7d', (select count(distinct phone_hash) from public.wa_messages where direction = 'in' and role <> 'owner' and at > now() - interval '7 days')),
    'steps', (select jsonb_agg(jsonb_build_object('step', g, 'at', s.rollout_started_at + make_interval(days => s.rollout_days[g]),
                     'live', now() >= s.rollout_started_at + make_interval(days => s.rollout_days[g]),
                     'agents', (select coalesce(jsonb_agg(r.agent order by r.agent), '[]') from public.agent_registry r where r.rollout_step = g)) order by g)
                from generate_series(1, 3) g),
    'agents', (select jsonb_agg(jsonb_build_object('agent', r.agent, 'role_description', r.role_description, 'max_class', r.max_class, 'status', r.status,
                     'step', r.rollout_step, 'live', public.agent_is_live(r.agent), 'allowed_actions', r.allowed_actions) order by r.rollout_step, r.agent)
                 from public.agent_registry r),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]') from
                (select id, agent, kind, title, status, created_at,
                        case when kind = 'wa_handoff' and status = 'open' then detail ->> 'phone' end as phone
                   from public.agent_tasks order by (status = 'open') desc, created_at desc limit 40) x),
    'open_tasks', (select count(*) from public.agent_tasks where status = 'open'));
end $$;
