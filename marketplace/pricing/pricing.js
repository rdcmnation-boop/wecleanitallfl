'use strict';
// We Clean It All — pricing engine.
// Pure functions: no database, no network. Administrators set rates in `config`.
// calculate() returns internal figures (worker pay, commission, supply cost, margin).
// Only pass the output of customerView() to customers and workerView() to workers.

const SEGMENTS = ['residential', 'commercial'];
const FREQUENCIES = ['once', 'daily', 'weekly', 'biweekly', 'monthly'];
const OVERRIDABLE = ['hours', 'customerPrice', 'workerPayout', 'commissionRate'];

const DEFAULT_CONFIG = Object.freeze({
  currency: 'USD',
  minimumJob: 90,              // minimum service subtotal, customer side
  customerHourly: 45,          // per cleaner-hour, customer side
  workerHourly: 22,            // per cleaner-hour, worker side
  commissionRate: 0.15,        // platform commission on the customer price (marketplace jobs)
  minCompanyMarginRate: 0.2,   // flag jobs whose company margin falls below this share of the price
  minWorkerPayout: 40,         // flag jobs that pay a worker less than this
  deepServices: Object.freeze(['deep', 'move', 'post_construction']),
  deepMultiplier: 1.6,         // extra hours for deep cleaning
  deepFlatFee: 0,              // optional flat deep-clean fee
  frequencyDiscount: Object.freeze({ once: 0, monthly: 0.05, biweekly: 0.10, weekly: 0.15, daily: 0.20 }),
  residential: Object.freeze({ baseHours: 1, perBedroomHours: 0.5, perBathroomHours: 0.5, sqftPerHour: 350 }),
  commercial: Object.freeze({ baseHours: 1, sqftPerHour: 1200 }),
  travel: Object.freeze({ freeMiles: 10, perMile: 1, maxMiles: 60 }),
  supplies: Object.freeze({ perVisitCost: 8, markup: 0.25 }),
  specialRequirements: Object.freeze({
    pet_hair: Object.freeze({ label: 'Heavy pet hair', customerFee: 20, workerFee: 8, extraHours: 0 }),
    heavy_grease: Object.freeze({ label: 'Heavy grease or kitchen', customerFee: 35, workerFee: 15, extraHours: 0.5 }),
    interior_windows: Object.freeze({ label: 'Interior windows', customerFee: 25, workerFee: 10, extraHours: 0.5 }),
    empty_move_out: Object.freeze({ label: 'Empty move-out', customerFee: 40, workerFee: 15, extraHours: 0.5 }),
  }),
});

const r2 = (n) => Math.round(n * 100) / 100;
const roundUpHalf = (h) => Math.ceil(h * 2) / 2;
function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  throw e;
}

function validate(input, cfg) {
  const job = {
    segment: input.segment,
    service: String(input.service || ''),
    frequency: input.frequency || 'once',
    bedrooms: Number(input.bedrooms ?? 0),
    bathrooms: Number(input.bathrooms ?? 0),
    sqft: Number(input.sqft ?? 0),
    cleaners: Number(input.cleaners ?? 1),
    miles: Number(input.miles ?? 0),
    suppliesByCompany: Boolean(input.suppliesByCompany),
    source: input.source === 'company' ? 'company' : 'marketplace',
    specials: Array.isArray(input.specials) ? [...new Set(input.specials)] : [],
  };
  if (!SEGMENTS.includes(job.segment)) fail('invalid_segment');
  if (!FREQUENCIES.includes(job.frequency)) fail('invalid_frequency');
  if (!job.service) fail('invalid_service');
  for (const k of ['bedrooms', 'bathrooms']) {
    if (!Number.isInteger(job[k]) || job[k] < 0 || job[k] > 20) fail('invalid_' + k);
  }
  if (!Number.isFinite(job.sqft) || job.sqft < 0 || job.sqft > 1000000) fail('invalid_sqft');
  if (!Number.isInteger(job.cleaners) || job.cleaners < 1 || job.cleaners > 10) fail('invalid_cleaners');
  if (!Number.isFinite(job.miles) || job.miles < 0) fail('invalid_miles');
  if (job.miles > cfg.travel.maxMiles) fail('out_of_area');
  for (const c of job.specials) {
    if (!cfg.specialRequirements[c]) fail('invalid_special', 'Unknown special requirement: ' + c);
  }
  return job;
}

