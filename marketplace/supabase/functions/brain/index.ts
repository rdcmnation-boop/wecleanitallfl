// Brain: one central assistant with three roles (customer, worker, owner).
// Secrets: ANTHROPIC_API_KEY (needed for AI replies), ANTHROPIC_MODEL (optional, default claude-haiku-4-5, same model as ai-ceo).
// Without the key it answers { mode: "off" } and the app shows its built-in replies instead.
// The caller must be signed in. A worker must really be a worker; the owner role needs is_admin().
// The app sends only the context it is allowed to show that user (no other people's addresses or phones).
// Learning: owner-approved notes (brain_notes, status "active") are added to the prompt, and customer and worker
// questions are logged without contact details (brain_questions). brain-learn turns those into pending notes.

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Learned notes the owner has approved (status "active") that this role may see. Read with the service role.
// Only the text goes into the prompt; ids and other fields never leave the function.
async function activeNotes(base: string, role: string): Promise<string> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return "";
  const q = base + "/rest/v1/brain_notes?select=topic,note&status=eq.active&or=(scope.eq.all,scope.eq." + role + ")&order=created_at.desc&limit=30";
  const r = await fetch(q, { headers: { apikey: key, Authorization: "Bearer " + key } }).catch(() => null);
  if (!r || !r.ok) return "";
  const rows: { topic: string; note: string }[] = await r.json();
  return rows.map((n) => "- " + n.topic + ": " + n.note).join("\n").slice(0, 3000);
}

// Customer and worker questions, with email addresses, phone numbers and street addresses removed, kept for learning.
// Owner questions are never logged. Logging never blocks or breaks a reply.
function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[teléfono]")
    .replace(/\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[\p{L}.'-]+(?:\s+[\p{L}.'-]+){0,3}\s+(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Ter|Terrace|Pl|Street|Avenue|Road)\b\.?/giu, "[dirección]");
}
async function logQuestion(base: string, role: string, question: string, answered: boolean) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || role === "owner") return;
  await fetch(base + "/rest/v1/brain_questions", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ role, question: redact(question).slice(0, 500), answered }),
  }).catch((e) => console.error("brain: log failed", String(e)));
}

// Usage cap: at most HOURLY_CAP answered replies an hour for customers and workers, counted from brain_questions.
// Owner questions are not logged, so they are not counted or capped. A failed count never blocks a reply.
const HOURLY_CAP = 300;
async function overHourlyCap(base: string): Promise<boolean> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return false;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const q = base + "/rest/v1/brain_questions?select=id&answered=eq.true&created_at=gte." + encodeURIComponent(since) + "&limit=" + HOURLY_CAP;
  const r = await fetch(q, { headers: { apikey: key, Authorization: "Bearer " + key } }).catch(() => null);
  if (!r || !r.ok) { console.error("brain: cap check failed"); return false; }
  const rows: unknown[] = await r.json();
  return rows.length >= HOURLY_CAP;
}

