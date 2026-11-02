# We Clean It All — Master system diagram

_Consolidates SYSTEM_BLUEPRINT.md and DEPENDENCY_MAP.md._


_"The intelligence of a company. The power of a marketplace. The future of robotics."_
One customer identity · one provider identity · one booking record · one financial ledger · one orchestration system · one source of operational truth.

Legend: **LIVE** (in production, tested) · **BUILT** (tested, not applied) · **PLANNED**

## 1. The whole machine on one page
```
                         ┌──────────────────────────── EXPERIENCES ────────────────────────────┐
                         │ Customer app (PWA) · Business portal · Provider app (cleaner/company)│
                         │ Owner Command Center · WhatsApp agent · (future) iOS/Android · APIs  │
                         └───────────────┬──────────────────────────────────────┬──────────────┘
                                         │ one API: database functions (RPC)    │ partner API gateway (PLANNED)
                                         ▼  with the user's login token          ▼  scoped keys, webhooks
┌──────────────────────────────────────── ONE DATABASE (source of truth) ───────────────────────────────────────┐
│ IDENTITY      one person = one auth user + profile; roles as data (PLANNED user_roles); 2-step for owner (LIVE)  │
│ MARKETS       countries · states · cities · markets · ZIP areas · prices · tax · checklist (LIVE)               │
│ PROVIDERS     cleaners · companies · WCIA teams · coverage · compliance · insurance (LIVE) · teams (PLANNED)     │
│               robots: manufacturers · fleets · units · capabilities · task rules (PLANNED)                      │
│ PROPERTIES    digital twin profiles, areas, robot zones (PLANNED)                                               │
│ BOOKINGS      one booking record · workflow state machine (BUILT) · reviews (LIVE)                              │
│ DISPATCH      one eligibility rule `provider_block_reason` · ranking · offers · first-valid-accept (LIVE)       │
│ MONEY         fees · tax · floor (LIVE) · one double-entry ledger + Stripe Connect (PLANNED)                    │
│ COMMERCIAL    accounts · locations (LIVE tables) · quotes → agreements → work orders → invoices (PLANNED)       │
│ TRUST & SAFETY incidents · disputes · claims · fraud risk scores with human review (PLANNED)                    │
│ EVENTS        domain_events history (BUILT) · outbox/inbox for outside calls (BUILT) · audit_log (LIVE)         │
│ AGENTS        registry · approvals · append-only log · AI cost cap (LIVE)                                       │
└─────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                              │ background workers: pg_cron (orchestrator 5 min LIVE, watchdog 10 min BUILT)
                                              ▼ edge functions (each the ONLY door to one outside service)
        AI (Claude, capped)  ·  Twilio/WhatsApp/SMS  ·  Email  ·  Stripe (PLANNED)  ·  Maps  ·  Robot vendor adapters + labeled SIMULATOR (PLANNED)
```

## 2. The five "ones"
| One… | Where it lives | Rule |
|---|---|---|
| Customer identity | `auth.users` + `profiles` (+ `commercial_accounts` for businesses, linked to people) | A business is an account that people belong to, not a second login |
| Provider identity | `workers` (+ planned `companies`, `company_members`, `robot_fleets`) | Robots and teams are providers with the same eligibility gate |
| Booking record | `bookings` (+ `workflow_state`, `domain_events`) | Recurring plans and commercial work orders **create bookings**; they never bypass them |
| Financial ledger | planned `ledger_entries` (double-entry) fed only by confirmed Stripe events | Nothing else writes money; reports read the ledger |
| Orchestration | `booking_transitions` graph + triggers + outbox/inbox + watchdog | Every status change goes through it; agents can only request changes |

## 3. The core flow end to end (first milestone)
| Step | Module | Today |
|---|---|---|
| 1 Customer books (app / WhatsApp / AI booking agent) | Booking | LIVE |
| 2 Market + service + time validated | Markets | LIVE |
| 3 Price, fee, tax computed | Money | LIVE (fee shown when payments on) |
| 4 Card authorized | Money ↔ Stripe | PLANNED |
| 5 Eligible providers ranked, offers sent | Dispatch | LIVE |
| 6 First valid acceptance wins | Dispatch | LIVE (tested) |
| 7 Customer confirmation + live tracking | Messaging · Booking | LIVE (in-app; WhatsApp when Twilio set) |
| 8 On the way → start → complete | Booking | LIVE (suspended providers blocked — LIVE) |
| 9 Checklist / photos / quality check | Quality | PLANNED |
| 10 Capture + payout + reconciliation | Money ledger | PLANNED (until then CLOSED_OFFLINE — BUILT) |
| History of every step | Events | BUILT |

## 4. How each idea plugs in (no new silo)
| Idea | Plugs into | Notes |
|---|---|---|
| Profitability engine | Money (job economics view on ledger + bookings) | AI recommends; approved pricing rules charge |
| Business Intelligence Center | read-only views over ledger, bookings, markets | real/simulated/predicted labels |
| Commercial contract intelligence, AI sales | Commercial + Agents (drafts, approval to send) | consent rules for outreach |
| Subscriptions (CaaS, RaaS) | Commercial agreements → recurring bookings | billing through ledger/Stripe |
| Emergency rescue dispatch | Dispatch + watchdog events | bonuses need approval |
| Digital twin, smart buildings, AI property manager | Properties + Commercial; read tools for clients' own data | authorized building data only |
| Quality inspector | Booking (QUALITY_CHECK) + storage | AI flags, humans confirm |
| Insurance & risk, trust & safety, fraud | Providers (insurance) + Trust & Safety module | risk scores → human review, never auto-punish |
| Robotics, RaaS, predictive maintenance | Providers (robot fleets) + adapters + telemetry | simulator labeled; safety stays with vendor |
| Inventory, equipment marketplace, leasing | Providers/Company + partner marketplace (later) | lending only by licensed partners |
| Academy, workforce opportunity | Providers (training records, skills) | platform badges ≠ licenses |
| Green Earth / environmental dashboard | reads Inventory + Robotics telemetry | measured vs estimated, method documented |
| International engine | Markets (country, currency, language, tax) | inactive until legal/ops review |
| Open API, developer ecosystem | gateway over the same RPCs + events | scoped keys, signed webhooks |
| Innovation lab | separate experiments on staging only | never touches production data |

## 5. Build order (foundation before features)
1. **Now:** apply orchestration (BUILT) · finish staging · roles (`user_roles`) · Supabase email + Site URL fixed.
2. **Money:** Stripe Connect + double-entry ledger + reconciliation.
3. **Provider tools:** company teams, verification, checklists/photos.
4. **Commercial:** quotes → agreements → work orders → invoices; subscriptions.
5. **Intelligence:** BI views, profitability, rescue dispatch, AI agents beyond the first 5.
6. **Robotics:** registry + simulator → first verified vendor.
7. **Ecosystem:** partner API, marketplace, academy, international.

---
