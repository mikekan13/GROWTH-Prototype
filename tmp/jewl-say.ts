/**
 * Speak to JEWL as the campaign's Watcher through the real copilot route (2026-11-01: Michael handed the prep seat over —
 * "work with him till he gives the outcome we want"). Makes a short-lived session for the GM user, POSTs the line, waits for
 * the reply (a stretch can take minutes) and prints it with the tools he called.
 *
 * Run: cd app && npx tsx ../tmp/jewl-say.ts "<what the Watcher says>"
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { prisma } from '../app/src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const BASE = process.env.GROWTH_BASE ?? 'http://localhost:3000';

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) throw new Error('say something');
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: CAMPAIGN }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3 * 3600_000) } });
  const t0 = Date.now();
  console.log(`→ Watcher: ${text}`);
  // node:http with no timeout: a stretch or a long build can run many minutes; fetch gives up first.
  const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const u = new URL(`${BASE}/api/campaigns/${CAMPAIGN}/copilot`);
    const payload = JSON.stringify({ prompt: { source: 'GM_TEXT', text } });
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), cookie: `session_token=${token}` }, timeout: 0 }, (r) => {
      let data = ''; r.setEncoding('utf8'); r.on('data', (c) => (data += c)); r.on('end', () => resolve({ status: r.statusCode ?? 0, body: data }));
    });
    req.on('error', reject); req.write(payload); req.end();
  });
  const secs = Math.round((Date.now() - t0) / 1000);
  const body = res.body;
  await prisma.session.deleteMany({ where: { token } }).catch(() => undefined);
  if (res.status < 200 || res.status >= 300) { console.log(`✗ ${res.status} after ${secs}s: ${body.slice(0, 600)}`); return; }
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(body); } catch { console.log(body.slice(0, 2000)); return; }
  const calls = (j.toolCalls as Array<{ name: string; input?: unknown; output?: unknown; error?: string }> | undefined) ?? [];
  console.log(`← JEWL (${secs}s, ${calls.length} tool call${calls.length === 1 ? '' : 's'}):`);
  console.log(String(j.message ?? j.text ?? j.reply ?? JSON.stringify(j).slice(0, 1500)));
  for (const c of calls) {
    const inp = JSON.stringify(c.input ?? {});
    const out = c.error ? `ERROR ${c.error}` : JSON.stringify(c.output ?? {});
    console.log(`  • ${c.name} ${inp.slice(0, 300)}${inp.length > 300 ? '…' : ''}\n    → ${out.slice(0, 400)}${out.length > 400 ? '…' : ''}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
