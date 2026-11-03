// Stripe → us. The ONLY door that can change money states. verify_jwt is off because Stripe signs the request instead:
// every event is rejected unless its Stripe-Signature matches STRIPE_WEBHOOK_SECRET (and, for Connect events,
// STRIPE_CONNECT_WEBHOOK_SECRET). Each event is recorded once in inbox_events; duplicates are acknowledged and ignored.
import { env, verifySignature } from "../_shared/stripe.ts";

const SB = env("SUPABASE_URL").replace(/\/$/, "");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcHttp: Rpc = async (fn, args) => {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc_${fn}_${r.status}`);
  return r.json();
};

// Pure routing, exported for tests: event → database call.
export async function route(evt: any, rpc: Rpc): Promise<string> {
  const o = evt?.data?.object ?? {};
  const live = !!evt.livemode;
  switch (evt.type) {
    case "payment_intent.amount_capturable_updated": // card authorized (manual capture): money is held, not taken
      if (!o.metadata?.booking_id) return "ignored_no_booking";
      return String(await rpc("payment_authorized", { p_booking: o.metadata.booking_id, p_session: o.metadata.checkout_session ?? null,
        p_intent: o.id, p_amount: o.amount_capturable, p_livemode: live }));
    case "payment_intent.payment_failed":
      if (!o.metadata?.booking_id) return "ignored_no_booking";
      return String(await rpc("payment_failed", { p_booking: o.metadata.booking_id, p_reason: o.last_payment_error?.code ?? o.last_payment_error?.decline_code ?? "failed" }));
    case "payment_intent.succeeded": // captured: money taken after the job
      return String(await rpc("payment_captured", { p_intent: o.id, p_amount: o.amount_received, p_charge: o.latest_charge ?? null }));
    case "payment_intent.canceled": // hold released
      return String(await rpc("payment_released", { p_intent: o.id }));
    case "refund.created": case "refund.updated":
      if (o.status !== "succeeded" || !o.payment_intent) return "ignored_refund_" + o.status;
      return String(await rpc("payment_refunded", { p_intent: o.payment_intent, p_amount: o.amount, p_refund: o.id }));
    case "transfer.created":
      if (!o.metadata?.booking_id) return "ignored_no_booking";
      return String(await rpc("payment_transferred", { p_booking: o.metadata.booking_id, p_transfer: o.id, p_amount: o.amount }));
    case "account.updated":
      if (!o.metadata?.worker_id) return "ignored_no_worker";
      await rpc("payment_account_update", { p_worker: o.metadata.worker_id, p_account: o.id, p_details: !!o.details_submitted,
        p_charges: !!o.charges_enabled, p_payouts: !!o.payouts_enabled, p_livemode: live });
      return "account_updated";
    default:
      return "ignored_" + evt.type;
  }
}

export async function handle(req: Request, rpc: Rpc, secrets: string[], nowSec?: number): Promise<Response> {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  let ok = false;
  for (const s of secrets) if (s && await verifySignature(raw, sig, s, nowSec)) { ok = true; break; }
  if (!ok) return new Response("bad signature", { status: 400 });
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  if (evt.livemode && env("STRIPE_ALLOW_LIVE") !== "yes") return Response.json({ ignored: "live_event_on_test_system" });
  const fresh = await rpc("inbox_record", { p_provider: "stripe", p_external_id: evt.id, p_event: evt.type, p_payload: { type: evt.type, livemode: !!evt.livemode } });
  if (fresh !== true) return Response.json({ duplicate: true });
  try {
    return Response.json({ result: await route(evt, rpc) });
  } catch (e) {
    // 500 → Stripe retries the event later. The inbox already has it, so record_inbox would say duplicate:
    // allow the retry by keying processing on success instead.
    await rpc("inbox_forget", { p_provider: "stripe", p_external_id: evt.id }).catch(() => null);
    return new Response("processing_failed", { status: 500 });
  }
}

if (!(globalThis as any).__TEST__) (globalThis as any).Deno.serve((req: Request) =>
  handle(req, rpcHttp, [env("STRIPE_WEBHOOK_SECRET"), env("STRIPE_CONNECT_WEBHOOK_SECRET")]));
