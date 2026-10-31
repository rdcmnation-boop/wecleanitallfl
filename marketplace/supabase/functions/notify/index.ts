// Connector: sends queued notifications (WhatsApp / SMS / email) from the `notifications` outbox.
// Phase 2 switch-on. Nothing is sent until the matching secrets exist, so it is safe to deploy now.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Trigger: Supabase Dashboard → Database → Webhooks → on INSERT into public.notifications → this function,
//          or call it on a schedule (e.g. every 5 min) with header  x-cron-secret: <CRON_SECRET>.
// Secrets (Dashboard → Edge Functions → Secrets):
//   CRON_SECRET                    shared secret required on every call
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_API_VERSION (default v21.0), WHATSAPP_LANG (default es)
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM            (SMS fallback)
//   RESEND_API_KEY, EMAIL_FROM                       (email fallback)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// WhatsApp business-initiated messages must use templates approved by Meta. Create these in WhatsApp Manager
// (category "Utility") with the body variables shown, then they are used automatically:
//   wcia_job_offer        {{1}} code  {{2}} service  {{3}} area  {{4}} when  {{5}} pay
//   wcia_booking_assigned {{1}} code
//   wcia_worker_approved  (no variables)

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SB = env("SUPABASE_URL");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const sbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

type Note = { id: number; user_id: string; channel: string; template: string; payload: Record<string, unknown> };

const TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  job_offer: (p) => `We Clean It All: nuevo trabajo ${p.code} · ${p.service} · ${p.city || p.zip} · ${p.budget ? "$" + p.budget : ""}. Abre la app para aceptar: https://www.wecleanitallfl.com/app/`,
  booking_assigned: (p) => `We Clean It All: tu limpieza ${p.code} ya tiene limpiador asignado. Detalles: https://www.wecleanitallfl.com/app/`,
  job_assigned: (p) => `We Clean It All: te asignaron el trabajo ${p.code}. Detalles: https://www.wecleanitallfl.com/app/`,
  booking_completed: (p) => `We Clean It All: tu limpieza ${p.code} está completa. ¡Califica tu servicio! https://www.wecleanitallfl.com/app/`,
  booking_cancelled: (p) => `We Clean It All: el trabajo ${p.code} fue cancelado.`,
  worker_approved: () => `We Clean It All: ¡tu cuenta fue aprobada! Activa tu disponibilidad: https://www.wecleanitallfl.com/app/`,
};

const e164 = (raw: string) => {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 10) return "1" + d;
  if (d.length === 11 && d.startsWith("1")) return d;
  return d.length >= 11 ? d : "";
};

async function sendWhatsApp(phone: string, n: Note): Promise<string> {
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

async function sendSms(phone: string, n: Note): Promise<string> {
  const sid = env("TWILIO_SID"), tok = env("TWILIO_TOKEN"), from = env("TWILIO_FROM");
  if (!sid || !tok || !from) return "skip:no_sms_keys";
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: "+" + phone, From: from, Body: (TEXT[n.template] ?? (() => "We Clean It All"))(n.payload) }),
  });
  return r.ok ? "sent" : `fail:${r.status}`;
}

async function sendEmail(email: string, n: Note): Promise<string> {
  const key = env("RESEND_API_KEY"), from = env("EMAIL_FROM");
  if (!key || !from || !email) return "skip:no_email_keys";
  const text = (TEXT[n.template] ?? (() => "We Clean It All"))(n.payload);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: "We Clean It All", text }),
  });
  return r.ok ? "sent" : `fail:${r.status}`;
}

Deno.serve(async (req) => {
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const q = await fetch(`${SB}/rest/v1/notifications?status=eq.queued&channel=neq.inapp&order=id.asc&limit=50`, { headers: sbHeaders });
  const notes: Note[] = await q.json();
  const results: Record<string, number> = {};
  for (const n of notes) {
    const pr = await fetch(`${SB}/rest/v1/profiles?id=eq.${n.user_id}&select=phone,email`, { headers: sbHeaders });
    const [prof] = await pr.json();
    const phone = e164(prof?.phone ?? "");
    let out = "skip:no_phone";
    if (n.channel === "whatsapp" && phone) {
      out = await sendWhatsApp(phone, n);
      if (out.startsWith("skip") || out.startsWith("fail")) {           // fall back so the cleaner still hears about it
        const sms = await sendSms(phone, n);
        out = sms === "sent" ? "sent" : (await sendEmail(prof?.email, n)) === "sent" ? "sent" : out;
      }
    } else if (n.channel === "sms" && phone) out = await sendSms(phone, n);
    else if (n.channel === "email") out = await sendEmail(prof?.email, n);
    // Keep 'queued' while no connector is configured, so nothing is lost before Phase 2.
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
