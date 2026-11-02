# We Clean It All — Master robotics architecture
**Status: PLANNED. No robot is connected. No manufacturer integration exists.** Development uses a clearly labeled SIMULATOR only.

## Principles
1. We integrate existing manufacturers through their **supported APIs**; we do not build robots.
2. The platform requests **missions** (clean area X, between times, within zone) — never low-level motion commands.
3. Manufacturer safety systems, emergency stop and geofencing stay in the robot/vendor stack. **AI and the platform can never override, disable or bypass them.**
4. Every robot job has an assigned **human supervisor** (provider staff) with a stop/escalate path.
5. A robot unit is dispatchable only when: provider approved · unit `integration_verified = true` · `field_test_passed = true` (recorded by an admin with evidence) · market allows robots · unit status `ready` · battery/maintenance OK · property area marked `robot_ok` · task allowed by `robot_task_rules`.
6. Simulated data is stored with `is_simulated = true`, shown with a **SIMULATION** badge, never counted in real metrics (robot utilization shows "not measured" until real data exists), and can never be attached to a real customer booking in an active market.

## Data model
`robot_manufacturers` → `robot_models` (capabilities: floor types, area/hour, water, noise, dimensions, elevator support) → `robot_fleets` (owned by a robot service provider = provider type `robot_fleet`) → `robot_units` (serial, status ready/charging/maintenance/offline/fault, battery, last_seen, market, is_simulated, integration_verified, field_test_passed) · `robot_task_rules` (task × surface × conditions → robot / hybrid / human-only) · `robot_missions` (booking, unit, supervisor, zone, status, vendor_mission_id) · `robot_telemetry` (sampled, partitioned) · `robot_maintenance` (scheduled, done, alerts) · `robot_integrations` (manufacturer, adapter, credentials reference in Vault, verified_at).

## Vendor-neutral adapter layer
One edge function `robotics` exposes a fixed interface; one adapter file per manufacturer implements it:
```
describe()            → capabilities of a model/unit
status(unit)          → ready/charging/fault, battery, position (if provided)
request_mission(spec) → vendor mission id   (idempotency key required; via outbox)
progress(mission)     → percent, area done, issues
pause(mission) / cancel(mission)            (vendor-supported calls only)
```
Adding a manufacturer = add an adapter + register it; the marketplace, dispatch and booking modules do not change. Vendor callbacks arrive through `inbox_events` (signature-verified, duplicates ignored).

## Dispatch (human / robot / hybrid)
Task eligibility rules decide which task types a robot may perform for a property; dispatch then picks human providers (existing rule) and/or robot units (same eligibility gate + robot conditions). Hybrid jobs: humans handle detail work, robots handle large open floors; one booking, several assignments.

## Safety & incidents
Robot fault, unexpected stop or geofence breach → mission `needs_attention`, supervisor + owner alert, booking → NEEDS_ATTENTION (orchestrator), human fallback via rescue dispatch. Incidents recorded in Trust & Safety.

## Pricing & commission
Robot-provider rates per market (area- or hour-based) + platform fee, same ledger as human jobs. Robot-as-a-Service subscriptions via commercial agreements.

## Simulator
`simulator` adapter generates labeled status/progress for development and tests (battery drain, faults on demand, mission completion), only on staging and in tests.
