# We Clean It All — Innovation Lab
_Version 1 · 2026-11-02 · Design only, nothing implemented. Replaces MASTER_INNOVATION_LAB.md and the earlier INNOVATION_ROADMAP.md._

**Mission:** make We Clean It All a leading platform for human cleaning, AI intelligence, autonomous robotics, smart buildings and sustainability.
**Principle:** an **operating system for the cleaning industry**, not seven apps. Every system uses the same identities, roles, booking records, building profiles, event history and ledger.
**Business rule:** the Miami-Dade + Broward core journey (MASTER_CUSTOMER_JOURNEY.md) must be working and profitable before anything not needed by that journey starts.

Status words: **LIVE** · **BUILT** · **PLANNED** · **SIMULATED** · **ESTIMATED** (calculated, not measured) · **MEASURED** (from real records or meters).
Cost figures are planning estimates for low volume (first ~500 jobs/month); real costs are verified before switching anything on.

## Honesty rules (apply to all seven)
1. No capability is claimed until it exists and has passed a test.
2. No robot hardware is assumed. Robotics stays SIMULATED until a manufacturer agreement, a verified integration and a field test exist.
3. No environmental saving is claimed without a measured baseline and a measured result. Everything else is labeled ESTIMATED with its method shown.
4. AI suggests, drafts and flags. People approve money, contracts, penalties, refunds and outbound sales messages.
5. No new paid infrastructure until a small test shows it's worth the money (see INNOVATION_BUSINESS_MODEL.md).

---

## 1. AI Digital Twin Buildings
**Business purpose:** know each property well enough to quote accurately, build the right checklist, send the right people and equipment, and price commercial contracts without guessing. This is the foundation the other six systems use.

**Architecture:** extends the planned Properties module. A property belongs to a customer or a commercial account and is linked to every booking at that address. It is **not** a 3D model: it is a structured profile (rooms, surfaces, sizes, rules), with floor-plan files attached.

**Database:** `properties` (owner account, market, type, total sq ft, floors, access notes stored encrypted, parking) · `property_areas` (name, room type, surface, sq ft, frequency, special care, `robot_ok` with reason) · `property_tasks` (area × task × frequency) · `property_files` (floor plans, private storage) · `property_equipment_needs` · `property_history` (a view over bookings, checklists and inspections; no copy of the data).

**APIs/integrations:** `property_upsert`, `property_get` (owner or assigned provider only, address only after acceptance), `property_estimate` (hours, crew size, supplies). Later: import floor plans as PDF/images; building-management system data only with written authorization.

**AI capabilities:** turn a customer's description or walkthrough notes into a draft room list for the customer to confirm; estimate labor from areas and past real durations; suggest supplies and equipment. AI never edits a profile without confirmation.

**Security and privacy:** access notes and alarm/lockbox details encrypted and shown only to the assigned provider during the job window; floor plans in a private bucket; row-level security by account; commercial accounts see only their own locations.

**Operating cost (estimate):** database rows negligible on the current plan; file storage small (floor plans are a few MB each); AI drafting ≈ a fraction of a cent to a few cents per property with the low-cost model.

**Revenue:** more accurate quotes (fewer underpriced jobs), faster commercial proposals, a "property care plan" upsell for recurring customers.

**KPIs:** % of bookings linked to a property profile · estimate accuracy (estimated vs actual hours, MEASURED from check-in/out) · quote turnaround time for commercial requests · repeat-booking rate for profiled properties.

**Dependencies:** orchestration live; check-in/out timestamps (provider tools) for real durations; roles (commercial account members).

**Roadmap:** P1 room list + surfaces per property, linked to bookings → P2 checklist generated from the profile → P3 labor estimate from real durations → P4 floor-plan files + commercial multi-location → P5 authorized building-system data (only if a client asks).

---

## 2. Global Cleaning Intelligence Network
**Business purpose:** learn from our own operations which methods, crews and schedules give the best results, so pricing, staffing and quality keep improving. Later, sell anonymized industry insight.

**Architecture:** not a separate system. A set of **aggregate views** over domain events, bookings, checklists, reviews and ledger entries, refreshed nightly. Raw data never leaves the platform's database. Starts as plain SQL reports; no data warehouse until volume justifies one.

