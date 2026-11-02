# We Clean It All — Dependency map

## Allowed direction (arrows = "may call / read")
```
Apps (PWA customer · provider · owner; future iOS/Android)
   │  only through api.js → Supabase RPC/REST (user's JWT)
   ▼
┌──────────────── Postgres modules ────────────────┐
│ Identity & Access  ◄── everything                 │
│ Markets            ◄── Providers, Booking, Dispatch, Money, Commercial
│ Providers          ◄── Dispatch, Robotics          │
│ Booking            ◄── Dispatch, Money, Commercial, Messaging(read)
│ Dispatch           ◄── Booking (trigger: after insert) │
│ Money              ◄── Booking (fee trigger)        │
│ Audit / events     ◄── all (write-only sink)        │
│ Agents & AI        ──► reads all; writes only via module functions / approvals
└───────────────────────────────────────────────────┘
   │ pg_cron / pg_net / outbox                ▲ webhooks (inbox)
   ▼                                          │
Edge functions: brain · ai-ceo · brain-learn · notify · whatsapp-in · (future) payments · robotics
   │
   ▼  external: Anthropic · Twilio · Resend · (future) Stripe · Google Maps · robot vendors
```

## Current dependencies found in the code (audit)
| From | To | Kind | OK? |
|---|---|---|---|
| `bookings` insert | `_booking_market` → `guard_*` → `_booking_fee` → `after_booking_insert` → `dispatch_booking` → `rank_workers` → `provider_block_reason` | triggers, same transaction | OK (ordered by trigger name `a1_`, `a_`, `b_`, `c_`, `guard_`); dispatch runs inside the customer's insert — acceptable now, move to event consumer when volume grows |
| `orchestrator_tick` | `rank_workers`, `_agent_alert`, `_notify` | SQL calls | OK (agents read + call module functions) |
| `_agent_alert` | `_notify` | SQL | OK |
| edge `brain`, `ai-ceo`, `whatsapp-in` | `ai.ts` (copied into each function) | code copy | **Duplicate code** — deploy tooling needs one file; keep `_shared/ai.ts` as source and copy at deploy (scripted) |
| edge `whatsapp-in`, `notify` | service role → limited RPCs | HTTP | OK; each RPC is service-role only and narrow |
| `app/api.js` demo backend | re-implements booking/dispatch/fees in JS | duplicate logic | **Violation** — reduce to UI preview (ADR-02) |
| `app/app.js` `suggest()` | price formula | duplicate logic | **Violation** — read `market_for_zip` pricing (server) |

## Circular dependencies
None found in SQL (no function calls back into its caller's module). Triggers form a chain, not a cycle; `admin_assign` and `accept_offer` both depend on `provider_block_reason`, which depends only on tables.

## External dependencies and failure impact
| Service | Used for | If down |
|---|---|---|
| Supabase (DB/Auth) | everything | app unavailable (critical) |
| GitHub Pages | website + app files | site unavailable; service worker shows cached shell |
| Anthropic | AI replies | built-in replies (graceful) |
| Twilio / Meta | WhatsApp/SMS | messages wait in outbox; in-app notifications still work |
| Resend | email | outbox waits |
| Google Maps (links) | navigation | links fail; app works |
| Stripe (future) | payments | bookings in "payment pending"; no capture without confirmation |
| Robot vendors (future) | missions | robot jobs → NEEDS_ATTENTION, human fallback |
