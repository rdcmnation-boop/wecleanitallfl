// Connector: sends queued notifications (WhatsApp / SMS / email) from the `notifications` outbox.
// Called every minute by pg_cron ("notify-outbox") only while agent_settings.messaging_on is true and something is waiting.
// The x-cron-secret header is checked by the database (check_cron_secret, value kept in Vault); CRON_SECRET still works too.
// Nothing is sent until a channel's secrets exist; messages simply stay queued.
// WhatsApp, in this order: Meta Cloud API (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) or Twilio (owner's choice for now:
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM like "whatsapp:+14155238886"; optional approved templates per message
//   as TWILIO_CONTENT_<template>, e.g. TWILIO_CONTENT_job_offer = HX…, with variables {"1": code, "2": service, ...}).
// Then SMS (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM), then email (RESEND_API_KEY, EMAIL_FROM).

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SB = env("SUPABASE_URL").replace(/\/$/, "");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APP = "https://www.wecleanitallfl.com/";

type Note = { id: number; user_id: string; channel: string; template: string; payload: Record<string, unknown> };

const TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  job_offer: (p) => `We Clean It All: nuevo trabajo ${p.code} · ${p.service} · ${p.city || p.zip}${p.budget ? " · $" + p.budget : ""}. Abre la app para aceptar: ${APP}`,
  booking_assigned: (p) => `We Clean It All: tu limpieza ${p.code} ya tiene limpiador asignado. Síguelo aquí: ${APP}`,
  job_assigned: (p) => `We Clean It All: te asignaron el trabajo ${p.code}. Detalles: ${APP}`,
  cleaner_on_way: (p) => `We Clean It All: tu limpiador va en camino (${p.code}). Síguelo en vivo: ${APP}`,
  job_started: (p) => `We Clean It All: tu limpiador empezó a limpiar (${p.code}).`,
  job_late_reminder: (p) => `We Clean It All: el trabajo ${p.code} ya debía empezar. Toca "Voy en camino" o avísale al cliente: ${APP}`,
  booking_completed: (p) => `We Clean It All: tu limpieza ${p.code} está completa. ¡Califica tu servicio! ${APP}`,
  booking_cancelled: (p) => `We Clean It All: el trabajo ${p.code} fue cancelado.`,
  worker_approved: () => `We Clean It All: ¡tu cuenta fue aprobada! Ponte activo para recibir trabajos: ${APP}`,
  agent_alert: (p) => `We Clean It All · ${p.agent}: ${p.title}`,
};
const text = (n: Note) => (TEXT[n.template] ?? (() => "We Clean It All"))(n.payload);

const e164 = (raw: string) => {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return "1" + d;
  if (d.length === 11 && d.startsWith("1")) return d;
  return d.length >= 11 ? d : "";
};

async function allowed(req: Request): Promise<boolean> {
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!given) return false;
  if (env("CRON_SECRET") && given === env("CRON_SECRET")) return true;
  const r = await fetch(`${SB}/rest/v1/rpc/check_cron_secret`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ p: given }) }).catch(() => null);
  return !!r && r.ok && (await r.json()) === true;
}

