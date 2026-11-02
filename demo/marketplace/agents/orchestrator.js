'use strict';
// We Clean It All — central orchestrator (software multi-agent reasoning, no external AI calls here).
// It routes requests to agents, enforces permissions, approvals, rate limits and records an audit trail.
// Real data access and model calls are injected (tools / models), so this module is testable offline.

// Approval classes: A read-only, B drafts, C reversible internal, D needs owner approval, E never by an agent.
const CLASS_ORDER = { A: 1, B: 2, C: 3, D: 4, E: 5 };

// Actions that agents can never perform or grant themselves, whatever the registry says.
const NEVER = new Set([
  'grant_permission', 'change_permissions', 'edit_own_code', 'change_safety_policy',
  'change_financial_rules', 'change_owner', 'delete_audit', 'disable_audit',
]);

const mk = (agent, role, actions) => Object.freeze({ agent, role, actions: Object.freeze(actions) });

const REGISTRY = Object.freeze([
  mk('ceo', 'Turns business goals into tasks and summarizes for the owner.', { summarize_business: 'A', plan_goal: 'B' }),
  mk('operations', 'Finds unassigned bookings and overdue work.', { list_unassigned: 'A', list_overdue: 'A', ops_report: 'A' }),
  mk('finance', 'Analyzes revenue and profitability. Never moves money.', { profitability: 'A', revenue_report: 'A', payout: 'D', refund: 'D' }),
  mk('sales', 'Prepares quotes and sales opportunities.', { prepare_quote: 'B', list_opportunities: 'A', send_quote: 'D' }),
  mk('marketing', 'Drafts campaigns.', { draft_campaign: 'B', publish_campaign: 'D' }),
  mk('support', 'Drafts replies to customers and cleaners.', { draft_reply: 'B', send_message: 'D' }),
  mk('worker_mgmt', 'Tracks worker documents and status.', { list_workers: 'A', approve_worker: 'D', suspend_worker: 'D' }),
  mk('matching', 'Recommends cleaners for bookings.', { recommend_workers: 'A', assign_worker: 'D' }),
  mk('risk', 'Flags unusual activity and policy risks.', { scan_risks: 'A' }),
  mk('bi', 'Builds performance reports.', { performance_report: 'A', recommend_improvements: 'B' }),
]);

// Keyword routing: request text → ordered tasks. Deterministic and auditable.
const ROUTES = [
  { re: /unassigned|no worker|sin asignar/i, task: ['operations', 'list_unassigned'] },
  { re: /overdue|late|atrasad/i, task: ['operations', 'list_overdue'] },
  { re: /recommend.*(worker|cleaner)|who should|asignar|match/i, task: ['matching', 'recommend_workers'] },
  { re: /quote|cotiza/i, task: ['sales', 'prepare_quote'] },
  { re: /profit|margin|ganancia/i, task: ['finance', 'profitability'] },
  { re: /revenue|ingresos/i, task: ['finance', 'revenue_report'] },
  { re: /risk|riesgo|fraud/i, task: ['risk', 'scan_risks'] },
  { re: /report|reporte|performance/i, task: ['bi', 'performance_report'] },
  { re: /pay(out)?|refund|reembolso/i, task: ['finance', 'payout'] },
  { re: /send (a )?message|text them|enviar mensaje/i, task: ['support', 'send_message'] },
];

// Model-independent routing: choose from configured models by what the task needs.
function pickModel(models, need = {}) {
  const w = { capability: need.capability ?? 1, cost: need.cost ?? 1, speed: need.speed ?? 1, reliability: need.reliability ?? 1 };
  const usable = models.filter((m) => m.enabled !== false && (need.minCapability == null || m.capability >= need.minCapability));
  if (!usable.length) return null;
  const score = (m) => w.capability * m.capability + w.reliability * m.reliability + w.speed * m.speed - w.cost * m.cost;
  return usable.slice().sort((a, b) => score(b) - score(a))[0].id;
}

