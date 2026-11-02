'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTools } = require('../tools');
const { createOrchestrator, REGISTRY } = require('../orchestrator');

const NOW = Date.parse('2026-11-01T12:00:00Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const bookings = [
  { id: 'a', status: 'requested', service: 'regular', zip: '33308', created_at: iso(5), customer: { name: 'X', phone: '555', email: 'x@y' }, address: '1 Secret St', offers: [] },
  { id: 'b', status: 'requested', service: 'deep', zip: '33309', created_at: iso(120), offers: [{}, {}] },
  { id: 'c', status: 'offered', service: 'regular', zip: '33308', created_at: iso(90), offers: [{}] },
  { id: 'd', status: 'assigned', service: 'regular', zip: '33308', created_at: iso(500), scheduled_at: iso(80) },
  { id: 'e', status: 'assigned', service: 'regular', zip: '33308', created_at: iso(500), scheduled_at: iso(-300) },
  { id: 'f', status: 'completed', service: 'regular', zip: '33308', created_at: iso(900) },
];
const stats = { workers_pending: 2, workers_approved: 5, workers_online: 3, bookings_open: 3, bookings_unmatched: 2, bookings_active: 2, bookings_completed_30d: 9, bookings_cancelled_30d: 1, gmv_30d: 1200, low_reviews_30d: 0, whatsapp_queued: 0, secret_extra: 'x' };
const rpc = async (fn) => (fn === 'admin_bookings' ? bookings : fn === 'admin_stats' ? stats : null);
const tools = createTools({ rpc, now: () => NOW });

test('list_unassigned returns only requested bookings, with no private fields', async () => {
  const r = await tools.list_unassigned();
  assert.deepEqual(r.data.map((b) => b.id), ['a', 'b']);
  const text = JSON.stringify(r.data);
  assert.ok(!/555|x@y|Secret|customer|address/.test(text));
  assert.ok(r.evidence.length === 1);
});

test('list_overdue finds stale open and late assigned bookings only', async () => {
  const r = await tools.list_overdue({ minutes: 60 });
  assert.deepEqual(r.data.map((b) => b.id).sort(), ['b', 'c', 'd']);
});

test('ops_report returns only the whitelisted counts', async () => {
  const r = await tools.ops_report();
  assert.equal(r.data.workers_pending, 2);
  assert.ok(!('secret_extra' in r.data));
});

test('revenue_report gives facts and no margin', async () => {
  const r = await tools.revenue_report();
  assert.equal(r.data.gmv_30d, 1200);
  assert.ok(!('margin' in r.data));
});

test('no data (not the owner / not 2-step) yields no evidence, not invented numbers', async () => {
  const t = createTools({ rpc: async () => null });
  assert.deepEqual((await t.ops_report()).evidence, []);
  assert.deepEqual((await t.list_unassigned()).data, []);
});

test('works end to end through the orchestrator, verified, with audit', async () => {
  const log = [];
  const status = Object.fromEntries(REGISTRY.map((a) => [a.agent, 'active']));
  const o = createOrchestrator({ audit: (e) => log.push(e), approvals: { request: async () => 'x' }, status, tools, now: () => NOW });
  const out = await o.handle('show unassigned bookings');
  assert.equal(out.results[0].ok, true);
  assert.equal(out.results[0].verified, true);
  assert.equal(out.results[0].result.length, 2);
  assert.equal(log.at(-1).outcome, 'done');
});
