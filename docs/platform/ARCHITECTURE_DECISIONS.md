# We Clean It All — Architecture Decisions (ADR log)

Status key: **Accepted** = already true in the live system · **Proposed** = needs owner approval before building.

---

## ADR-01 · Business rules live in Postgres; apps stay thin — Accepted
**Why:** one source of truth for booking, dispatch, pricing, money and permissions. Any client (PWA, iOS, Android, AI agent, partner API) calls the same functions, so rules can't drift between platforms and no client can skip them.
**Alternatives:** a Node/Next.js API layer holding the rules (more code to host and keep in sync; second place to secure); rules in the app (insecure).
**Cost:** none extra (Supabase included).
**Security:** RLS + `SECURITY DEFINER` functions that check the caller; front-end checks are cosmetic only.
**Scaling:** Postgres handles thousands of bookings/day on a small instance; read-heavy screens can move to views/caching later.
**Migration/rollback:** every function is `create or replace`; rollback = re-apply the previous version from git.
**Watch-out:** PL/pgSQL is harder to unit-test → keep functions small, one responsibility each, tested with rolled-back dry-run suites (ADR-11).

## ADR-02 · Keep the plain-JS PWA; split it into modules instead of rewriting in Next.js — Proposed
**Finding:** `app/app.js` is 1,525 lines and holds booking, cleaner, owner glue, radio and rendering; `api.js` (723 lines) contains a **demo backend that re-implements business rules** in the browser.
**Decision:** no framework rewrite. Split by domain into files already loaded the same way as `dash.js`/`owner.js`: `book.js`, `provider.js`, `orders.js`, `shared/ui.js`. Demo mode becomes UI preview only (no rule logic); pricing previews read `market_for_zip` instead of local formulas.
**Alternatives:** Next.js + TypeScript rewrite (weeks of work, risk to the live business, hosting cost if server rendering); keep as is (grows into an unmaintainable monolith).
**Cost:** free (GitHub Pages).
**Security:** unchanged; logic stays server-side.
**Scaling:** fine for the app shell; heavy owner dashboards can adopt a small library later per page.
**Migration/rollback:** one module at a time on staging; each step revertible by git commit.

## ADR-03 · Roles as data: `user_roles` with scope — Proposed
**Finding:** roles today are `profiles.role` (customer/worker) + `admins` (single owner). The directive needs 8 roles.
**Decision:** `user_roles(user_id, role, scope_type, scope_id)` where role ∈ customer, cleaner, company_owner, company_member, robot_provider, ops_manager, admin, super_admin; scope = global | market | company. One function `has_role(role, scope)` used by every RPC. Super admin = today's owner (2-step required); ops managers scoped to markets; company owners scoped to their company.
**Alternatives:** JWT custom claims only (stale until re-login; harder to revoke); separate tables per role (duplication).
**Security:** roles granted only by functions requiring a higher role; every grant audited; privileged roles require 2-step (`aal2`).
**Migration/rollback:** additive table + backfill from `profiles.role`/`admins`; `is_admin()` kept as a wrapper so nothing breaks.

## ADR-04 · Orchestration = explicit state machine + event log + outbox — Proposed
**Finding:** booking status today has 6 values; transitions are spread across functions (`accept_offer`, `start_job`, `complete_job`, `cancel_booking`, …) and checked individually; notifications use an outbox table polled by cron (good).
**Decision:**
- Table `booking_transitions(from_state, to_state, actor_roles[], guard_fn)` = the allowed graph. One function `transition_booking(booking, to_state, reason, idempotency_key)` locks the row, validates from→to, checks the actor's role, runs the guard, writes the change and appends to `domain_events`. Existing functions are refactored to call it (one at a time).
- Lifecycle: REQUESTED → VALIDATED → PRICED → PAYMENT_AUTHORIZED → PROVIDER_MATCHING → OFFERED → ACCEPTED/ASSIGNED → IN_PROGRESS → QUALITY_CHECK → COMPLETED → PAYMENT_CAPTURED → SETTLED, plus CANCELLED, REJECTED, FAILED, REFUND_PENDING, REFUNDED, RESCHEDULED, NEEDS_ATTENTION (recovery). Until Stripe exists, the payment states are skipped by a market flag (`payments_mode = 'offline'`), never faked.
- `domain_events` (append-only) is the history every module reads: notify, agents, analytics, robotics.
- External calls (Stripe, Twilio, robot vendors) go through `outbox_jobs(id, kind, payload, idempotency_key unique, attempts, next_attempt_at, status)` processed by edge functions with timeouts and capped exponential retry; replies/webhooks land in `inbox_events(provider, external_id unique)` so duplicates are ignored.
- A watchdog in the orchestrator moves stuck workflows (timeouts) to NEEDS_ATTENTION and alerts the owner — restart recovery is "read state from the database", never in-memory.
**Alternatives:** Temporal/Inngest/queue services (new vendor, cost, more moving parts); keep ad-hoc functions (rules drift, no full history).
**Cost:** none (pg_cron + pg_net + edge functions). Later option: Supabase Queues (pgmq) if volume needs it.
**Security:** one choke point for status changes; actor and reason recorded on every event.
**Scaling:** row-level locks per booking; events table partitioned by month when large.
**Migration/rollback:** new columns/tables are additive; old status values map 1:1 (`requested`, `offered`, `assigned`, `in_progress`, `completed`, `cancelled`); functions switched one by one with tests; rollback = previous function versions.

