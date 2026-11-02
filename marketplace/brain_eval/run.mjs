// Brain quality check. Calls the live brain function with a signed-in test token and checks each reply
// against simple rules in cases.json: required words, banned patterns, reply language, and brevity.
//
// Usage:
//   BRAIN_TOKEN=<test user's access token> node marketplace/brain_eval/run.mjs
//   node marketplace/brain_eval/run.mjs --dry      (checks the case file only, no network)
//
// Optional: BRAIN_URL (defaults to the live brain function). Tokens are never printed or saved.
// Cases with role "worker" or "owner" need a test account of that role, so run them with matching tokens
// or skip them by setting BRAIN_ROLES=customer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8"));
const dry = process.argv.includes("--dry");
const URL_BRAIN = process.env.BRAIN_URL || "https://fqajygzjteauxornipva.supabase.co/functions/v1/brain";
const TOKEN = process.env.BRAIN_TOKEN || "";
const roles = (process.env.BRAIN_ROLES || "customer,worker,owner").split(",").map((s) => s.trim());

const ES = /\b(el|la|que|de|para|los|las|por|con|puedes|pero)\b/gi;
const EN = /\b(the|you|and|for|with|is|to|can|your)\b/gi;
const count = (re, s) => (s.match(re) || []).length;

function check(c, reply) {
  const fails = [];
  const r = reply || "";
  if ((c.any_of || []).length && !c.any_of.some((w) => r.toLowerCase().includes(w.toLowerCase()))) fails.push("missing one of: " + c.any_of.join(" | "));
  for (const p of c.none_of || []) if (new RegExp(p, "i").test(r)) fails.push("contains banned pattern: " + p);
  // Only the company's own address may appear as contact info.
  const emails = r.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
  for (const e of emails) if (e !== "wecleanitallfl@gmail.com") fails.push("shows an unexpected email");
  if (c.lang) {
    const es = count(ES, r), en = count(EN, r);
    if (c.lang === "es" && en > es) fails.push("reply is not in Spanish");
    if (c.lang === "en" && es > en) fails.push("reply is not in English");
  }
  if (r.length > 1200) fails.push("too long (" + r.length + " characters)");
  if (!r.trim()) fails.push("empty reply");
  return fails;
}

if (dry) {
  let bad = 0;
  for (const c of cases) {
    if (!c.id || !c.role || !c.message) { bad++; console.log("INVALID case:", c.id || "(no id)"); }
    for (const p of c.none_of || []) { try { new RegExp(p, "i"); } catch { bad++; console.log("BAD PATTERN in", c.id, p); } }
  }
  console.log(`${cases.length} cases, ${bad} problems`);
  process.exit(bad ? 1 : 0);
}

if (!TOKEN) { console.error("Set BRAIN_TOKEN to a signed-in test user's access token."); process.exit(2); }

let pass = 0, run = 0;
for (const c of cases) {
  if (!roles.includes(c.role)) { console.log("SKIP  " + c.id + " (role " + c.role + " not in BRAIN_ROLES)"); continue; }
  run++;
  let reply = "", mode = "";
  try {
    const res = await fetch(URL_BRAIN, {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN, apikey: process.env.BRAIN_ANON_KEY || "", "Content-Type": "application/json" },
      body: JSON.stringify({ role: c.role, message: c.message, context: {} }),
    });
    const j = await res.json().catch(() => ({}));
    mode = j.mode || ("http " + res.status);
    reply = j.reply || "";
  } catch (e) { mode = "network error"; }
  const fails = mode === "ai" ? check(c, reply) : ["brain did not answer (" + mode + ")"];
  if (fails.length === 0) { pass++; console.log("PASS  " + c.id); }
  else { console.log("FAIL  " + c.id + " :: " + fails.join("; ")); }
}
console.log(`\n${pass}/${run} checks passed`);
process.exit(pass === run ? 0 : 1);
