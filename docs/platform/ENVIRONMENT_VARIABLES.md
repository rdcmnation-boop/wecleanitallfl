# We Clean It All — Environment variables and secrets

Values are **never** stored in the repository. Edge Function secrets are set in Supabase → Edge Functions → Secrets
(https://supabase.com/dashboard/project/fqajygzjteauxornipva/functions/secrets).

## App (`app/config.js`, public by design)
| Name | Purpose | Set? |
|---|---|---|
| `SUPABASE_URL` | Project URL | yes |
| `SUPABASE_ANON_KEY` | Publishable key (safe to be public; RLS protects data) | yes |
| `GUEST_VERIFY` | `email` or `phone` guest check | `email` |
| `GOOGLE_MAPS_KEY` | Embedded maps (restrict to the domain) | no |
| `SUGGESTED_HOURLY`, `DEEP_HOURLY`, `MIN_JOB` | Fallback prices if the market price can't load | 45 / 55 / 120 |
| `BUSINESS_PHONE`, `BUSINESS_EMAIL`, `APP_URL` | Contact + links | yes |

## Edge Function secrets
| Name | Used by | Set? | Cost |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | all | automatic | — |
| `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`) | brain, ai-ceo, brain-learn, whatsapp-in | **no** | Haiku 5.5 ≈ $0.10 / $0.50 per million tokens in/out; hard cap $10/month in the database |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_FROM` (SMS) | notify, whatsapp-in | **no** | pay per message (WhatsApp/SMS); check Twilio + Meta pricing |
| `TWILIO_CONTENT_<template>` | approved WhatsApp templates | no | — |
| `WHATSAPP_WEBHOOK_URL` | only if Twilio calls a different URL | no | — |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Meta Cloud API (alternative to Twilio) | no | Meta conversation pricing |
| `RESEND_API_KEY`, `EMAIL_FROM` | notify email | **no** | free tier available |
| `CRON_SECRET` | notify (fallback; Vault secret is used) | Vault | — |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | (future) payments | **no** | card fees + Connect fees; check current Stripe pricing |

## Supabase dashboard settings (not variables)
- Authentication → URL Configuration: Site URL `https://www.wecleanitallfl.com`, Redirect URLs `https://www.wecleanitallfl.com/**`, `https://wecleanitallfl.com/**`. **Not set yet.**
- Authentication → Emails → SMTP: custom sender (e.g. Resend) so customers receive emails. **Not set yet.**
- Authentication → Providers → Phone (Twilio) for WhatsApp/SMS codes. Not set.

## Vault
- `notify_cron_secret` — used by pg_cron to call `notify`; checked by `check_cron_secret()`.
