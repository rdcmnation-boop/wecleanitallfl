#!/usr/bin/env bash
# Security + flow tests for schema.sql on a local Postgres. Usage: PGHOST=... PGPORT=... ./run_tests.sh
set -u
DB=wcia_test
HERE="$(cd "$(dirname "$0")" && pwd)"
psql -U postgres -qtAc "drop database if exists $DB" >/dev/null
psql -U postgres -qtAc "create database $DB" >/dev/null
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$HERE/supabase_stub.sql" >/dev/null || { echo "stub failed"; exit 1; }
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$HERE/../schema.sql" >/dev/null || { echo "SCHEMA FAILED"; exit 1; }
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$HERE/../schema.sql" >/dev/null || { echo "SCHEMA NOT RE-RUNNABLE"; exit 1; }

pass=0; fail=0
sq() { psql -U postgres -d $DB -qtA -c "$1" 2>&1; }
# as <uuid|anon> <sql>
as() {
  local who="$1"; shift
  if [ "$who" = anon ]; then
    psql -U postgres -d $DB -qtA -c "begin; set local role anon; $1; commit;" 2>&1
  else
    psql -U postgres -d $DB -qtA -c "begin; set local role authenticated; set local request.jwt.claim.sub = '$who'; $1; commit;" 2>&1
  fi
}
check() { # name, actual, expected-regex
  if [[ "$2" =~ $3 ]]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1"; echo "       got: $(echo "$2" | head -3 | tr '\n' ' ')"; echo "       want: $3"; fi
}
mk() { sq "insert into auth.users(id,email,raw_user_meta_data) values ('$1','$2','$3') returning id" | head -1; }

A=00000000-0000-0000-0000-0000000000a1
C1=00000000-0000-0000-0000-0000000000c1
C2=00000000-0000-0000-0000-0000000000c2
W1=00000000-0000-0000-0000-0000000000b1
W2=00000000-0000-0000-0000-0000000000b2
W3=00000000-0000-0000-0000-0000000000b3
mk $A owner@x.com '{"role":"customer","full_name":"Owner"}' >/dev/null
mk $C1 c1@x.com '{"role":"customer","full_name":"Ana Gomez","phone":"9545550101","language":"es"}' >/dev/null
mk $C2 c2@x.com '{"role":"customer","full_name":"Bob Lee","language":"en"}' >/dev/null
mk $W1 w1@x.com '{"role":"worker","full_name":"Maria Perez","phone":"9545550111","kind":"individual"}' >/dev/null
mk $W2 w2@x.com '{"role":"worker","full_name":"Luis Diaz","phone":"9545550122","kind":"company","company_name":"Brillo LLC"}' >/dev/null
mk $W3 w3@x.com '{"role":"admin","full_name":"Sneaky","kind":"individual"}' >/dev/null
sq "insert into public.admins(user_id) values ('$A')" >/dev/null

echo "Signup"
check "profiles created by trigger" "$(sq "select count(*) from profiles")" '^6$'
check "role 'admin' in signup metadata is downgraded" "$(sq "select role from profiles where id='$W3'")" '^customer$'
check "worker row created for workers" "$(sq "select count(*) from workers")" '^2$'
sq "insert into workers(id) values ('$W3')" >/dev/null; sq "update profiles set role='worker' where id='$W3'" >/dev/null

echo "Self-promotion is blocked"
as $W1 "update workers set status='approved', rating_avg=5, jobs_done=99, available=true where id='$W1'" >/dev/null
check "worker cannot approve self / fake rating / go online while pending" "$(sq "select status||rating_avg||jobs_done||available from workers where id='$W1'")" '^pending0\.000false$'
check "user cannot change own role" "$(as $C1 "update profiles set role='worker' where id='$C1'" >/dev/null; sq "select role from profiles where id='$C1'")" '^customer$'
check "nobody can read admins table" "$(as $C1 "select * from admins")" 'permission denied'
check "nobody can add self as admin" "$(as $C1 "insert into admins values ('$C1')")" 'permission denied'
check "anon reads nothing" "$(as anon "select * from profiles")" 'permission denied'
check "customer cannot read other profiles" "$(as $C1 "select count(*) from profiles")" '^1$'
check "customer cannot delete bookings" "$(as $C1 "delete from bookings")" 'permission denied'
check "worker cannot call matching engine directly" "$(as $W1 "select dispatch_booking(gen_random_uuid())")" 'permission denied'
check "non-admin cannot approve" "$(as $W1 "select admin_set_worker_status('$W1','approved')")" 'admin_only'
check "admin_stats hidden from non-admin" "$(as $C1 "select coalesce(admin_stats()::text,'null')")" '^null$'

