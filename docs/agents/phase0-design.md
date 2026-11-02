# We Clean It All — AI agent system, Phase 0 design

Status: **draft for owner review.** No code, no database changes, no live deployment.

## 1. Principles
- Agents recommend. The owner approves anything external, financial, or irreversible.
- No agent holds database service-role credentials. Agents act only through scoped roles and approved functions.
- No agent can change its own permissions, the approval rules, pricing rules, or safety policy.
- Every agent action is written to an append-only audit log.
- Facts the system doesn't have are recorded as unknown. Nothing is invented.

## 2. Approval classes
| Class | What it covers | Approval |
|---|---|---|
| A | Read-only analysis and reports | None |
| B | Internal drafts: messages, reports, recommendations, checklists | None to create; owner reviews before use |
| C | Reversible internal changes: flag a booking, open a task, add a note | Allowed for the listed agents; logged |
| D | Owner approval before execution: any customer or worker message, job assignment, price or commission change, refund, payout, worker approval or suspension, contract terms, account permission change | Owner approves each action |
| E | Never allowed for agents: payments, moving money, owner account, roles, deployments, policies, and code | Not available to agents |

## 3. Agent contracts
| Agent | Role | May read | May propose | Max class without approval | Never |
|---|---|---|---|---|---|
| CEO_AGENT | Summarize the business and set priorities | Aggregate views only | Priorities, weekly plan | B | Execute D or E actions |
| OPERATIONS_AGENT | Track bookings, offers, status, overdue work | Bookings, offers, status history | Reassignments, reminders (drafts), escalations | C | Assign jobs without approval |
| FINANCE_AGENT | Revenue and profitability reports | Bookings, pricing outputs, payment status | Price or commission changes (D) | A | Move money, change prices |
| SALES_AGENT | Commercial leads and proposals | Commercial account records (when built) | Proposals, follow-up drafts | B | Send proposals or sign contracts |
| MARKETING_AGENT | Content and campaign drafts | Published-content metadata | Drafts, schedules (D to publish) | B | Publish or spend budget |
| CUSTOMER_SUPPORT_AGENT | Answer questions from approved knowledge; draft replies | Approved FAQ and service catalog; the customer's own bookings | Draft replies; escalations | B | Issue refunds; promise prices or times |
| WORKER_MANAGEMENT_AGENT | Worker profiles, availability, reliability | Worker profiles and status | Notices (drafts); suspension recommendations | B | Approve, suspend, or change worker status (D) |
| JOB_MATCHING_AGENT | Rank and recommend workers for open jobs | Worker qualifications, availability, service area, ratings | Top-N recommendations with reasons | B | Assign a job (D) |
| RISK_AGENT | Detect unusual cancellations, no-shows, complaints | Bookings, cancellations, complaints | Alerts to owner | C | Take any action on a customer or worker |
| BUSINESS_INTELLIGENCE_AGENT | Analytics and trends | Aggregates, historical outcomes | Reports, improvement ideas | A | Modify data |

Notes:
- JOB_MATCHING_AGENT builds on the existing database ranking (`rank_workers`). It doesn't replace it.
- Pricing comes only from the pricing engine on `feature/pricing-engine`. Agents never set prices.

## 4. Permission model
- **Agent registry:** one row per agent with its name, an enumerated allowed-action list, its maximum approval class, and its status (active or paused). Only the owner can change the registry.
- **Enforcement in the database,** not in the prompt. Each agent uses its own database role, and every action is checked against the registry.
- **Runtime tool allowlist** (Phase 2): an agent can call only the tools listed in its contract.
- **Rate limits** per agent per hour, plus a monthly model-spend cap.
- **Agents cannot add to their own permissions.** Any change to the registry is an owner action.

## 5. Audit and approvals (designed here, built in Phase 1)
- **agent_actions** (append-only): id, agent, action, input hash, output summary, approval id, actor, created_at. No update or delete. Enforced by database rules.
- **approvals:** id, requesting agent, action, payload, status (pending, approved, rejected, expired), decided by, decided at, reason. Owner decisions are recorded with a reason.

## 6. Business memory (built later)
- Facts are stored with a source, a verified-at time, and a verified-by field.
- Agents read memory. They write only owner-verified facts, or system-derived records that link to their source.
- Start with SQL queries. Add vector search only if a specific retrieval need can't be met with SQL.

## 7. Model layer (Phase 2)
- Provider-independent interface: `complete({ task, context, tools, maxTokens })`, with one adapter per provider.
- A configuration table assigns a model to each task, based on capability, cost, speed, and reliability.
- The API key lives only in Supabase Edge Function secrets. It never appears in frontend code or the repository.

## 8. Success metrics (examples)
- OPERATIONS: share of bookings assigned within the target time; overdue count.
- FINANCE: report reconciliation rate against source records.
- JOB_MATCHING: acceptance rate of recommendations.
- CUSTOMER_SUPPORT: escalation accuracy; time to first reply.
- RISK: share of flagged cases confirmed by the owner.

## 9. Error recovery
- **Timeout:** retry once, then escalate to the owner.
- **Tool error:** log it and stop the action. Never retry an external action automatically.
- **Uncertainty:** say so and ask the owner. Don't guess.

## 10. Owner decisions needed before Phase 2
1. Can any agent message a customer or worker without approval? **Default: no.**
2. Which model provider, and what monthly spend cap? **Default: Anthropic, capped at an amount you set.**
3. Which agents go live first? **Default: OPERATIONS and FINANCE, read-only.**
4. How long audit records are kept. **Default: indefinitely.**

## 11. Out of scope for this phase
- Any code, database migration, or deployment.
- Payments, Stripe, WhatsApp, and the AI assistant's live connections. These need credentials and separate approval.
