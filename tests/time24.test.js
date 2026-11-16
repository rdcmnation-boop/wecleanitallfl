'use strict';
// 24-hour (military) time is a permanent rule for every user-facing time: HH:mm, 00:00 to 23:59, never AM/PM.
// These tests fail if the shared formatter produces anything else, or if code that shows times to people
// (app, demo, owner and agent screens, notifications, database message formats) starts formatting a
// 12-hour clock or skips the shared formatter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const T = require('../app/time.js');
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

test('hm gives HH:mm for every hour and minute of the day', () => {
  for (let h = 0; h < 24; h++) for (const m of [0, 1, 5, 30, 59]) {
    const out = T.hm(new Date(2026, 10, 16, h, m));
    assert.match(out, HHMM);
    assert.equal(out, String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
  }
});

test('the required examples come out exactly', () => {
  const at = (h, m) => T.hm(new Date(2026, 10, 16, h, m));
  assert.equal(at(0, 0), '00:00');
  assert.equal(at(8, 5), '08:05');
  assert.equal(at(12, 0), '12:00');
  assert.equal(at(12, 30), '12:30');
  assert.equal(at(13, 0), '13:00');
  assert.equal(at(14, 45), '14:45');
  assert.equal(at(15, 30), '15:30');
  assert.equal(at(17, 0), '17:00');
  assert.equal(at(18, 45), '18:45');
  assert.equal(at(23, 59), '23:59');
});

test('hms adds seconds with leading zeros', () => {
  assert.equal(T.hms(new Date(2026, 0, 1, 0, 0, 7)), '00:00:07');
  assert.equal(T.hms(new Date(2026, 0, 1, 23, 59, 59)), '23:59:59');
});

test('Miami time (hmIn) is 24-hour across both daylight-saving changes and never shows 24:00', () => {
  const tz = 'America/New_York';
  assert.equal(T.hmIn('2026-11-16T05:00:00Z', tz), '00:00');   // midnight EST
  assert.equal(T.hmIn('2026-11-16T17:00:00Z', tz), '12:00');   // noon EST
  assert.equal(T.hmIn('2026-11-16T23:45:00Z', tz), '18:45');
  assert.equal(T.hmIn('2026-07-01T04:00:00Z', tz), '00:00');   // midnight EDT
  assert.equal(T.hmIn('2026-03-08T06:59:00Z', tz), '01:59');   // just before spring forward
  assert.equal(T.hmIn('2026-03-08T07:00:00Z', tz), '03:00');   // clocks jump 02:00 -> 03:00
  assert.equal(T.hmIn('2026-11-01T05:30:00Z', tz), '01:30');   // 01:30 EDT
  assert.equal(T.hmIn('2026-11-01T06:30:00Z', tz), '01:30');   // 01:30 EST, one hour later in real time
  for (let i = 0; i < 48; i++) assert.match(T.hmIn(Date.UTC(2026, 10, 16, 0, i * 30), tz), HHMM);
});

test('a stored timestamp keeps its moment: the formatter never shifts the time it is given', () => {
  const iso = '2026-11-16T19:30:00Z';
  const d = new Date(iso);
  assert.equal(T.hm(iso), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
  assert.equal(new Date(iso).toISOString(), '2026-11-16T19:30:00.000Z');
});

test('the device time zone and language cannot turn on a 12-hour clock', () => {
  const code = "const T=require(" + JSON.stringify(path.join(ROOT, 'app/time.js')) + ");" +
    "process.stdout.write([T.hm('2026-11-16T21:05:00Z'),T.dateTime('2026-11-16T21:05:00Z','en-US'),T.dateTime('2026-11-16T21:05:00Z','es-US')].join('|'))";
  for (const [tz, lang] of [['America/Los_Angeles', 'en_US.UTF-8'], ['America/New_York', 'es_US.UTF-8'], ['UTC', 'C']]) {
    const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz, LANG: lang, LC_ALL: lang } }).toString();
    assert.doesNotMatch(out, /\b(AM|PM)\b|a\.\s?m\.|p\.\s?m\./i, tz + ' ' + lang + ': ' + out);
    assert.match(out.split('|')[0], HHMM);
  }
});