echo "Admin approves, cleaners set up profiles"
as $A "select admin_set_worker_status('$W1','approved'); select admin_set_worker_status('$W2','approved')" >/dev/null
as $W1 "update workers set zips='{33308,33304,bad}', services='{standard,deep}', languages='{es,en}', years_experience=6, available=true where id='$W1'" >/dev/null
as $W2 "update workers set zips='{33309}', services='{standard,office}', languages='{en}', years_experience=2, has_insurance=true, available=true where id='$W2'" >/dev/null
as $W3 "update workers set zips='{33308}', services='{standard}', available=true where id='$W3'" >/dev/null
check "invalid ZIPs dropped" "$(sq "select array_to_string(zips,',') from workers where id='$W1'")" '^(33304,33308|33308,33304)$'
check "approved worker can go online" "$(sq "select available from workers where id='$W1'")" '^t$'
check "pending worker stays offline" "$(sq "select available from workers where id='$W3'")" '^f$'

echo "Booking + matching"
B1=$(as $C1 "insert into bookings(segment,service,zip,city,address,urgency,budget,status,worker_id,customer_id) values ('residential','standard','33308','Fort Lauderdale','123 Secret St','asap',120,'completed','$W1','$C2') returning id" | head -1)
check "booking created" "$B1" '^[0-9a-f-]{36}$'
check "forged status/worker/customer are reset" "$(sq "select status||'|'||coalesce(worker_id::text,'none')||'|'||customer_id from bookings where id='$B1'")" "^offered\|none\|$C1$"
check "booking code assigned" "$(sq "select code from bookings where id='$B1'")" '^WC-1001$'
check "offers sent to the 2 approved, online cleaners (not the pending one)" "$(sq "select count(*) from job_offers where booking_id='$B1'")" '^2$'
check "exact-ZIP + Spanish speaker ranks first" "$(sq "select worker_id from job_offers where booking_id='$B1' order by score desc limit 1")" "^$W1$"
check "worker sees offer without the street address" "$(as $W1 "select * from my_offers()")" 'WC-1001'
check "address not exposed in offer" "$(as $W1 "select * from my_offers()")" '^[^S]*$'
check "unassigned worker cannot read the booking row" "$(as $W1 "select count(*) from bookings")" '^0$'
check "pending worker gets no offers" "$(as $W3 "select count(*) from my_offers()")" '^0$'
check "other customer sees nothing" "$(as $C2 "select count(*) from bookings")" '^0$'
check "worker cannot place bookings" "$(as $W1 "insert into bookings(segment,service,zip,urgency) values ('residential','standard','33308','asap')")" 'row-level security'
check "bad ZIP rejected" "$(as $C1 "insert into bookings(segment,service,zip,urgency) values ('residential','standard','3330','asap')")" 'check constraint'
check "scheduled booking needs a date" "$(as $C1 "insert into bookings(segment,service,zip,urgency) values ('residential','standard','33308','scheduled')")" 'scheduled_at required'
check "WhatsApp copy queued for opted-in cleaners" "$(sq "select count(*) from notifications where channel='whatsapp' and template='job_offer'")" '^2$'
check "worker sees own job-offer notification" "$(as $W1 "select count(*) from notifications where template='job_offer'")" '^1$'
check "WhatsApp outbox rows are not readable by users" "$(as $W1 "select count(*) from notifications where channel<>'inapp'")" '^0$'
check "worker cannot read others' notifications" "$(as $W1 "select count(*) from notifications where user_id<>'$W1'")" '^0$'

