# We Clean It All — Innovation roadmap (future capabilities)

Guiding rule: **strong core first.** None of these is built until the core flow works end to end (book → qualified provider accepts → tracking → completion → payment recorded) and the business has paying customers. Each capability plugs into an existing module (SYSTEM_BOUNDARIES.md) — no new services unless measured need.

Success is tracked with the five company numbers: **completed jobs · recurring revenue · customer satisfaction · provider earnings · robot utilization** (real data only; simulated and predicted values labeled).

## Priority ranking
Scores 1–5 (5 = best; for risk, 5 = lowest risk).

| Rank | Capability | Revenue | Customer value | Ops efficiency | Tech risk | Stage |
|---|---|---|---|---|---|---|
| 1 | Commercial Contract Intelligence | 5 | 4 | 4 | 4 | A (after payments) |
| 2 | Emergency Rescue Dispatch | 3 | 5 | 5 | 4 | A (after state machine) |
| 3 | Digital Twin property profiles | 4 | 4 | 4 | 4 | B (basic) → D (robot maps) |
| 4 | AI Quality Inspector | 3 | 5 | 4 | 3 | B (checklists/photos) → C (AI assist) |
| 5 | Smart Inventory & Supplies | 2 | 2 | 4 | 4 | C |
| 6 | Green Earth Intelligence | 2 | 3 | 2 | 4 | C (measured data only) |
| 7 | Developer & Integration Platform | 4 (long term) | 3 | 3 | 2 | D (after core is stable) |

**Stage A** = right after the job workflow + payments. **B** = with provider tools (Phase 3). **C** = after first recurring commercial clients. **D** = national scale / robotics.

---

## 1. Commercial Contract Intelligence
- **Purpose:** win and run recurring commercial contracts (offices, banks, medical, hotels, retail, warehouses): quote → walkthrough → proposal → agreement → recurring work orders → inspections → monthly invoice → renewal.
- **Users:** owner/sales, ops manager, commercial client (business portal), assigned teams.
- **Architecture:** Commercial module (already has `commercial_accounts`, `commercial_locations`). Proposal drafting by the AI layer (recommendation only); prices from `market_pricing` + labor/equipment estimate; agreement PDF generated for human review and e-signature; recurring work orders created by the orchestrator from the agreement schedule; invoices from completed work orders.
- **Database:** `quotes`, `walkthroughs`, `proposals(version, status)`, `service_agreements(term, schedule, sla, price, renewal_date)`, `work_orders`, `inspections`, `invoices`, `invoice_lines`.
- **APIs:** `request_quote`, `schedule_walkthrough`, `create_proposal` (owner), `accept_agreement` (client), `generate_work_orders` (cron), `issue_invoice` (owner/Stripe Invoicing).
- **Integrations:** Stripe Invoicing (net-30, ACH), e-signature (optional, e.g. Dropbox Sign), calendar.
- **Security/privacy:** client sees only its own locations (RLS by account); proposals and prices visible only to the account and owner; AI drafts never sent without owner approval.
- **Cost:** build 3–5 weeks; run cost ≈ Stripe invoicing fees + e-signature plan if used.
- **Dependencies:** state machine (ADR-04), roles (company/client), payments (ADR-07), Digital Twin basic profile.
- **Success:** proposals sent/month, win rate, recurring monthly revenue from contracts, on-time work orders %, renewal rate, gross margin per contract.

## 2. Emergency Rescue Dispatch
- **Purpose:** when a cleaner cancels, runs late, is suspended, or a robot fails, find replacement capacity fast and keep the customer informed.
- **Users:** dispatch/ops, customers (notices), replacement providers.
- **Architecture:** a Dispatch-module workflow triggered by events (`provider.cancelled`, `job.late`, `provider.suspended` — partly live today, `robot.fault`). Ranks replacements with the same eligibility rule; ASAP offers with a rescue bonus option; owner approval required for bonuses or price changes; NEEDS_ATTENTION state if no one accepts within the timeout.
- **Database:** `rescue_cases(booking, reason, status, opened_at, resolved_at, bonus, approved_by)`; uses `job_offers`, `domain_events`.
- **APIs:** `open_rescue` (system/ops), `approve_rescue_bonus` (owner), `resolve_rescue`.
- **Integrations:** WhatsApp/SMS/push for urgent offers.
- **Security:** no auto-spend; bonuses need approval; same eligibility gate.
- **Cost:** 1–2 weeks (builds on the reassignment added on 2026-11-02).
- **Dependencies:** state machine, notifications live.
- **Success:** % of disrupted jobs saved, median time to replacement, customer satisfaction on rescued jobs, cancellations per 100 jobs.

## 3. Digital Twin — property profiles
- **Purpose:** one reusable profile per property so quotes, staffing, supplies and robot suitability are accurate.
- **Users:** customers and commercial clients (edit), providers (read on assigned jobs), ops, AI estimators.
- **Architecture:** Booking module gets `properties`; bookings reference a property. Stage B: structured fields (rooms, sq ft, floors, surface types, access notes, pets, parking, cleaning history). Stage D: floor plan upload and robot-accessibility zones (no-go areas, elevators, thresholds, slopes) shared with robot adapters as mission boundaries.
- **Database:** `properties`, `property_areas(type, surface, sqft, robot_ok)`, `property_files` (private bucket), history from `bookings`/`inspections`.
- **APIs:** `upsert_property`, `property_for_job` (provider, only while assigned), `estimate_job(property, service)`.
- **Security/privacy:** addresses, access codes and floor plans are sensitive: encrypted notes, visible to the assigned provider only during the job window; never sent to AI with the street address.
- **Cost:** stage B 1–2 weeks; stage D 3–4 weeks.
- **Dependencies:** roles, storage, robotics module (stage D).
- **Success:** quote accuracy (estimated vs actual hours within ±15%), repeat-booking time saved, robot suitability decisions with zero safety incidents.

