'use strict';
// Owner console glue: runs the orchestrator on the owner's session and records to the database.
// Only class A–C outcomes are written to agent_actions. Class D only creates a pending approval.
// The request text itself is never stored (privacy); only agent, action, outcome and confidence.

function createConsole({ orch, tools, api }) {
  const rpcMap = { admin_bookings: () => api.adminBookings(), admin_stats: () => api.adminStats() };
  const rpc = (fn) => (rpcMap[fn] ? rpcMap[fn]() : Promise.resolve(null));

  async function ask(request, agents) {
    const status = Object.fromEntries((agents || []).map((a) => [a.agent, a.status]));
    const writes = [];
    const logErrors = [];
    const audit = (e) => {
      if (['A', 'B', 'C'].includes(e.cls) && ['done', 'done_unverified', 'error'].includes(e.outcome)) {
        const summary = e.outcome + (e.confidence != null ? ' conf=' + e.confidence : '');
        writes.push(Promise.resolve().then(() => api.adminLogAgentAction(e.agent, e.action, e.cls, '', summary)).catch((err) => { logErrors.push(String((err && err.message) || err).slice(0, 120)); }));
      }
    };
    const o = orch.createOrchestrator({
      tools: tools.createTools({ rpc }),
      status,
      audit,
      approvals: { request: ({ agent, action, payload }) => api.adminRequestApproval(agent, action, payload || {}) },
    });
    const out = await o.handle(request);
    await Promise.all(writes);
    return { ...out, logErrors };
  }
  return { ask };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createConsole };
else if (typeof window !== 'undefined') window.WCIA_CONSOLE = { createConsole };
