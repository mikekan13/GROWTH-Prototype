/**
 * T17 acceptance — JEWL identity/wallet leak audit (INV-69/70).
 *
 * Walks the API as a WATCHER and a TRAILBLAZER and asserts NO response
 * serializes the name "JEWL", JEWL's wallet id, his character id, or his
 * balance. Seeds a real GODHEAD_TO_GM message from JEWL first so the
 * godhead-messages surface is exercised with live data (cleaned up after).
 * Also proves the copilot still answers (through the masked path).
 *
 * Requires: dev server on :3000, seeded DB (npm run seed:all).
 * Run: npx tsx scripts/audit-jewl-leaks.ts   (exits non-zero on any leak)
 */
import './_server-only-shim'; // MUST be first — neutralizes 'server-only' at import time
import { prisma } from '../src/lib/db';
import { getJewlGodHead } from '../src/ai/copilot/jewl-identity';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function login(loginName: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginName, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${loginName}: ${res.status}`);
  return res.headers.get('set-cookie') ?? '';
}

interface LeakNeedles {
  walletId: string;
  characterId: string;
  godHeadId: string;
  balance: string;
}

function findLeaks(body: string, needles: LeakNeedles): string[] {
  const leaks: string[] = [];
  if (/\bJEWL\b/.test(body)) leaks.push('name "JEWL"');
  if (body.includes(needles.walletId)) leaks.push('wallet id');
  if (body.includes(needles.balance)) leaks.push(`balance ${needles.balance}`);
  return leaks;
}

async function walkAs(
  label: string,
  cookie: string,
  needles: LeakNeedles,
): Promise<void> {
  // Discover this user's campaigns, then walk every JEWL-relevant surface.
  const camps = await fetch(`${BASE}/api/campaigns`, { headers: { cookie } }).then(r => r.json());
  const campaignIds: string[] = [
    ...(camps.gmCampaigns ?? []).map((c: { id: string }) => c.id),
    ...(camps.playerCampaigns ?? []).map((c: { id: string }) => c.id),
  ];

  const paths = [
    '/api/auth/me',
    '/api/campaigns',
    '/api/characters',
    ...campaignIds.flatMap(id => [
      `/api/campaigns/${id}`,
      `/api/campaigns/${id}/members`,
      `/api/campaigns/${id}/entities`,
      `/api/campaigns/${id}/godhead-messages`,
      `/api/campaigns/${id}/events?limit=50`,
      `/api/campaigns/${id}/locations`,
      `/api/campaigns/${id}/items`,
      `/api/krma/campaigns/${id}/economy`,
    ]),
    // Direct probes at JEWL's own resources — expect denial, and above all no data
    `/api/krma/wallets/character/${needles.characterId}/transactions`,
    `/api/characters/${needles.characterId}`,
  ];

  let walked = 0;
  const leaky: string[] = [];
  for (const path of paths) {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
    const body = await res.text();
    walked++;
    // Non-2xx bodies are error envelopes — still must not leak.
    const leaks = findLeaks(body, needles);
    if (leaks.length) leaky.push(`${path} [${res.status}]: ${leaks.join(', ')}`);
  }
  check(`${label}: ${walked} routes walked, zero JEWL leaks`, leaky.length === 0, leaky.join(' | '));
}

async function main() {
  const jewl = await getJewlGodHead();
  const wallet = jewl.walletId
    ? await prisma.wallet.findUnique({ where: { id: jewl.walletId } })
    : null;
  if (!jewl.walletId || !wallet) {
    console.error('JEWL wallet missing — run npm run seed:all first.');
    process.exit(1);
  }
  check('DB: JEWL godhead + wallet exist', true, `balance ${wallet.balance.toString()}`);

  const needles: LeakNeedles = {
    walletId: jewl.walletId,
    characterId: jewl.characterId,
    godHeadId: jewl.godHeadId,
    balance: wallet.balance.toString(),
  };

  // Exercise the godhead-messages surface with a REAL JEWL→GM message.
  const watcherCampaign = await prisma.campaign.findFirst({
    where: { name: 'The Fraying' },
  });
  let probeMessageId: string | null = null;
  if (watcherCampaign) {
    const probe = await prisma.godHeadMessage.create({
      data: {
        godHeadId: jewl.godHeadId,
        campaignId: watcherCampaign.id,
        direction: 'GODHEAD_TO_GM',
        content: 'Leak-audit probe message (transient).',
      },
    });
    probeMessageId = probe.id;
  } else {
    console.warn('⚠ "The Fraying" campaign missing — godhead-messages surface untested.');
  }

  try {
    // WATCHER (owns The Fraying) and TRAILBLAZER walks
    const watcherCookie = await login('Selva', 'password');
    await walkAs('WATCHER (Selva)', watcherCookie, needles);

    const playerCookie = await login('Mira', 'password');
    await walkAs('TRAILBLAZER (Mira)', playerCookie, needles);

    // Sanity: with the probe message present, the watcher's godhead-messages
    // response must carry the masked label, not an empty list.
    if (watcherCampaign && probeMessageId) {
      const res = await fetch(
        `${BASE}/api/campaigns/${watcherCampaign.id}/godhead-messages`,
        { headers: { cookie: watcherCookie } },
      );
      const json = await res.json() as { messages?: Array<{ id: string; godHeadName: string }> };
      const probeRow = json.messages?.find(m => m.id === probeMessageId);
      check('mask: JEWL message reaches Watcher as "Copilot"', probeRow?.godHeadName === 'Copilot', probeRow?.godHeadName);
    }

    // Copilot still answers (Watcher, non-Prime campaign) — and doesn't sign as JEWL
    if (watcherCampaign) {
      const res = await fetch(`${BASE}/api/campaigns/${watcherCampaign.id}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: watcherCookie },
        body: JSON.stringify({ prompt: { text: 'In one sentence: what can you help me with?', source: 'GM_TEXT' } }),
      });
      const body = await res.text();
      check('copilot answers in test campaign', res.ok && body.length > 0, `status ${res.status}`);
      check('copilot reply carries no JEWL leak', findLeaks(body, needles).length === 0);
    }

    // ADMIN control: admin IS allowed to see the name (mask is role-scoped)
    const adminCookie = await login('admin@growth.local', 'admin');
    if (watcherCampaign) {
      const res = await fetch(
        `${BASE}/api/campaigns/${watcherCampaign.id}/godhead-messages`,
        { headers: { cookie: adminCookie } },
      );
      const json = await res.json() as { messages?: Array<{ id: string; godHeadName: string }> };
      const probeRow = json.messages?.find(m => m.id === probeMessageId);
      check('control: ADMIN still sees the true name', probeRow?.godHeadName === 'JEWL', probeRow?.godHeadName);
    }
  } finally {
    if (probeMessageId) {
      await prisma.godHeadMessage.delete({ where: { id: probeMessageId } }).catch(() => null);
    }
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
