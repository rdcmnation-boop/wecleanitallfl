# Project EARTH ONE — Partnerships and marketplace
_Covers systems 1 (Smart City Cleaning Coordination), 7 (Global Cleaning and Maintenance Marketplace) and 8 (Municipal and Enterprise Partnerships). Version 1 · 2026-11-02 · Design only. **No partnership exists yet.**_

## Partner types
| Type | They bring | They get | Account |
|---|---|---|---|
| Customers (homes) | bookings | trusted cleaning | existing |
| Businesses / enterprises | multi-site contracts, facility data (optional) | one provider network, quality and impact reports | organization |
| Business districts / campuses | public-facing areas, recurring routes | SLA-based coordination | organization |
| Municipalities | public spaces, procurement contracts | coordinated cleaning, measured reporting | organization (public) |
| Cleaning & maintenance providers | people, crews, licensed trades | jobs, payouts, training | existing provider + organization |
| Equipment & supply companies | products, eco-certified supplies | marketplace listings, orders | supplier organization |
| Robotics companies | robots, fleet APIs | deployments, Robot-as-a-Service revenue | robotics organization |
| NGOs / universities | research, community programs | anonymized aggregates (agreement) | organization |

## System 1 — Smart City Cleaning Coordination
**Purpose:** coordinate recurring cleaning and maintenance across authorized public spaces, districts and campuses.
**How:** sites and zones → work orders with SLAs and recurring rules → the same workflow engine and dispatch → Mission Control for multi-crew/robot jobs → completion evidence (checklists, photos without people) → SLA reports.
**Start small:** a private campus or business improvement district before any city, because the contracts are simpler and faster.
**Public-space rules:** permission from the site owner, permits where required, labor rules (prevailing wage where applicable), insurance and bonding levels set by the contract.

## System 7 — Global Cleaning and Maintenance Marketplace
**Purpose:** one marketplace connecting every partner type.
**Builds on:** the existing booking/dispatch marketplace + supplier catalog + robotics fleets + partner API.
**Rules:** every seller is verified (business documents, insurance where required); listings show real availability only; commissions recorded in the ledger; disputes through trust & safety; no product claims (e.g., "eco") without the supplier's certificate on file.

## System 8 — Municipal and Enterprise Partnerships
**Enterprise process:** prospect (Growth Engine) → walkthrough → proposal (AI draft, owner approved) → master service agreement → site onboarding → work orders → monthly invoice (Stripe Invoicing) → quarterly business review with quality + impact reports.
**Municipal process:** watch public bids (RFP/RFQ) → legal review of requirements (insurance, bonding, certifications, local preferences, labor rules) → bid prepared with AI help, **approved and submitted by a person** → if awarded: contract compliance tracking, public-records obligations, reporting cadence.
**Data agreements:** signed for any client data (meters, haulers, sensors) with purpose, retention, sharing limits and end date. Nothing flows before signing.

## Secure integration path for partners
Sandbox (staging) keys → integration tests → contract signed → production keys (scoped, hashed, rotatable) → signed webhooks → monitoring in the command center → annual review. Partners never get direct database access; they call the same checked functions as the app.

## Compliance per jurisdiction
For each new country/state/city, the launch checklist adds: business registration, tax registration, worker classification rules, data-protection law, procurement rules for public work, robotics/public-space rules, insurance minimums. **Each item needs a qualified reviewer before the jurisdiction can activate.** We Clean It All's own team does not give legal advice; local counsel does the review.

## Partnership revenue
Contract margin (enterprise, district, municipal) · marketplace commissions (suppliers, robotics companies) · data-agreement-based reporting subscriptions · training for partner staff (Academy).

## Risks
| Risk | Mitigation |
|---|---|
| Long public sales cycles | lead with private campuses and districts |
| Bid requirements we can't meet yet (bonding, insurance, certifications) | readiness checklist before bidding; don't bid early |
| Partner data misuse | agreements, scoped keys, access logs, revocation |
| Marketplace fraud | seller verification, ledger, payout holds, dispute process |
| Reputation risk from public work | SLA reporting, quality evidence, measured claims only |