async function sendWhatsAppMeta(phone: string, n: Note): Promise<string> {
  const token = env("WHATSAPP_TOKEN"), phoneId = env("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) return "skip:no_whatsapp_keys";
  const p = n.payload as Record<string, string>;
  const params: Record<string, string[]> = {
    job_offer: [p.code, p.service, p.city || p.zip, p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("es-US", { timeZone: "America/New_York" }) : "ASAP", p.budget ? `$${p.budget}` : "-"],
    booking_assigned: [p.code], job_assigned: [p.code],
  };
  const body = {
    messaging_product: "whatsapp", to: phone, type: "template",
    template: {
      name: `wcia_${n.template}`, language: { code: env("WHATSAPP_LANG", "es") },
      components: params[n.template] ? [{ type: "body", parameters: params[n.template].map((t) => ({ type: "text", text: String(t ?? "-") })) }] : [],
    },
  };
  const r = await fetch(`https://graph.facebook.com/${env("WHATSAPP_API_VERSION", "v21.0")}/${phoneId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.ok ? "sent" : `fail:${r.status}:${(await r.text()).slice(0, 300)}`;
}

async function twilio(form: Record<string, string>): Promise<string> {
  const sid = env("TWILIO_SID"), tok = env("TWILIO_TOKEN");
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  return r.ok ? "sent" : `fail:${r.status}:${(await r.text()).slice(0, 200)}`;
}

// Twilio WhatsApp. Business-started messages outside a 24-hour chat need an approved template (TWILIO_CONTENT_<template>);
// without one the plain text is sent, which works in the Twilio sandbox and inside an open chat.
async function sendWhatsAppTwilio(phone: string, n: Note): Promise<string> {
  const from = env("TWILIO_WHATSAPP_FROM");
  if (!env("TWILIO_SID") || !env("TWILIO_TOKEN") || !from) return "skip:no_whatsapp_keys";
  const p = n.payload as Record<string, string>;
  const content = env("TWILIO_CONTENT_" + n.template);
  if (content) {
    const vars = [p.code, p.service, p.city || p.zip, p.budget ? `$${p.budget}` : "-"].filter((x) => x != null);
    return twilio({ To: "whatsapp:+" + phone, From: from, ContentSid: content, ContentVariables: JSON.stringify(Object.fromEntries(vars.map((v, i) => [String(i + 1), String(v)]))) });
  }
  return twilio({ To: "whatsapp:+" + phone, From: from, Body: text(n) });
}

async function sendSms(phone: string, n: Note): Promise<string> {
  if (!env("TWILIO_SID") || !env("TWILIO_TOKEN") || !env("TWILIO_FROM")) return "skip:no_sms_keys";
  return twilio({ To: "+" + phone, From: env("TWILIO_FROM"), Body: text(n) });
}

async function sendEmail(email: string, n: Note): Promise<string> {
  const key = env("RESEND_API_KEY"), from = env("EMAIL_FROM");
  if (!key || !from || !email) return "skip:no_email_keys";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: "We Clean It All", text: text(n) }),
  });
  return r.ok ? "sent" : `fail:${r.status}`;
}

Deno.serve(async (req) => {
  if (!(await allowed(req))) return new Response("forbidden", { status: 403 });
  const q = await fetch(`${SB}/rest/v1/notifications?status=eq.queued&channel=neq.inapp&order=id.asc&limit=50`, { headers: sbHeaders });
  const notes: Note[] = q.ok ? await q.json() : [];
  const results: Record<string, number> = {};
  for (const n of notes) {
    const pr = await fetch(`${SB}/rest/v1/profiles?id=eq.${n.user_id}&select=phone,email`, { headers: sbHeaders });
    const [prof] = pr.ok ? await pr.json() : [];
    const phone = e164(prof?.phone ?? "");
    let out = "skip:no_phone";
    if (n.channel === "whatsapp" && phone) {
      out = await sendWhatsAppMeta(phone, n);
      if (out.startsWith("skip")) out = await sendWhatsAppTwilio(phone, n);
      if (out.startsWith("skip") || out.startsWith("fail")) {
        const sms = await sendSms(phone, n);
        out = sms === "sent" ? "sent" : (await sendEmail(prof?.email, n)) === "sent" ? "sent" : out;
      }
    } else if (n.channel === "sms" && phone) out = await sendSms(phone, n);
    else if (n.channel === "email") out = await sendEmail(prof?.email, n);
    if (out.startsWith("skip:no_") && out !== "skip:no_phone") { results.waiting = (results.waiting ?? 0) + 1; continue; }
    const status = out === "sent" ? "sent" : out.startsWith("skip") ? "skipped" : "failed";
    results[status] = (results[status] ?? 0) + 1;
    await fetch(`${SB}/rest/v1/notifications?id=eq.${n.id}`, {
      method: "PATCH", headers: sbHeaders,
      body: JSON.stringify({ status, sent_at: status === "sent" ? new Date().toISOString() : null, error: status === "sent" ? null : out }),
    });
  }
  return Response.json({ processed: notes.length, ...results });
});
