# We Clean It All — Master integration map
Each outside service has exactly one door (an edge function) and its secrets live only in Supabase secrets/Vault.

| Service | Purpose | Door | Status | Secrets | Failure behavior |
|---|---|---|---|---|---|
| Supabase Auth | sign-in, 2-step (TOTP), guest sessions | built-in | LIVE (Site URL + SMTP still to fix) | — | app unavailable |
| GitHub Pages | website + app hosting | — | LIVE | — | cached app shell |
| Anthropic Claude (Haiku 5.5) | assistant, owner briefing, WhatsApp answers, learning | `ai.ts` in brain/ai-ceo/brain-learn/whatsapp-in | code LIVE, **no key** | ANTHROPIC_API_KEY | built-in replies; $10 cap |
| OpenAI (optional) | alternative AI provider | same `ai.ts` interface | PLANNED | OPENAI_API_KEY | same fallback |
| Twilio WhatsApp/SMS | notices, WhatsApp agent, OTP | `notify`, `whatsapp-in` | code LIVE, **no keys** | TWILIO_SID/TOKEN/WHATSAPP_FROM/FROM | outbox waits, in-app still works |
| Meta WhatsApp Cloud API | alternative channel | `notify` | code ready, no keys | WHATSAPP_TOKEN/PHONE_ID | falls back to Twilio/SMS/email |
| Resend (SMTP/email) | auth emails + notices | Supabase SMTP + `notify` | **not configured** | RESEND_API_KEY | emails don't reach customers |
| Google Maps | directions links (LIVE), embedded map/travel time (PLANNED) | app links / future fn | links LIVE | GOOGLE_MAPS_KEY (restricted) | links only |
| Stripe Connect | payments, payouts, invoices, subscriptions | future `payments` fn + webhook (inbox) | PLANNED | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | bookings stay payment-pending; never assumed paid |
| Robot manufacturers | missions, status | future `robotics` fn adapters | PLANNED (simulator only) | per vendor in Vault | NEEDS_ATTENTION + human fallback |
| Web push / Expo push | push notifications | future fn | PLANNED | VAPID / Expo token | in-app + WhatsApp |
| Partner apps | property mgmt, BMS, companies | future `api` gateway | PLANNED | hashed partner keys | rate-limited, signed webhooks |
