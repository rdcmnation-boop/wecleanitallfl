'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Load the real owner panel module in a stub browser and render the Agents tab.
global.window = {};
require(path.join(__dirname, '..', '..', '..', 'app', 'owner.js'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function render(data) {
  const S = { sys: 'agents', data };
  const o = window.WCIA_OWNER({ t: (k) => k, esc, icon: () => '', money: String, when: (d) => d, svcName: String, S, tile: () => '', loading: () => 'LOADING', empty: () => '', wa: () => '', CFG: {}, lang: () => 'en' });
  return o.vSystem({ connectors: () => '', account: () => '' });
}

const base = { agents: [{ agent: 'operations', role_description: 'x', max_class: 'A', status: 'paused' }], pending: [], log: [] };

test('composer and run button render', () => {
  const html = render(base);
  assert.ok(html.includes('id="agent-ask"'));
  assert.ok(html.includes('data-act="ask"'));
});

test('answer shows verified, unverified and waiting-for-owner results', () => {
  const html = render({ ...base, answer: { results: [
    { agent: 'operations', action: 'list_unassigned', ok: true, verified: true, result: [1, 2] },
    { agent: 'finance', action: 'profitability', ok: true, verified: false, result: { margin: 0.2 } },
    { agent: 'finance', action: 'payout', ok: false, reason: 'owner_approval_required' },
  ], logErrors: ['function does not exist'] } });
  assert.ok(html.includes('Done, verified · 2 items'));
  assert.ok(html.includes('Done, not verified (no evidence)'));
  assert.ok(html.includes('waiting for your approval below'));
  assert.ok(html.includes('Could not record 1 entries.'));
});

test('answer with an error is shown escaped', () => {
  const html = render({ ...base, answer: { error: '<img src=x onerror=alert(1)>' } });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});

test('hostile agent text in results is escaped', () => {
  const html = render({ ...base, answer: { results: [{ agent: '<script>', action: '"><b>', ok: false, reason: '<i>' }] } });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('"><b>'));
});

test('no answer means no answer block', () => {
  assert.ok(!render(base).includes('No agent matched'));
});
