# We Clean It All — System boundaries and ownership

Each module owns its tables and is the only one allowed to write them. Other modules read through views/functions or react to `domain_events`. "Owner" = the code module responsible, and the human role accountable.

| Module | Owns (tables) | Public interface (functions / endpoints) | Reads from | Human owner |
|---|---|---|---|---|
| **Identity & Access** | `profiles`, `admins`, `trusted_devices`, (proposed) `user_roles` | `is_admin`, (proposed) `has_role`, sign-in via Supabase Auth | — | Super admin |
| **Geography & Markets** | `countries`, `states`, `cities`, `markets`, `service_areas`, `market_pricing`, `tax_configurations`, `market_launch_checklists` | `market_for_zip`, `admin_markets`, `admin_set_market_*`, `admin_create_market` | Identity | Ops manager per market |
| **Providers** | `workers`, `provider_coverage`, `provider_compliance`, `insurance_policies`, docs bucket, (proposed) `companies`, `company_members` | `provider_block_reason` (eligibility), profile functions, `admin_set_worker_status`, `admin_set_coverage` | Identity, Markets | Ops manager |
| **Robotics** (proposed) | `robot_*` tables | `robotics` edge function (adapter interface), eligibility extension | Providers, Markets | Ops manager + robotics lead |
| **Booking** | `bookings`, `reviews`, (proposed) `booking_transitions`, `properties` | create booking, `transition_booking`, cancel, review | Markets (price, area), Identity | Customer support |
| **Dispatch** | `job_offers` | `rank_workers`, `dispatch_booking`, `accept_offer`, `admin_assign`, `admin_candidates` | Booking, Providers, Markets | Ops manager |
| **Money** | `pay_settings`, fee/tax columns, (proposed) `payments`, `payouts`, `ledger_entries` | `_booking_fee`, `pay_info`, `admin_money`, (proposed) `payments` edge function + webhook | Booking, Markets | Owner (finance) |
| **Commercial** | `commercial_accounts`, `commercial_locations`, (proposed) quotes, proposals, agreements, invoices | (Phase 8) | Booking, Money, Markets | Sales/ops |
| **Messaging** | `notifications` (outbox), `wa_messages` | `_notify`, `notify` edge fn, `whatsapp-in` | Identity, Booking (read-only context) | Support |
| **Agents & AI** | `agent_registry`, `agent_settings`, `agent_actions`, `agent_tasks`, `approvals`, `ai_usage`, `brain_*` | `orchestrator_tick`, `ai_budget`, `brain`, `ai-ceo` | everything **read-only**; writes only through other modules' functions or `approvals` | Owner |
| **Audit** | `audit_log`, (proposed) `domain_events` | `_audit` | — (write-only sink) | Super admin |

## Hard rules
1. **No module writes another module's tables directly.** Example: AI agents create `approvals`, they never update `bookings` or money tables.
2. **Eligibility has one home:** `provider_block_reason`. Offers, acceptance, manual assignment and (later) robots all call it.
3. **Price has one home:** `market_pricing` + `_booking_fee`. Apps only display previews.
4. **Status changes have one home** (proposed `transition_booking`).
5. **External services only through edge functions**, behind the outbox/inbox, with idempotency keys.
6. **Apps never hold rules**; they render and call functions.
