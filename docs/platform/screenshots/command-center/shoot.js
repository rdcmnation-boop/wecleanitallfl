const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/home/claude/wecleanitallfl', OUT = __dirname + '/out';
fs.mkdirSync(OUT, { recursive: true });
const FIX = fs.readFileSync(__dirname + '/fixtures.js', 'utf8');
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const BANNER = `(()=>{const d=document.createElement('div');d.textContent='STAGING TEST DATA · real staging database responses · not production';const st=document.createElement('style');st.textContent='.demo-banner{display:none!important}';document.head.appendChild(st);d.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#ffcf5a;color:#111;font:700 12px/1.2 system-ui;padding:6px 10px;text-align:center;pointer-events:none';document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(d));})();`;
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  for (const [label, vp] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.host !== 'app.test') return route.abort();
      let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
      if (p === '/app/config.js') return route.fulfill({ contentType: types['.js'], body: 'window.WCIA_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",BRAIN_ON:false,GUEST_BOOKING:false};' + BANNER });
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(f);
      if (p === '/app/api.js') body = Buffer.concat([body, Buffer.from('\n' + FIX)]);
      route.fulfill({ contentType: types[path.extname(f)] || 'application/octet-stream', body });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(label + ' console: ' + m.text()); });
    await page.goto('http://app.test/');
    await page.waitForSelector('[data-act="cc_mod"]', { timeout: 15000 });
    const mods = ['overview','bookings','dispatch','customers','workforce','companies','ai','robotics','finance','sales','markets','reports'];
    const snap = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${label}-${name}.png`, fullPage: label === 'desktop' }); };
    let i = 1;
    for (const m of mods) {
      await page.click(`[data-act="cc_mod"][data-m="${m}"]`);
      await page.waitForTimeout(300);
      await snap(String(i++).padStart(2, '0') + '-' + m);
      if (m === 'bookings') { await page.click('[data-act="cc_open"][data-id="3dbf55c6-7fb8-45e4-aa2b-529ac4feb5f4"]'); await snap('02b-booking-detail'); await page.click('[data-act="cc_back"]'); }
      if (m === 'dispatch') { await page.click('[data-act="cc_dispatch_open"]'); await snap('03b-dispatch-WC-1042'); await page.click('[data-act="cc_back"]'); }
      if (m === 'customers') { await page.click('[data-act="cc_open"][data-id="00000000-7e57-4000-8000-000000000011"]'); await snap('04b-customer-detail'); await page.click('[data-act="cc_back"]'); }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(errs.length ? errs.join('\n') : 'no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
