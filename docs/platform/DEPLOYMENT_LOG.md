# We Clean It All — Deployment log
Every change to production or staging: what changed, who approved it, test evidence, and how to undo it.
Production = Supabase `fqajygzjteauxornipva` + GitHub Pages `main` (wecleanitallfl.com). Staging = Supabase `wcia-staging` (`elzpvlpeypkcsvywwebl`).
Approver "owner" = Rolando Castanon (RDCM), approval given in the Claude conversation, quoted.

| # | Date (ET) | Env | Change | Approved by | Tests / evidence | Rollback |
|---|---|---|---|---|---|---|
| H1 | 2026-10-31 → 11-02 | prod | Migrations 1–24 (marketplace phase 1 → national markets b). Listed in `supabase_migrations.schema_migrations` | owner, per feature in earlier sessions | per-feature suites in `marketplace/supabase/test/` (agents 48/48, WhatsApp 36/36 + 37/37, national markets 26/26) | `create or replace` previous function versions; additive tables can stay |
| H2 | 2026-11-02 | prod | `provider_must_stay_approved`: a suspended cleaner can no longer act on jobs; assigned jobs re-dispatch, in-progress jobs alert the owner | owner: "Approve 1,2,3" | QA scenario found the bug; fix re-verified on staging 2026-11-02 (`in_progress_suspension_alerts_owner`, `suspended_cleaner_cannot_complete`, `suspension_redispatches` PASS) | `drop trigger a2_booking_worker_active, z_worker_lost_approval` |
| 1 | 2026-11-02 18:40 | prod | **Backup**: schema `backup_20261102` with a copy of all 32 public tables + account records (id, email, phone, dates, metadata; no passwords). Locked to service roles only | owner: "Back up production data" | Checksums: 32/32 tables identical to live at snapshot time (later only 2 new guest sessions). Storage: 0 uploaded files exist. Restore drill: all 32 tables restored into fresh copies of the production structure, 254 rows, 0 mismatches (rolled back) | Not needed (read-only copy). Remove later with owner approval |
| 2 | 2026-11-02 | staging | Schema brought to production parity: 588 objects (tables, columns, functions, triggers, policies, grants) identical; 7 functions differ only in whitespace/line endings. Nightly brain-learn cron not scheduled on staging; notify cron points at staging | owner: "Bring staging up to production" | Fingerprint diff: only-prod 0, only-staging 0 | Staging only |
| 3 | 2026-11-02 | staging | **Orchestration engine v1** (`orchestration.sql`) + watchdog cron every 10 min | owner: "Enable orchestration in staging" | `test/orchestration_test.sql`: **54/54 PASS** (creation, assignment race, cancellation, owner override, retries/backoff/dead letter, crash recovery, duplicate webhooks/payment jobs, append-only history, AI permission limits, market gating) | drop triggers `a0_booking_workflow_init`, `a_booking_workflow_insert`, `a3_booking_workflow_update`, `z_booking_close_offline`; `cron.unschedule('orchestration-watchdog')` |
| 4 | 2026-11-02 | staging | **Duplicate booking guard** (`guard_duplicate_booking.sql`): same customer + service + ZIP + time within 10 min is refused | owner: "Verify duplicate bookings … are prevented" | 4 tests in the suite above | `drop trigger a4_guard_duplicate_booking` |
| 5 | 2026-11-02 | branch `milestone1` | App: clear messages for duplicate booking, ZIP outside the area, market not open, service not offered, price too low (these used to show "something went wrong") | pending — goes live only with the production approval | `node --check` passes; browser check pending on the staging site | revert the commit |

| 6 | 2026-11-02 | staging | **Customer notifications** (`customer_notifications.sql`): customers get email (or a text for guest bookings) for received / assigned / on the way / completed / cancelled / reassigning; new booking-received confirmation | owner: "Test … booking confirmations, and notifications" | Routing tests 11/11 PASS (rolled back) | re-apply previous `_notify` and `after_booking_insert` |
| 7 | 2026-11-02 | staging | **notify function v1 on staging**: bilingual (es/en by profile), subject per message, `APP_URL` setting | same | Templates 29/29 (`test/notify_templates.test.mjs`); live call checks: no secret 403, wrong secret 403, correct secret 200 | redeploy previous version from git |

## Not done yet — needs the owner
- **Email keys**: Resend account, verify the domain wecleanitallfl.com (DNS records), then add `RESEND_API_KEY` and `EMAIL_FROM` as secrets on staging. Until then emails wait in the queue (tested).
- **Sign-up / password-reset emails** come from Supabase Auth, not our code: set SMTP (Resend) and Site URL / Redirect URLs in the dashboard, on staging and production.

## Waiting for owner approval (production)
- Orchestration engine v1 (entry 3), duplicate guard (4), app messages (5), customer notifications (6), notify v1 (7).