function createOrchestrator({ tools = {}, audit, approvals, now = () => Date.now(), status = {}, rateLimit = { max: 20, windowMs: 60000 } } = {}) {
  if (typeof audit !== 'function') throw new Error('audit sink required');
  if (!approvals || typeof approvals.request !== 'function') throw new Error('approvals.request required');
  const byAgent = new Map(REGISTRY.map((a) => [a.agent, a]));
  const calls = new Map();

  const limited = (agent) => {
    const t = now();
    const recent = (calls.get(agent) || []).filter((x) => t - x < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) { calls.set(agent, recent); return true; }
    recent.push(t); calls.set(agent, recent); return false;
  };

  const log = (e) => audit(Object.freeze({ at: new Date(now()).toISOString(), ...e }));

  function plan(request) {
    const text = String(request || '');
    const tasks = ROUTES.filter((r) => r.re.test(text)).map((r) => ({ agent: r.task[0], action: r.task[1] }));
    const seen = new Set();
    const uniq = tasks.filter((t) => !seen.has(t.agent + t.action) && seen.add(t.agent + t.action));
    return uniq.length ? uniq : [{ agent: 'ceo', action: 'plan_goal', note: 'no direct match; owner clarification needed' }];
  }

  async function runTask(task, input = {}) {
    const { agent, action } = task;
    const def = byAgent.get(agent);
    if (NEVER.has(action)) { log({ agent, action, outcome: 'denied_never' }); return { ok: false, reason: 'never_allowed' }; }
    if (!def) { log({ agent, action, outcome: 'unknown_agent' }); return { ok: false, reason: 'unknown_agent' }; }
    const cls = def.actions[action];
    if (!cls) { log({ agent, action, outcome: 'not_permitted' }); return { ok: false, reason: 'not_permitted' }; }
    if ((status[agent] || 'paused') !== 'active') { log({ agent, action, cls, outcome: 'agent_paused' }); return { ok: false, reason: 'agent_paused' }; }
    if (limited(agent)) { log({ agent, action, cls, outcome: 'rate_limited' }); return { ok: false, reason: 'rate_limited' }; }

    if (CLASS_ORDER[cls] >= CLASS_ORDER.D) {
      const id = await approvals.request({ agent, action, payload: input });
      log({ agent, action, cls, outcome: 'approval_requested', approvalId: id });
      return { ok: false, reason: 'owner_approval_required', approvalId: id };
    }
    const tool = tools[action];
    if (typeof tool !== 'function') { log({ agent, action, cls, outcome: 'tool_missing' }); return { ok: false, reason: 'tool_missing' }; }
    try {
      const out = await tool(input);
      // Verification: no evidence → no confidence. Never present unsupported results as facts.
      const evidence = Array.isArray(out && out.evidence) ? out.evidence : [];
      const confidence = evidence.length ? Math.min(0.95, 0.5 + 0.1 * evidence.length) : 0.2;
      const verified = evidence.length > 0;
      log({ agent, action, cls, outcome: verified ? 'done' : 'done_unverified', confidence });
      return { ok: true, result: out && out.data !== undefined ? out.data : out, confidence, verified };
    } catch (err) {
      log({ agent, action, cls, outcome: 'error', error: String(err && err.message || err).slice(0, 200) });
      return { ok: false, reason: 'tool_error' };
    }
  }

  async function handle(request, input = {}) {
    const tasks = plan(request);
    const results = [];
    for (const t of tasks) results.push({ ...t, ...(await runTask(t, input)) });
    const needsOwner = results.some((r) => r.reason === 'owner_approval_required' || r.reason === undefined && !r.ok);
    const uncertain = results.some((r) => r.ok && !r.verified);
    return { request, results, needsOwner, uncertain };
  }

  return { plan, runTask, handle, registry: REGISTRY };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createOrchestrator, pickModel, REGISTRY, NEVER, CLASS_ORDER };
else if (typeof window !== 'undefined') window.WCIA_ORCH = { createOrchestrator, pickModel, REGISTRY, NEVER, CLASS_ORDER };