function estimateHours(job, cfg) {
  let hours;
  if (job.segment === 'commercial') {
    hours = cfg.commercial.baseHours + job.sqft / cfg.commercial.sqftPerHour;
  } else {
    const bySqft = job.sqft / cfg.residential.sqftPerHour;
    const byRooms = job.bedrooms * cfg.residential.perBedroomHours + job.bathrooms * cfg.residential.perBathroomHours;
    hours = cfg.residential.baseHours + Math.max(bySqft, byRooms);
  }
  if (cfg.deepServices.includes(job.service)) hours *= cfg.deepMultiplier;
  for (const c of job.specials) hours += cfg.specialRequirements[c].extraHours;
  return roundUpHalf(hours);
}

// Builds the full price from a validated job. `o` carries the hours and any admin overrides.
function build(job, cfg, o) {
  const isDeep = cfg.deepServices.includes(job.service);
  const specials = job.specials.map((c) => ({ code: c, ...cfg.specialRequirements[c] }));
  const cleanerHours = o.hours * job.cleaners;

  // Customer side
  const laborGross = r2(cleanerHours * cfg.customerHourly);
  const discount = r2(laborGross * (cfg.frequencyDiscount[job.frequency] || 0));
  const deepFee = isDeep ? cfg.deepFlatFee : 0;
  const specialFees = r2(specials.reduce((s, x) => s + x.customerFee, 0));
  const subtotal = r2(laborGross - discount + deepFee + specialFees);
  const minimumAdj = r2(Math.max(0, cfg.minimumJob - subtotal));
  const travelFee = r2(Math.max(0, job.miles - cfg.travel.freeMiles) * cfg.travel.perMile);
  const supplyCost = job.suppliesByCompany ? cfg.supplies.perVisitCost : 0;
  const supplyFee = job.suppliesByCompany ? r2(cfg.supplies.perVisitCost * (1 + cfg.supplies.markup)) : 0;
  const computedPrice = r2(subtotal + minimumAdj + travelFee + supplyFee);
  const customerPrice = o.customerPrice ?? computedPrice;
  const adjustment = r2(customerPrice - computedPrice);

  const lines = [{ label: 'Cleaning labor', amount: laborGross }];
  if (discount) lines.push({ label: 'Recurring discount', amount: -discount });
  if (deepFee) lines.push({ label: 'Deep clean', amount: deepFee });
  for (const s of specials) lines.push({ label: s.label, amount: s.customerFee });
  if (minimumAdj) lines.push({ label: 'Minimum visit', amount: minimumAdj });
  if (travelFee) lines.push({ label: 'Travel', amount: travelFee });
  if (supplyFee) lines.push({ label: 'Supplies', amount: supplyFee });
  if (adjustment) lines.push({ label: 'Adjustment', amount: adjustment });

  // Worker side
  const workerLabor = r2(cleanerHours * cfg.workerHourly);
  const workerSpecials = r2(specials.reduce((s, x) => s + x.workerFee, 0));
  const laborCost = r2(workerLabor + workerSpecials + travelFee); // estimated labor cost before commission
  const commissionRate = o.commissionRate ?? cfg.commissionRate;
  const commission = job.source === 'marketplace' ? r2(customerPrice * commissionRate) : 0;
  const workerPayout = o.workerPayout ?? r2(laborCost - commission);
  const companyMargin = r2(customerPrice - supplyCost - workerPayout);
  const marginRate = customerPrice > 0 ? r2(companyMargin / customerPrice) : 0;

  const flags = [];
  if (marginRate < cfg.minCompanyMarginRate) flags.push('low_margin');
  if (workerPayout < 0) flags.push('negative_payout');
  else if (workerPayout < cfg.minWorkerPayout) flags.push('low_worker_payout');

  return {
    currency: cfg.currency,
    hours: o.hours,
    cleanerHours,
    lines,
    customer: { total: customerPrice },
    worker: { payout: workerPayout, travel: travelFee, hours: o.hours, cleanerHours },
    internal: {
      computedPrice,
      adjustment,
      laborCost,
      commissionRate,
      commission,
      supplyCost,
      companyMargin,
      marginRate,
      workerPayout,
    },
    flags,
  };
}

