# Pricing engine (Phase 1)

Pure JavaScript module: `pricing.js`. No database, no network. Tests: `node --test pricing.test.js` (20 tests, all passing).

## What it calculates
- **Customer price** and a line-item breakdown (labor, recurring discount, deep clean, special requirements, minimum visit, travel, supplies, adjustment).
- **Estimated labor cost** (worker pay before commission, plus special-requirement worker fees and travel).
- **Platform commission** (a share of the customer price on marketplace jobs; zero on company-run jobs).
- **Company gross margin** (customer price minus supply cost minus worker payout).
- **Worker payout** (labor cost minus commission).

## Admin controls
- Property size (sq ft), bedrooms, bathrooms, cleaning type (`service`), frequency, cleaner count, travel miles, supplies provided by the company, special requirements.
- Overrides for `hours`, `customerPrice`, `workerPayout` and `commissionRate`. Each override needs an admin actor and a reason of at least 5 characters, and returns an `audit` entry with before and after values.
- Flags: `low_margin`, `low_worker_payout`, `negative_payout`.

## Customer and worker views
- `customerView()` returns the total, hours and line items. It never includes worker pay, commission, cost or margin. A test enforces this.
- `workerView()` returns only the worker's own payout, hours and travel.

## Default rates are placeholders
These numbers are my starting assumptions, not your prices. Please set them before any real quote goes out:
- `customerHourly: 45`, `workerHourly: 22` per cleaner-hour
- `commissionRate: 0.15`
- `minimumJob: 90`, `minWorkerPayout: 40`, `minCompanyMarginRate: 0.20`
- Travel: 10 free miles, $1 per mile after that, 60-mile limit
- Supplies: $8 per visit at cost, 25% markup when we supply them
- Frequency discounts: monthly 5%, biweekly 10%, weekly 15%, daily 20%
- Deep and move-out services: 1.6× hours

## Not done yet
- The rates live in code. They are not yet stored in the database or editable from an admin screen. That needs a migration and an admin UI, and it needs your approval.
- Tax is not calculated.
- Hours are estimates from square footage and rooms, not measured. Cleaner count multiplies labor, so each cleaner is billed for the full estimated visit.
