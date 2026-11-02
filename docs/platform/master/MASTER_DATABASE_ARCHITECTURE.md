# We Clean It All — Master database architecture

One Postgres database (Supabase) = the single source of operational truth. Every table has row-level security; most are closed to direct access and reached only through checked functions. Each module owns its tables (SYSTEM_BOUNDARIES.md).

## LIVE tables (inspected 2026-11-02)
| Module | Table | Key columns / notes |
|---|---|---|
| Identity | `profiles` | id = auth user, role (customer/worker), name, phone, email, language |
| | `admins` | single owner (unique lock) |
| | `trusted_devices` | remembered-device tokens (hashed) for owner 2-step |
| Markets | `countries`, `states`, `cities` | US, FL; status per state |
| | `markets` | id, state, county, timezone, status (6), dispatch_mode, dispatch_paused, requires_insurance, required_compliance[], languages[] |
| | `service_areas` | ZIP or ZIP-prefix → market (unique) |
| | `market_pricing` | market × service: hourly, min job, available |
| | `tax_configurations` | state/county/segment rate, active (FL commercial seeded OFF) |
| | `market_launch_checklists` | 8 items per market; activation gate |
| Providers | `workers` | provider_type (wcia_team/individual/company), services[], zips[], languages[], team_size, status, available, rating, jobs |
| | `provider_coverage` | worker × market approved/suspended |
| | `provider_compliance` | id/background/license/W-9… status, expiry |
| | `insurance_policies` | kind, expiry, verified |
| | storage `worker-docs` | private bucket, owner-only paths |
| Booking | `bookings` | code, customer, segment, service, property, schedule, budget, fee_pct, service_fee, tax_pct, tax_amount, total, market_id, local_tz, status, worker, timestamps, live location fields |
| | `reviews` | one per completed booking |
| Dispatch | `job_offers` | booking × worker unique, score, status |
| Money | `pay_settings` | service fee %, instant payout fee, payments_on |
| Commercial | `commercial_accounts`, `commercial_locations` | tables only |
| Messaging | `notifications` | outbox (inapp/whatsapp/sms/email) |
| | `wa_messages` | WhatsApp chat log (hashed phone, 90 days) |
| Agents | `agent_registry`, `agent_settings`, `agent_actions` (append-only), `agent_tasks`, `approvals`, `ai_usage`, `brain_notes`, `brain_questions` | |
| Audit | `audit_log` | owner/system actions |

## BUILT (tested, not applied)
`workflow_states`, `booking_transitions`, `domain_events` (append-only), `outbox_jobs`, `inbox_events`, columns `bookings.workflow_state/state_changed_at`, `markets.payments_mode`.

## PLANNED (by phase)
| Phase | Tables |
|---|---|
| Roles & teams | `user_roles(user, role, scope_type, scope_id)`, `companies`, `company_members(role)`, `invitations` |
| Payments | `payment_accounts` (Stripe connected accounts), `payments`, `payouts`, `ledger_entries` (double-entry), `refund_requests`, `receipts` |
| Provider tools | `availability_slots`, `checklist_templates`, `job_checklists`, `job_photos`, `signatures`, `training_records` |
| Properties | `properties`, `property_areas` (surface, robot_ok), `property_files` |
| Commercial | `quotes`, `walkthroughs`, `proposals`, `service_agreements`, `work_orders`, `inspections`, `invoices`, `invoice_lines`, `subscriptions` |
| Trust & safety | `incidents`, `disputes`, `claims`, `risk_scores`, `investigations` |
| Robotics | `robot_manufacturers`, `robot_models`, `robot_capabilities`, `robot_fleets`, `robot_units`, `robot_task_rules`, `robot_missions`, `robot_telemetry` (partitioned), `robot_maintenance`, `robot_integrations` |
| Ecosystem | `partner_apps`, `api_keys` (hashed), `webhook_subscriptions`, `webhook_deliveries`, `inventory_items`, `stock_movements`, `sustainability_measurements` |

## Rules
1. Additive migrations only; anything deleting data needs owner approval and runs from the SQL editor.
2. New table: RLS on + `revoke all` from anon/authenticated + access via checked functions.
3. Money is written only from confirmed provider events into the ledger.
4. History tables (`agent_actions`, `domain_events`) are append-only; retention purges run only under the retention flag.
5. Large time-series (telemetry, events) partitioned by month when they grow.
