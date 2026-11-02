# We Clean It All — MASTER BLUEPRINT
_The global Human + AI + Robotics cleaning ecosystem. Version 1 · 2026-11-02._
_The intelligence of a company. The power of a marketplace. The future of robotics._

Status legend used in every master document: **LIVE** (production, tested) · **BUILT** (tested, not applied) · **SIMULATED** (labeled simulator only) · **PLANNED**.

## Document set
| # | Document | Covers (Prompt 23 part) |
|---|---|---|
| 1 | MASTER_BLUEPRINT.md (this) | summary, conflicts resolved, marketplace (5), finance (6), national/global (7), ecosystem (9) |
| 2 | MASTER_SYSTEM_DIAGRAM.md | complete architecture map (1) |
| 3 | MASTER_DATABASE_ARCHITECTURE.md | every table, owner module, live vs planned |
| 4 | MASTER_ORCHESTRATION.md | orchestration engine (2) |
| 5 | MASTER_AI_ARCHITECTURE.md | supervisor + agents (3) |
| 6 | MASTER_ROBOTICS_ARCHITECTURE.md | robotics (4) |
| 7 | MASTER_SECURITY_ARCHITECTURE.md | security & reliability (8) |
| 8 | MASTER_INTEGRATION_MAP.md | every external service and its door |
| 9 | MASTER_DEPLOYMENT_ARCHITECTURE.md | environments, deploy, rollback, DR |
| 10 | MASTER_IMPLEMENTATION_ROADMAP.md | phased roadmap (10) |

## What actually exists (inspected, not assumed)
Static website + installable PWA (plain JavaScript, no build step) on GitHub Pages at wecleanitallfl.com · Supabase Postgres (free plan) holding all business rules as database functions with row-level security · 5 Deno edge functions (assistant, owner briefing, learning, notifications outbox, WhatsApp webhook) · pg_cron jobs · Claude via one capped caller (no key yet) · Twilio/Resend code ready (no keys yet) · **no Stripe, no robots, no native apps yet.** Test copy project `wcia-staging` created (schema copy 3/24 done).

## Conflicting design decisions — resolved
| Conflict | Resolution | Why |
|---|---|---|
| Directive suggests Next.js/TypeScript/React Native/OpenAI; repo is plain-JS PWA + Supabase + Claude | **Keep the current stack.** Add Expo/React Native later on the same database functions. AI provider made configurable (Claude now, OpenAI optional). | Preserve the working business; rules already live in the database so any client shares them |
| Lifecycle puts PAYMENT_AUTHORIZED before matching, but there is no payment provider | Per-market `payments_mode`: `offline` skips payment states and closes as CLOSED_OFFLINE; `stripe` requires confirmed webhooks | Never fake a payment state |
| Old `status` (6 values) vs new 21-state lifecycle | `status` kept for compatibility; `workflow_state` is the authority; one trigger keeps both in step | No app rewrite needed |
| 12 requested agents vs 10 existing | Mapped onto existing registry; start with 5 live; others off until their feature exists | Avoid AI complexity without data |
| One owner account vs 8 roles | `user_roles` with scope; today's owner = super admin (2-step) | Least privilege without breaking owner lock |
| "Never assign an unavailable provider" vs scheduled future jobs | Today "available" = Go active; Phase 3 adds availability calendars and eligibility uses the job's time | Correct for both instant and scheduled work |
| "Marketplace commission" vs implemented client service fee | Service fee on the client (cleaner keeps 100%) is the default; optional provider commission per market later | Matches owner decision (option 1 + 4) |
| Demo mode in the browser re-implements rules | Demo becomes UI-preview only | One source of truth |
| Robots "connected" | Only after verified vendor integration + field test; simulator always labeled | Honesty + safety |

## Part 5 — Marketplace
Residential (apartments, houses, deep, move in/out, Airbnb, recurring, emergency/ASAP) and commercial (offices, banks, medical, hotels, retail, buildings, warehouses) share **one booking record**. Recurring plans and commercial work orders *generate bookings*. Service type per booking: `human` (LIVE), `robot` / `hybrid` (PLANNED — offered only where an approved robot provider covers that market, never advertised otherwise). Pricing per market and service (LIVE), fee and tax computed by the database (LIVE).

## Part 6 — Financial architecture
- **Today (LIVE):** price floor, 12% client service fee and $1.99 same-day payout fee configured; tax rules (off); `admin_money` report. Payments happen outside the app; nothing is charged.
- **Planned:** Stripe Connect Express — PaymentIntent per booking with application fee; capture after completion; connected-account payouts (weekly free, instant with fee); tips; refunds only by owner approval; **double-entry `ledger_entries`** (charge, platform fee, provider earning, tip, tax, refund, payout) written only from confirmed Stripe events via the inbox; nightly reconciliation with Stripe balance transactions; subscriptions via Stripe Billing; receipts; profitability per booking computed from the ledger (actual) vs estimates (labeled).

## Part 7 — National and global
LIVE: countries, states, cities, markets with status planned/onboarding/ready/active/paused/closed, ZIP service areas, market pricing, tax configurations, time zones, insurance/compliance requirements per market, launch checklist gate (owner-only activation). Miami-Dade + Broward active; Palm Beach, Orlando, Tampa planned. PLANNED: currency + language per country, local payment methods, data-residency projects per region (e.g. EU) — international stays inactive until legal and operational review.

## Part 9 — Business ecosystem (all plug into existing modules)
Cleaning marketplace (LIVE core) · commercial contracts (tables LIVE, workflow PLANNED) · AI property manager (read tools over the client's own data) · Robot-as-a-Service (robot fleets as providers + agreements) · equipment marketplace (partner listings, later) · Global Cleaning Academy (training records on providers) · smart building intelligence (authorized building data → property profiles) · sustainability intelligence (measured vs estimated) · developer integrations (API gateway over the same functions). See INNOVATION_ROADMAP.md for priorities.

## Safest implementation sequence (summary)
1 Apply orchestration (BUILT) → 2 finish staging + CI → 3 roles/teams → 4 Stripe + ledger → 5 provider verification + checklists/photos → 6 owner command-center screens → 7 commercial contracts + subscriptions → 8 BI/profitability + rescue dispatch → 9 robotics registry + simulator → 10 native apps → 11 partner API → 12 next markets. Details: MASTER_IMPLEMENTATION_ROADMAP.md.
