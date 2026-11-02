// Brain: one central assistant with three roles (customer, worker, owner).
// Secrets: ANTHROPIC_API_KEY (needed for AI replies), ANTHROPIC_MODEL (optional, default claude-haiku-5-5).
// Without the key it answers { mode: "off" } and the app shows its built-in replies instead.
// The caller must be signed in. A worker must really be a worker; the owner role needs is_admin().
// The app sends only the context it is allowed to show that user (no other people's addresses or phones).

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPTS: Record<string, string> = {
  customer:
    "Eres el asistente de We Clean It All, empresa de limpieza en Miami-Dade y Broward. Ayudas al cliente a reservar: tipos de servicio, qué incluye, cómo funciona la reserva y el estado de sus pedidos. No inventes precios: el precio sugerido lo calcula la app según habitaciones, baños y servicio. No pidas ni repitas teléfonos ni direcciones completas. Para cancelar o cambiar un pedido, o para reembolsos, escribe a wecleanitallfl@gmail.com. Responde breve, en el idioma del cliente.",
  worker:
    "Eres el asistente para limpiadores de We Clean It All. Ayudas con sus trabajos asignados: horario, cómo iniciar y terminar el trabajo, el temporizador, compartir ubicación durante el trabajo, documentos y reseñas. No des datos de otros limpiadores ni de clientes que no estén en el contexto. Para emergencias o conflictos, escribe a wecleanitallfl@gmail.com. Responde breve, en el idioma del limpiador.",
  owner:
    "Eres el asesor del dueño de We Clean It All. Con los números del contexto, resume la situación del negocio y propone de 2 a 3 acciones concretas, en orden de prioridad. No inventes cifras que no estén en el contexto. Responde breve, en el idioma del dueño.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "auth" }, 401);

  const base = env("SUPABASE_URL").replace(/\/$/, "");
  const H = { apikey: env("SUPABASE_ANON_KEY"), Authorization: auth, "Content-Type": "application/json" };

  // Who is calling?
  const me = await fetch(base + "/auth/v1/user", { headers: H });
  if (!me.ok) return json({ error: "auth" }, 401);
  const uid: string = (await me.json()).id;

  let body: { role?: string; message?: string; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "body" }, 400); }

  const role = body.role === "owner" || body.role === "worker" ? body.role : "customer";
  const message = String(body.message ?? "").trim().slice(0, 500);
  if (!message) return json({ error: "empty" }, 400);

  // The caller must really have the role it asks for.
  if (role === "owner") {
    const a = await fetch(base + "/rest/v1/rpc/is_admin", { method: "POST", headers: H, body: "{}" });
    if (!a.ok || (await a.json()) !== true) return json({ error: "forbidden" }, 403);
  } else if (role === "worker") {
    const p = await fetch(base + "/rest/v1/profiles?select=role&id=eq." + uid, { headers: H });
    const rows = p.ok ? await p.json() : [];
    if (!rows[0] || rows[0].role !== "worker") return json({ error: "forbidden" }, 403);
  }

  const key = env("ANTHROPIC_API_KEY");
  if (!key) return json({ mode: "off" });

  const ctx = JSON.stringify(body.context ?? {}).slice(0, 4000);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"),
      max_tokens: 400,
      system: PROMPTS[role] + "\n\nDatos disponibles (JSON): " + ctx,
      messages: [{ role: "user", content: message }],
    }),
  });
  if (!r.ok) return json({ mode: "error" }, 502);
  const j = await r.json();
  const text = (j.content || []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n").trim();
  return json({ mode: "ai", reply: text || null });
});
