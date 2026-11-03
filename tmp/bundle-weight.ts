/**
 * How heavy is the campaign page for a phone? Load it headless as the GM, sum every /_next/ response, and time the first
 * API call (the client has booted) and the stream (the canvas is live).
 * Run: cd app && PW_EXE=<chrome.exe> PW_CORE=<playwright-core dir> npx tsx ../tmp/bundle-weight.ts
 */
import crypto from 'node:crypto';
import { prisma } from '../app/src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3000';

async function main() {
  const req = eval('require') as NodeRequire;
  const pw = req(process.env.PW_CORE ?? 'playwright-core') as typeof import('playwright-core');
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3600_000) } });
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'session_token', value: token, url: BASE }]);
  const page = await ctx.newPage();
  let bytes = 0; let scripts = 0; const big: Array<[number, string]> = [];
  const t0 = Date.now(); let firstApi = 0; let stream = 0;
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/_next/')) {
      try { const b = (await r.body()).length; bytes += b; scripts++; big.push([b, u.replace(BASE, '').slice(0, 90)]); } catch { /* streamed */ }
    }
    if (!firstApi && u.includes('/api/') && !u.includes('/stream')) firstApi = Date.now() - t0;
    if (!stream && u.includes('/stream')) stream = Date.now() - t0;
  });
  await page.goto(BASE + '/campaign/' + CAMPAIGN, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(12_000);
  big.sort((a, b) => b[0] - a[0]);
  console.log(`client assets: ${scripts} files, ${(bytes / 1048576).toFixed(1)} MB | first API call at ${firstApi} ms | stream at ${stream} ms`);
  console.log('largest: ' + big.slice(0, 6).map(([b, u]) => `${(b / 1048576).toFixed(1)}MB ${u}`).join(' | '));
  await browser.close();
  await prisma.session.deleteMany({ where: { token } });
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
