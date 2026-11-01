/**
 * Reproduce the phone canvas failure headless: an iPhone-sized touch Chromium opens the campaign page as the GM and we
 * record every console error / page error, who calls location.reload(), and whether the live stream ever opened.
 * Run: cd app && PW_EXE=<chrome.exe> PW_CORE=<playwright-core dir> [DESKTOP=1] npx tsx ../tmp/mobile-repro.ts
 */
import crypto from 'node:crypto';
import { prisma } from '../app/src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3000';
const NL = String.fromCharCode(10);

async function main() {
  const req = eval('require') as NodeRequire;
  const pw = req(process.env.PW_CORE ?? 'playwright-core') as typeof import('playwright-core');
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3600_000) } });
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}) });

  const probe = () => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-layoutEpoch'));
    console.log('[probe] load; epochKey=' + (key ?? '(none)') + ' value=' + (key ? localStorage.getItem(key) : '-') + ' keys=' + Object.keys(localStorage).length);
    const orig = window.location.reload.bind(window.location);
    Object.defineProperty(window.location, 'reload', { configurable: true, value: () => { console.log('[probe] location.reload() from: ' + String(new Error().stack).split(String.fromCharCode(10)).slice(1, 6).join(' | ')); orig(); } });
    window.addEventListener('beforeunload', () => console.log('[probe] beforeunload'));
  };

  async function run(label: string, opts: Record<string, unknown>, ms: number) {
    const ctx = await browser.newContext(opts as Parameters<typeof browser.newContext>[0]);
    await ctx.addCookies([{ name: 'session_token', value: token, url: BASE }]);
    await ctx.addInitScript(probe);
    const page = await ctx.newPage();
    const errors: string[] = []; const probes: string[] = [];
    let streamOpened = false; let navs = 0;
    page.on('console', (m) => {
      const t = m.text();
      if (t.startsWith('[probe]')) probes.push(t.slice(0, 600));
      else if (m.type() === 'error') errors.push('[console.error] ' + t.slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message.slice(0, 400) + NL + String(e.stack ?? '').split(NL).slice(1, 4).join(NL)));
    page.on('request', (r) => { if (r.url().includes('/stream')) streamOpened = true; });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
    page.on('crash', () => errors.push('[crash]'));
    const t0 = Date.now();
    await page.goto(BASE + '/campaign/' + CAMPAIGN, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(ms);
    const svg = await page.$('svg').catch(() => null);
    console.log(label + ': ' + (Date.now() - t0) + 'ms | navigations=' + navs + ' | stream=' + streamOpened + ' | svg=' + !!svg);
    for (const p of probes) console.log('  ' + p);
    console.log(errors.length ? '  errors (' + errors.length + '):' + NL + '  ' + [...new Set(errors)].slice(0, 10).join(NL + '  ') : '  no console/page errors');
    await ctx.close();
  }

  await run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, 15_000);
  if (process.env.DESKTOP) await run('desktop', { viewport: { width: 1400, height: 900 } }, 12_000);
  await browser.close();
  await prisma.session.deleteMany({ where: { token } });
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
