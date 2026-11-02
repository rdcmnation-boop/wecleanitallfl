'use strict';
// Client-side behaviour of "remember this device" in app/api.js, run against a fake browser + fake Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'api.js'), 'utf8');
const SECRET = 'a'.repeat(64);

function boot({ session = true, device = null, isAdmin = true, isAdminAccount = true, failVerify = false } = {}) {
  const ls = new Map();
  if (session) ls.set('wcia_session', JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_at: Math.floor(Date.now() / 1000) + 3000, user: { id: 'u1' } }));
  if (device) ls.set('wcia_device', JSON.stringify(device));
  const calls = [];
  const state = { isAdmin, isAdminAccount };
  const reply = (url) => {
    if (url.includes('/challenge')) return { id: 'ch1' };
    if (url.includes('/verify')) return { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: { id: 'u1' } };
    if (url.includes('/rpc/admin_trust_device')) return SECRET;
    if (url.includes('/rpc/admin_revoke_devices')) return 1;
    if (url.includes('/rpc/admin_device_status')) return { this_device: true, active: 1 };
    if (url.includes('/rpc/is_admin_account')) return state.isAdminAccount;
    if (url.includes('/rpc/is_admin')) return state.isAdmin;
    if (url.includes('/profiles')) return [{ id: 'u1', role: 'customer', full_name: 'Owner' }];
    return {};
  };
  const fetch = async (url, opts = {}) => {
    calls.push({ url, headers: opts.headers || {}, body: opts.body });
    if (failVerify && url.includes('/verify')) return { ok: false, status: 422, text: async () => JSON.stringify({ msg: 'invalid_totp' }) };
    const body = reply(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const win = {
    WCIA_CONFIG: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', APP_URL: 'https://app.test/' },
  };
  const ctx = vm.createContext({
    window: win, fetch, console, URLSearchParams, Date, Math, JSON, String, Number, Promise, Object, Array, Error, encodeURIComponent,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) },
    location: { hash: '', pathname: '/', search: '', href: 'https://app.test/' },
    history: { replaceState() {} },
    navigator: { platform: 'iPhone' },
    setTimeout, clearTimeout,
  });
  vm.runInContext(SRC, ctx);
  return { api: win.WCIA_API, calls, ls, state };
}
const hdr = (c, name) => c.headers[name];
const rest = (calls) => calls.filter((c) => c.url.includes('/rest/v1/'));

test('live backend is selected with the fake config', () => {
  assert.equal(boot().api.mode, 'live');
});

test('trusted device secret is sent on data calls, never on auth calls', async () => {
  const { api, calls } = boot({ device: SECRET });
  await api.me();
  assert.ok(rest(calls).length >= 3);
  for (const c of rest(calls)) assert.equal(hdr(c, 'x-device-token'), SECRET);
  await api.signOut();
  const logout = calls.find((c) => c.url.includes('/auth/v1/logout'));
  assert.ok(logout);
  assert.equal(hdr(logout, 'x-device-token'), undefined);
});

test('no secret stored -> header is not sent', async () => {
  const { api, calls } = boot();
  await api.me();
  for (const c of rest(calls)) assert.equal(hdr(c, 'x-device-token'), undefined);
});

test('malformed stored secret is ignored', async () => {
  const { api, calls } = boot({ device: 'short' });
  await api.me();
  for (const c of rest(calls)) assert.equal(hdr(c, 'x-device-token'), undefined);
});

test('secret is not sent when there is no session', async () => {
  const { api, calls } = boot({ session: false, device: SECRET });
  await api.listWorkers('33101', 'regular').catch(() => {});
  for (const c of rest(calls)) assert.equal(hdr(c, 'x-device-token'), undefined);
});

test('verify WITHOUT remember does not trust the device', async () => {
  const { api, calls, ls } = boot();
  await api.mfaVerify('F1', '123 456', false);
  assert.ok(calls.some((c) => c.url.includes('/verify')));
  assert.ok(!calls.some((c) => c.url.includes('admin_trust_device')));
  assert.equal(ls.has('wcia_device'), false);
});

test('verify WITH remember trusts the device after the code is accepted, and stores the secret', async () => {
  const { api, calls, ls } = boot();
  await api.mfaVerify('F1', '123456', true);
  const iVerify = calls.findIndex((c) => c.url.includes('/verify'));
  const iTrust = calls.findIndex((c) => c.url.includes('admin_trust_device'));
  assert.ok(iVerify >= 0 && iTrust > iVerify, 'trust happens after verify');
  assert.equal(calls[iTrust].headers.Authorization, 'Bearer AT2', 'uses the new 2-step session');
  assert.equal(JSON.parse(ls.get('wcia_device')), SECRET);
});

test('wrong code: nothing is trusted or stored', async () => {
  const { api, calls, ls } = boot({ failVerify: true });
  await assert.rejects(() => api.mfaVerify('F1', '000000', true));
  assert.ok(!calls.some((c) => c.url.includes('admin_trust_device')));
  assert.equal(ls.has('wcia_device'), false);
});

test('sign out keeps the secret on the phone (that is the point)', async () => {
  const { api, ls } = boot({ device: SECRET });
  await api.signOut();
  assert.equal(JSON.parse(ls.get('wcia_device')), SECRET);
  assert.equal(ls.has('wcia_session'), false);
});

test('server says not admin although the secret is stored -> secret dropped, code is asked', async () => {
  const { api, ls } = boot({ device: SECRET, isAdmin: false, isAdminAccount: true });
  const me = await api.me();
  assert.equal(me.adminNeedsMfa, true);
  assert.equal(ls.has('wcia_device'), false);
});

test('trusted device works: isAdmin true -> no MFA screen', async () => {
  const { api } = boot({ device: SECRET, isAdmin: true, isAdminAccount: true });
  const me = await api.me();
  assert.equal(me.isAdmin, true);
  assert.equal(me.adminNeedsMfa, false);
});

test('forget this device removes the local secret and calls revoke(false); forget all calls revoke(true)', async () => {
  let b = boot({ device: SECRET });
  await b.api.revokeDevices(false);
  let c = b.calls.find((x) => x.url.includes('admin_revoke_devices'));
  assert.deepEqual(JSON.parse(c.body), { p_all: false });
  assert.equal(b.ls.has('wcia_device'), false);
  b = boot({ device: SECRET });
  await b.api.revokeDevices(true);
  c = b.calls.find((x) => x.url.includes('admin_revoke_devices'));
  assert.deepEqual(JSON.parse(c.body), { p_all: true });
});
