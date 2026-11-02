# We Clean It All — Technical risks (prioritized)

| # | Risk | Likelihood | Impact | Mitigation | Owner decision? |
|---|---|---|---|---|---|
| 1 | **No staging**: every change hits live customers | High | High | ADR-10: second free Supabase project + staging site; numbered migrations with rollback files | **Yes** |
| 2 | **Auth emails broken** (Site URL = localhost; free email only reaches team members) | Certain | High | Set Site URL/Redirect URLs; connect Resend SMTP | Yes (dashboard) |
| 3 | **Free plan in production**: auto-pause after inactivity, limited backups, no leaked-password check | Medium | High | Supabase Pro ($25/mo) before public launch; nightly pg_dump meanwhile | Yes (cost) |
| 4 | **Duplicate business logic in the browser** (demo backend, price formula) | High | Medium | ADR-02: preview-only demo; server prices | No (technical) |
| 5 | **Status changes spread across many functions** (no single state machine/event history) | Medium | High as payments arrive | ADR-04 before Stripe | Yes (approve design) |
| 6 | **No automated CI**; tests run by hand | High | Medium | ADR-11 GitHub Actions | No |
| 7 | **Monolithic `app.js`** (1,525 lines) | Medium | Medium | split by domain, one module per step | No |
| 8 | Dispatch runs inside the booking insert transaction | Low now | Medium at scale | move to event consumer later | No |
| 9 | Polling instead of realtime | Medium | Low–Medium (cost/latency) | Supabase Realtime with polling fallback | No |
| 10 | Edge functions each carry a copy of `ai.ts` | Medium | Low | scripted copy from `_shared` at deploy | No |
| 11 | Migrations exist both as repo files and applied history; some repo files never applied (`agents_retention.sql`) | Medium | Medium | migrations folder with order + status table | No |
| 12 | Legal/tax per state not encoded beyond the checklist | Medium | High when expanding | checklist + accountant/lawyer review per market | Yes, per market |
| 13 | Payments outside the app: no record that money changed hands | High | Medium | Stripe Connect (ADR-07) | Yes (keys) |
| 14 | Robotics vendor APIs unknown | — | High if rushed | simulator + adapter interface; no real dispatch until verified | Yes (vendor choice) |
| 15 | Single owner account = single point of failure for 2-step login | Low | High | recovery codes + second super admin (ADR-03) | Yes |