echo "First to accept wins"
O1=$(sq "select id from job_offers where booking_id='$B1' and worker_id='$W1'")
O2=$(sq "select id from job_offers where booking_id='$B1' and worker_id='$W2'")
check "W2 accepts" "$(as $W2 "select accept_offer('$O2')")" '^assigned$'
check "W1 is told it is taken" "$(as $W1 "select accept_offer('$O1')")" '^taken$'
check "W1 cannot accept W2's offer id" "$(as $W1 "select accept_offer('$O2')")" 'not_found'
check "assigned worker now sees the address" "$(as $W2 "select my_jobs()->>'address'")" '123 Secret St'
check "assigned worker sees customer phone" "$(as $W2 "select my_jobs()->'customer'->>'phone'")" '9545550101'
check "customer sees assigned cleaner" "$(as $C1 "select my_bookings()->'worker'->>'name'")" 'Luis Diaz'
check "customer cannot edit booking directly" "$(as $C1 "update bookings set status='completed' where id='$B1'" >/dev/null; sq "select status from bookings where id='$B1'")" '^assigned$'
check "other worker cannot start job" "$(as $W1 "select start_job('$B1')")" 'not_allowed'
as $W2 "select start_job('$B1')" >/dev/null
check "review blocked before completion" "$(as $C1 "select review_booking('$B1',5,'great')")" 'not_allowed'
as $W2 "select complete_job('$B1')" >/dev/null
check "job completed" "$(sq "select status from bookings where id='$B1'")" '^completed$'
check "other customer cannot review" "$(as $C2 "select review_booking('$B1',1,'x')")" 'not_allowed'
as $C1 "select review_booking('$B1',4,'muy bien')" >/dev/null
check "rating rolled into cleaner profile" "$(sq "select rating_avg||'/'||rating_count||'/'||jobs_done from workers where id='$W2'")" '^4\.00/1/1$'
check "only one review per booking" "$(as $C1 "select review_booking('$B1',5,'again')")" 'duplicate key'

echo "Returning customer + requested cleaner"
B2=$(as $C1 "insert into bookings(segment,service,zip,urgency,scheduled_at,preferred_worker_id) values ('residential','standard','33308','scheduled',now()+interval '2 days','$W2') returning id" | head -1)
check "requested cleaner ranks first" "$(sq "select worker_id from job_offers where booking_id='$B2' order by score desc limit 1")" "^$W2$"
check "customer can cancel" "$(as $C1 "select cancel_booking('$B2')"; sq "select status from bookings where id='$B2'")" 'cancelled'
check "offers withdrawn after cancel" "$(sq "select count(*) from job_offers where booking_id='$B2' and status='sent'")" '^0$'

echo "Price fit"
as $A "select admin_set_worker_status('$W3','approved')" >/dev/null
as $W3 "update workers set zips='{33308}', services='{standard}', languages='{es,en}', years_experience=6, hourly_rate=90, available=true where id='$W3'" >/dev/null
as $W1 "update workers set hourly_rate=25 where id='$W1'" >/dev/null
B4=$(as $C2 "insert into bookings(segment,service,zip,urgency,hours_est,budget) values ('residential','standard','33308','asap',4,120) returning id" | head -1)
check "cleaner within budget outranks an equal one priced above it" "$(sq "select (select score from job_offers where booking_id='$B4' and worker_id='$W1') - (select score from job_offers where booking_id='$B4' and worker_id='$W3')")" '^10\.0$'
as $A "select admin_set_worker_status('$W3','suspended')" >/dev/null

echo "Directory + admin"
check "directory hides phone/email" "$(as $C2 "select row_to_json(t)::text from list_workers('33308','standard') t limit 1")" '^[^@]*$'
check "directory shows short name" "$(as $C2 "select display_name from list_workers('33308','standard') order by 1")" 'Maria P\.'
check "anon cannot use directory" "$(as anon "select * from list_workers(null,null)")" 'permission denied'
check "admin stats" "$(as $A "select admin_stats()->>'workers_approved'")" '^2$'
check "admin sees all bookings with offers" "$(as $A "select count(*) from admin_bookings()")" '^3$'
B3=$(as $C2 "insert into bookings(segment,service,zip,urgency) values ('commercial','office','33130','asap') returning id" | head -1)
check "no match → stays requested (flagged for owner)" "$(sq "select status from bookings where id='$B3'")" '^requested$'
check "admin manual assign" "$(as $A "select admin_assign('$B3','$W2')"; sq "select status||'/'||worker_id from bookings where id='$B3'")" "assigned/$W2"
check "admin cannot assign unapproved cleaner" "$(as $A "select admin_assign('$B3','$W3')")" 'worker_not_approved'
as $A "select admin_set_worker_status('$W1','suspended')" >/dev/null
check "suspended cleaner forced offline" "$(sq "select available from workers where id='$W1'")" '^f$'
check "audit trail written" "$(sq "select count(*) from audit_log")" '^[1-9][0-9]*$'

echo
echo "RESULT: $pass passed, $fail failed"
[ $fail -eq 0 ]
