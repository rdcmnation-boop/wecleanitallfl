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
const APP = env("APP_URL", "https://www.wecleanitallfl.com/");

type Note = { id: number; user_id: string; channel: string; template: string; payload: Record<string, unknown>; lang?: string };
type P = Record<string, unknown>;

const when = (p: P, lang: string) => p.urgency === "asap" || !p.scheduled_at ? (lang === "en" ? "as soon as possible" : "lo antes posible")
  : new Date(String(p.scheduled_at)).toLocaleString(lang === "en" ? "en-US" : "es-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (v: unknown) => (v == null || v === "" ? "" : "$" + Number(v).toFixed(2));

// [subject, text] per template and language. Spanish is the default; English when the profile says "en".
const MSG: Record<string, { es: (p: P) => [string, string]; en: (p: P) => [string, string] }> = {
  booking_received: {
    es: (p) => [`Recibimos tu solicitud ${p.code}`, `We Clean It All: recibimos tu solicitud ${p.code} (${p.service}, ${when(p, "es")}${p.total ? ", total " + money(p.total) : ""}). Te avisamos cuando un limpiador la acepte. Síguela aquí: ${APP}`],
    en: (p) => [`We received your request ${p.code}`, `We Clean It All: we received your request ${p.code} (${p.service}, ${when(p, "en")}${p.total ? ", total " + money(p.total) : ""}). We'll let you know when a cleaner accepts it. Track it here: ${APP}`],
  },
  payment_authorized: {
    es: (p) => [`Pago confirmado (${p.code})`, `We Clean It All: confirmamos tu pago de ${money(p.total)} para ${p.code}. Solo se cobra cuando el trabajo esté hecho. Ya estamos buscando tu limpiador.`],
    en: (p) => [`Payment confirmed (${p.code})`, `We Clean It All: we confirmed your payment of ${money(p.total)} for ${p.code}. You're only charged once the job is done. We're finding your cleaner now.`],
  },
  booking_assigned: {
    es: (p) => [`Tu limpieza ${p.code} tiene limpiador`, `We Clean It All: tu limpieza ${p.code} ya tiene limpiador asignado. Síguelo aquí: ${APP}`],
    en: (p) => [`Your cleaning ${p.code} has a cleaner`, `We Clean It All: your cleaning ${p.code} now has a cleaner assigned. Follow it here: ${APP}`],
  },
  booking_reassigning: {
    es: (p) => [`Estamos buscando otro limpiador (${p.code})`, `We Clean It All: tu limpiador ya no puede ir (${p.code}). Estamos buscando otro y te avisamos enseguida.`],
    en: (p) => [`We're finding another cleaner (${p.code})`, `We Clean It All: your cleaner can no longer make it (${p.code}). We're finding another one and will update you shortly.`],
  },
  cleaner_on_way: {
    es: (p) => [`Tu limpiador va en camino`, `We Clean It All: tu limpiador va en camino (${p.code}). Síguelo en vivo: ${APP}`],
    en: (p) => [`Your cleaner is on the way`, `We Clean It All: your cleaner is on the way (${p.code}). Follow them live: ${APP}`],
  },
  job_started: {
    es: (p) => [`Empezó tu limpieza`, `We Clean It All: tu limpiador empezó a limpiar (${p.code}).`],
    en: (p) => [`Your cleaning started`, `We Clean It All: your cleaner started cleaning (${p.code}).`],
  },
  booking_completed: {
    es: (p) => [`Tu limpieza ${p.code} está completa`, `We Clean It All: tu limpieza ${p.code} está completa. ¡Califica tu servicio! ${APP}`],
    en: (p) => [`Your cleaning ${p.code} is done`, `We Clean It All: your cleaning ${p.code} is done. Please rate your service: ${APP}`],
  },
  booking_rescheduled: {
    es: (p) => [`Nueva hora para ${p.code}`, `We Clean It All: cambiamos la hora de ${p.code} a ${when(p, "es")}. Si no te queda bien, respóndenos o revisa aquí: ${APP}`],
    en: (p) => [`New time for ${p.code}`, `We Clean It All: ${p.code} has a new time: ${when(p, "en")}. If that doesn't work for you, reply or check here: ${APP}`],
  },
  booking_cancelled: {
    es: (p) => [`Trabajo ${p.code} cancelado`, `We Clean It All: el trabajo ${p.code} fue cancelado.`],
    en: (p) => [`Job ${p.code} cancelled`, `We Clean It All: job ${p.code} was cancelled.`],
  },
  job_offer: {
    es: (p) => [`Nuevo trabajo ${p.code}`, `We Clean It All: nuevo trabajo ${p.code} · ${p.service} · ${p.city || p.zip}${p.budget ? " · $" + p.budget : ""}. Abre la app para aceptar: ${APP}`],
    en: (p) => [`New job ${p.code}`, `We Clean It All: new job ${p.code} · ${p.service} · ${p.city || p.zip}${p.budget ? " · $" + p.budget : ""}. Open the app to accept: ${APP}`],
  },
  job_assigned: {
    es: (p) => [`Te asignaron ${p.code}`, `We Clean It All: te asignaron el trabajo ${p.code}. Detalles: ${APP}`],
    en: (p) => [`You were assigned ${p.code}`, `We Clean It All: you were assigned job ${p.code}. Details: ${APP}`],
  },
  job_late_reminder: {
    es: (p) => [`El trabajo ${p.code} ya debía empezar`, `We Clean It All: el trabajo ${p.code} ya debía empezar. Toca "Voy en camino" o avísale al cliente: ${APP}`],
    en: (p) => [`Job ${p.code} should have started`, `We Clean It All: job ${p.code} should have started. Tap "On my way" or let the customer know: ${APP}`],
  },
  worker_approved: {
    es: () => [`¡Tu cuenta fue aprobada!`, `We Clean It All: ¡tu cuenta fue aprobada! Ponte activo para recibir trabajos: ${APP}`],
    en: () => [`Your account is approved!`, `We Clean It All: your account is approved! Go active to receive jobs: ${APP}`],
  },
  agent_alert: {
    es: (p) => [`Alerta: ${p.title}`, `We Clean It All · ${p.agent}: ${p.title}`],
    en: (p) => [`Alert: ${p.title}`, `We Clean It All · ${p.agent}: ${p.title}`],
  },
};
export const render = (template: string, payload: P, lang = "es"): [string, string] => {
  const m = MSG[template];
  if (!m) return ["We Clean It All", "We Clean It All"];
  return (lang === "en" ? m.en : m.es)(payload ?? {});
};
const text = (n: Note) => render(n.template, n.payload, n.lang)[1];
const subject = (n: Note) => render(n.template, n.payload, n.lang)[0];

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
  if (r.ok) return "sent";
  const j = await r.json().catch(() => ({} as Record<string, unknown>));
  return `fail:${r.status}:${(j as Record<string, unknown>).code ?? ""}`;   // Twilio error code only (e.g. 21610 = recipient replied STOP)
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
    body: JSON.stringify({ from, to: [email], subject: subject(n), text: text(n) }),
  });
  return r.ok ? "sent" : `fail:${r.status}`;
}

