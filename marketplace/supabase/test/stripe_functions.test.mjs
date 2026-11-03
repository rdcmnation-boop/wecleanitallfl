// Local tests for stripe-webhook + payments (no network: Stripe and the database are mocked).
// Run: node --experimental-strip-types --no-warnings marketplace/supabase/test/stripe_functions.test.mjs
const ENV = { STRIPE_SECRET_KEY: "sk_test_FAKE_for_unit_tests_only", SUPABASE_URL: "https://x.supabase.co" };
globalThis.Deno = { env: { get: (k) => ENV[k] } };
globalThis.__TEST__ = true;
const base = new URL("../functions/", import.meta.url);
const S = await import(new URL("_shared/stripe.ts", base));
const W = await import(new URL("stripe-webhook/index.ts", base));
const P = await import(new URL("payments/index.ts", base));

let total = 0, fails = 0;
const ok = (name, cond) => { total++; if (!cond) { fails++; console.log("FAIL", name); } };
const SECRET = "whsec_test_unit";
const now = 1793664000;

// 1 signature verification
const body = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", livemode: false, data: { object: { id: "pi_1", amount_received: 17920, latest_charge: "ch_1" } } });
const good = await S.signForTest(body, SECRET, now);
ok("sig_valid", await S.verifySignature(body, good, SECRET, now));
ok("sig_wrong_secret", !(await S.verifySignature(body, good, "whsec_other", now)));
ok("sig_tampered_body", !(await S.verifySignature(body.replace("17920", "1"), good, SECRET, now)));
ok("sig_replay_old", !(await S.verifySignature(body, good, SECRET, now + 301)));
ok("sig_missing", !(await S.verifySignature(body, null, SECRET, now)));
ok("sig_garbage", !(await S.verifySignature(body, "t=abc,v1=zz", SECRET, now)));
ok("sig_multiple_v1", await S.verifySignature(body, good + ",v1=deadbeef", SECRET, now));

// 2 webhook handling (mock database)
function mockDb(opts = {}) {
  const calls = []; const seen = new Set();
  const rpc = async (fn, args) => {
    calls.push([fn, args]);
    if (fn === "inbox_record") { const k = args.p_external_id; if (seen.has(k)) return false; seen.add(k); return true; }
    if (fn === "inbox_forget") { seen.delete(args.p_external_id); return null; }
    if (opts.fail === fn) throw new Error("db down");
    return fn + ":ok";
  };
  return { rpc, calls };
}
const req = (b, sig) => new Request("https://x/functions/v1/stripe-webhook", { method: "POST", body: b, headers: sig ? { "stripe-signature": sig } : {} });
let db = mockDb();
let r = await W.handle(req(body, "t=1,v1=00"), db.rpc, [SECRET], now);
ok("webhook_bad_sig_400", r.status === 400 && db.calls.length === 0);
r = await W.handle(req(body, good), db.rpc, [SECRET], now);
ok("webhook_valid_routes_capture", r.status === 200 && db.calls.some(([f, a]) => f === "payment_captured" && a.p_amount === 17920 && a.p_intent === "pi_1"));
r = await W.handle(req(body, good), db.rpc, [SECRET], now);
ok("webhook_duplicate_ignored", (await r.json()).duplicate === true && db.calls.filter(([f]) => f === "payment_captured").length === 1);
const second = await S.signForTest(body, "whsec_connect", now);
db = mockDb();
r = await W.handle(req(body, second), db.rpc, [SECRET, "whsec_connect"], now);
ok("webhook_connect_secret_accepted", r.status === 200);
const liveBody = JSON.stringify({ id: "evt_live", type: "payment_intent.succeeded", livemode: true, data: { object: { id: "pi_l" } } });
db = mockDb();
r = await W.handle(req(liveBody, await S.signForTest(liveBody, SECRET, now)), db.rpc, [SECRET], now);
ok("webhook_live_event_ignored", (await r.json()).ignored === "live_event_on_test_system" && !db.calls.some(([f]) => f.startsWith("payment_")));
db = mockDb({ fail: "payment_captured" });
r = await W.handle(req(body, good), db.rpc, [SECRET], now);
ok("webhook_failure_500_for_retry", r.status === 500 && db.calls.some(([f]) => f === "inbox_forget"));
r = await W.handle(req(body, good), db.rpc, [SECRET], now);
ok("webhook_retry_processed_again", db.calls.filter(([f]) => f === "payment_captured").length === 2);
r = await W.handle(new Request("https://x", { method: "GET" }), db.rpc, [SECRET], now);
ok("webhook_get_rejected", r.status === 405);

