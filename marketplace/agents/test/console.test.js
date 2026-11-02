'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const orch = require('../orchestrator');
const tools = require('../tools');
const { createConsole } = require('../console');

const agents = orch.REGISTRY.map((a) => ({ agent: a.agent, status: 'active' }));
function mkApi(over = {}) {
  const calls = { log: [], approvals: [] };
  return {
    calls,
    adminBookings: async () => [{ id: 'b1', status: 'requested', service: 'regular', zip: '33308', created_at: '2026-11-01T10:00:00Z' }],
    adminStats: async () => ({ workers_pending: 1 }),
    adminLogAgentAction: async (...a) => { calls.log.push(a); return 1; },
    adminRequestApproval: async (agent, action, payload) => { calls.approvals.push({ agent, action, payload }); return 'ap-1'; },
    ...over,
  };
}

test('read-only request runs, logs outcome without the request text', async () => {
  const api = mkApi();
  const c = createConsole({ orch, tools, api });
  const out = await c.ask('show unassigned bookings for Maria Lopez', agents);
  assert.equal(out.results[0].ok, true);
  assert.equal(out.logErrors.length, 0);
  assert.equal(api.calls.log.length, 1);
  assert.deepEqual(api.calls.log[0].slice(0, 3), ['operations', 'list_unassigned', 'A']);
  assert.ok(!JSON.stringify(api.calls.log).includes('Maria'));
});

test('money request only creates a pending approval and logs no action', async () => {
  const api = mkApi();
  const out = await createConsole({ orch, tools, api }).ask('pay out the worker', agents);
  assert.equal(out.needsOwner, true);
  assert.equal(api.calls.approvals.length, 1);
  assert.equal(api.calls.log.length, 0);
});

test('paused agents do nothing and write nothing', async () => {
  const api = mkApi();
  const paused = agents.map((a) => ({ ...a, status: 'paused' }));
  const out = await createConsole({ orch, tools, api }).ask('show unassigned bookings', paused);
  assert.equal(out.results[0].reason, 'agent_paused');
  assert.equal(api.calls.log.length, 0);
});

test('log failures are reported, not hidden', async () => {
  const api = mkApi({ adminLogAgentAction: async () => { throw new Error('function does not exist'); } });
  const out = await createConsole({ orch, tools, api }).ask('show unassigned bookings', agents);
  assert.equal(out.results[0].ok, true);
  assert.equal(out.logErrors.length, 1);
});
