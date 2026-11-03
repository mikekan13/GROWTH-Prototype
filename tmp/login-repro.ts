/**
 * Does the login page's JavaScript run on a phone? Open "/" headless as an iPhone, record console/page errors, then
 * submit the form with a bogus password and see whether the client posts to /api/auth/login (JS alive) or the browser
 * navigates to "/?login=…" (JS dead).
 * Run: cd app && PW_EXE=<chrome.exe> PW_CORE=<playwright-core dir> npx tsx ../tmp/login-repro.ts
 */
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3000';
const NL = String.fromCharCode(10);

async function main() {
  const req = eval('require') as NodeRequire;
  const pw = req(process.env.PW_CORE ?? 'playwright-core') as typeof import('playwright-core');
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}) });
  for (const [label, opts] of [
    ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
    ['desktop', { viewport: { width: 1400, height: 900 } }],
  ] as const) {
    const ctx = await browser.newContext(opts as Parameters<typeof browser.newContext>[0]);
    const page = await ctx.newPage();
    const errors: string[] = []; const failed: string[] = []; let posted = false;
    page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message.slice(0, 300)));
    page.on('requestfailed', (r) => failed.push(r.url().slice(0, 160) + ' — ' + (r.failure()?.errorText ?? '')));
    page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/_next/')) failed.push(r.url().slice(0, 160) + ' — ' + r.status()); });
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/auth')) posted = true; });
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(4000);
    const hydrated = await page.evaluate(() => !!document.querySelector('form') && Object.keys(document.querySelector('form') ?? {}).some((k) => k.startsWith('__reactProps'))).catch(() => false);
    await page.fill('input[name="login"], input[type="text"], input[type="email"]', 'nobody').catch(() => undefined);
    await page.fill('input[type="password"]', 'wrong-password').catch(() => undefined);
    await Promise.all([page.waitForTimeout(3000), page.press('input[type="password"]', 'Enter').catch(() => undefined)]);
    console.log(label + ': url after submit=' + page.url().replace(/password=[^&]*/, 'password=***') + ' | react on form=' + hydrated + ' | posted to /api/auth=' + posted);
    if (failed.length) console.log('  failed loads:' + NL + '  ' + [...new Set(failed)].slice(0, 8).join(NL + '  '));
    console.log(errors.length ? '  errors:' + NL + '  ' + [...new Set(errors)].slice(0, 8).join(NL + '  ') : '  no console/page errors');
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