**Database:** `intel_job_facts` (nightly, one row per completed job: market, service, size band, duration, crew size, rating, missed-task flag, no names/addresses) · `intel_aggregates` (market × service × size band × week) · `intel_publish_log` (what was shown or shared, to whom).

**APIs/integrations:** `intel_report(market, period)` for the owner and ops managers; later a partner/industry report export. No outside service needed.

**AI capabilities:** plain-language weekly insights ("deep cleans in Broward ran 18% over estimate"), anomaly flags, demand forecast by ZIP labeled PREDICTED with its error range shown.

**Security and privacy:** aggregation only, with a **minimum group size of 10 jobs** before any figure is shown; no addresses, names, photos or free text in facts; anything shared outside the company needs owner approval and is logged; customer data is never sold.

**Operating cost:** ≈ $0 extra (runs inside the existing database); AI summary ≈ cents per week.

**Revenue:** indirect at first (better prices and staffing). Later: market reports for property managers and industry partners.

**KPIs:** estimate error trending down · forecast accuracy (predicted vs actual demand) · % of pricing decisions backed by data.

**Dependencies:** orchestration events, check-in/out times, checklists and reviews. Needs real volume: a few hundred completed jobs before results mean anything.

**Roadmap:** P1 nightly facts + owner report → P2 AI weekly insights → P3 demand forecast (PREDICTED) → P4 method/equipment comparisons (needs Quality + Twin data) → P5 external anonymized reports.

---

## 3. Human + Robot Mission Control
**Business purpose:** run one job with several workers (people and later robots), with an AI supervisor watching progress and a human operations manager in charge. Starts with **people-only multi-crew jobs**, which commercial contracts need anyway.

**Architecture:** extends orchestration. One booking → many `assignments` (person, robot unit or crew), each with its own task list taken from the building profile. The AI supervisor reads progress events and **raises alerts and suggestions**. It issues no commands to people or machines. Robots connect only through the vendor-neutral adapter (MASTER_ROBOTICS_ARCHITECTURE.md), mission-level only.

**Database:** `assignments` (booking, assignee type person/robot, assignee id, role lead/helper/robot, areas, status) · `assignment_events` · robot tables from the robotics plan (`robot_units`, `robot_missions`, `robot_task_rules`) — all with `is_simulated`.

**APIs/integrations:** `mission_plan(booking)` (proposed split, needs ops-manager confirmation) · `assignment_update` · `mission_board(market)` (live view) · robotics adapter `request_mission/progress/pause/cancel` (vendor-supported calls only).

**AI capabilities:** propose how to split areas between crew members (and later robot-eligible floors); predict finish time from progress; flag delays and ask the ops manager to approve sending help.

**Security and privacy:** only the ops manager and owner can confirm plans or send help; robots can never be dispatched to a booking unless verified and field-tested; **manufacturer safety systems are never overridden**; a human supervisor is assigned to every robot mission; simulated missions can never attach to a real customer booking.

**Operating cost:** people-only: ≈ $0 extra. Robotics: $0 until a vendor exists. Vendor APIs, robot leasing and insurance are unknown and will be quoted per manufacturer.

**Revenue:** larger commercial jobs (offices, hotels, warehouses) and later Robot-as-a-Service subscriptions with robot-fleet providers.

**KPIs:** on-time completion of multi-crew jobs · ops-manager interventions per job · later: robot mission success rate and robot utilization (**not measured until real robots exist**).

**Dependencies:** orchestration, roles (ops manager), building profiles, provider tools. Robotics part: a manufacturer agreement + field test.

**Roadmap:** P1 multi-person assignments (people only) → P2 live mission board for ops managers → P3 AI progress/delay alerts → P4 robotics registry + labeled simulator on staging → P5 first real robot partner pilot in one building, with a supervisor, after field test.

---

## 4. AI Quality Assurance (Quality Guarantee Engine)
**Business purpose:** prove the work was done, catch problems early, fix them fast, and make a quality guarantee the company can afford. This is part of the core journey (stage 8).

