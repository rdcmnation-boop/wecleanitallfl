# We Clean It All — Master deployment architecture

## Environments
| | Production | Staging (test copy) |
|---|---|---|
| Website/app | GitHub Pages `main` → www.wecleanitallfl.com | separate Pages site (PLANNED) with `config.js` → staging project |
| Database | Supabase `fqajygzjteauxornipva` | Supabase `wcia-staging` `elzpvlpeypkcsvywwebl` (created; schema copy in progress) |
| Secrets | real keys | test keys only (Stripe test mode, Twilio sandbox) |
| Data | real | synthetic only (never copy customer data) |

## Release flow
1. Change written as a numbered migration (`marketplace/supabase/migrations/NNNN_name.sql`) + rollback file, and app changes on a branch.
2. Apply to staging → run SQL test suites + function harnesses + phone-size browser checks.
3. Record results in TEST_REPORT.md; architecture review (release-readiness: CRITICAL/HIGH block).
4. **Owner authorizes** the production change.
5. Apply migration to production; deploy app (bump version tags + service-worker cache).
6. Smoke test live (rolled-back dry-run suites are safe on production).

## Rollback
- App: revert the commit; GitHub Pages redeploys in ~1–2 minutes; version tags force fresh files.
- Database: re-apply previous function versions (`create or replace`), drop new triggers; tables are additive so they can stay unused.
- Edge functions: redeploy previous version from git.

## Disaster recovery
| Risk | Plan |
|---|---|
| Database loss/corruption | Supabase backups (Pro: daily, 7 days; PITR optional) + nightly `pg_dump` to private storage (PLANNED) · weekly restore test into staging · target RPO 24 h (free) / minutes (PITR), RTO 4 h |
| Bad deploy | rollback above; feature flags per market (`payments_mode`, agent kill switches, messaging switch) |
| Outside service down | graceful degradation (MASTER_INTEGRATION_MAP.md); outbox retries; dead-letter alerts |
| Owner account lockout | recovery codes + second super admin (PLANNED) |
| Free-plan pause | Supabase Pro before public launch |

## Monitoring
Orchestrator (5 min) + watchdog (10 min, BUILT) alerts in the owner panel; outbox/dead-letter counts; AI spend bar; Supabase logs; PLANNED: uptime checks, error tracker, daily health summary.
