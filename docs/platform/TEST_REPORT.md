# We Clean It All — Test report

Only tests that actually ran are listed. All database tests run inside a transaction that is rolled back on purpose (`RAISE EXCEPTION 'DRYRUN_RESULT…'`), so nothing is saved on the live project.

## Run on 2026-11-02

| Suite | Tests | Result |
|---|---|---|
| National markets + dispatch rules | 26 | **26 pass** |
| WhatsApp agent database rules | 36 | 36 pass |
| WhatsApp function logic (local harness, mocked network) | 37 | 37 pass |
| Agents rules (live-safe) | 48 | 48 pass |
| Service fee + price floor (ad hoc) | 6 | 6 pass |
| QA scenarios (below) | 12 | **10 pass, 1 real failure, 1 test-sequence artifact** |

### QA scenarios (2026-11-02, 18:05 ET)
| Scenario | Result |
|---|---|
| Two eligible providers both receive the offer | PASS |
| **Two providers accept the same job → only the first wins, second gets "taken"** | PASS |
| Cleaner calls owner-only assignment | PASS (admin_only) |
| Cleaner tries to change fees | PASS (admin_only) |
| Cleaner tries to take a job by editing the booking row directly | PASS (blocked by row security) |
| Owner replaces the provider on an assigned job | PASS |
| **Worker suspended while assigned: the job stays assigned to them** | FINDING — no automatic reassignment or owner alert |
| **Suspended worker can still start the job** | **FAIL — security bug (HIGH)**: `start_job` (and likely `on_my_way`, `complete_job`, `share_location`) do not re-check that the worker is still approved |
| Market paused → new bookings refused | PASS |
| Market paused → existing future bookings | FINDING — left as they are, customer not told; needs a policy (keep / reassign / notify) |
| Customer cancels | test artifact: the job had already been started by the suspended worker (see FAIL), so cancel was correctly refused (`not_allowed` for in-progress jobs) |
| Accept after the job is gone | PASS |

## Not run (cannot run yet — nothing to test)
- Payment authorization/capture, duplicate payment webhooks, cancellation after authorization, refunds → **Stripe not built**.
- AI outage → behavior is coded (falls back to built-in replies) and covered in the local harness, but no live AI key exists.
- Robot stops unexpectedly → **robotics module not built**.
- Provider internet loss → needs browser/network test on staging.
- Load tests, failure-recovery drills → need staging (never against production).
- Database transaction failure → partially covered (every failed rule rolls back the whole action), no dedicated test yet.

## Unresolved
1. **HIGH:** suspended/unapproved providers can continue an already-assigned job (start, on-the-way, complete, location). Proposed fix: every job action calls `provider_block_reason`-style status check (approved), and suspension triggers owner alert + re-dispatch of their open jobs.
2. MEDIUM: market pause policy for existing bookings.
3. Release blocked for payments/robotics features until built and tested.

## Staging launch evidence — 2026-11-02/03 (Supabase `wcia-staging`, synthetic people only, every SQL suite rolled back)
| Suite | Result | What it proves |
|---|---|---|
| Backup checksums (production, read-only) | 32/32 tables identical | backup is exact; 0 uploaded files exist |
| Restore drill (production structure, rolled back) | 32 tables, 254 rows, 0 mismatches | backup can be restored |
| Schema parity | 588/588 objects | staging = production |
| `test/orchestration_test.sql` | 54/54 (re-run after payments: 54/54) | lifecycle, assignment race, cancel, owner override, retries, crash recovery, duplicate bookings/webhooks, append-only history, AI limits, only Miami-Dade + Broward open |
| Notification routing (inline) | 11/11 | email customers, guest texts, cleaner WhatsApp, queued until keys |
| `test/notify_templates.test.mjs` | 31/31 | every message in Spanish + English, subjects, ET time, totals |
| `test/payments_test.sql` | 53/53 | SIMULATED Stripe events: unpaid hidden from cleaners, declines, amount mismatch, live-mode lock, duplicate auth/capture/transfer/refund, balanced ledger, payout gate (approval, onboarding, payouts enabled, mode), owner-only refunds, cancel/release, outage retry, SMS consent + STOP, email retry ×5 then alert |
| `test/stripe_functions.test.mjs` | 39/39 | real HMAC signature checks (wrong secret, tampered, replay, forged), duplicate webhook, live event ignored, failure → 500 so Stripe retries, live key refused, idempotency keys on every call, no secrets in code or app |
| Live staging calls | 9/9 as designed | notify 403/403/200; webhook 400/400; payments 403/200/401; queue probe → `stripe_not_configured` |
| `test/command_center_test.sql` | 28/28 | anon, customers and the owner without 2-step are refused; paging, search by code/name/phone, market and type filters; phone masked in lists; letters never match phone numbers; dispatch labeled RECOMMENDATION, ineligible cleaners explained; reschedule refuses past times and missing reasons, writes history + audit, emails the customer; cancel with reason audited; commercial stages validated + audited; reports counted from records |
| `test/notify_templates.test.mjs` (now builds from the real function file) | 35/35 | adds the "new time" message, es + en |
| Command Center screenshots | 12 modules + 3 detail screens, desktop + phone | rendered with the app's real code fed by real staging responses (`screenshots/command-center/fixtures.js`); every record is a TEST record |

**Not yet proven (needs keys):** a real Stripe test-mode payment, decline card, capture, refund and Connect payout; real email delivery through Resend; real SMS. These are NOT claimed to work until run.
