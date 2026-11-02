# We Clean It All — Roadmap

## 0. Decisions needed before the next build phase
1. **Staging environment** (directive: "use staging before production").
   Recommended: a second free Supabase project (`wcia-staging`) + a `staging` branch published to a separate GitHub Pages site (e.g. `staging.wecleanitallfl.com` or a second repo). Free. Every phase is built and tested there, then promoted to live with your approval.
2. **Keep the current stack** (plain-JS PWA + Supabase) instead of rebuilding in Next.js now.
   Reason: the live app works, rules are already in the database (shared by any future app), and a rewrite would put the running business at risk. Native apps can be added with Expo/React Native calling the same functions.
3. **AI provider**: the app is wired to Claude (Anthropic) with a $10/month cap. The AI layer will be made provider-configurable (Anthropic or OpenAI) — nothing is active until a key is added and tested.

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Audit + national database foundation (markets, areas, pricing, tax, coverage, compliance, insurance, checklists, commercial records, market-aware dispatch) | **Done — 26/26 tests** |
| 2 | Roles & accounts: company owner, team member, robot provider, operations manager, administrator, super administrator; company teams + invitations; role-based functions; audit | Next (needs staging decision) |
| 3 | Provider marketplace: applications, verification and background-check status, documents, insurance upload/review, skills, service areas, availability calendar, check-in/out, checklists, before/after photos, customer signature, payout history, suspension | |
| 4 | Customer booking upgrade: service catalog per market (medical, hospitality, warehouse, windows, recurring agreements), property profiles, receipts, messaging, rebooking, human/robot/hybrid choice where a covering provider exists | |
| 5 | Owner National Command Center screens: markets, checklist, prices, tax, coverage, performance by market, live dispatch board, candidates + override | |
| 6 | Live maps + travel-time matching (Google Maps key), provider locations | |
| 7 | Payments (Stripe Connect Express): checkout, commissions, tips, refunds (owner approval), receipts, payouts, signed idempotent webhooks, reconciliation; communications: WhatsApp/SMS/email/push, consent preferences | needs Stripe + Twilio |
| 8 | Commercial portal: quote → walkthrough → proposal → agreement → recurring work orders → inspections → monthly invoices; multi-location accounts | |
| 9 | AI Operations Brain: configurable provider, tool-based actions with permissions, recommendations logged, human approval for sensitive actions, fallbacks | needs AI key |
| 10 | Robotics module: manufacturers, providers, fleets, models, capabilities, task eligibility, adapter interface, **labeled simulator**, safety/geofence/supervision, maintenance, pricing/commission, reporting | simulator only until a real vendor integration is verified |
| 11 | PWA completion (push, offline-safe screens) + native iOS/Android (Expo), App Store / Google Play prep | Apple $99/yr, Google $25 once |
| 12 | Testing, compliance review per market, staged launch (Palm Beach → Orlando → Tampa → other states) | |

## Future capabilities (after the core)
See `INNOVATION_ROADMAP.md`: Stage A Emergency Rescue Dispatch + Commercial Contract Intelligence; Stage B Digital Twin profiles + checklists/photos; Stage C AI quality flags, inventory, Green Earth reports (measured data only); Stage D robot zones, developer platform, vendor adapters.

## Five company numbers
Completed jobs · recurring revenue · customer satisfaction · provider earnings · robot utilization (real data only; simulated/predicted labeled).
