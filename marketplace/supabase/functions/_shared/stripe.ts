// Stripe helpers shared by `payments` and `stripe-webhook`. No SDK: plain fetch, form-encoded, so every call is visible.
// SAFETY: refuses any key that is not a TEST key unless STRIPE_ALLOW_LIVE === "yes" (never set on staging).

export const env = (k: string, d = "") => (globalThis as any).Deno?.env.get(k) ?? d;

export function stripeKey(): string {
  const k = env("STRIPE_SECRET_KEY");
  if (!k) throw new Error("stripe_not_configured");
  if (!k.startsWith("sk_test_") && !k.startsWith("rk_test_") && env("STRIPE_ALLOW_LIVE") !== "yes") throw new Error("live_key_refused");
  return k;
}
export const isTestKey = (k: string) => k.startsWith("sk_test_") || k.startsWith("rk_test_");

// Stripe form encoding: nested objects → a[b][c]=v
export function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => typeof item === "object" ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item)));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export type Fetch = typeof fetch;
export async function stripe(method: string, path: string, body: Record<string, unknown> | null, idemKey?: string, f: Fetch = fetch) {
  const key = stripeKey();
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (idemKey) headers["Idempotency-Key"] = idemKey;
  const r = await f(`https://api.stripe.com/v1${path}`, { method, headers, body: body ? form(body).toString() : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`stripe_${r.status}:${(j as any)?.error?.code || (j as any)?.error?.type || "error"}`);
  return j as Record<string, any>;
}

// Webhook signature (Stripe-Signature: t=…,v1=…). HMAC-SHA256 of `${t}.${rawBody}`; 5-minute tolerance; constant-time compare.
async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function verifySignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}
export const signForTest = async (rawBody: string, secret: string, t: number) => `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`;
