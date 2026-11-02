# We Clean It All — Architecture

## Principle
**Business rules live in the database; apps are thin.** Every action (book, offer, accept, assign, pay, activate a market) is a Postgres function with its own permission check, protected by row-level security. The web PWA, a future iOS/Android app and AI agents all call the same functions, so behavior cannot differ between platforms and no client can skip a rule. "AI recommends, dispatch rules enforce, admin controls exceptions."

```
 Customer PWA      Provider PWA      Owner / Ops console      (future) iOS + Android
        \               |                    |                     /
         \______________|____________________|____________________/
                                  |  HTTPS (Supabase REST / RPC, Auth JWT)
                    ┌─────────────┴──────────────┐
                    │  Postgres (Supabase)        │
                    │  · RLS on every table        │
                    │  · SECURITY DEFINER RPCs     │
                    │  · triggers = guards          │
                    │  · append-only audit/agent log│
                    └─────┬───────────────┬────────┘
                          │ pg_cron       │ pg_net
              ┌───────────┴──┐     ┌──────┴────────────────────────┐
              │ orchestrator │     │ Edge functions (Deno)          │
              │ every 5 min  │     │ brain · ai-ceo · brain-learn   │
              └──────────────┘     │ notify · whatsapp-in           │
                                   │ (future) payments · robotics   │
                                   └──────┬──────────────────────────┘
                                          │ Anthropic · Twilio · Resend · (future) Stripe · Maps · robot vendors
```

## Domains and main tables

| Domain | Tables | Key functions |
|---|---|---|
| Identity & roles | `auth.users`, `profiles`, `workers`, `admins`, `trusted_devices` | `is_admin()` (owner + 2-step or trusted device), `guard_profiles`, `guard_workers` |
| Geography & markets | `countries`, `states`, `cities`, `markets`, `service_areas`, `market_pricing`, `tax_configurations`, `market_launch_checklists` | `market_for_zip`, `admin_markets`, `admin_set_market_status` (checklist gate) |
| Providers | `workers` (+`provider_type`), `provider_coverage`, `provider_compliance`, `insurance_policies` | `provider_block_reason` (single eligibility rule) |
| Booking & dispatch | `bookings`, `job_offers`, `reviews` | `_booking_market` (market + tz + tax), `rank_workers`, `dispatch_booking` (auto/hybrid/admin/paused), `accept_offer` (row lock, first valid wins), `admin_assign` (override, same rules) |
| Money | `pay_settings`, booking `fee_pct/service_fee/tax_amount/total` | `_booking_fee`, `pay_info`, `admin_money`, `admin_set_fees` |
| Commercial | `commercial_accounts`, `commercial_locations` | (Phase 8) |
| Agents & AI | `agent_registry`, `agent_settings`, `agent_actions` (append-only), `agent_tasks`, `approvals`, `ai_usage`, `brain_notes`, `brain_questions` | `orchestrator_tick`, `ai_budget`, `ai_record_usage`, `agent_is_live` |
| Messaging | `notifications` (outbox), `wa_messages` | `_notify`, `wa_lookup`, `wa_handoff` |
| Audit | `audit_log` | `_audit` |

## Dispatch flow (implemented)
1. Booking insert → `_booking_market` finds the market from the ZIP; refuses if no market or market not active; sets local time zone and tax.
2. `_booking_fee` computes service fee, tax and total (client cannot override).
3. `dispatch_booking`: paused or admin mode → owner alert, no offers. Otherwise `rank_workers` scores **only eligible** providers and offers to the top 5 (8 if ASAP).
4. `accept_offer` locks the booking row and re-checks eligibility; first valid acceptance wins; other offers marked lost.
5. Owner `admin_assign` can assign/replace, but eligibility still applies.
6. Orchestrator re-offers stale requests, flags late jobs, alerts the owner.

Eligibility (`provider_block_reason`): approved · available · offers the service · not the customer · market exists · not suspended in the market · approved coverage or ZIPs in that market · verified unexpired general liability when the market requires insurance · verified compliance items the market requires.

Ranking factors today: ZIP proximity (exact/nearby), rating, offer-acceptance reliability, jobs done, experience, repeat customer, language, team capacity for large commercial jobs, price fit, insurance, preferred cleaner. **Distance/travel time** is ZIP-based until provider locations are stored (Phase 6).

## Planned modules (not built)
- **Robotics** (`robot_manufacturers`, `robot_providers`, `robot_models`, `robot_units`, `robot_capabilities`, `robot_task_rules`, `robot_telemetry`, `robot_maintenance`, adapters): vendor-neutral adapter interface (`connect`, `status`, `assign_mission`, `progress`, `pause`, `stop`), one adapter per manufacturer behind an Edge Function; a **clearly labeled simulator adapter** for development. Robots get the same eligibility gate plus: verified integration, real-world test passed, geofence, human supervisor assigned, battery/maintenance OK. The platform never sends commands that override manufacturer safety or emergency stop.
- **Payments** (Stripe Connect Express): checkout/PaymentIntent with application fee, signed + idempotent webhook function, payouts, refunds requiring owner approval.
- **Native apps**: Expo/React Native (or Capacitor wrapping the PWA) calling the same RPCs; push via Expo/APNs/FCM.
