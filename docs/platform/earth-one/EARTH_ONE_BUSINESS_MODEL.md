# Project EARTH ONE — Business model, costs and risks
_Version 1 · 2026-11-02 · Planning only. **No revenue forecasts**: none of these markets has been tested. Cost figures are rough planning estimates to be checked before any spend._

## Who pays for what
| Revenue line | Paid by | Model | Starts |
|---|---|---|---|
| Home and commercial cleaning (core) | customers, businesses | service fee 12% + payout fees; contract margin | now (fees charged once Stripe is live) |
| District / campus / municipal service contracts | organizations | monthly SLA contracts | E4 / E8 |
| Predictive maintenance subscription | commercial buildings | per site per month | E2 |
| Sustainability reporting subscription | enterprises, districts | per site or per report (measured data only) | E1 / E3 |
| Marketplace commissions | suppliers, robotics companies | % of orders / deployments | E7 |
| Robot-as-a-Service | commercial clients | subscription or per-mission, shared with the robotics partner | E5 |
| Training and certification | providers, partner staff | per course / subscription | Academy |
| Anonymized insight reports | industry, NGOs, universities | per report, under agreement | late |

## Cost structure (rough estimates)
| Category | E0–E3 | E4–E6 | E7–E10 |
|---|---|---|---|
| Platform infrastructure (Supabase Pro, storage, functions) | ≈ $25–60/month | ≈ $60–200/month as data grows | regional projects added per region (≈ $25+/month each, before usage) |
| AI (capped) | current cap ($10/month), raised only on proven value | low tens/month | scales with use, capped |
| Messaging / email | per message | per message | per message |
| Insurance (general, robotics, public work), bonding | existing policy | **quotes required** per contract | **quotes required** |
| Legal (contracts, data agreements, jurisdictions) | template review | per contract | local counsel per country |
| Robots / hardware | $0 | **paid by pilot client or partner** | same |
| Security (penetration test) | — | before first municipal bid (**quote required**) | yearly |
| People (ops managers, supervisors, sales) | owner | first hires funded by contract margin | per market |

**Principle:** infrastructure stays inside the current platform until a signed customer or partner pilot pays for anything bigger.

## Value tests before spending
| Spend | Only when |
|---|---|
| Sensor/IoT connector | a client has signed a paid pilot that needs live data |
| Regional database project | a real customer in that region requires data residency |
| Robot hardware | a pilot client or robotics partner covers it |
| Bid/bonding costs | readiness checklist passed and the margin estimate is approved |
| Data platform beyond Postgres | reports become slow or data no longer fits |

## Main risks
| Risk | Impact | Mitigation |
|---|---|---|
| Losing focus on the core business | high | EARTH ONE gated behind E0; feature flags; core tests must pass |
| Greenwashing / unprovable claims | high (reputation, legal) | measurement rule, owner approval, qualified review |
| Robot safety incident | high | supervision, vendor safety stack, insurance, field tests |
| Public-sector complexity | medium | start with private campuses and districts |
| Data-protection breach | high | data agreements, least data, RLS, access logs, retention, pen tests |
| Multi-country legal exposure | high | local counsel review before any activation |
| Cost creep from infrastructure | medium | value tests; pilots pay for their own infrastructure |
| Partner dependency (vendors, haulers) | medium | vendor-neutral interfaces; more than one partner per category over time |

## Unit economics to track (as stages start)
- **Contracts:** contract revenue − provider pay − supplies − insurance/compliance share − platform costs = contract margin.
- **Subscriptions:** subscription revenue − data and AI costs − support time.
- **Marketplace:** commissions − payment fees − dispute costs.

Every figure comes from the ledger once real; until then it is labeled ESTIMATED.
