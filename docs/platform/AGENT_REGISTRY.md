# We Clean It All — Agent registry (multi-agent design)

## What already exists (live, tested 48/48)
`agent_registry` (agent, status, rollout_step, max_class, allowed_actions) · `agent_actions` (append-only log) · `agent_tasks` (alerts) · `approvals` (human decisions) · `agent_settings` (cap, model, auto-send, kill switches) · `orchestrator_tick` every 5 min · AI spend cap checked before every call. 10 agents: orchestrator, dispatch, operations (step 1, live) · support, security, compliance (step 2, Nov 5) · finance, quality, growth, pricing (step 3, Nov 9).

## Approval classes (enforced in the database)
| Class | Meaning | Who decides |
|---|---|---|
| A | read / report / alert | agent alone |
| B | draft (message, campaign, proposal, price suggestion) | human sends/applies |
| C | routine operational action inside rules (re-offer a job, send a routine notice) | agent alone, logged; owner can pause |
| D | sensitive: refunds, payouts, account changes, market activation, major price changes, robot safety settings | **always an `approvals` row + owner (2-step) decision**; the agent can never execute it |
`max_class` per agent caps what it may even request; nothing above C runs without approval.

## The 12 agents (mapped to existing ones; start small)
| # | Agent | Registry id | Responsibility | Tools (allow-list) | Max class | Start |
|---|---|---|---|---|---|---|
| 1 | CEO / Operations Supervisor | `orchestrator` | coordinates agents, daily briefing, routes tasks | read stats; `_agent_alert`; route_task | B | **live** |
| 2 | Customer Support | `support` | answers clients & cleaners (app, WhatsApp), hands off to a person | read caller's own bookings; FAQ; create handoff | C (answers) | Nov 5 |
| 3 | Booking | `booking` (new) | conversational booking: collects details, shows market price, creates the request **as the customer** | `market_for_zip`; create booking with caller's token | C | after state machine |
| 4 | Pricing Intelligence | `pricing` | suggests price changes per market from demand/margins | read market data; draft `market_pricing` change | B (major → D) | Nov 9 |
| 5 | Dispatch | `dispatch` | re-offers stale jobs, recommends candidates | `rank_workers`, `dispatch_booking` | C | **live** |
| 6 | Workforce Coordination | `operations` | late jobs, cleaner reminders, coverage gaps | read jobs; remind; alert | C | **live** |
| 7 | Commercial Sales | `growth` | lead follow-up, proposal drafts | read accounts; draft proposal/campaign | B | Nov 9 (drafts only) |
| 8 | Quality Assurance | `quality` | low ratings, checklist gaps, (later) photo flags for human review | read reviews/checklists; alert | A | Nov 9 |
| 9 | Robotics Coordination | `robotics` (new) | recommends robot vs human vs hybrid; watches fleet status | read robot registry/telemetry; recommend | A (never commands safety) | Stage D, simulator only |
| 10 | Financial Reconciliation Assistant | `finance` | daily revenue, fee totals, mismatches vs Stripe | read money tables; report | A | Nov 9 (report only) |
| 11 | Market Expansion Research | `expansion` (new) | demand outside active markets, checklist readiness reports | read waitlist/zip demand; report | A | later |
| 12 | System Monitoring | `security` | audit scan, failed jobs, cron/outbox health, AI cost | read logs; alert | A | Nov 5 |

**Begin with 5 useful agents:** orchestrator, dispatch, operations (live) + support and security (Nov 5). The others stay off until their underlying feature exists.

## Contract for every agent
- **Input schema:** `{ trace_id, agent, trigger: 'cron'|'event'|'user', subject_ref, context (minimal, no street addresses/phones unless the tool needs them) }`
- **Output schema:** `{ trace_id, kind: 'fact'|'recommendation'|'action_done'|'approval_requested', summary, evidence_refs[], confidence?, approval_id? }` — the UI shows **Fact**, **Recommendation**, **Done**, **Awaiting approval** differently.
- **Limits:** max tool calls per run (5), max AI tokens per run, per-agent monthly AI budget inside the global cap, 20 s timeout per AI call, 2 retries with backoff, then the run is marked `failed` and the orchestrator alerts.
- **Logging:** every run and tool call → `agent_actions` (append-only) with `trace_id`, input hash, outcome.
- **Escalation:** failure, low confidence, policy hit, or class D → `agent_tasks` alert / `approvals` row for the owner.
- **No agent-to-agent tool access:** agents only talk through the orchestrator (tasks) and shared events; one agent can't call another's tools.
- **Permissions:** tools are database functions; user-facing agents run with the **caller's token**, background agents with a dedicated restricted path — never broad service-role SQL.

## Evaluation, versioning, cost, kill switch
- **Kill switch:** per agent (`admin_set_agent_status` → paused) and global (`agent_settings` messaging/AI off); pausing always wins. (Live.)
- **Cost:** `ai_usage` per feature/agent; monthly cap; owner panel spend bar. (Live.)
- **Versioning:** `agent_registry.prompt_version`, `model`; changes logged; rollback = previous version.
- **Evaluation:** fixed test sets per agent (e.g. 30 support questions with expected behavior: safety-first, no invented prices, handoff when asked), run before enabling a new version; results stored in TEST_REPORT.md. Brain prompt eval set already exists (`marketplace/brain_eval`).
- **Forbidden (enforced in DB, not prompts):** refunds, payouts, sensitive account changes, market activation, major pricing changes, robot safety overrides.
