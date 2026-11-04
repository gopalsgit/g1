// Drives App.html in Chromium with google.script.run wired to the Node harness.
const fs = require('fs'); const path = require('path');
process.env.UI = '1';
const { chromium } = require('playwright');
const harness = require('./harness');
(async () => {
  const { G, tokens } = harness.seed();
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'App.html'), 'utf8');
  const out = process.argv[2] || '/tmp/claude-0/shots';
  const b = await chromium.launch();
  const errors = [];
  async function page(boot, store) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    p.on('pageerror', e => errors.push(e.message));
    await p.exposeFunction('__call', (fn, args) => { try { return { ok: G[fn].apply(null, args) }; } catch (e) { return { err: e.message }; } });
    const init = `<script>(function(store){
      for (const k in store) localStorage.setItem(k, store[k]);
      window.google = { script: { run: (function mk(s, f) { return new Proxy({}, { get: (t, k) => {
        if (k === 'withSuccessHandler') return h => mk(h, f);
        if (k === 'withFailureHandler') return h => mk(s, h);
        return (...a) => window.__call(k, a).then(r => r.err ? f(new Error(r.err)) : s(r.ok));
      } }); })() } };
    })(${JSON.stringify(store || {})});</script>`;
    await p.route('https://app.test/', r => r.fulfill({ contentType: 'text/html', body: html.replace('<script>', init + '<script>').replace('<?!= boot ?>', JSON.stringify(boot)) }));
    await p.goto('https://app.test/');
    await p.waitForTimeout(400);
    return p;
  }
  const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.png'), fullPage: true });
  let p = await page({ appUrl: 'x' }, { 'omt.lang': 'hi' }); await shot(p, '01-login-hi');
  await p.fill('input[type=tel]', '9876543210'); await p.fill('input[type=password]', '1234');
  await p.click('button.main'); await p.waitForTimeout(400); await shot(p, '02-home-hi');
  await p.click('text=मेरी जानकारी'); await p.waitForTimeout(300); await shot(p, '03-details-hi');
  await p.click('.lang'); await p.waitForTimeout(300); await shot(p, '04-details-en');
  await p.locator('button', { hasText: 'Change' }).nth(9).click(); await p.waitForTimeout(300); await shot(p, '05-change-address');
  p = await page({ appUrl: 'x' }, { 'omt.lang': 'hi', 'omt.kind': 's', 'omt.token': tokens.lead }); await p.waitForTimeout(300);
  await shot(p, '06-lead-home'); await p.click('text=मेरी टीम'); await p.waitForTimeout(300); await shot(p, '07-team');
  p = await page({ join: tokens.join, appUrl: 'x' }, { 'omt.lang': 'hi' }); await shot(p, '08-join-1');
  await p.click('text=टीम लीडर'); await p.waitForTimeout(200); await shot(p, '09-join-1-lead');
  p = await page({ g: tokens.g, appUrl: 'x' }, { 'omt.lang': 'en' }); await shot(p, '10-admin-pin');
  await p.fill('input[type=password]', '4321'); await p.click('button.main'); await p.waitForTimeout(500); await shot(p, '11-admin-queue');
  await p.click('text=People'); await p.waitForTimeout(500); await shot(p, '12-admin-people');
  await p.locator('.card').first().click(); await p.waitForTimeout(500); await shot(p, '13-admin-person');
  await b.close();
  console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
})();
