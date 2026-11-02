// Shared Claude caller (a copy sits next to each function as ai.ts, because each function is deployed on its own).
// 1) No ANTHROPIC_API_KEY → { ok:false, reason:"no_key" }: the app uses its free built-in replies.
// 2) The monthly cap in agent_settings (owner decision: $10, Miami calendar month) is checked BEFORE every call.
//    If the cap is reached, or the budget can't be read, nothing is spent → { ok:false, reason:"cap" }.
// 3) After each call the real token counts are recorded in ai_usage (ai_record_usage computes the cost).
// Model: agent_settings.ai_model (claude-haiku-5-5), unless ANTHROPIC_MODEL is set. Haiku 5.5 runs with thinking off and
// low effort for short, fast answers (thinking would otherwise count toward max_tokens).

type Msg = { role: "user" | "assistant"; content: string };
export type ClaudeResult = { ok: boolean; text: string; model?: string; reason?: "no_key" | "cap" | "error"; detail?: string };

export async function claude(opts: { feature: string; system: string; messages: Msg[]; maxTokens: number }): Promise<ClaudeResult> {
  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return { ok: false, text: "", reason: "no_key" };
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const H = { apikey: sr, Authorization: "Bearer " + sr, "Content-Type": "application/json" };

  const budget = await fetch(base + "/rest/v1/rpc/ai_budget", { method: "POST", headers: H, body: "{}" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!budget || budget.ok !== true) return { ok: false, text: "", reason: "cap" };

  const model = Deno.env.get("ANTHROPIC_MODEL") || budget.model || "claude-haiku-5-5";
  const body: Record<string, unknown> = { model, max_tokens: opts.maxTokens, system: opts.system, messages: opts.messages };
  if (/^claude-haiku-5-5/.test(model)) { body.thinking = { type: "disabled" }; body.output_config = { effort: "low" }; }

  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, text: "", reason: "error", detail: String(e).slice(0, 200) };
  }
  if (!r.ok) return { ok: false, text: "", reason: "error", detail: r.status + " " + (await r.text()).slice(0, 300) };
  const j = await r.json();
  const u = j.usage || {};
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  await fetch(base + "/rest/v1/rpc/ai_record_usage", {
    method: "POST", headers: H,
    body: JSON.stringify({ p_feature: opts.feature, p_model: model, p_in: input, p_out: u.output_tokens || 0 }),
  }).catch((e) => console.error("ai: usage not recorded", String(e)));
  const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n").trim();
  return { ok: true, text, model };
}

// Is this agent switched on and past its rollout day? (agent_is_live in the database.)
export async function agentLive(agent: string): Promise<boolean> {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const r = await fetch(base + "/rest/v1/rpc/agent_is_live", {
    method: "POST", headers: { apikey: sr, Authorization: "Bearer " + sr, "Content-Type": "application/json" }, body: JSON.stringify({ p_agent: agent }),
  }).catch(() => null);
  return !!r && r.ok && (await r.json()) === true;
}
