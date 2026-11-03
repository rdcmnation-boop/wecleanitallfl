globalThis.Deno = { env: { get: () => undefined } };
const m = await import("/tmp/claude-0/-home-claude/609b8a4e-be9a-5528-aebb-e6fbfa56e546/scratchpad/notify_build.mts");
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
for (const k of ["booking_assigned","booking_reassigning","cleaner_on_way","job_started","booking_completed","booking_cancelled","payment_authorized","job_offer","job_assigned","job_late_reminder","worker_approved","agent_alert"])
  for (const l of ["es","en"]) { const [s,t] = m.render(k, { code: "WC-9", service: "deep", zip: "33101", title: "x", agent: "ops" }, l); ok(k+"/"+l, s && t && !t.includes("undefined")); }
ok("unknown template safe", m.render("nope", {}, "en")[0] === "We Clean It All");
console.log(`notify templates: ${total - fails}/${total} pass`);