Deno.serve(async (req) => {
  if (!(await allowed(req))) return new Response("forbidden", { status: 403 });
  const due = encodeURIComponent(new Date().toISOString());
  const q = await fetch(`${SB}/rest/v1/notifications?status=eq.queued&channel=neq.inapp&next_attempt_at=lte.${due}&order=id.asc&limit=50`, { headers: sbHeaders });
  const notes: Note[] = q.ok ? await q.json() : [];
  const results: Record<string, number> = {};
  for (const n of notes) {
    const pr = await fetch(`${SB}/rest/v1/profiles?id=eq.${n.user_id}&select=phone,email,language`, { headers: sbHeaders });
    const [prof] = pr.ok ? await pr.json() : [];
    n.lang = prof?.language === "en" ? "en" : "es";
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
    // Carrier STOP (Twilio 21610): opt the person out of texts and drop their queued texts.
    if (n.channel === "sms" && out.includes(":21610")) {
      await fetch(`${SB}/rest/v1/rpc/sms_opted_out`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ p_user: n.user_id }) });
      results.opted_out = (results.opted_out ?? 0) + 1; continue;
    }
    if (out.startsWith("skip")) {
      await fetch(`${SB}/rest/v1/notifications?id=eq.${n.id}`, { method: "PATCH", headers: sbHeaders, body: JSON.stringify({ status: "skipped", error: out }) });
      results.skipped = (results.skipped ?? 0) + 1; continue;
    }
    // sent → done; failure → retried 1, 5, 30 min, 2 h, then failed + owner alert (decided by the database).
    const r = await fetch(`${SB}/rest/v1/rpc/notification_result`, { method: "POST", headers: sbHeaders,
      body: JSON.stringify({ p_id: n.id, p_ok: out === "sent", p_error: out === "sent" ? null : out }) });
    const status = r.ok ? String(await r.json()) : "error";
    results[status] = (results[status] ?? 0) + 1;
  }
  return Response.json({ processed: notes.length, ...results });
});