// Cleaning knowledge shared by all three assistants. Facts about prices, policies or insurance are never invented here.
const CLEANING = [
  "CONOCIMIENTO DE LIMPIEZA (lo general de la industria; lo que incluye cada servicio exacto se confirma en la reserva o con la empresa):",
  "Servicios de We Clean It All: limpieza regular, profunda, mudanza (entrada o salida), Airbnb o alquiler, post-construcción, ventanas, alfombras, oficina, restaurante, banco, hotel pequeño y edificio comercial. Frecuencias: una vez, semanal, cada 2 semanas, mensual o diario.",
  "Qué suele incluir cada servicio: regular = polvo de superficies, aspirar y trapear, cocina y baños (superficies, lavabo, inodoro, espejos) y vaciar basura. Profunda = lo regular más detrás y debajo de muebles ligeros, rodapiés, puertas y marcos, interruptores, ventiladores y cal en grifos y juntas. Mudanza = limpieza completa para entrar o salir; gabinetes y refrigerador por dentro si se acuerda. Airbnb = cambio rápido entre huéspedes: ropa de cama y toallas, reposición básica y revisión de daños pequeños. Post-construcción = polvo fino, restos de yeso, pintura y silicona; varias pasadas con aspiradora HEPA. Ventanas = vidrios por dentro y por fuera según acuerdo; las alturas necesitan equipo. Alfombras = extracción con agua caliente; necesitan horas para secar.",
  "Orden de trabajo: de arriba hacia abajo y de lo más limpio a lo más sucio; polvo antes que agua; baños y cocina casi al final; pisos al final.",
  "Tiempos aproximados (dependen de la condición): un cuarto o estudio 1 a 2 horas; 2 habitaciones y 1 baño en limpieza regular 2 a 3 horas; la limpieza profunda suele tardar entre 1 y 2 veces más que la regular. No des un precio final: la estimación de la app se confirma con la empresa.",
  "Productos y seguridad: nunca mezclar cloro con amoníaco, vinagre u otros limpiadores ácidos (genera gases tóxicos). Ventilar al usar químicos. Probar en un lugar escondido. No usar ácidos ni cloro en piedra natural (mármol, granito, travertino) ni en acero inoxidable sin diluir. En madera y pisos laminados, poca agua y bien escurrida. Usar guantes. Nada de agua cerca de enchufes.",
  "Si alguien se intoxica o siente malestar por químicos: salir a aire fresco y llamar al Centro de Control de Intoxicaciones de EE. UU., 1-800-222-1222 (o al 911 si es grave). Para fuego, gas, caídas o lesiones: 911 primero.",
  "Florida: la humedad favorece el moho en baños, debajo de fregaderos y cerca del aire acondicionado; hay que secar bien y ventilar. Si aparecen hormigas o cucarachas, avisar al cliente y no usar pesticidas fuertes sin autorización.",
  "Para el cliente: antes de la limpieza conviene recoger objetos de valor y la ropa del piso, avisar de mascotas, dejar agua y luz disponibles, y anotar accesos, códigos o zonas que no se tocan.",
  "Para el limpiador: llegar a tiempo y avisar de retrasos; no abrir gavetas personales ni usar cosas del cliente sin permiso; cuidar llaves y códigos; reportar daños u objetos rotos de inmediato a la empresa; no compartir datos del cliente; usar el temporizador y la ubicación que la app pide durante el trabajo.",
  "Para el dueño: hablar de precio por hora y por tamaño, capacidad de limpiadores, calidad, reseñas, retención de clientes y horarios. Usar solo las cifras que trae el contexto.",
  "Cómo elegir la frecuencia: semanal o cada 2 semanas mantiene la casa al día; mensual sirve para mantenimiento; con mascotas, niños pequeños o muchas visitas suele pedirse más frecuencia. Si la casa lleva tiempo sin limpieza, una profunda al inicio hace que la regular dure más.",
  "Antes de un primer servicio: el cliente debe anotar en la reserva accesos, códigos, mascotas y zonas que no se tocan. Si no estará en casa, debe confirmar con la empresa cómo se dará el acceso.",
  "Buenas prácticas del limpiador: revisar la casa al llegar y anotar lo que falta antes de empezar; tomar fotos de antes y después si hay un reclamo; avisar a la empresa de cualquier cambio en el trabajo.",
  "Para el dueño: ganar eficiencia agrupando trabajos por zona para reducir traslados; retener clientes con un servicio fijo; comparar horas reales contra las estimadas para ajustar el precio. Son ideas generales: usa solo las cifras del contexto.",
  "Cómo responder: directo y con pasos concretos. Si el cliente pregunta por el precio final, explica que la app da una estimación y la empresa la confirma. Si no sabes algo, dilo y di a quién escribir.",
  "Lecciones para empezar (de la sección Aprender de la app): elige uno o dos servicios al inicio; calcula el costo real por trabajo incluyendo viaje, productos, equipo y gasolina; escribe qué incluye y qué no cada servicio; consulta a un contador o abogado antes de registrar el negocio.",
  "Registro e impuestos (general; no es asesoría legal ni fiscal): en Florida el registro de negocio se hace en sunbiz.org; el EIN es gratis en IRS.gov, desconfía de sitios que cobran por él; pregunta a la ciudad o al condado por el permiso local de negocio; pregunta al Departamento de Ingresos de Florida si el servicio paga impuesto de ventas; habla con un agente de seguros sobre responsabilidad civil. Para decisiones concretas, recomienda un profesional.",
  "Clientes y reseñas: crear un perfil de Google Business con fotos reales del trabajo; pedir reseñas a los clientes satisfechos; pedir referidos a vecinos y administradores de edificios. Nunca comprar reseñas falsas ni prometer precios o fechas que no se pueden cumplir.",
  "Dinero: cuenta bancaria solo del negocio; factura escrita con fecha, servicio y monto; guardar recibos de productos, equipo y gasolina; apartar una parte de cada pago para impuestos.",
  "Si se contrata: revisar antecedentes y referencias antes de dar acceso a casas; entrenar con trabajo acompañado; definir por escrito si la persona es empleada o contratista (consultar a un profesional); tener un plan para emergencias.",
  "Reglas: no inventar precios, garantías, seguros, licencias, políticas de cancelación ni reembolsos; para eso escribe a wecleanitallfl@gmail.com. No pedir ni repetir teléfonos ni direcciones completas. Si no sabes algo, dilo y di a quién escribir.",
].join("\n");

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
  if (!key) { await logQuestion(base, role, message, false); return json({ mode: "off" }); }
  if (role !== "owner" && await overHourlyCap(base)) return json({ mode: "limit" }, 429);

  const ctx = JSON.stringify(body.context ?? {}).slice(0, 4000);
  const notes = await activeNotes(base, role);
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env("ANTHROPIC_MODEL", "claude-haiku-4-5"),
        max_tokens: 700,
        system: PROMPTS[role] + "\n\n" + CLEANING + (notes ? "\n\nNOTAS APRENDIDAS (aprobadas por el dueño; úsalas si aplican):\n" + notes : "") + "\n\nDatos disponibles (JSON): " + ctx,
        messages: [{ role: "user", content: message }],
      }),
    });
  } catch (e) {
    console.error("brain: anthropic fetch failed", String(e));
    await logQuestion(base, role, message, false);
    return json({ mode: "error" }, 502);
  }
  if (!r.ok) {
    // Log the reason (never the key) so it can be read in the function logs.
    const detail = (await r.text()).slice(0, 300);
    console.error("brain: anthropic status", r.status, detail);
    await logQuestion(base, role, message, false);
    return json({ mode: "error" }, 502);
  }
  const j = await r.json();
  const text = (j.content || []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n").trim();
  await logQuestion(base, role, message, Boolean(text));
  return json({ mode: "ai", reply: text || null });
});