// 3 event routing
const R = async (type, object, livemode = false) => { const m = mockDb(); await W.route({ type, livemode, data: { object } }, m.rpc); return m.calls; };
let c = await R("payment_intent.amount_capturable_updated", { id: "pi_2", amount_capturable: 17920, metadata: { booking_id: "b-1" } });
ok("route_authorized", c[0][0] === "payment_authorized" && c[0][1].p_amount === 17920 && c[0][1].p_booking === "b-1" && c[0][1].p_livemode === false);
c = await R("payment_intent.payment_failed", { id: "pi_3", metadata: { booking_id: "b-2" }, last_payment_error: { code: "card_declined" } });
ok("route_declined", c[0][0] === "payment_failed" && c[0][1].p_reason === "card_declined");
c = await R("payment_intent.canceled", { id: "pi_4" });
ok("route_released", c[0][0] === "payment_released");
c = await R("refund.created", { id: "re_1", status: "pending", payment_intent: "pi_5", amount: 500 });
ok("route_refund_pending_ignored", c.length === 0);
c = await R("refund.updated", { id: "re_1", status: "succeeded", payment_intent: "pi_5", amount: 500 });
ok("route_refund_succeeded", c[0][0] === "payment_refunded" && c[0][1].p_refund === "re_1");
c = await R("transfer.created", { id: "tr_1", amount: 16000, metadata: { booking_id: "b-3" } });
ok("route_transfer", c[0][0] === "payment_transferred" && c[0][1].p_amount === 16000);
c = await R("account.updated", { id: "acct_1", details_submitted: true, charges_enabled: true, payouts_enabled: false, metadata: { worker_id: "w-1" } });
ok("route_account", c[0][0] === "payment_account_update" && c[0][1].p_payouts === false);
c = await R("payment_intent.amount_capturable_updated", { id: "pi_x", amount_capturable: 1 });
ok("route_no_booking_ignored", c.length === 0);
c = await R("customer.created", { id: "cus_1" });
ok("route_unknown_ignored", c.length === 0);

// 4 test-mode lock on keys
ENV.STRIPE_SECRET_KEY = "sk_live_REAL_KEY_SHOULD_BE_REFUSED";
let err = ""; try { S.stripeKey(); } catch (e) { err = e.message; }
ok("live_key_refused", err === "live_key_refused");
ENV.STRIPE_SECRET_KEY = ""; err = ""; try { S.stripeKey(); } catch (e) { err = e.message; }
ok("missing_key_not_configured", err === "stripe_not_configured");
ENV.STRIPE_SECRET_KEY = "sk_test_FAKE_for_unit_tests_only";
ok("test_key_accepted", S.stripeKey().startsWith("sk_test_"));

// 5 outbox jobs → Stripe calls with idempotency keys; errors never contain the key
const sent = [];
const fakeStripe = async (url, init) => { sent.push({ url, init }); return new Response(JSON.stringify({ id: "ok" }), { status: 200 }); };
await P.perform({ kind: "stripe.capture", idempotency_key: "capture:b-1", payload: { payment_intent: "pi_9" } }, fakeStripe);
ok("capture_call", sent[0].url.endsWith("/payment_intents/pi_9/capture") && sent[0].init.headers["Idempotency-Key"] === "capture:b-1");
await P.perform({ kind: "stripe.refund", idempotency_key: "refund:b-1:5000", payload: { payment_intent: "pi_9", amount_cents: 5000, booking_id: "b-1" } }, fakeStripe);
ok("refund_call", sent[1].url.endsWith("/refunds") && sent[1].init.body.includes("amount=5000") && sent[1].init.headers["Idempotency-Key"] === "refund:b-1:5000");
await P.perform({ kind: "stripe.transfer", idempotency_key: "transfer:b-1", payload: { amount_cents: 16000, destination: "acct_1", charge: "ch_1", booking_id: "b-1" } }, fakeStripe);
ok("transfer_call", sent[2].url.endsWith("/transfers") && sent[2].init.body.includes("destination=acct_1") && sent[2].init.body.includes("source_transaction=ch_1"));
await P.perform({ kind: "stripe.cancel", idempotency_key: "cancel:b-2", payload: { payment_intent: "pi_8" } }, fakeStripe);
ok("cancel_call", sent[3].url.endsWith("/payment_intents/pi_8/cancel"));
const declineStripe = async () => new Response(JSON.stringify({ error: { code: "card_declined", message: "secret details" } }), { status: 402 });
err = ""; try { await P.perform({ kind: "stripe.capture", idempotency_key: "k", payload: { payment_intent: "pi" } }, declineStripe); } catch (e) { err = e.message; }
ok("stripe_error_is_code_only", err === "stripe_402:card_declined" && !err.includes("sk_test"));
err = ""; try { await P.perform({ kind: "stripe.payout_everything", idempotency_key: "k", payload: {} }, fakeStripe); } catch (e) { err = e.message; }
ok("unknown_job_refused", err === "unknown_kind");

// 6 checkout request: authorize only, exact amount, booking linked
const cp = P.checkoutParams({ id: "b-1", code: "WC-1001", service: "standard" }, 17920, "a@b.test", "https://staging.example/");
const enc = S.form(cp).toString();
ok("checkout_manual_capture", cp.payment_intent_data.capture_method === "manual" && enc.includes("payment_intent_data%5Bcapture_method%5D=manual"));
ok("checkout_amount", enc.includes("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=17920"));
ok("checkout_booking_metadata", cp.payment_intent_data.metadata.booking_id === "b-1");
ok("checkout_no_card_fields", !/card|cvc|number/i.test(enc));

// 7 source code never ships a secret
const fs = await import("node:fs");
const files = ["_shared/stripe.ts", "stripe-webhook/index.ts", "payments/index.ts"].map((f) => fs.readFileSync(new URL(f, base), "utf8")).join("\n");
ok("no_secret_in_source", !/sk_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/.test(files));
const app = fs.readdirSync(new URL("../../../app/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(new URL("../../../app/" + f, import.meta.url), "utf8")).join("\n");
ok("no_stripe_secret_in_frontend", !/sk_(test|live)_|whsec_|STRIPE_SECRET/.test(app));

console.log(`stripe functions: ${total - fails}/${total} pass`);
process.exit(fails ? 1 : 0);
