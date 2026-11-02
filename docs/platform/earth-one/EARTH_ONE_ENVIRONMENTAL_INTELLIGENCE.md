# Project EARTH ONE — Environmental Intelligence
_Covers systems 2 (Global Environmental Intelligence), 4 (Predictive Building Maintenance), 5 (Waste and Recycling Intelligence), 6 (Environmental Resource Optimization) and 9 (Sustainability Reporting). Version 1 · 2026-11-02 · Design only. **No environmental measurements exist yet; none are invented here.**_

## The measurement rule
Every number is an **observation** with:
- `basis`: **MEASURED** (from a meter, scale, invoice, our own job records) · **ESTIMATED** (calculated; method shown) · **PREDICTED** (model output; error range shown) · **SIMULATED** (tests only, never in reports)
- `method`, `source`, `data_agreement_id`, `period`, `unit`

A **saving or improvement** can be claimed only when there is a MEASURED baseline and a MEASURED result for the same site, metric and comparable period. Otherwise the report says "estimated" or "not measured".

## Data sources (authorized only)
| Source | Example data | Basis | Available |
|---|---|---|---|
| Our own job records | travel distance, job duration, supply quantities used | MEASURED | after provider tools + check-in/out |
| Supplier invoices | chemicals and consumables bought | MEASURED | when entered |
| Client utility bills / meters | water, electricity at a site | MEASURED | only with a data agreement |
| Waste hauler records | pickups, weights, recycling share | MEASURED | only with a data agreement |
| Building sensors / BMS | occupancy, HVAC runtime, leak sensors | MEASURED | only with a data agreement |
| Robot vendor telemetry | energy use, area cleaned | MEASURED | only with verified integration |
| Inspection records | defects, wear, recurring issues | MEASURED (observed by a person) | after Quality module |
| Product data sheets / published factors | emission or water factors | used for ESTIMATED values, with the source cited | — |

## System 2 — Global Environmental Intelligence
**Purpose:** understand cleanliness, waste and resource patterns across sites to find where work and supplies matter most.
**How:** nightly aggregation of observations by site type, jurisdiction and season; anonymized when shown beyond the site owner (minimum group size 10).
**AI:** plain-language insights, anomaly flags (e.g., "restroom complaints doubled at site X"), PREDICTED demand. AI never creates observations.
**KPIs:** share of insights acted on; forecast error.

## System 4 — Predictive Building Maintenance
**Purpose:** spot likely problems (leaks, clogged filters, worn flooring, recurring dirt sources) before they become expensive.
**How:** start **without sensors**: recurring issues from our own inspection and checklist records → `predictions` with confidence and evidence → a person reviews → recommendation to the client → the outcome is recorded, so accuracy becomes MEASURED. Sensor data is added only under an agreement.
**Humans:** licensed trades do repairs (partner plumbers/HVAC techs); we do not perform licensed work without the license.
**KPIs:** prediction precision (confirmed / flagged), issues caught before failure, client cost avoided (MEASURED from client records only, otherwise not claimed).

## System 5 — Waste and Recycling Intelligence
**Purpose:** understand waste streams at the sites we serve and improve sorting and recycling.
**How:** crews record bag counts/stream type per job (MEASURED counts); hauler data adds weights under agreement; AI suggests bin placement and sorting changes for a person to approve.
**KPIs:** recycling share (MEASURED only where weights exist), contamination issues reported.

## System 6 — Environmental Resource Optimization
**Purpose:** reduce water, chemicals, energy and travel per job.
**How:** route ordering to cut miles (MEASURED from job locations); concentrated/refillable products; dosing guidance in checklists; robot energy from vendor data when real.
**KPIs:** miles per job, chemical quantity per 1,000 sq ft, water per job where metered. All MEASURED, or labeled.

## System 9 — Sustainability Reporting
**Purpose:** give clients and partners honest reports they can use.
**Report rules:**
1. Every figure shows its basis label, method and source.
2. ESTIMATED and MEASURED totals are never added together.
3. Simulated data is never included.
4. Each report is versioned and **approved by the owner** before release; public claims need extra review.
5. Reports describe themselves as "prepared with reference to" a framework (e.g., GHG Protocol categories) only after a qualified review. No certification claims unless obtained.

## Data model
`observations`, `observation_methods`, `emission_factors` (source, version, valid dates), `baselines` (site, metric, period, MEASURED only), `predictions`, `reports` (version, approved_by, contents hash), `data_agreements`, `data_access_log`.

## Privacy
Metrics are about sites and assets, not people. No camera feeds are stored. Occupancy is used only as counts, and only if a partner provides it under an agreement. Agreements set retention, and a purge job enforces it.

## Costs (estimates)
| Stage | Extra cost |
|---|---|
| Own job data + reports | ≈ $0 (existing database), AI drafting cents per report |
| First client meter/hauler data (file uploads) | ≈ $0–low |
| Live sensor feeds | **not budgeted**: only when a signed client pays for the pilot; the connector is chosen then |

## Risks
Poor or missing data → reports say "not measured" · greenwashing risk → the measurement rule and owner approval · liability for missed predictions → recommendations only, with a person in the loop · data-protection rules differ by country → jurisdiction rules + regional projects.
