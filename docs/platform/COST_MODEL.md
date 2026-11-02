# We Clean It All — Cost model and infrastructure profiles

**All amounts are ESTIMATES** for planning (Nov 2026). Check current vendor pricing before committing. Payment fees are per transaction and passed through the business, not infrastructure.

## STARTUP — Miami-Dade + Broward (up to ~1,000 jobs/month)
| Item | Choice | Monthly (est.) |
|---|---|---|
| Website + app hosting | GitHub Pages | $0 |
| Database/Auth/Storage/Functions | Supabase Free now → **Pro before public launch** | $0 → $25 |
| AI | Claude Haiku 5.5, hard cap in DB | ≤ $10 (owner-set) |
| WhatsApp / SMS | Twilio, ~2–4 messages per job | ~$10–40 |
| Email | Resend free tier | $0 |
| Maps | Google Maps links (free); embedded map within free usage | $0 |
| Monitoring | Supabase logs + owner panel; optional free error tracker tier | $0 |
| Backups | Pro daily backups (+ nightly pg_dump to private storage) | included |
| **Total fixed** | | **≈ $25–75** |
Bottlenecks: none expected. Risks: free-plan pause/backups (fix = Pro).

## GROWTH — Florida + first other states (~10,000–50,000 jobs/month)
| Item | Change | Monthly (est.) |
|---|---|---|
| Supabase | Pro + larger compute, point-in-time recovery | ~$150–400 |
| Storage | job photos (≈ 4 × 1–2 MB per job), lifecycle: originals 12 months, thumbnails kept | ~$10–50 |
| Realtime | tracker/offers subscriptions instead of polling | included in plan limits; upgrade if connections exceed |
| Background jobs | pg_cron + outbox; Supabase Queues (pgmq) if outbox lag > 1 min | included |
| AI | assistants + quality flags, capped | ~$100–500 (cap) |
| Messaging | WhatsApp templates + SMS | ~$300–1,500 |
| Error monitoring / uptime | hosted error tracker + uptime checks | ~$30–80 |
| CDN | GitHub Pages or Cloudflare (free) | $0 |
| **Total** | | **≈ $600–2,500** |
Bottlenecks to watch (and the trigger to act): DB CPU > 60% sustained → bigger compute; slow queries > 200 ms p95 → indexes/views; outbox lag > 1 min → queue workers; realtime connections near plan limit → plan upgrade.

## GLOBAL — many US metros + international
| Item | Change | Monthly (est.) |
|---|---|---|
| Database | larger primary + read replicas; separate regional projects where data residency requires (e.g. EU) | ~$2,000–10,000 |
| Services | split only measured hot spots (e.g. robotics telemetry ingest, payments) following existing boundaries | ~$500–3,000 |
| Telemetry | robot status sampled (e.g. every 10–30 s) into a time-series table/partitioned storage; raw data aggregated after 30 days | ~$200–2,000 |
| Messaging, AI, storage | scale with volume, caps per market | varies |
| Observability | centralized logs/traces | ~$300–1,500 |
| **Total** | | **≈ $5,000–30,000+** |

## Evolution rules
1. Grow vertically (bigger database) before splitting services.
2. Split a module into its own service only with a measured trigger (load, compliance, release cadence).
3. Every AI feature has a monthly cap per market; spend shown in the owner panel.
4. Retention keeps costs flat: chats 90 days, logs 1 year, photos per policy, telemetry aggregated.