## ADR-05 · AI: reasoning separated from rules; tools with the caller's permissions — Proposed (partly accepted)
**Accepted today:** one AI caller (`ai.ts`) with a monthly cap checked before every call, cost recorded, fails closed; agents registry with approval classes; append-only agent log.
**Proposed:** AI never calls the database as service role for user-facing work. Assistants get a short allowlist of tools that map to existing RPCs and run **with the requesting user's token**, so the database enforces their permissions. Sensitive actions (refunds, payouts, market activation, big price changes, account changes) can only create an `approvals` request. Provider adapter interface (`anthropic`, `openai`) chosen in `agent_settings`; nothing active without a key and a passing test.
**Cost:** capped (owner sets the cap).
**Security:** prompt text treated as data; outputs validated against schemas; every recommendation logged.

## ADR-06 · Robotics through a vendor-neutral adapter, simulator first — Proposed
**Decision:** robots are providers of type `robot_fleet` with `robot_units`, `robot_models`, `robot_capabilities`, `robot_task_rules`. An edge function `robotics` exposes one interface (`describe`, `status`, `request_mission`, `progress`, `pause`, `cancel`) with one adapter per manufacturer. The platform only requests **missions through the vendor's supported API**; it never sends motion commands, never disables emergency stop or geofencing, and always requires an assigned human supervisor. A `simulator` adapter is labeled everywhere, has `is_simulated = true`, and cannot be attached to a real customer booking in an active market. A unit becomes dispatchable only after `integration_verified` and `field_test_passed` are recorded by an admin.
**Cost:** none until a vendor contract.
**Migration/rollback:** separate tables and function; can be switched off per market.

## ADR-07 · Payments with Stripe Connect Express + internal ledger — Proposed
**Decision:** Stripe hosts card entry (no card data touches us). PaymentIntent per booking with `application_fee_amount`; manual capture after completion (or authorization hold); payouts to providers' connected accounts. Internal `ledger_entries` (double-entry: customer charge, platform fee, provider earning, tip, refund, tax) reconciled nightly with Stripe balance transactions. Webhooks verified by signature and stored in `inbox_events` (idempotent).
**Cost:** Stripe card fees + Connect fees (check current Stripe pricing); no fixed cost.
**Security:** refunds and payout exceptions need owner approval; AI cannot release money.

## ADR-08 · Real-time: Supabase Realtime for tracker and offers; polling fallback — Proposed
**Finding:** the app polls (`setInterval`) for offers, orders and location.
**Decision:** subscribe to row changes (own bookings/offers only, enforced by RLS) and keep polling as fallback. **Cost:** included; free-plan connection limits apply → Pro plan before scale.

## ADR-09 · Mobile: PWA now; native apps on the same API — Proposed
**Decision:** finish PWA (web push, offline-safe screens). Native: Expo/React Native app calling the same RPCs (or Capacitor wrapping the PWA for a faster first release). No business logic in native code. **Cost:** Apple $99/year, Google Play $25 one-time.

## ADR-10 · Environments: staging + production, promotion by approval — Proposed (urgent)
**Finding:** one Supabase project and `main` = live; changes go straight to customers.
**Decision:** second free Supabase project `wcia-staging`; staging site from a `staging` branch; numbered migrations in `marketplace/supabase/migrations/NNNN_name.sql` with a matching `rollback/NNNN_name.sql`; promote to production only after tests pass and owner approves.
**Cost:** free (second free project). Supabase Pro ($25/month) recommended before public launch for backups, no auto-pause, leaked-password protection, and branching.

## ADR-11 · Testing: rolled-back database suites + browser checks in CI — Proposed
**Decision:** keep the dry-run SQL suites (they run safely even against production) and add GitHub Actions: JS syntax check, local function harnesses, SQL suites against staging, phone-size browser smoke test. A phase is "done" only with recorded results.

## ADR-12 · Multi-market and multi-tenant — Accepted (markets) / Proposed (companies)
**Accepted:** markets with status gate, ZIP areas, pricing, tax, time zone, dispatch mode; bookings refused outside active markets.
**Proposed:** companies as tenants: `companies`, `company_members(role)`, RLS by membership so companies never see each other's data; currency and language per country for international later.

## ADR-13 · Disaster recovery — Proposed
Nightly logical backup (GitHub Action `pg_dump` to private storage, needs the DB connection string as a GitHub secret), weekly restore test into staging, documented RTO 4h / RPO 24h on free plan (better with Pro/PITR). Static site is in git (instant redeploy).