**Architecture:** extends provider tools and trust & safety. Checklist from the building profile → before/after photos → provider signature → customer confirm/report window (48 h) → **AI flags** → human review → corrective work order if needed.

**Database:** `checklist_templates` · `job_checklists` (item, done, note) · `job_photos` (area, before/after, private storage, retention period) · `inspections` (supervisor, score, notes) · `quality_flags` (source: customer/AI/inspector, reason, status open/reviewed/dismissed/confirmed, reviewer) · `corrective_jobs` (linked to original booking).

**APIs/integrations:** `checklist_get/update`, `photo_upload` (signed URL, type/size limits), `report_missed_task`, `quality_review` (owner/ops only), `create_corrective_job`. Image analysis through the shared AI caller (Claude vision) only after the cost test.

**AI capabilities:** check that required photos exist and match the area; compare before/after and **flag possible misses for a person to review**; summarize the customer's complaint; spot repeat issues for a provider or property. **AI never marks a job defective, penalizes a provider or issues a refund.**

**Security and privacy:** photos are private and shown only to the customer, the assigned provider, and ops/owner; people should not appear in photos (in-app guidance), and AI does no face analysis; photos deleted after the retention period (proposed 180 days unless disputed); provider can respond to every flag.

**Operating cost (estimate):** photo storage: a few MB per job (stays within the plan at low volume); AI image review ≈ a few cents per job if switched on. Start with **customer reports + checklist completeness only ($0 AI)**, then test AI flags on a sample and turn them on only if they catch real misses.

**Revenue:** fewer refunds and lost customers; "Guaranteed Clean" premium for commercial and recurring plans; inspection reports for commercial clients.

**KPIs:** missed-task rate · % of flags confirmed by a person (AI precision) · time to corrective visit · refund amount per 100 jobs · repeat rate after a corrective visit.

**Dependencies:** provider tools (checklists, photos), building profiles (for checklists), roles (ops manager), orchestration (QUALITY_CHECK state).

**Roadmap:** P1 checklist + before/after photos + missed-task button → P2 human review queue + corrective jobs → P3 supervisor inspections for commercial → P4 AI flag pilot on a sample, measured against human review → P5 Guaranteed Clean plan once the refund rate is known.

---

## 5. Autonomous Business Growth Engine
**Business purpose:** find and win commercial contracts (offices, banks, medical, hotels, buildings) faster, with AI doing the research and paperwork and people making every commitment.

**Architecture:** extends agents + commercial. A small CRM inside the platform: prospects → opportunities → walkthrough → proposal → agreement. Proposals use the building twin and the profitability calculator. "Autonomous" means it prepares everything on its own; **it never sends, prices or signs without approval.**

**Database:** `prospects` (business name, public contact, source, consent status, do-not-contact flag) · `opportunities` (stage, estimated value, probability) · `proposals` (versions, price, estimated margin, status draft/approved/sent/accepted) · `sales_activities` · `contact_consents`.

**APIs/integrations:** `prospect_add`, `proposal_draft` (AI), `proposal_approve` (owner only), `opportunity_board`. Email via Resend, only to approved and allowed contacts. Public business information through web search done by a person or an agent with a logged source. No purchased lead lists until justified.

