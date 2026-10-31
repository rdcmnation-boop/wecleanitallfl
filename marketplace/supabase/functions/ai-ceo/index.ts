// Connector: "AI CEO" briefing for the owner's dashboard. Admin-only.
// Reads the live business numbers (admin_stats) and asks Claude for a short, prioritized action list.
// Without ANTHROPIC_API_KEY the app shows its built-in rule-based briefing instead, so this is optional.
//
// Deploy:  supabase functions deploy ai-ceo
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-haiku-4-5)

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const cors = {
  "Access-Control-Allow-Origin": "https://www.wecleanitallfl.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const SB = env("SUPABASE_URL");
  // Ask the database as the caller: admin_stats() returns null unless the caller is an admin.
  const r = await fetch(`${SB}/rest/v1/rpc/admin_stats`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const stats = r.ok ? await r.json() : null;
  if (!stats) return new Response(JSON.stringify({ error: "admin_only" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ configured: false }, { headers: cors });

  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "English" : "Spanish";
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-haiku-4-5"),
      max_tokens: 600,
      system:
        "You are the operations chief for We Clean It All, a cleaning marketplace in Miami-Dade and Broward. " +
        "Given live metrics, return 3-5 short, concrete actions for the owner today, most urgent first. " +
        "Never invent numbers that are not in the data. You only advise; the owner approves every action. " +
        `Reply in ${lang} as JSON: {"items":[{"level":"urgent|warn|good|info","text":"..."}]}`,
      messages: [{ role: "user", content: JSON.stringify(stats) }],
    }),
  });
  if (!ai.ok) return Response.json({ configured: true, error: `ai_${ai.status}` }, { headers: cors });
  const out = await ai.json();
  const text = out?.content?.[0]?.text ?? "{}";
  let items = [];
  try { items = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)).items ?? []; } catch { /* fall through */ }
  return Response.json({ configured: true, items }, { headers: cors });
});
