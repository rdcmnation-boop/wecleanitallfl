// Brain learning: reads the anonymized customer and worker questions from the last 7 days that are not learned yet,
// drafts up to 5 general notes with Claude, and saves them as "pending". Nothing reaches users until the owner
// sets a note's status to "active" (brain_notes). Called nightly by pg_cron (brain_learning_cron.sql).
// Secrets: LEARN_SECRET (required, checked against the x-learn-secret header), ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Deploy with verify_jwt off: the secret header guards it.

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const RULES = [
  "Eres el editor de conocimiento de We Clean It All, empresa de limpieza en Miami-Dade y Broward.",
  "Con las preguntas anonimizadas de clientes y limpiadores, escribe hasta 5 notas generales y útiles sobre limpieza, productos, seguridad, orden de trabajo o cómo usar la app.",
  "Reglas estrictas: no escribas precios, tarifas, descuentos, garantías, seguros, licencias, políticas de cancelación o reembolso, ni datos del negocio, nombres, direcciones o teléfonos. Si una pregunta trata de eso, no hagas nota.",
  "No repitas temas que ya existen en la lista. Cada nota: 1 a 3 frases claras, en español.",
  'Responde solo con JSON: [{"topic":"...","note":"..."}]. Si no hay nada útil, responde [].',
].join("\n");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = env("LEARN_SECRET");
  if (!secret || req.headers.get("x-learn-secret") !== secret) return json({ error: "forbidden" }, 403);

  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = env("ANTHROPIC_API_KEY");
  if (!key || !anthropicKey) return json({ error: "config" }, 500);
  const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };

  // Questions not learned yet (the newest 200 from the last 7 days).
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const qs = await fetch(
    base + "/rest/v1/brain_questions?select=id,role,question&learned=eq.false&created_at=gte." + since + "&order=created_at.desc&limit=200",
    { headers: H },
  );
  if (!qs.ok) return json({ error: "read" }, 502);
  const rows: { id: number; role: string; question: string }[] = await qs.json();
  if (rows.length === 0) return json({ learned: 0, questions: 0 });

  // Topics already known, so drafts do not repeat them.
  const known = await fetch(base + "/rest/v1/brain_notes?select=topic&status=in.(active,pending)&limit=200", { headers: H });
  const topics: string[] = known.ok ? (await known.json()).map((n: { topic: string }) => n.topic) : [];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-haiku-4-5"),
      max_tokens: 900,
      system: RULES + "\n\nTemas ya existentes (no repetir): " + JSON.stringify(topics).slice(0, 3000),
      messages: [{
        role: "user",
        content: "Preguntas:\n" + rows.map((x) => "- (" + x.role + ") " + x.question).join("\n").slice(0, 12000),
      }],
    }),
  });
  if (!r.ok) {
    console.error("brain-learn: anthropic status", r.status, (await r.text()).slice(0, 300));
    return json({ error: "anthropic" }, 502);
  }
  const j = await r.json();
  const text: string = (j.content || []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("");

  let drafts: unknown[] = [];
  try {
    const m = text.match(/\[[\s\S]*\]/);
    drafts = m ? JSON.parse(m[0]) : [];
  } catch {
    drafts = [];
  }
  const notes = drafts
    .filter((d): d is { topic: string; note: string } =>
      !!d && typeof (d as { topic?: unknown }).topic === "string" && typeof (d as { note?: unknown }).note === "string")
    .map((d) => ({ topic: d.topic.slice(0, 80), note: d.note.slice(0, 600), source: "learned", status: "pending", scope: "all" }))
    .filter((d) => d.topic.length >= 2 && d.note.length >= 10)
    .slice(0, 5);

  if (notes.length) {
    const ins = await fetch(base + "/rest/v1/brain_notes", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(notes) });
    if (!ins.ok) return json({ error: "write" }, 502);
  }

  // Each question is used once.
  const ids = rows.map((x) => x.id).join(",");
  await fetch(base + "/rest/v1/brain_questions?id=in.(" + ids + ")", {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ learned: true }),
  });
  return json({ learned: notes.length, questions: rows.length });
});
