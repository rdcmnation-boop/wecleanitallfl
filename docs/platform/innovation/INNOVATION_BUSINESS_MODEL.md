# We Clean It All — Innovation business model
_Version 1 · 2026-11-02 · Planning estimates, not measured results. Every figure is re-checked against real prices and real data before money is spent._

## Revenue streams
| Stream | Source system | Model | Status |
|---|---|---|---|
| Client service fee (12%) | core marketplace | per booking | configured, charged once Stripe is live |
| Same-day payout fee ($1.99) | core marketplace | per instant payout | configured, charged once Stripe is live |
| Commercial contracts | 5 Growth + 1 Twin | monthly recurring, platform margin | PLANNED |
| Recurring home plans | 1 Twin + journey | weekly/biweekly/monthly bookings | PLANNED |
| Guaranteed Clean plan | 4 Quality | premium on recurring/commercial | PLANNED, after the refund rate is known |
| Inspection & quality reports | 4 Quality | included in commercial price or add-on | PLANNED |
| Academy courses & certification | 6 Academy | per course or provider subscription; outside companies later | PLANNED |
| Green clean add-on | 7 Impact | per booking add-on | PLANNED |
| Sustainability reports | 7 Impact | commercial add-on | PLANNED, only with measured data |
| Industry insight reports | 2 Intelligence | per report / subscription | PLANNED, late (needs volume) |
| Robot-as-a-Service | 3 Mission control | commission on robot-provider jobs / subscriptions | PLANNED, needs a real vendor |
| Partner API | ecosystem | usage tiers | PLANNED, late |

## Operating cost estimates (low volume ≈ 500 jobs/month)
| Item | Estimate | Note |
|---|---|---|
| Supabase Pro | ≈ $25/month | needed before public launch anyway (not innovation-specific) |
| Extra storage (photos, floor plans, course media) | ≈ $0–10/month at first | stays within plan allowances at low volume; verify |
| AI (all agents, low-cost model) | capped, currently $10/month | raise the cap only when a feature proves its value |
| AI photo review (if switched on) | ≈ a few cents per job | test on a sample first |
| Email (Resend) | free tier, then low monthly | verify current pricing before setup |
| WhatsApp/SMS (Twilio) | per-message fees | existing plan; marketing texts not used |
| Stripe | per-transaction fees | paid from the service fee |
| Robotics | **$0 until a vendor exists** | leases, vendor API and insurance quoted per manufacturer |
| Course content | owner/staff time | biggest real Academy cost |

**Total extra monthly infrastructure for Waves 1–4: estimated tens of dollars, not hundreds.** Nothing in Waves 1–4 needs new servers.

## Value tests before spending
| Spend | Switch on only when |
|---|---|
| AI photo review | the sample pilot catches real misses humans confirm, at an acceptable cost per job |
| Higher AI cap | the agent's output is used (drafts approved, insights acted on) |
| Data warehouse / ML tools | the database reports get slow or questions need more than SQL |
| Paid lead data | manual + AI research has produced won contracts and the funnel needs more leads |
| Video hosting service | course video storage or bandwidth outgrows simple storage |
| Robot pilot | a manufacturer agreement, insurance and safety review are in place, with a paying commercial client |
| New market | the home markets have shown positive per-job margin for 2 months |

## Unit economics to track (from the ledger, once Stripe is live)
Per job: **service fee + payout fees − Stripe fees − AI/messaging cost − support/corrective cost = platform margin.** The provider keeps 100% of the job price and tips. Commercial contracts: contract price − provider pay − supplies − fees = contract margin. All these show as ESTIMATED until ledger data exists, then as actuals.

## KPIs by system (summary)
| System | Main KPI |
|---|---|
| 1 Twin | estimate accuracy (estimated vs actual hours) |
| 2 Intelligence | forecast and estimate error trending down |
| 3 Mission control | on-time multi-crew completion; robot utilization **not measured until real robots** |
| 4 Quality | missed-task rate, refunds per 100 jobs, AI flag precision |
| 5 Growth | win rate, recurring commercial revenue |
| 6 Academy | complaint rate certified vs not; course revenue |
| 7 Impact | travel miles per job (measured), % claims with measured baseline |
