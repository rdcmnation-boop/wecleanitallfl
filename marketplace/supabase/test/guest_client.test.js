'use strict';
// Guest booking + human check, client side (app/api.js) against a fake browser and fake Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'api.js'), 'utf8');

function boot({ anonymous = true, session = false, emptySignup = false } = {}) {
  const ls = new Map(), calls = [];
  if (session) ls.set('wcia_session', JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: Math.floor(Date.now() / 1000) + 3000, user: { id: 'u1', is_anonymous: anonymous } }));
  const reply = (url, opts) => {
    if (url.endsWith('/auth/v1/signup')) return emptySignup ? {} : { access_token: 'ANON', refresh_token: 'R', expires_in: 3600, user: { id: 'g1', is_anonymous: true } };
    if (url.includes('/auth/v1/verify')) return { access_token: 'VER', refresh_token: 'R2', expires_in: 3600, user: { id: 'g1', is_anonymous: false, email: 'c@x.test' } };
    if (url.endsWith('/auth/v1/user')) return { id: 'g1' };
    if (url.includes('/rpc/is_admin')) return false;
    if (url.includes('/profiles')) return [{ id: 'g1', role: 'customer' }];
    return {};
  };
  const fetch = async (url, opts = {}) => { calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null }); return { ok: true, status: 200, text: async () => JSON.stringify(reply(url, opts)) }; };
  const win = { WCIA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', APP_URL: 'https://app.test/' } };
  const ctx = vm.createContext({ window: win, fetch, console, URLSearchParams, Date, Math, JSON, String, Number, Promise, Object, Array, Error, encodeURIComponent,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) },
    location: { hash: '', pathname: '/', search: '', href: 'https://app.test/' }, history: { replaceState() {} }, navigator: { platform: 'iPhone' }, setTimeout, clearTimeout });
  vm.runInContext(SRC, ctx);
  return { api: win.WCIA_API, calls, ls };
}

test('guestStart signs up anonymously as a customer, with no existing token', async () => {
  const { api, calls, ls } = boot();
  await api.guestStart('en');
  const c = calls[0];
  assert.equal(c.method, 'POST'); assert.ok(c.url.endsWith('/auth/v1/signup'));
  assert.equal(c.headers.Authorization, undefined);
  assert.deepEqual(c.body.data, { role: 'customer', language: 'en' });
  assert.equal(JSON.parse(ls.get('wcia_session')).access_token, 'ANON');
});

test('guest is flagged as guest by me(); verified user is not', async () => {
  let b = boot({ session: true, anonymous: true });
  assert.equal((await b.api.me()).isGuest, true);
  b = boot({ session: true, anonymous: false });
  assert.equal((await b.api.me()).isGuest, false);
});

test('verifyStart attaches email + password with the guest token', async () => {
  const { api, calls } = boot({ session: true });
  await api.verifyStart('c@x.test', 'Secret123!');
  const c = calls[0];
  assert.equal(c.method, 'PUT'); assert.equal(c.headers.Authorization, 'Bearer AT');
  assert.deepEqual(c.body, { email: 'c@x.test', password: 'Secret123!' });
});

test('verifyCode confirms the email change, keeps digits only, and stores the verified session', async () => {
  const { api, calls, ls } = boot({ session: true });
  await api.verifyCode('c@x.test', '12 34-56');
  const c = calls[0];
  assert.ok(c.url.endsWith('/auth/v1/verify')); assert.deepEqual(c.body, { type: 'email_change', email: 'c@x.test', token: '123456' });
  assert.equal(JSON.parse(ls.get('wcia_session')).user.is_anonymous, false);
});

test('consent proof (version + time) is saved on the auth user', async () => {
  const { api, calls } = boot({ session: true });
  await api.recordConsent('2026-11-draft');
  const c = calls[0];
  assert.equal(c.method, 'PUT'); assert.equal(c.body.data.consent_version, '2026-11-draft');
  assert.ok(!Number.isNaN(Date.parse(c.body.data.consent_at)));
});

test('guestStart failure surfaces as an error (app falls back to normal sign-up)', async () => {
  const { api, ls } = boot({ emptySignup: true });
  await assert.rejects(() => api.guestStart('es'), /guest_unavailable/);
  assert.equal(ls.has('wcia_session'), false);
});
