# Marketplace review — 2026-11-01

Scope: `app/` (browser scripts), `sw.js`, `marketplace/supabase/schema.sql`, live Supabase project `we-clean-it-all`.

## Results
- Syntax check passes for `app/*.js` and `sw.js`.
- `ai-ceo` and `notify` edge functions (TypeScript) were not compiled: no TypeScript toolchain in the review environment.
- Repo `schema.sql` function bodies match the live database for accept_offer, admin_set_worker_status and dispatch_booking.
- Grants: anon and authenticated get execute only on the functions the apps need, per `schema.sql` lines 587–607.
- Security test suite (66 tests) was not run: no Postgres server in the review environment.

## Open items (dashboard, not code)
1. Supabase Auth: turn off "Confirm email" (until a custom SMTP is connected) and set minimum password length to 8.
2. Supabase Auth: enable leaked-password protection (advisor `auth_leaked_password_protection`).
3. Supabase Auth URL configuration: Site URL and redirect URLs set to https://www.wecleanitallfl.com/.
4. Owner account: create with wecleanitallfl@gmail.com, add to `public.admins`, enable 2-step verification.

## Advisor notes
- 22 SECURITY DEFINER functions are executable by `authenticated`. Admin functions check `is_admin()` inside the body. Owner review should confirm each non-admin function checks `auth.uid()` ownership (accept_offer, decline_offer, complete_job, start_job, cancel_booking and review_booking do).
- `admins` has RLS enabled and no policies. Intended: it is read only through `is_admin()`.
