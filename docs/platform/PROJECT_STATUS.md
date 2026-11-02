# We Clean It All — Project Status

_Last updated: 2026-11-02 (Phase 1 audit + national foundation)._
_Mission: Humans + AI + Robotics — "Together, humans and AI can build a cleaner Earth."_

## 1. Current technology stack (what really exists)

| Layer | What is in place | Notes |
|---|---|---|
| Public website | Static HTML on GitHub Pages, repo `rdcmnation-boop/wecleanitallfl`, branch `main`, domain `www.wecleanitallfl.com` (CNAME) | `/` (booking app landing), `/comercial/` (commercial site), `/privacy/`, `/terms/`, sitemap, Google verification file |
| App (customer, cleaner, owner) | One installable PWA in `app/` — plain JavaScript, no framework or build step (`app.js`, `dash.js`, `owner.js`, `api.js`, `i18n.js`, `learn.js`, `app.css`, `sw.js`) | ~3,600 lines of JS; Spanish/English; demo mode runs fully in the browser when `SUPABASE_URL` is empty |
| Backend | Supabase project `fqajygzjteauxornipva` (East US, **free plan**) | Postgres + Auth + Storage + Edge Functions + pg_cron + pg_net + Vault |
| Business rules | In Postgres: row-level security on every table, `SECURITY DEFINER` functions for every action, triggers for guards | The same rules apply to any future client (web, iOS, Android) because they live in the database, not in the app |
| Edge functions (Deno) | `brain` (assistant), `ai-ceo` (owner briefing), `brain-learn` (nightly learning), `notify` (WhatsApp/SMS/email outbox), `whatsapp-in` (Twilio webhook) | AI calls go through one shared caller with a monthly cap |
| AI | Claude Haiku 5.5 via Anthropic API, **$10/month cap**, checked before every call | **No API key saved yet**, so the app uses its free built-in replies. No AI integration is active. |
| Messaging | Twilio WhatsApp/SMS and Resend email code is written and tested locally | **No Twilio or Resend secrets saved yet**; `messaging_on` is off; messages wait in a queue |
| Payments | Service-fee and payout-fee rules in the database | **Stripe is not integrated.** Nothing is charged. Clients pay cleaners outside the app today. |
| Maps | Google Maps links (directions, ZIP view) | No Maps API key; no embedded live map yet |
| Scheduling | pg_cron: `agents-tick` every 5 min, `notify-outbox` every minute (only when messaging is on), `brain-learn-nightly` 06:00 UTC | |

## 2. Existing functionality (preserve)

- **Public site and commercial site** (`/`, `/comercial/`) — unchanged by this phase.
- **Three sign-in doors:** Clients · Cleaners · Owners. Owner requires approval + 2-step code (TOTP), with optional "remember this device".
- **Single-owner lock:** only one owner account can exist (`admins_single_owner` index).
- **Client:** guest or account booking, residential/commercial, ASAP or scheduled, recurrence (once/weekly/biweekly/monthly/daily for commercial), fair-price suggestion with a price floor, preferred cleaner, live order tracker (finding → assigned → on the way → cleaning → done), live cleaner location while on the way/cleaning, reviews, cancel.
- **Cleaner (DoorDash-style):** "Go active", job offers (first acceptance wins), On my way, start/pause/resume/complete with timer, location sharing only during the job, earnings by week with goal, ratings and tier scorecard, account, help, radio.
- **Owner:** live panel, analytics (order progress), bookings and cleaners management, approvals, manual assignment and re-dispatch, Agents panel (decisions, AI spend, WhatsApp agent, rollout, alerts), Your money (fees), Launch checklist, audit log.
- **Agents:** 10 agents in a 3-step rollout (step 1 live now, step 2 on Nov 5, step 3 on Nov 9), orchestrator every 5 minutes, all actions logged in an append-only table, approval classes A–D.

## 3. Completed in this phase (2026-11-02)

