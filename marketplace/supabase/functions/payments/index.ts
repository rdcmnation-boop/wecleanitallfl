// Us → Stripe. Three actions:
//   POST {action:"checkout", booking_id}  (signed-in customer) → Stripe-hosted Checkout URL. Card is AUTHORIZED only (manual capture).
//   POST {action:"connect"}               (signed-in cleaner)  → Stripe Express onboarding link for payouts.
//   POST {action:"run"}  + x-cron-secret  (pg_cron)            → performs queued capture / cancel / refund / transfer jobs.
// We never see card numbers. Every Stripe call carries an Idempotency-Key, so a retry can never charge twice.
// Money states are NOT changed here: they change only when the signed webhook confirms (stripe-webhook).
import { env, stripe, type Fetch } from "../_shared/stripe.ts";

const SB = env("SUPABASE_URL").replace(/\/$/, "");
const SRV = env("SUPABASE_SERVICE_ROLE_KEY");
const ANON = env("SUPABASE_ANON_KEY");
const APP = env("APP_URL", "https://www.wecleanitallfl.com/");
const svc = { apikey: SRV, Authorization: `Bearer ${SRV}`, "Content-Type": "application/json" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function rest(path: string, init: RequestInit = {}, headers: Record<string, string> = svc) {
  const r = await fetch(`${SB}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });
  if (!r.ok) throw new Error(`db_${r.status}`);
  return r.status === 204 ? null : r.json();
}
const rpc = (fn: string, args: unknown, headers = svc) => rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, headers);

async function caller(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return { id: u.id as string, email: (u.email as string) || "", auth };
}

// Exported for tests: build the Checkout Session request from a booking.
export function checkoutParams(b: { id: string; code: string; service: string }, amountCents: number, email: string, app = APP) {
  return {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: `We Clean It All ${b.code} (${b.service})` } } }],
    payment_intent_data: { capture_method: "manual", metadata: { booking_id: b.id, code: b.code } },
    metadata: { booking_id: b.id },
    customer_email: email || undefined,
    success_url: `${app}?paid=${encodeURIComponent(b.code)}`,
    cancel_url: `${app}?pay_cancelled=${encodeURIComponent(b.code)}`,
  };
}

async function checkout(req: Request, body: any) {
  const u = await caller(req);
  if (!u) return json({ error: "sign_in_required" }, 401);
  const userH = { apikey: ANON, Authorization: u.auth, "Content-Type": "application/json" };
  const pay = await rpc("my_payment", { p_booking: body.booking_id }, userH) as { status: string; amount_cents: number } | null;
  if (!pay) return json({ error: "not_found" }, 404);           // not this customer's booking (checked by the database)
  if (pay.status !== "requires_payment") return json({ error: "already_" + pay.status }, 409);
  const [b] = await rest(`/rest/v1/bookings?id=eq.${encodeURIComponent(body.booking_id)}&select=id,code,service`) as any[];
  const s = await stripe("POST", "/checkout/sessions", checkoutParams(b, pay.amount_cents, u.email), `checkout:${b.id}:${pay.amount_cents}`);
  return json({ url: s.url });
}

async function connect(req: Request) {
  const u = await caller(req);
  if (!u) return json({ error: "sign_in_required" }, 401);
  const [w] = await rest(`/rest/v1/workers?id=eq.${u.id}&select=id`) as any[];
  if (!w) return json({ error: "cleaners_only" }, 403);
  const [acct] = await rest(`/rest/v1/payment_accounts?worker_id=eq.${u.id}&select=stripe_account_id`) as any[];
  let id = acct?.stripe_account_id as string | undefined;
  if (!id) {
    const a = await stripe("POST", "/accounts", { type: "express", country: "US", email: u.email || undefined,
      capabilities: { transfers: { requested: true } }, metadata: { worker_id: u.id } }, `connect:${u.id}`);
    id = a.id as string;
    await rpc("payment_account_update", { p_worker: u.id, p_account: id, p_details: false, p_charges: false, p_payouts: false, p_livemode: !!a.livemode });
  }
  const link = await stripe("POST", "/account_links", { account: id, type: "account_onboarding", refresh_url: `${APP}?payout=retry`, return_url: `${APP}?payout=done` });
  return json({ url: link.url });
}

// Exported for tests: one outbox job → one Stripe call (idempotent by the job's key).
export async function perform(job: { kind: string; idempotency_key: string; payload: any }, f: Fetch = fetch) {
  const p = job.payload;
  switch (job.kind) {
    case "stripe.capture": return stripe("POST", `/payment_intents/${p.payment_intent}/capture`, {}, job.idempotency_key, f);
    case "stripe.cancel": return stripe("POST", `/payment_intents/${p.payment_intent}/cancel`, {}, job.idempotency_key, f);
    case "stripe.refund": return stripe("POST", "/refunds", { payment_intent: p.payment_intent, amount: p.amount_cents, metadata: { booking_id: p.booking_id } }, job.idempotency_key, f);
    case "stripe.transfer": return stripe("POST", "/transfers", { amount: p.amount_cents, currency: "usd", destination: p.destination,
      source_transaction: p.charge ?? undefined, metadata: { booking_id: p.booking_id } }, job.idempotency_key, f);
    default: throw new Error("unknown_kind");
  }
}

async function run(req: Request) {
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!given || (await rpc("check_cron_secret", { p: given })) !== true) return json({ error: "forbidden" }, 403);
  const out: Record<string, number> = {};
  for (const kind of ["stripe.capture", "stripe.cancel", "stripe.refund", "stripe.transfer"]) {
    const jobs = await rpc("outbox_claim", { p_kind: kind, p_limit: 20, p_lease_seconds: 120 }) as any[];
    for (const j of jobs) {
      let r: string;
      try { await perform(j); r = await rpc("outbox_finish", { p_id: j.id, p_ok: true }) as string; }
      catch (e) { r = await rpc("outbox_finish", { p_id: j.id, p_ok: false, p_error: String((e as Error).message).slice(0, 300) }) as string; }
      out[r] = (out[r] ?? 0) + 1;
    }
  }
  return json(out);
}

if (!(globalThis as any).__TEST__) (globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "checkout") return await checkout(req, body);
    if (body.action === "connect") return await connect(req);
    if (body.action === "run") return await run(req);
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const m = String((e as Error).message);
    // never echo keys; Stripe error codes only
    return json({ error: m.startsWith("stripe_") || m === "stripe_not_configured" || m === "live_key_refused" ? m : "server_error" }, m === "stripe_not_configured" ? 503 : 500);
  }
});
