#!/usr/bin/env bash
# Tests for guest_booking.sql. Usage: PGHOST=/var/run/postgresql ./guest_booking_test.sh
set -u
DB=wcia_guest_test; HERE="$(cd "$(dirname "$0")" && pwd)"
psql -U postgres -qtAc "drop database if exists $DB" >/dev/null; psql -U postgres -qtAc "create database $DB" >/dev/null
for f in "$HERE/supabase_stub.sql" "$HERE/../schema.sql" "$HERE/../guest_booking.sql"; do psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "FAILED loading $f"; exit 1; }; done
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$HERE/../guest_booking.sql" >/dev/null 2>&1 || { echo "NOT RE-RUNNABLE"; exit 1; }
pass=0; fail=0
sq() { psql -U postgres -d $DB -qtA -c "$1" 2>&1; }
as() { local who="$1" anon="$2"; psql -U postgres -d $DB -qtA -c "begin; set local role authenticated; set local request.jwt.claim.sub='$who'; set local request.jwt.claims='{\"sub\":\"$who\",\"aal\":\"aal1\",\"is_anonymous\":$anon}'; $3; commit;" 2>&1; }
check() { if [[ "$2" =~ $3 ]]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1"; echo "       got: $(echo "$2" | head -2 | tr '\n' ' ')"; fi; }
G1=00000000-0000-0000-0000-0000000000b1; G2=00000000-0000-0000-0000-0000000000b2; C1=00000000-0000-0000-0000-0000000000c1
for u in $G1 $G2 $C1; do sq "insert into auth.users(id,email) values ('$u','$u@x.test')" >/dev/null; done
sq "update public.profiles set full_name='Guest One', phone='7865550142' where id='$G1'; update public.profiles set full_name='Guest Two', phone='7865550142' where id='$G2'; update public.profiles set full_name='Cust', phone='9545550000', email='c@x.test' where id='$C1'" >/dev/null
B="insert into public.bookings(segment,service,frequency,zip,urgency,address) values ('residential','standard','once','33308','asap','1 Main St')"
echo "== guest limits"
check "guest without contact details is refused" "$(sq "update public.profiles set full_name='', phone='' where id='$G2'" >/dev/null; as $G2 true "$B")" 'guest_contact_required'
sq "update public.profiles set full_name='Guest Two', phone='7865550142' where id='$G2'" >/dev/null
check "guest with contact can book once"          "$(as $G1 true "$B")" '^(INSERT 0 1)?$'
check "second open request from same guest blocked" "$(as $G1 true "$B")" 'guest_one_open_request'
check "other guest, same phone, still allowed (2nd on phone)" "$(as $G2 true "$B")" '^(INSERT 0 1)?$'
check "verified customer is not limited by guest rules" "$(as $C1 false "$B")" '^(INSERT 0 1)?$'
echo; echo "RESULT: $pass passed, $fail failed"; [ "$fail" -eq 0 ]