| Item | Status | Evidence |
|---|---|---|
| Repository and infrastructure audit | Done | This file, `ARCHITECTURE.md`, `SECURITY.md`, `ENVIRONMENT_VARIABLES.md`, `ROADMAP.md` |
| National geography: countries, states, cities, markets, service areas (ZIP and ZIP-prefix) | Built, applied to the live database (additive only) | `marketplace/supabase/national_markets.sql` |
| Market statuses planned/onboarding/ready/active/paused/closed; Miami-Dade + Broward active; Palm Beach, Orlando, Tampa planned | Built | same |
| Market launch checklist (providers, operations, insurance, legal, tax, pricing, payments, support); activation blocked until all required items are done; owner-only | Built and tested | test 26/26 |
| Market pricing per service, tax configurations (Florida commercial-cleaning rates seeded **off**, pending accountant review), local time zones | Built | |
| Provider types (WCIA team / individual / company), provider coverage per market, compliance records, insurance policies with expiry | Built (database + rules; screens not yet) | |
| Commercial accounts and multi-location records | Tables only (screens are Phase 8) | |
| Bookings: market, local time zone, tax amount; bookings refused outside active markets | Built and tested | |
| Dispatch rules: one function decides eligibility for offers, acceptance and manual assignment (approved, available, qualified, in area, insurance and compliance when the market requires them) | Built and tested | |
| Dispatch modes per market: auto / hybrid / admin, plus pause | Built and tested | |
| Owner functions: list markets, change status, checklist, dispatch settings, prices, tax, create market, coverage, provider type, candidates | Built (database); owner screen not yet built | |

## 4. Actual test results

All database tests run against the live project inside a transaction that is rolled back on purpose (`RAISE EXCEPTION 'DRYRUN_RESULT …'`), so they leave no data.

| Suite | Result | Date |
|---|---|---|
| National markets + dispatch rules (`test/national_markets_test.sql`) | **26 / 26 pass** | 2026-11-02 |
| WhatsApp agent database rules (`test/whatsapp_agent_test.sql`) | 36 / 36 pass | 2026-11-02 |
| WhatsApp function logic (local harness, mocked network) | 37 / 37 pass | 2026-11-02 |
| Agents rules (`test/agents_phase1_live_test.sql`) | 48 / 48 pass | 2026-11-02 |
| Service fee, price floor (ad-hoc dry runs) | pass | 2026-11-02 |
| Browser screenshots (demo mode, phone size) for booking, sections, fees, owner pages | checked visually | 2026-11-02 |

Not tested (cannot be until configured): Twilio delivery, Claude answers, Stripe, Google Maps, email delivery to non-team addresses.

## 5. Missing features (from the master directive)

- Staging environment (today every change goes straight to the live site and database — see Risks).
- Roles beyond customer / worker / owner: company owner, company team member, robot provider, operations manager, administrator, super administrator.
- Company team management, worker invitations.
- Identity/business verification workflow, background-check status, document review screens.
- Checklists, before/after photos, customer signature, check-in/out evidence.
- Stripe Connect payments, tips, refunds, receipts, payouts, reconciliation.
- Push notifications, in-app messaging threads, consent preferences.
- Owner screens for markets, coverage, compliance and insurance.
- Commercial portal: quotes, walkthroughs, proposals, agreements, invoices.
- Robotics module (registry, adapters, simulator, safety, supervision).
- Native iOS/Android apps.

## 6. Risks and dependencies

1. **No staging.** The repo `main` branch is the live site and there is one Supabase project. The directive requires staging first. → Decision needed (see ROADMAP §0).
2. **Supabase auth emails link to `localhost:3000`.** Site URL is not set to the domain. Owner must set it in the dashboard (1 minute).
3. **Supabase's built-in email only delivers to project team members.** Customers and cleaners will not receive confirmation/reset emails until a custom SMTP (e.g. Resend) is configured.
4. Free plan limits: no leaked-password protection, no branching, daily backups only, project pauses after 7 days without activity.
5. Anonymous (guest) sign-ins are enabled for guest booking; protected by the guest guard (contact required, open-request limits, hourly cap).
6. Payments happen outside the app; fees are not collected until Stripe is connected.
7. Retention job (`agents_retention.sql`) is written but not applied (needs the SQL editor because it deletes old rows).
8. Florida tax handling is seeded off; must be confirmed by an accountant before turning on.
9. Contractor classification, licensing and insurance requirements differ by state; the checklist forces a review per market but does not replace legal advice.

## 7. Recommended next steps

1. Approve the staging plan and the architecture decision (ROADMAP §0).
2. Owner sets Site URL + Redirect URLs, and connects Resend SMTP for real emails.
3. Phase 2: roles and company/team accounts, built and tested on staging.
4. Then the owner Markets screen, provider verification screens, booking upgrades (service catalog, commercial quotes).
