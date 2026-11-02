'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrchestrator, pickModel, REGISTRY, NEVER } = require('../orchestrator');

function setup(over = {}) {
  const log = [];
  const asked = [];
  let t = 1000;
  const allActive = Object.fromEntries(REGISTRY.map((a) => [a.agent, 'active']));
  const o = createOrchestrator({
    audit: (e) => log.push(e),
    approvals: { request: async (r) => { asked.push(r); return 'appr-' + asked.length; } },
    now: () => t,
    status: allActive,
    tools: {
      list_unassigned: async () => ({ data: [{ id: 'b1' }], evidence: ['bookings table'] }),
      profitability: async () => ({ data: { margin: 0.2 } }), // no evidence
      scan_risks: async () => { throw new Error('boom'); },
    },
    ...over,
  });
  return { o, log, asked, tick: (ms) => { t += ms; } };
}

test('registry has the ten agents and no class above D', () => {
  assert.equal(REGISTRY.length, 10);
  for (const a of REGISTRY) for (const c of Object.values(a.actions)) assert.ok('ABCD'.includes(c));
});

test('registry is frozen: agents cannot grant themselves permissions', () => {
  assert.throws(() => { 'use strict'; REGISTRY[0].actions.payout = 'A'; }, TypeError);
  assert.throws(() => { 'use strict'; REGISTRY.push({}); }, TypeError);
});

test('planning routes known requests and falls back to the CEO agent', () => {
  const { o } = setup();
  assert.deepEqual(o.plan('show unassigned bookings'), [{ agent: 'operations', action: 'list_unassigned' }]);
  assert.equal(o.plan('what is the meaning of life')[0].agent, 'ceo');
});

test('read-only task runs and is verified with evidence', async () => {
  const { o, log } = setup();
  const r = await o.runTask({ agent: 'operations', action: 'list_unassigned' });
  assert.equal(r.ok, true);
  assert.equal(r.verified, true);
  assert.ok(r.confidence > 0.5);
  assert.equal(log.at(-1).outcome, 'done');
});

test('result without evidence is flagged unverified with low confidence', async () => {
  const { o } = setup();
  const r = await o.runTask({ agent: 'finance', action: 'profitability' });
  assert.equal(r.ok, true);
  assert.equal(r.verified, false);
  assert.ok(r.confidence < 0.3);
});

test('class D actions never run: they create an owner approval request', async () => {
  const { o, asked, log } = setup({ tools: { payout: async () => { throw new Error('must not run'); } } });
  const r = await o.runTask({ agent: 'finance', action: 'payout' }, { worker: 'w1', amount: 50 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'owner_approval_required');
  assert.equal(asked.length, 1);
  assert.equal(log.at(-1).outcome, 'approval_requested');
});

test('permission-escalation actions are always denied', async () => {
  const { o } = setup();
  for (const action of NEVER) {
    const r = await o.runTask({ agent: 'ceo', action });
    assert.equal(r.reason, 'never_allowed');
  }
});

test('an agent cannot use another agent’s actions', async () => {
  const { o } = setup();
  const r = await o.runTask({ agent: 'marketing', action: 'payout' });
  assert.equal(r.reason, 'not_permitted');
});

test('paused agents (the default) do nothing', async () => {
  const { o } = setup({ status: {} });
  const r = await o.runTask({ agent: 'operations', action: 'list_unassigned' });
  assert.equal(r.reason, 'agent_paused');
});

test('rate limit blocks bursts and resets after the window', async () => {
  const { o, tick } = setup({ rateLimit: { max: 2, windowMs: 1000 } });
  const task = { agent: 'operations', action: 'list_unassigned' };
  assert.equal((await o.runTask(task)).ok, true);
  assert.equal((await o.runTask(task)).ok, true);
  assert.equal((await o.runTask(task)).reason, 'rate_limited');
  tick(1500);
  assert.equal((await o.runTask(task)).ok, true);
});

test('tool errors are contained and audited', async () => {
  const { o, log } = setup();
  const r = await o.runTask({ agent: 'risk', action: 'scan_risks' });
  assert.equal(r.reason, 'tool_error');
  assert.equal(log.at(-1).outcome, 'error');
});

test('audit entries are frozen', async () => {
  const { o, log } = setup();
  await o.runTask({ agent: 'operations', action: 'list_unassigned' });
  assert.throws(() => { 'use strict'; log[0].outcome = 'x'; }, TypeError);
});

test('handle flags owner approval and uncertainty', async () => {
  const { o } = setup();
  const a = await o.handle('please pay out the worker');
  assert.equal(a.needsOwner, true);
  const b = await o.handle('show profit margin');
  assert.equal(b.uncertain, true);
});

test('model router picks by need and respects disabled models', () => {
  const models = [
    { id: 'big', capability: 9, reliability: 9, speed: 3, cost: 8 },
    { id: 'small', capability: 5, reliability: 7, speed: 9, cost: 1 },
    { id: 'off', capability: 10, reliability: 10, speed: 10, cost: 0, enabled: false },
  ];
  assert.equal(pickModel(models, { capability: 3, cost: 0.2 }), 'big');
  assert.equal(pickModel(models, { speed: 3, cost: 3, capability: 0.5 }), 'small');
  assert.equal(pickModel(models, { minCapability: 8 }), 'big');
  assert.equal(pickModel(models, { minCapability: 11 }), null);
});