**AI capabilities:** research a named business from public information and summarize it; draft a proposal from walkthrough notes and the building profile; estimate contract profitability (labor at the market's fair rates, supplies, fee) labeled ESTIMATED; suggest follow-up timing; point out ZIPs with demand but few providers.

**Security and privacy:** follow email/text marketing rules (CAN-SPAM; TCPA for texts — **no cold texting**); honor opt-outs immediately; no personal data scraping; every outbound message, price and contract needs owner approval and is logged; AI outputs show their sources.

**Operating cost:** AI research and drafting ≈ cents per proposal; email nearly free at low volume. Paid data tools only after a test shows contracts won.

**Revenue:** commercial contracts (recurring monthly revenue), the largest and steadiest revenue line.

**KPIs:** proposals per month · win rate · time from walkthrough to proposal · estimated vs actual contract margin · recurring commercial revenue.

**Dependencies:** commercial module, building twin, roles, Stripe Invoicing for contract billing, email setup (Resend).

**Roadmap:** P1 prospect + opportunity tracker (manual) → P2 AI proposal drafts with profitability estimate → P3 approved email follow-ups → P4 underserved-market finder (from Intelligence Network) → P5 contract renewals and upsells.

---

## 6. Global Cleaning Academy
**Business purpose:** raise provider quality, reduce complaints and safety incidents, prepare people for commercial and robot-supervision work, and later earn course revenue.

**Architecture:** extends provider verification. Courses → lessons → quizzes → certificates stored on the provider's record. Certificates feed dispatch eligibility (e.g., "medical office" jobs only for certified providers) and the provider badge. Content is our own text/video; a multilingual AI tutor answers questions about the lessons only.

**Database:** `courses`, `lessons`, `quizzes`, `quiz_attempts`, `enrollments`, `certificates` (provider, course, issued, expires, revoked), `training_records` (view used by dispatch).

**APIs/integrations:** `course_list`, `lesson_progress`, `quiz_submit` (graded in the database), `certificate_verify` (public check by certificate code). Video hosting: start with unlisted links or storage; dedicated video service only if needed. Course payments through Stripe later.

**AI capabilities:** tutor answers in English/Spanish/Creole about lesson content; generates practice questions for staff review; summarizes a provider's weak areas from quiz results and quality flags.

**Security and privacy:** quiz grading in the database (not trust-the-browser); certificates only by passing rules; providers see their own records; owner can revoke; no claims of government or industry accreditation unless obtained.

**Operating cost:** course content creation is the real cost (time); hosting ≈ $0–low; AI tutor ≈ cents per provider per month.

**Revenue:** paid advanced courses (commercial, medical-grade, equipment, robot supervision), certified-provider badges, later training for outside cleaning companies.

**KPIs:** % of active providers certified · complaint and missed-task rate of certified vs non-certified providers · course completion rate · course revenue.

**Dependencies:** provider tools and verification, roles, Quality data (to measure impact), Stripe for paid courses.

**Roadmap:** P1 three required short modules (safety, our standards, customer service) for new cleaners → P2 certificates + dispatch rules for specialty jobs → P3 AI tutor (multilingual) → P4 paid advanced courses → P5 robot supervision course (when a robot pilot exists) and outside-company training.

---

## 7. Clean Earth Impact Engine
**Business purpose:** make the "cleaner Earth" mission measurable and sellable: lower waste and travel, greener supplies, and honest impact reports for commercial clients.

**Architecture:** extends BI. Every impact number is stored with **`basis = MEASURED | ESTIMATED`**, a method and a source. Starts with data we already have (travel distance) and supply records; adds meter/vendor data only where it really exists.

**Database:** `impact_measurements` (booking or property, metric, value, unit, basis, method, source, period) · `supply_catalog` (product, eco-label claim with its certificate source, unit size) · `supply_usage` (booking × product × quantity, entered by provider) · `impact_baselines` (per property, MEASURED period before a change).

**APIs/integrations:** `impact_report(account, period)`; supply usage entry in the provider job flow; route/travel distance from job locations. Later: robot vendor energy data, building meters, only through authorized integrations.

**AI capabilities:** suggest lower-impact options (concentrated products, reusable cloths, better route order); draft the impact report in plain language, keeping every figure's MEASURED/ESTIMATED label; **never presents an estimate as a saving.**

**Security and privacy:** reports for an account show only that account's data; any public sustainability claim needs owner approval and a measured baseline; vendor eco-labels stored with their certificate reference.

**Operating cost:** ≈ $0 extra at first (database + existing data); AI report drafting ≈ cents per report.

**Revenue:** "green clean" add-on for homes; sustainability reporting for commercial/ESG-minded clients; supply partnerships later.

**KPIs:** travel miles per job (MEASURED) · % of jobs using eco-supply option · chemical quantity per sq ft (MEASURED from usage entries) · number of claims backed by a measured baseline.

**Dependencies:** check-in/out and locations, provider tools (supply entry), building twin (sq ft), BI.

**Roadmap:** P1 travel distance per job + eco-supply option → P2 supply usage tracking → P3 per-account impact report (labeled) → P4 measured baselines and before/after comparisons for willing commercial clients → P5 meter/robot energy data where an integration exists.
