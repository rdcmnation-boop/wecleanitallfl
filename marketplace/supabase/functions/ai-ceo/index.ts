// Connector: "AI CEO" briefing for the owner's dashboard. Admin-only.
// Reads the live business numbers (admin_stats) and asks Claude for a short, prioritized action list.
// Without ANTHROPIC_API_KEY, or once the $10 monthly AI cap is reached, it answers { configured: false }
// and the app shows its free built-in briefing instead. AI calls go through ./ai.ts (cap first, cost recorded after).
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional; default from agent_settings: claude-haiku-5-5)
import { claude } from "./ai.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const cors = {
  "Access-Control-Allow-Origin": "https://www.wecleanitallfl.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const SB = env("SUPABASE_URL");
  // Ask the database as the caller: admin_stats() returns null unless the caller is the owner with 2-step verification
  // (or a remembered device, whose token travels in x-device-token).
  const dev = req.headers.get("x-device-token");
  const r = await fetch(`${SB}/rest/v1/rpc/admin_stats`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: auth, "Content-Type": "application/json", ...(dev ? { "x-device-token": dev } : {}) },
    body: "{}",
  });
  const stats = r.ok ? await r.json() : null;
  if (!stats) return new Response(JSON.stringify({ error: "admin_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "English" : "Spanish";
  const out = await claude({
    feature: "ai_ceo",
    maxTokens: 600,
    system:
      "You are the operations chief for We Clean It All, a cleaning marketplace in Miami-Dade and Broward. " +
      "Given live metrics, return 3-5 short, concrete actions for the owner today, most urgent first. " +
      "Never invent numbers that are not in the data. You only advise; the owner approves every action. " +
      `Reply in ${lang} as JSON: {"items":[{"level":"urgent|warn|good|info","text":"..."}]}`,
    messages: [{ role: "user", content: JSON.stringify(stats) }],
  });
  if (!out.ok) {
    if (out.reason === "error") { console.error("ai-ceo:", out.detail); return Response.json({ configured: true, error: "ai_error" }, { headers: cors }); }
    return Response.json({ configured: false, reason: out.reason }, { headers: cors });
  }
  let items = [];
  try { items = JSON.parse(out.text.slice(out.text.indexOf("{"), out.text.lastIndexOf("}") + 1)).items ?? []; } catch { /* fall through */ }
  return Response.json({ configured: true, items }, { headers: cors });
});
