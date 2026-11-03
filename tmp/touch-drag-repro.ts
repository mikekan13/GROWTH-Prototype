/**
 * A finger drags Violet's token: what moves? Trusted touch events through CDP (the canvas tracker ignores synthetic ones),
 * then compare the token, a location folder and the canvas pan before/after.
 * Run: cd app && GROWTH_BASE=http://localhost:3001 PW_EXE=<chrome.exe> PW_CORE=<playwright-core dir> npx tsx ../tmp/touch-drag-repro.ts
 */
import crypto from 'node:crypto';
import { prisma } from '../app/src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3001';

async function main() {
  const req = eval('require') as NodeRequire;
  const pw = req(process.env.PW_CORE ?? 'playwright-core') as typeof import('playwright-core');
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3600_000) } });
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: 'session_token', value: token, url: BASE }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${BASE}/campaign/${CAMPAIGN}`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector(`[data-character-token="${VIOLET}"]`, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const snap = () => page.evaluate((vid) => {
    const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const tok = document.querySelector(`[data-character-token="${vid}"]`);
    const folders = [...document.querySelectorAll('[data-folder-location-id]')].slice(0, 3).map((f) => ({ id: f.getAttribute('data-folder-location-id'), rect: r(f) }));
    const cards = [...document.querySelectorAll('[data-card-wrapper]')].slice(0, 2).map((c) => r(c));
    const svg = document.querySelector('svg');
    const g = svg?.querySelector('g[transform]');
    return { token: r(tok), folders, cards, pan: g?.getAttribute('transform') ?? null, viewBox: svg?.getAttribute('viewBox') ?? null };
  }, VIOLET);

  const before = await snap();
  if (!before.token) { console.log('no token found'); await browser.close(); return; }
  const sx = before.token.x + before.token.w / 2, sy = before.token.y + before.token.h / 2;
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', sx + i * 12, sy + i * 8); await page.waitForTimeout(40); }
  await touch('touchEnd', sx + 120, sy + 80);
  await page.waitForTimeout(1500);
  const after = await snap();

  const moved = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) => (a && b ? `${b.x - a.x},${b.y - a.y}` : '?');
  console.log(`token moved by ${moved(before.token, after.token)} px (finger moved 120,80)`);
  console.log(`folders moved by ${before.folders.map((f, i) => moved(f.rect, after.folders[i]?.rect ?? null)).join(' | ') || '(none found)'}`);
  console.log(`cards moved by ${before.cards.map((c, i) => moved(c, after.cards[i] ?? null)).join(' | ') || '(none found)'}`);
  console.log(`pan before=${before.pan} after=${after.pan}`);
  if (errors.length) console.log('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  await prisma.session.deleteMany({ where: { token } });
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
