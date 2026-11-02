-- Trusted device ("remember this device") for the single owner. Additive and re-runnable.
--
-- Today: owner powers need a session with the 2-step code (aal2). Every new password sign-in asks for the code again.
-- New: after ONE real 2-step verification the owner may tick "remember this device". The phone then holds a random
-- secret for 30 days. A sign-in with password + that secret opens owner powers without asking for the code again.
--
-- Guarantees kept:
--   * password alone still opens nothing (no secret on the phone and no code = not owner);
--   * a device can only be trusted from a session that really has the 2-step code (JWT aal2), never from another trusted device;
--   * only the SHA-256 hash of the secret is stored; the secret is shown once, on creation;
--   * secrets are bound to the owner account, expire after 30 days, can be revoked, and at most 3 are active at once;
--   * agents and the app cannot read or write the table directly (RLS on, no policies, no grants).

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admins(user_id) on delete cascade,
  token_hash bytea not null unique,
  label text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz
);
alter table public.trusted_devices enable row level security;
revoke all on public.trusted_devices from public, anon, authenticated;

-- Does this request carry a valid trusted-device secret for the signed-in owner? (header x-device-token)
create or replace function public._device_trusted() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_tok text;
begin
  begin
    v_tok := nullif(current_setting('request.headers', true), '')::json ->> 'x-device-token';
  exception when others then
    return false;
  end;
  if v_tok is null or char_length(v_tok) < 32 or char_length(v_tok) > 128 or auth.uid() is null then return false; end if;
  return exists (
    select 1 from public.trusted_devices d
     where d.user_id = auth.uid()
       and d.token_hash = sha256(convert_to(v_tok, 'utf8'))
       and d.revoked_at is null
       and d.expires_at > now()
  );
end $$;
revoke all on function public._device_trusted() from public, anon, authenticated;

-- Owner powers: owner account AND (2-step code on this session OR a valid trusted-device secret).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' or public._device_trusted());
$$;

-- Trust this device. Needs the real 2-step code on THIS session (aal2); a trusted device cannot create more of them.
create or replace function public.admin_trust_device(p_label text default '') returns text
language plpgsql security definer set search_path = public as $$
declare v_tok text;
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
     or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'admin_only';
  end if;
  -- keep at most 3 active devices: revoke the oldest extras
  update public.trusted_devices set revoked_at = now()
   where id in (
     select id from public.trusted_devices
      where user_id = auth.uid() and revoked_at is null and expires_at > now()
      order by created_at desc offset 2
   );
  v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.trusted_devices(user_id, token_hash, label)
    values (auth.uid(), sha256(convert_to(v_tok, 'utf8')), left(coalesce(p_label, ''), 80));
  perform public._audit('device_trusted', 'trusted_device', null, jsonb_build_object('label', left(coalesce(p_label, ''), 80)));
  return v_tok;
end $$;

-- Is THIS device currently trusted? (so the app can show the right button)
create or replace function public.admin_device_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'this_device', public.is_admin() and public._device_trusted(),
    'active', case when public.is_admin()
      then (select count(*) from public.trusted_devices where user_id = auth.uid() and revoked_at is null and expires_at > now())
      else null end);
$$;

-- Forget devices: all of them, or just the one making this request.
create or replace function public.admin_revoke_devices(p_all boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int; v_tok text;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_all then
    update public.trusted_devices set revoked_at = now() where user_id = auth.uid() and revoked_at is null;
  else
    v_tok := nullif(current_setting('request.headers', true), '')::json ->> 'x-device-token';
    update public.trusted_devices set revoked_at = now()
     where user_id = auth.uid() and revoked_at is null and token_hash = sha256(convert_to(coalesce(v_tok, ''), 'utf8'));
  end if;
  get diagnostics v_n = row_count;
  perform public._audit('device_revoked', 'trusted_device', null, jsonb_build_object('all', p_all, 'count', v_n));
  return v_n;
end $$;

revoke all on function public.admin_trust_device(text), public.admin_device_status(), public.admin_revoke_devices(boolean) from public, anon, authenticated;
grant execute on function public.admin_trust_device(text), public.admin_device_status(), public.admin_revoke_devices(boolean) to authenticated;