test('booking slots are HH:mm and invalid values are refused', () => {
  assert.equal(T.slot('8:00'), '08:00');
  assert.equal(T.slot('14:00'), '14:00');
  assert.equal(T.slot('24:00'), '');
  assert.equal(T.slot('2 PM'), '');
  for (const f of ['app/app.js', 'demo/app/app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = /const SLOTS = (\[[^\]]*\])/.exec(src);
    assert.ok(m, f + ' has SLOTS');
    for (const s of JSON.parse(m[1])) assert.match(s, HHMM, f + ' slot ' + s);
  }
});

test('dateTime shows the date in the person\'s language and a 24-hour time', () => {
  const iso = new Date(2026, 10, 16, 15, 30).toISOString();
  assert.match(T.dateTime(iso, 'en-US'), /, 15:30$/);
  assert.match(T.dateTime(iso, 'es-US'), /, 15:30$/);
  assert.equal(T.dateTime('not a date'), '');
});

// Code that shows times to people. Every file here is scanned for 12-hour formatting.
const USER_FACING = [
  'index.html', 'demo/index.html', 'app/index.html', 'comercial/index.html',
  'app/app.js', 'app/dash.js', 'app/owner.js', 'app/i18n.js', 'app/learn.js', 'app/api.js', 'app/time.js',
  'demo/app/app.js', 'demo/app/owner.js', 'demo/app/i18n.js', 'demo/app/learn.js', 'demo/app/api.js', 'demo/app/time.js',
  'marketplace/agents/console.js', 'marketplace/agents/orchestrator.js', 'marketplace/agents/tools.js',
  ...fs.readdirSync(path.join(ROOT, 'marketplace/supabase/functions')).filter((d) => fs.existsSync(path.join(ROOT, 'marketplace/supabase/functions', d, 'index.ts'))).map((d) => 'marketplace/supabase/functions/' + d + '/index.ts'),
  ...fs.readdirSync(path.join(ROOT, 'marketplace/supabase')).filter((f) => f.endsWith('.sql')).map((f) => 'marketplace/supabase/' + f),
];
const RULES = [
  [/toLocaleTimeString\s*\(/, 'toLocaleTimeString (uses the device 12/24-hour setting)'],
  [/hour12\s*:\s*true/, 'hour12: true'],
  [/hourCycle\s*:\s*["']h1[12]["']/, '12-hour hourCycle'],
  [/\bHH12\b|\bHH:MI\s*AM\b|\bAM\b'\)/, 'SQL 12-hour format (HH12 / AM)'],
  [/["'`]h{1,2}:mm(\s*[aA])?["'`]/, 'h:mm / hh:mm 12-hour pattern'],
  [/\b(?:[1-9]|1[0-2])(?::[0-5]\d)?\s?(?:AM|PM|a\.m\.|p\.m\.)(?![a-z])/i, 'a 12-hour time written as text'],
  [/toLocaleString\s*\([^)]*\bhour\s*:/, 'toLocaleString with an hour option (format times through app/time.js)'],
  [/hour\s*:\s*["']numeric["']/, 'hour: "numeric" (12-hour in en-US)'],
];

test('no user-facing file formats a 12-hour clock or writes AM/PM', () => {
  const found = [];
  for (const f of USER_FACING) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const [re, why] of RULES) if (re.test(line)) found.push(f + ':' + (i + 1) + ' ' + why + ' :: ' + line.trim().slice(0, 120));
    });
  }
  assert.deepEqual(found, [], 'Remaining 12-hour displays:\n' + found.join('\n'));
});

test('the app and demo load the shared formatter before the screens, and the offline cache includes it', () => {
  const order = (html, a, b) => html.indexOf(a) > -1 && html.indexOf(a) < html.indexOf(b);
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(order(idx, '/app/time.js', '/app/app.js'), 'index.html loads app/time.js before app.js');
  assert.ok(order(idx, '/app/time.js', '/app/dash.js'), 'index.html loads app/time.js before dash.js');
  const demo = fs.readFileSync(path.join(ROOT, 'demo/index.html'), 'utf8');
  assert.ok(order(demo, '/demo/app/time.js', '/demo/app/app.js'), 'demo loads time.js before app.js');
  assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /"\/app\/time\.js"/);
  assert.equal(fs.readFileSync(path.join(ROOT, 'app/time.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'demo/app/time.js'), 'utf8'), 'demo copy matches');
});

test('screens use the shared formatter for times', () => {
  for (const f of ['app/app.js', 'demo/app/app.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, /const TM = window\.WCIA_TIME;/, f);
    assert.match(src, /TM\.dateTime\(iso,/, f + ' when()');
    assert.match(src, /const clockText = \(\) => TM\.hms\(new Date\(\)\);/, f + ' header clock');
    assert.match(src, /esc\(TM\.slot\(s\)\)/, f + ' booking time chips');
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'app/dash.js'), 'utf8'), /hhmm = \(iso\) => window\.WCIA_TIME\.hm\(iso\)/);
  const notify = fs.readFileSync(path.join(ROOT, 'marketplace/supabase/functions/notify/index.ts'), 'utf8');
  assert.match(notify, /hourCycle: "h23"/);
  assert.match(notify, /whenET\(p\.scheduled_at\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'marketplace/supabase/whatsapp_agent.sql'), 'utf8'), /'Dy Mon DD, HH24:MI'/);
});
