# We Clean It All — Master security architecture


## In place (tested)
- **Row-level security on every public table.** Sensitive tables (markets, pricing, tax, coverage, compliance, insurance, agents, chats, AI usage, admins, devices) have no direct access for `anon`/`authenticated`; access only through functions that check the caller.
- **Owner powers need 2-step verification** (`aal2`) or a remembered device token; one owner account only (unique index).
- **Server-side authorization only.** Every admin function starts with `if not public.is_admin() then raise exception 'admin_only'`. Front-end role checks are cosmetic.
- **Guards as triggers:** customers cannot set status/worker/price below the floor/fees; workers cannot approve themselves or change ratings; providers cannot mark themselves as a We Clean It All team; bookings outside active markets are refused.
- **Dispatch eligibility is one function** used by offers, acceptance and manual assignment — neither AI ranking nor the owner can assign an unapproved, unavailable, unqualified or out-of-area provider.
- **Concurrency:** `accept_offer` locks the booking row (`for update`) so only one acceptance wins.
- **Append-only agent log** (update/delete/truncate blocked); audit log for owner actions.
- **AI spend cap** checked before every AI call (fails closed). AI prompts treat user text as data (prompt-injection guard). AI never approves money or market activation.
- **Location privacy:** cleaner location is shared only while on the way or cleaning and is cleared after the job.
- **Guest booking limits:** contact required, 1 open request per guest, 2 per phone, 30 guest bookings/hour overall.
- **WhatsApp webhook:** Twilio signature (HMAC-SHA1) verified, account checked, per-number rate limits, phone stored only as a keyed hash + last 4 digits, owner mode read-only.
- **Secrets** live in Supabase Edge Function secrets or Vault — never in the repo or the app. The app only contains the publishable (public) key.

## Known gaps / to do
1. **Staging environment** missing (all changes are live). Highest priority process risk.
2. Supabase **Site URL** still `localhost:3000` → auth links broken (owner dashboard setting).
3. **Leaked-password protection** requires Supabase Pro; free alternative: require digits/upper/lower/symbols, min 8.
4. `pg_net` installed in `public` schema (advisor warning; Supabase-managed, low risk).
5. Advisor lists signed-in users can execute SECURITY DEFINER functions — intended: each checks permissions internally; reviewed.
6. No automated CI yet; tests are run manually (SQL dry runs + local harness).
7. Retention purge not yet scheduled (chats 90 days, logs 1 year).
8. Document uploads: private bucket with per-owner paths; virus scanning not available on free plan.
9. Backups: free plan daily backups only (no point-in-time recovery).

## Rules for all future work
- Additive migrations only; anything that deletes data runs only with owner approval.
- New tables: RLS on, `revoke all` from `anon`/`authenticated`, access through checked functions.
- Never store card numbers (Stripe hosts payment fields), never log full phone numbers or addresses in AI/chat logs.
- Integrations are reported as "configured" only after a real successful test.

## Threat model (summary)
| Threat | Control |
|---|---|
| Malicious customer / fraudulent bookings | rate limits, guest guard, price floor, market gate, risk review (planned) |
| Compromised provider account | provider must stay approved for every job action (LIVE), suspension re-dispatches, location only during jobs |
| Payment manipulation | fees/tax computed in DB, ledger from signed webhooks only, refunds need owner |
| Prompt injection | user text treated as data, tools run with caller's token, sensitive actions only as approval requests |
| Malicious uploads | private bucket, type/size limits, owner-path rule; scanning planned |
| AI tool misuse | allow-listed tools, class limits, kill switch, append-only log |
| Unauthorized robot commands | mission-level API only, verified units, supervisor, no safety override |
| Webhook spoofing | signature verification + inbox duplicates ignored |

## Verified by tests
Agents 48/48 · WhatsApp 36/36 + 37/37 · national markets 26/26 · orchestration 17/17 (BUILT) · QA scenarios 10/12 with 1 real failure fixed live (suspended provider), verification re-run pending.
