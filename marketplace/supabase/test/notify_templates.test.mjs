globalThis.Deno = { env: { get: () => undefined } };
// Builds a copy of the real notify function without its server line, then imports it (run: node --experimental-strip-types).
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../functions/notify/index.ts"), "utf8");
const build = join(mkdtempSync(join(tmpdir(), "notify-")), "notify_build.mts");
writeFileSync(build, src.slice(0, src.indexOf("Deno.serve(")));
const m = await import(build);
let fails = 0, total = 0;
const ok = (name, cond) => { total++; if (!cond) { fails++; console.log("FAIL", name); } };
const p = { code: "WC-1001", service: "standard", urgency: "scheduled", scheduled_at: "2026-11-05T15:00:00Z", total: 179.2 };
const [s1, t1] = m.render("booking_received", p, "en");
ok("en subject", s1 === "We received your request WC-1001");
ok("en text total", t1.includes("total $179.20") && t1.includes("Thu, Nov 5"));
ok("en time ET", t1.includes("10:00"));
const [s2, t2] = m.render("booking_received", p, "es");
ok("es subject", s2.startsWith("Recibimos tu solicitud"));
ok("es text", t2.includes("total $179.20"));
ok("asap en", m.render("booking_received", { ...p, urgency: "asap" }, "en")[1].includes("as soon as possible"));
for (const k of ["booking_assigned","booking_reassigning","cleaner_on_way","job_started","booking_completed","booking_cancelled","payment_authorized","booking_rescheduled","job_offer","job_assigned","job_late_reminder","worker_approved","agent_alert"])
  for (const l of ["es","en"]) { const [s,t] = m.render(k, { code: "WC-9", service: "deep", zip: "33101", title: "x", agent: "ops" }, l); ok(k+"/"+l, s && t && !t.includes("undefined")); }
const [rs, rt] = m.render("booking_rescheduled", p, "en");
ok("reschedule en shows new time", rs === "New time for WC-1001" && rt.includes("Thu, Nov 5") && rt.includes("10:00"));
ok("reschedule es", m.render("booking_rescheduled", p, "es")[0] === "Nueva hora para WC-1001");
ok("unknown template safe", m.render("nope", {}, "en")[0] === "We Clean It All");
console.log(`notify templates: ${total - fails}/${total} pass`);
