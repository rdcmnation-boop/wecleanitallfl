// We Clean It All — app settings.
// Leave SUPABASE_URL empty to run in DEMO mode (everything saved only in this browser).
// To go live: paste your Supabase Project URL and "anon public" key (Supabase → Project Settings → API).
// The anon key is designed to be public; the database's Row Level Security protects the data.
window.WCIA_CONFIG = {
  SUPABASE_URL: "https://fqajygzjteauxornipva.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_29CglvTchKfNHjhNnQCkdA_MorPe_51",
  // Let people book without an account (anonymous guest). Demo mode always allows it.
  // Keep false in live mode until the guest limits in marketplace/supabase/guest_booking.sql are applied
  // and "Allow anonymous sign-ins" is on in Supabase Auth.
  GUEST_BOOKING: false,
  // Suggested hourly rate used only to pre-fill an estimate the customer can change.
  SUGGESTED_HOURLY: 30,
  // Owner contact shown to customers and cleaners.
  BUSINESS_PHONE: "9543209303",
  BUSINESS_EMAIL: "wecleanitallfl@gmail.com",
  APP_URL: "https://www.wecleanitallfl.com/"
};