## 4. AI Quality Inspector
- **Purpose:** consistent quality with checklists, before/after photos, customer feedback, missed-task detection, inspection reports.
- **Users:** providers (capture), supervisors/ops (review), customers (report), AI (flags).
- **Architecture:** Stage B (no AI): per-service checklists, required photos, customer sign-off. Stage C: AI vision **flags possible issues for human review** (e.g. "area may be missed"), never accuses or penalizes; a supervisor confirms. Results feed the provider scorecard only after human confirmation.
- **Database:** `checklist_templates`, `job_checklists`, `job_photos`, `inspections(score, reviewer)`, `quality_flags(source='ai'|'customer'|'supervisor', confirmed)`.
- **APIs:** `submit_checklist`, `upload_job_photo`, `review_flag` (supervisor), `job_report`.
- **Integrations:** AI vision model via the AI layer (capped spend).
- **Security/privacy:** photos may show people or private items → private bucket, provider uploads only during the job, customer and ops access only, retention limit, no faces sent to AI where avoidable.
- **Cost:** stage B 2 weeks; stage C AI ≈ cents per job (capped).
- **Dependencies:** storage, state machine (QUALITY_CHECK state), roles.
- **Success:** customer complaints per 100 jobs, % jobs with full checklist, re-clean rate, agreement rate between AI flags and supervisor decisions.

## 5. Smart Inventory & Supply Chain
- **Purpose:** know supply and equipment levels, cost per job, and reorder in time (robot parts later).
- **Users:** WCIA teams, companies, ops/finance.
- **Architecture:** Providers/Company module: stock per team or location; usage logged per job (manual first, estimates labeled); reorder **recommendations** that an authorized person approves (no automatic purchasing).
- **Database:** `inventory_items`, `stock_levels`, `stock_movements`, `equipment`, `reorder_requests(status, approved_by)`.
- **APIs:** `log_usage`, `stock_report`, `create_reorder_request`, `approve_reorder`.
- **Integrations:** later supplier ordering APIs or email orders.
- **Security:** purchase approvals by role; audit trail.
- **Cost:** 2 weeks; no run cost.
- **Dependencies:** roles, company accounts.
- **Success:** stock-outs per month, supply cost per job, % reorders on time.

## 6. Green Earth Intelligence
- **Purpose:** an honest environmental record: products used, chemical volumes, water where measured, robot energy, and sustainability reports for commercial clients.
- **Users:** commercial clients (reports), owner/marketing, providers (product choice).
- **Architecture:** reads Inventory (chemical usage), Robotics (energy from vendor telemetry), job data. Every number is labeled **MEASURED** or **ESTIMATED (method documented)**; no savings claims without measurement and a written calculation method.
- **Database:** `products(eco_certifications, sds_link)`, `sustainability_measurements(source, unit, value, method)`, report snapshots.
- **APIs:** `sustainability_report(account, period)`.
- **Security/risk:** greenwashing/legal risk → claims reviewed by owner before publication.
- **Cost:** 1–2 weeks after Inventory.
- **Dependencies:** Inventory, Robotics telemetry.
- **Success:** % jobs using preferred products, measured chemical volume per 1,000 sq ft, reports delivered to contract clients.

## 7. Developer & Integration Platform
- **Purpose:** let partners connect: cleaning companies, robot manufacturers, equipment providers, property-management systems, building operators, other marketplaces.
- **Users:** partner developers, owner (approves partners).
- **Architecture:** a gateway edge function `api` with versioned endpoints (`/v1/...`) mapping to existing RPCs; partner apps with scoped API keys (hashed), per-key rate limits, webhooks fed from `domain_events` (signed, retried, dead-letter). No direct database access for partners.
- **Database:** `partner_apps`, `api_keys(hash, scopes, market_ids)`, `webhook_subscriptions`, `webhook_deliveries`.
- **APIs:** OpenAPI spec published; sandbox using the staging project.
- **Security:** least-privilege scopes, key rotation, audit of every partner call, no personal data beyond scope, abuse limits.
- **Cost:** 4–6 weeks; run cost low until volume.
- **Dependencies:** state machine + events (ADR-04), roles, stable API contracts, staging.
- **Success:** active partners, jobs created via API, webhook delivery success rate (≥ 99%), partner-attributed revenue.

---

## Staged innovation roadmap (after the core)
| Stage | When | Build |
|---|---|---|
| Core | now | job workflow/state machine, roles, payments, provider verification, owner command center |
| A | first paying clients | Emergency Rescue Dispatch · Commercial Contract Intelligence (quotes → agreements → work orders → invoices) |
| B | provider tools phase | Digital Twin basic profiles · checklists + photos + sign-off (Quality, no AI yet) |
| C | recurring commercial base | AI quality flags (human review) · Inventory & supplies · Green Earth reports (measured data only) |
| D | national scale / robots | Digital Twin robot zones · Developer & Integration Platform · robotics vendor adapters |
