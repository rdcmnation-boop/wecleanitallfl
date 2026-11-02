'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./pricing.js');

const admin = { id: 'admin-1', isAdmin: true };
const base = { segment: 'residential', service: 'standard', bedrooms: 2, bathrooms: 2, sqft: 0, cleaners: 1, frequency: 'once', miles: 0 };
const sumLines = (r) => Math.round(r.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

test('standard 2 bed / 2 bath: hours, price, commission, payout and margin', () => {
  const r = p.calculate(base);
  assert.equal(r.hours, 3);
  assert.equal(r.customer.total, 135);
  assert.equal(r.internal.commission, 20.25);
  assert.equal(r.internal.workerPayout, 45.75);
  assert.equal(r.internal.companyMargin, 89.25);
  assert.deepEqual(r.flags, []);
  assert.equal(sumLines(r), 135);
});

test('deep clean multiplies hours and weekly discount applies', () => {
  const r = p.calculate({ ...base, bedrooms: 3, service: 'deep', frequency: 'weekly' });
  assert.equal(r.hours, 6);
  assert.equal(r.customer.total, 229.5);
  assert.equal(sumLines(r), 229.5);
});

test('monthly discount is 5% of labor', () => {
  const r = p.calculate({ ...base, frequency: 'monthly' });
  assert.equal(r.customer.total, 128.25);
});

test('commercial hours scale with square footage and cleaners multiply labor', () => {
  const r = p.calculate({ segment: 'commercial', service: 'office', sqft: 4000, cleaners: 2, frequency: 'once' });
  assert.equal(r.hours, 4.5);
  assert.equal(r.cleanerHours, 9);
  assert.equal(r.customer.total, 405);
});

test('minimum visit charge applies when labor is below the minimum', () => {
  const r = p.calculate({ segment: 'residential', service: 'standard', bedrooms: 0, bathrooms: 0, sqft: 0, cleaners: 1, frequency: 'once' });
  assert.equal(r.customer.total, 90);
  assert.ok(r.lines.some((l) => l.label === 'Minimum visit' && l.amount === 45));
});

test('travel beyond free miles is charged to the customer and paid to the worker', () => {
  const r = p.calculate({ ...base, miles: 25 });
  assert.equal(r.customer.total, 150);
  assert.equal(r.worker.travel, 15);
  assert.equal(r.internal.workerPayout, 58.5);
});

test('jobs beyond the service area are refused', () => {
  assert.throws(() => p.calculate({ ...base, miles: 80 }), (e) => e.code === 'out_of_area');
});

test('company-supplied supplies add a fee and a cost to the margin', () => {
  const r = p.calculate({ ...base, suppliesByCompany: true });
  assert.equal(r.customer.total, 145);
  assert.equal(r.internal.supplyCost, 8);
  assert.equal(r.internal.companyMargin, 92.75);
});

test('special requirements carry a customer fee and a worker fee', () => {
  const r = p.calculate({ ...base, specials: ['pet_hair'] });
  assert.equal(r.customer.total, 155);
  assert.equal(r.internal.workerPayout, 50.75);
  assert.ok(r.lines.some((l) => l.label === 'Heavy pet hair' && l.amount === 20));
});

test('company-run jobs carry no marketplace commission', () => {
  const r = p.calculate({ ...base, source: 'company' });
  assert.equal(r.internal.commission, 0);
  assert.equal(r.internal.workerPayout, 66);
  assert.equal(r.internal.companyMargin, 69);
});

test('unknown special requirement and out-of-range inputs are rejected', () => {
  assert.throws(() => p.calculate({ ...base, specials: ['nope'] }), (e) => e.code === 'invalid_special');
  assert.throws(() => p.calculate({ ...base, bedrooms: 99 }), (e) => e.code === 'invalid_bedrooms');
  assert.throws(() => p.calculate({ ...base, segment: 'x' }), (e) => e.code === 'invalid_segment');
  assert.throws(() => p.calculate({ ...base, cleaners: 0 }), (e) => e.code === 'invalid_cleaners');
});

test('overrides require an administrator', () => {
  assert.throws(() => p.calculate(base, { overrides: { customerPrice: 200 }, reason: 'special deal' }), (e) => e.code === 'admin_required');
  assert.throws(() => p.calculate(base, { overrides: { customerPrice: 200 }, actor: { id: 'w', isAdmin: false }, reason: 'special deal' }), (e) => e.code === 'admin_required');
});

test('overrides require a reason', () => {
  assert.throws(() => p.calculate(base, { overrides: { customerPrice: 200 }, actor: admin }), (e) => e.code === 'reason_required');
  assert.throws(() => p.calculate(base, { overrides: { customerPrice: 200 }, actor: admin, reason: 'no' }), (e) => e.code === 'reason_required');
});

test('admin price override keeps line items balanced and writes an audit entry', () => {
  const r = p.calculate(base, { overrides: { customerPrice: 200 }, actor: admin, reason: 'Long-term client, agreed rate' });
  assert.equal(r.customer.total, 200);
  assert.equal(sumLines(r), 200);
  assert.equal(r.audit.action, 'pricing_override');
  assert.equal(r.audit.actorId, 'admin-1');
  assert.equal(r.audit.before.customerPrice, 135);
  assert.equal(r.audit.after.customerPrice, 200);
  assert.equal(r.internal.commission, 30);
});

test('a price override that leaves the worker under the minimum is flagged', () => {
  const r = p.calculate(base, { overrides: { customerPrice: 200 }, actor: admin, reason: 'Long-term client, agreed rate' });
  assert.equal(r.internal.workerPayout, 36);
  assert.ok(r.flags.includes('low_worker_payout'));
});

test('worker payout override recalculates the company margin', () => {
  const r = p.calculate(base, { overrides: { workerPayout: 50 }, actor: admin, reason: 'Crew bonus for weekend shift' });
  assert.equal(r.internal.workerPayout, 50);
  assert.equal(r.internal.companyMargin, 85);
});

test('hour override changes labor and price', () => {
  const r = p.calculate(base, { overrides: { hours: 5 }, actor: admin, reason: 'Extra clutter, agreed on site' });
  assert.equal(r.estimatedHours, 3);
  assert.equal(r.hours, 5);
  assert.equal(r.customer.total, 225);
});

test('low company margin is flagged', () => {
  const cfg = { ...p.DEFAULT_CONFIG, workerHourly: 44 };
  const r = p.calculate(base, { config: cfg });
  assert.ok(r.flags.includes('low_margin'));
});

test('customer view contains no internal figures', () => {
  const r = p.calculate({ ...base, specials: ['pet_hair'], suppliesByCompany: true, miles: 20 });
  const json = JSON.stringify(p.customerView(r)).toLowerCase();
  for (const word of ['commission', 'margin', 'payout', 'cost', 'hourly', 'rate', 'workerfee']) {
    assert.ok(!json.includes(word), 'customer view leaked: ' + word);
  }
});

test('worker view contains only the worker’s own pay and job facts', () => {
  const r = p.calculate({ ...base, miles: 20 });
  const v = p.workerView(r);
  assert.deepEqual(Object.keys(v).sort(), ['cleanerHours', 'currency', 'hours', 'payout', 'travel']);
  assert.equal(v.payout, r.internal.workerPayout);
});
