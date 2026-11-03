/**
 * A finger drags Violet's token: what moves? Trusted touch events through CDP (the canvas tracker ignores synthetic ones),
 * then compare the token, a location folder and the canvas pan before/after.
 * Run: cd app && GROWTH_BASE=http://localhost:3001 PW_EXE=<chrome.exe> PW_CORE=<playwright-core dir> npx tsx ../tmp/touch-drag-repro.ts
 */
import crypto from 'node:crypto';
import { prisma } from '../app/src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const DX = Number(process.env.DX ?? 120), DY = Number(process.env.DY ?? 80);
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3001';

setTimeout(() => { console.error('TOTAL TIMEOUT'); process.exit(2); }, 170_000);
async function main() {
  const req = eval('require') as NodeRequire;
  const pw = req(process.env.PW_CORE ?? 'playwright-core') as typeof import('playwright-core');
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3600_000) } });
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: process.env.MODE !== 'mouse', hasTouch: process.env.MODE !== 'mouse' });
  await ctx.addCookies([{ name: 'session_token', value: token, url: BASE }]);
  // Phone opening view centres on the AVERAGE of everyone (Violet is culled): pre-seed a camera centred on her stored spot.
  await ctx.addInitScript(([c, dx, dy]) => { try { if (!localStorage.getItem(`canvas-${c}-camera`)) { localStorage.setItem(`canvas-${c}-camera`, JSON.stringify({ x: 179 - 364 + dx, y: 845 - 646 + dy })); localStorage.setItem(`canvas-${c}-zoom`, '1.4'); } } catch { /* */ } }, [CAMPAIGN, Number(process.env.CAM_DX ?? 0), Number(process.env.CAM_DY ?? 0)] as const);
  await ctx.addInitScript('window.__name = (f) => f;');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { const t = m.text(); if (/settle|reparent|drop|move/i.test(t)) console.log('[console] ' + t.slice(0, 400)); });
  page.on('request', (r) => { if (r.method() !== 'GET' && /api\//.test(r.url())) console.log('[req] ' + r.method() + ' ' + r.url().replace(BASE, '') + ' ' + (r.postData() ?? '').slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${BASE}/campaign/${CAMPAIGN}`, { waitUntil: 'load', timeout: 90_000 });
  await page.waitForSelector(`[data-character-token="${VIOLET}"]`, { timeout: 60_000, state: 'attached' }).catch(async (e) => {
    const info = await page.evaluate(() => ({ url: location.href, vb: [...document.querySelectorAll('svg')].map((s) => s.getAttribute('viewBox') + '@' + Math.round(s.getBoundingClientRect().width)).join(';'), ls: Object.entries(localStorage).map(([k, v]) => k + '=' + String(v).slice(0, 60)).join(' ; '), nsvg: document.querySelectorAll('svg').length, fo: document.querySelectorAll('foreignObject').length, folders: document.querySelectorAll('[data-folder-location-id]').length, toks: [...document.querySelectorAll('[data-character-token]')].map((t) => t.getAttribute('data-character-token')), body: document.body.innerText.slice(0, 200) }));
    console.log('wait failed', JSON.stringify(info)); await page.screenshot({ path: process.env.SHOT ?? 'repro-fail.png' }); throw e;
  });
  await page.waitForTimeout(2500);

  const snap = () => page.evaluate((vid) => {
    const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const tok = document.querySelector(`[data-character-token="${vid}"]`);
    const folders = [...document.querySelectorAll('[data-folder-location-id]')].slice(0, 4).map((f) => ({ id: f.getAttribute('data-folder-location-id'), rect: r(f) }));
    const cards = [...document.querySelectorAll('[data-card-wrapper]')].slice(0, 2).map((c) => r(c));
    const svg = [...document.querySelectorAll('svg')].find((s) => (s as SVGElement).style.touchAction === 'none') ?? null;
    const allFolders = [...document.querySelectorAll('[data-folder-id]')].map((f) => ({ id: f.getAttribute('data-folder-id'), rect: r(f) }));
    const nodes: Record<string, string> = {}; document.querySelectorAll('[data-card-wrapper][data-node-id]').forEach((w) => { const b = w.getBoundingClientRect(); nodes[w.getAttribute('data-node-id') ?? ''] = `${Math.round(b.x)},${Math.round(b.y)}`; });
    return { nodes, token: r(tok), folders: folders.length ? folders : allFolders.slice(0, 4), cards, pan: svg?.getAttribute('viewBox') ?? null, viewBox: svg?.getAttribute('viewBox') ?? null };
  }, VIOLET);

  const SH = process.env.SHOT_DIR; if (SH) await page.screenshot({ path: SH + '/before.png' });
  const before = await snap();
  if (!before.token) { console.log('no token found'); await browser.close(); return; }
  console.log('before.token', JSON.stringify(before.token));
  const sx = before.token.x + before.token.w / 2, sy = before.token.y + before.token.h / 2;
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  if (process.env.MODE === 'mouse') {
    await page.mouse.move(sx, sy); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(sx + i * DX / 10, sy + i * DY / 10); await page.waitForTimeout(40); }
    await page.mouse.up();
  } else {
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', sx + i * DX / 10, sy + i * DY / 10); await page.waitForTimeout(40); }
    await touch('touchEnd', sx + DX, sy + DY);
  }
  await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 1500));
  const after = await snap();
  if (SH) await page.screenshot({ path: SH + '/after.png' });

  const moved = (a: { x: number; y: number } | null, b: { x: number; y: number } | null) => (a && b ? `${b.x - a.x},${b.y - a.y}` : '?');
  console.log(`token moved by ${moved(before.token, after.token)} px (finger moved 120,80)`);
  console.log(`folders moved by ${before.folders.map((f, i) => moved(f.rect, after.folders[i]?.rect ?? null)).join(' | ') || '(none found)'}`);
  console.log(`cards moved by ${before.cards.map((c, i) => moved(c, after.cards[i] ?? null)).join(' | ') || '(none found)'}`);
  const nb = (before as { nodes: Record<string, string> }).nodes, na = (after as { nodes: Record<string, string> }).nodes;
  console.log('nodes appeared/moved: ' + Object.keys({ ...nb, ...na }).filter((k) => nb[k] !== na[k]).map((k) => `${k.slice(-5)}:${nb[k] ?? '-'}->${na[k] ?? '-'}`).join(' | '));
  console.log(`pan before=${before.pan} after=${after.pan}`);
  if (errors.length) console.log('page errors: ' + [...new Set(errors)].join(' | '));
  await browser.close();
  await prisma.session.deleteMany({ where: { token } });
  await prisma.$disconnect(); process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
