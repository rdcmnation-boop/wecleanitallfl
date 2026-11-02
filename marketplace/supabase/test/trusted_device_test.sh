#!/usr/bin/env bash
# Tests for trusted_device.sql on a local Postgres (uses the same Supabase stub as run_tests.sh).
# Usage: PGHOST=/var/run/postgresql ./trusted_device_test.sh
set -u
DB=wcia_td_test
HERE="$(cd "$(dirname "$0")" && pwd)"
psql -U postgres -qtAc "drop database if exists $DB" >/dev/null
psql -U postgres -qtAc "create database $DB" >/dev/null
for f in "$HERE/supabase_stub.sql" "$HERE/../schema.sql" "$HERE/../trusted_device.sql"; do
  psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAILED loading $f"; exit 1; }
done
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$HERE/../trusted_device.sql" >/dev/null || { echo "trusted_device.sql NOT RE-RUNNABLE"; exit 1; }

pass=0; fail=0
sq() { psql -U postgres -d $DB -qtA -c "$1" 2>&1; }
# as <uuid|anon> <aal> <token|-> <sql>
as() {
  local who="$1" aal="$2" tok="$3" q="$4" hdr="{}"
  [ "$tok" != "-" ] && hdr="{\"x-device-token\":\"$tok\"}"
  if [ "$who" = anon ]; then
    psql -U postgres -d $DB -qtA -c "begin; set local role anon; set local request.headers = '$hdr'; $q; commit;" 2>&1
  else
    psql -U postgres -d $DB -qtA -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$who'; set local request.jwt.claims = '{\"sub\":\"$who\",\"aal\":\"$aal\"}'; set local request.headers = '$hdr'; $q; commit;" 2>&1
  fi
}
check() {
  if [[ "$2" =~ $3 ]]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1"; echo "       got: $(echo "$2" | head -3 | tr '\n' ' ')"; echo "       want: $3"; fi
}

OWN=00000000-0000-0000-0000-0000000000a1
OTHER=00000000-0000-0000-0000-0000000000c1
sq "insert into auth.users(id,email) values ('$OWN','owner@x.test'),('$OTHER','cust@x.test')" >/dev/null
sq "insert into public.admins(user_id) values ('$OWN')" >/dev/null

echo "== baseline (unchanged behaviour)"
check "owner, 2-step code -> is_admin"          "$(as $OWN aal2 - 'select public.is_admin()')" '^t$'
check "owner, password only -> not admin"       "$(as $OWN aal1 - 'select public.is_admin()')" '^f$'
check "customer with 2-step -> not admin"       "$(as $OTHER aal2 - 'select public.is_admin()')" '^f$'

echo "== issuing a trusted device"
check "password-only session cannot trust a device" "$(as $OWN aal1 - "select public.admin_trust_device('x')")" 'admin_only'
check "customer cannot trust a device"              "$(as $OTHER aal2 - "select public.admin_trust_device('x')")" 'admin_only'
check "anon cannot call trust"                      "$(as anon aal1 - "select public.admin_trust_device('x')")" 'permission denied'
TOK=$(as $OWN aal2 - "select public.admin_trust_device('iPhone')")
check "owner with 2-step gets a long secret"        "$TOK" '^[0-9a-f]{64}$'
check "table stores only a hash, not the secret"    "$(sq "select count(*) from public.trusted_devices where encode(token_hash,'hex') = '$TOK' or label = '$TOK'")" '^0$'
check "stored hash is sha256 of secret"             "$(sq "select count(*) from public.trusted_devices where token_hash = sha256(convert_to('$TOK','utf8'))")" '^1$'
check "expiry is about 30 days"                     "$(sq "select (expires_at - created_at) between interval '29 days' and interval '31 days' from public.trusted_devices")" '^t$'
check "audit row written, secret not in it"         "$(sq "select count(*) from public.audit_log where action='device_trusted' and details::text not like '%$TOK%'")" '^1$'

echo "== using the trusted device"
check "password + secret -> is_admin"               "$(as $OWN aal1 $TOK 'select public.is_admin()')" '^t$'
check "password + wrong secret -> not admin"        "$(as $OWN aal1 deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef 'select public.is_admin()')" '^f$'
check "password + short secret -> not admin"        "$(as $OWN aal1 abc 'select public.is_admin()')" '^f$'
check "secret without password -> not admin (anon)" "$(as anon aal1 $TOK 'select public.is_admin()')" '^(f|ERROR:  permission denied for function is_admin)$'
check "owner's secret used by another user -> no"   "$(as $OTHER aal1 $TOK 'select public.is_admin()')" '^f$'
check "owner's secret on a customer w/ 2-step -> no" "$(as $OTHER aal2 $TOK 'select public.is_admin()')" '^f$'
check "trusted device cannot trust more devices"    "$(as $OWN aal1 $TOK "select public.admin_trust_device('evil')")" 'admin_only'
check "device status says this device is trusted"   "$(as $OWN aal1 $TOK 'select public.admin_device_status()->>$$this_device$$')" '^true$'
check "device status for password-only is empty"    "$(as $OWN aal1 - 'select public.admin_device_status()->>$$active$$')" '^$'
check "owner RPC admin_stats works with secret"     "$(as $OWN aal1 $TOK 'select public.admin_stats() is not null')" '^t$'
check "owner RPC admin_stats empty without secret"  "$(as $OWN aal1 - 'select public.admin_stats() is null')" '^t$'
check "owner RPC admin_workers works with secret"   "$(as $OWN aal1 $TOK 'select count(*) >= 0 from public.admin_workers()')" '^t$'
check "admin_set_worker_status refused w/o secret"  "$(as $OWN aal1 - "select public.admin_set_worker_status('$OTHER','approved')")" 'admin_only'

echo "== lockdown"
check "app roles cannot read the table"             "$(as $OWN aal2 - 'select * from public.trusted_devices')" 'permission denied'
check "app roles cannot write the table"            "$(as $OWN aal2 - "insert into public.trusted_devices(user_id,token_hash) values ('$OWN','\\x00')")" 'permission denied'
check "app roles cannot call the internal check"    "$(as $OWN aal2 $TOK 'select public._device_trusted()')" 'permission denied'
check "anon cannot call status/revoke"              "$(as anon aal1 - 'select public.admin_revoke_devices(true)')" 'permission denied'

echo "== expiry and revoking"
sq "update public.trusted_devices set expires_at = now() - interval '1 minute'" >/dev/null
check "expired secret stops working"                "$(as $OWN aal1 $TOK 'select public.is_admin()')" '^f$'
sq "update public.trusted_devices set expires_at = now() + interval '30 days'" >/dev/null
check "valid again after resetting expiry (control)" "$(as $OWN aal1 $TOK 'select public.is_admin()')" '^t$'
check "password-only cannot revoke"                 "$(as $OWN aal1 - 'select public.admin_revoke_devices(false)')" 'admin_only'
check "forget this device revokes exactly one"      "$(as $OWN aal1 $TOK 'select public.admin_revoke_devices(false)')" '^1$'
check "revoked secret stops working"                "$(as $OWN aal1 $TOK 'select public.is_admin()')" '^f$'

echo "== limit of 3 and revoke-all"
T1=$(as $OWN aal2 - "select public.admin_trust_device('a')")
T2=$(as $OWN aal2 - "select public.admin_trust_device('b')")
T3=$(as $OWN aal2 - "select public.admin_trust_device('c')")
T4=$(as $OWN aal2 - "select public.admin_trust_device('d')")
check "only 3 devices stay active"                  "$(sq "select count(*) from public.trusted_devices where revoked_at is null")" '^3$'
check "oldest of the four was revoked"              "$(as $OWN aal1 $T1 'select public.is_admin()')" '^f$'
check "newest still works"                          "$(as $OWN aal1 $T4 'select public.is_admin()')" '^t$'
check "revoke all kills the rest"                   "$(as $OWN aal2 - 'select public.admin_revoke_devices(true)')" '^3$'
check "after revoke all, none work"                 "$(as $OWN aal1 $T4 'select public.is_admin()')$(as $OWN aal1 $T3 'select public.is_admin()')" '^ff$'

echo "== removing the owner removes devices"
T5=$(as $OWN aal2 - "select public.admin_trust_device('e')")
sq "delete from public.admins where user_id='$OWN'" >/dev/null
check "devices deleted with the owner row"          "$(sq "select count(*) from public.trusted_devices")" '^0$'
check "secret useless once not owner"               "$(as $OWN aal1 $T5 'select public.is_admin()')" '^f$'

echo; echo "RESULT: $pass passed, $fail failed"; [ "$fail" -eq 0 ]