// calculate(input, opts)
//   input: { segment, service, frequency, bedrooms, bathrooms, sqft, cleaners, miles,
//            suppliesByCompany, source ('marketplace' | 'company'), specials: [codes] }
//   opts:  { config, overrides: { hours, customerPrice, workerPayout, commissionRate },
//            actor: { id, isAdmin }, reason }
function calculate(input, opts = {}) {
  const cfg = opts.config || DEFAULT_CONFIG;
  const job = validate(input, cfg);
  const estimatedHours = estimateHours(job, cfg);
  const before = build(job, cfg, { hours: estimatedHours });

  const ov = opts.overrides || {};
  const keys = Object.keys(ov).filter((k) => ov[k] !== undefined && ov[k] !== null);
  if (keys.length === 0) {
    return { ...before, estimatedHours, overrides: [], audit: null };
  }

  if (!opts.actor || opts.actor.isAdmin !== true) fail('admin_required', 'Only an administrator can override an estimate');
  if (!opts.reason || String(opts.reason).trim().length < 5) fail('reason_required', 'A reason of at least 5 characters is required');
  for (const k of keys) if (!OVERRIDABLE.includes(k)) fail('invalid_override', 'Cannot override: ' + k);

  const o = { hours: estimatedHours };
  if (ov.hours != null) {
    const h = Number(ov.hours);
    if (!Number.isFinite(h) || h <= 0 || h > 200) fail('invalid_override', 'hours must be between 0 and 200');
    o.hours = roundUpHalf(h);
  }
  if (ov.customerPrice != null) {
    const p = Number(ov.customerPrice);
    if (!Number.isFinite(p) || p < 0 || p > 100000) fail('invalid_override', 'customerPrice out of range');
    o.customerPrice = r2(p);
  }
  if (ov.workerPayout != null) {
    const w = Number(ov.workerPayout);
    if (!Number.isFinite(w) || w < 0 || w > 100000) fail('invalid_override', 'workerPayout out of range');
    o.workerPayout = r2(w);
  }
  if (ov.commissionRate != null) {
    const c = Number(ov.commissionRate);
    if (!Number.isFinite(c) || c < 0 || c > 0.5) fail('invalid_override', 'commissionRate must be between 0 and 0.5');
    o.commissionRate = c;
  }

  const after = build(job, cfg, o);
  const summary = (r) => ({ hours: r.hours, customerPrice: r.customer.total, workerPayout: r.internal.workerPayout, commissionRate: r.internal.commissionRate });
  return {
    ...after,
    estimatedHours,
    overrides: keys,
    audit: {
      action: 'pricing_override',
      actorId: opts.actor.id ?? null,
      reason: String(opts.reason).trim(),
      overridden: keys,
      before: summary(before),
      after: summary(after),
    },
  };
}

// What a customer may see: price, hours and line items. Never worker pay, commission, cost or margin.
function customerView(result) {
  return {
    currency: result.currency,
    total: result.customer.total,
    hours: result.hours,
    lines: result.lines.map((l) => ({ label: l.label, amount: l.amount })),
  };
}

// What a worker may see: their own payout, hours and travel. Never the customer price or internal figures.
function workerView(result) {
  return {
    currency: result.currency,
    hours: result.worker.hours,
    cleanerHours: result.worker.cleanerHours,
    payout: result.worker.payout,
    travel: result.worker.travel,
  };
}

module.exports = { DEFAULT_CONFIG, SEGMENTS, FREQUENCIES, calculate, customerView, workerView, estimateHours };
