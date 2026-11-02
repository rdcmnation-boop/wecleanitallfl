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
