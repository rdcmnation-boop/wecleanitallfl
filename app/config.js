// We Clean It All — app settings.
// Leave SUPABASE_URL empty to run in DEMO mode (everything saved only in this browser).
// To go live: paste your Supabase Project URL and "anon public" key (Supabase → Project Settings → API).
// The anon key is designed to be public; the database's Row Level Security protects the data.
window.WCIA_CONFIG = {
  SUPABASE_URL: "https://fqajygzjteauxornipva.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_29CglvTchKfNHjhNnQCkdA_MorPe_51",
  // Let people book without an account (anonymous guest). Demo mode always allows it.
  // ON by owner decision. Still to do: apply marketplace/supabase/guest_booking.sql (bot limits) and turn on
  // "Allow anonymous sign-ins" + the Phone provider in Supabase Auth. Without them the flow falls back safely.
  GUEST_BOOKING: true,
  // How guests prove they are a person: "email" (free, works now: a code to their email) or "phone"
  // (code by WhatsApp, then SMS; needs the Phone provider with Twilio in Supabase Auth).
  GUEST_VERIFY: "email",
  // Google Maps key (Maps Embed API, enabled in a Google Cloud project with billing). Empty = no map, directions button only.
  GOOGLE_MAPS_KEY: "",
  // Brain assistants (customer, cleaner, owner). Keep false until the 'brain' function is deployed in Supabase
  // and ANTHROPIC_API_KEY is set. Demo mode always shows them.
  BRAIN_ON: true,
  // Suggested hourly rate used only to pre-fill an estimate the customer can change.
  SUGGESTED_HOURLY: 30,
  // Owner contact shown to customers and cleaners.
  BUSINESS_PHONE: "9543209303",
  BUSINESS_EMAIL: "wecleanitallfl@gmail.com",
  APP_URL: "https://www.wecleanitallfl.com/"
};
