/**
 * Ambient-stream classifier — the cheap pre-filter for JEWL.
 *
 * Per [[jewl-always-on-audio-when-active]] JEWL listens continuously while
 * the GM is on a campaign page. We can't run the expensive Sonnet tool-use
 * loop on every 10-second audio chunk — a 4-hour session would burn cost
 * and noise. Instead, after each chunk we ask a cheap Haiku call:
 *
 *     "Given recent activity, should JEWL react RIGHT NOW?"
 *
 * If the answer is "silent", we do nothing — context piles up in the log
 * for the next decision. If the answer is anything else, we wake the full
 * dispatchPrompt loop, which runs Sonnet with tools and lands a reply in
 * the chat. Cost model (rough):
 *
 *   Haiku classifier per chunk:    ~$0.0004
 *   Sonnet dispatchPrompt when fired: ~$0.006
 *   Whisper per chunk:                ~$0.001
 *
 * Total ≈ $2 for a 4-hour live session. Production-acceptable.
 *
 * The classifier is rate-limited per campaign (default = once every 8s)
 * so a noisy burst of chunks doesn't fire it on every single one.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { dispatchPrompt } from './runtime';
import type { JewlPrompt } from './prompts/types';

const CLASSIFIER_MIN_INTERVAL_MS = 8_000;
const CONTEXT_WINDOW_MS = 90_000; // last 90s of activity feeds the classifier
const MAX_CONTEXT_MESSAGES = 25;

const CLASSIFIER_MODEL =
  process.env.ANTHROPIC_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001';

// In-process throttle keyed by campaign id. Resets when the Next.js process
// restarts, which is fine — over-firing once during a dev hot reload is
// cheap. Production with multiple instances will lean on this loosely.
const lastFireByCampaign = new Map<string, number>();

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  cachedClient = new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_API_URL || undefined });
  return cachedClient;
}

export interface ClassifierActorContext {
  campaignId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
}

type Verdict = 'silent' | 'react' | 'act' | 'proact';

/**
 * Run the classifier if the campaign hasn't been classified recently. If
 * the verdict is anything other than 'silent', dispatch a full JEWL prompt
 * (Sonnet + tools) with source=TABLE_AMBIENT.
 *
 * Safe to call from a fire-and-forget context — all errors land in the
 * console and never throw to the caller.
 */
export async function maybeFireClassifier(ctx: ClassifierActorContext): Promise<void> {
  const now = Date.now();
  const last = lastFireByCampaign.get(ctx.campaignId) ?? 0;
  if (now - last < CLASSIFIER_MIN_INTERVAL_MS) return;
  lastFireByCampaign.set(ctx.campaignId, now);

  let verdict: Verdict = 'silent';
  try {
    verdict = await classify(ctx.campaignId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classifier] failed:', err);
    return;
  }

  if (verdict === 'silent') return;

  const prompt: JewlPrompt = {
    source: 'TABLE_AMBIENT',
    campaignId: ctx.campaignId,
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    actorRole: ctx.actorRole,
    text:
      `Ambient classifier verdict: ${verdict.toUpperCase()}. ` +
      `Review the last ~90s of [ambient] transcripts and recent activity in your conversation history. ` +
      `Decide what to do (reply, run a tool, voice an NPC, log a memory, or — if the classifier was overeager — produce empty output to stay silent).`,
  };
  await dispatchPrompt(prompt);
}

async function classify(campaignId: string): Promise<Verdict> {
  const cutoff = new Date(Date.now() - CONTEXT_WINDOW_MS);
  const recent = await prisma.copilotMessage.findMany({
    where: { campaignId, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: MAX_CONTEXT_MESSAGES,
    select: {
      role: true,
      content: true,
      username: true,
      createdAt: true,
    },
  });
  if (recent.length === 0) return 'silent';

  const lines = recent
    .reverse()
    .map(m => {
      const who = m.role === 'assistant' ? 'JEWL' : (m.username || 'user');
      const ts = m.createdAt.toISOString().slice(11, 19);
      return `[${ts}] ${who}: ${m.content.slice(0, 400)}`;
    })
    .join('\n');

  const system = [
    'You are a cheap pre-filter for a TTRPG copilot named JEWL. JEWL listens',
    'to the table continuously and decides moment-by-moment whether to engage.',
    'Your only job is to classify the most recent activity into ONE of:',
    '',
    '  silent  - nothing meaningful; nobody addressed JEWL; no tool fits; nothing to log.',
    '  react   - the GM or a player said something JEWL should respond to or comment on.',
    '  act     - a tool call is clearly warranted (apply damage, advance clock, create entity, voice an NPC, etc.).',
    '  proact  - the GM hasn\'t asked but JEWL should initiate (continuity gap, missed clock, NPC reaction overdue).',
    '',
    'BE STRICT. Default to silent. JEWL\'s pride depends on not being noisy.',
    '"react" only when someone is asking a question or making a statement that wants a reply.',
    '"act" only when a tool would obviously trigger.',
    '"proact" only when there\'s a real continuity beat the GM forgot.',
    '',
    'OUTPUT EXACTLY ONE WORD on a single line: silent, react, act, or proact. Nothing else.',
  ].join('\n');

  const user = [
    'Recent activity (last ~90s):',
    '',
    lines,
    '',
    'Verdict?',
  ].join('\n');

  const client = getClient();
  const res = await client.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 8,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .toLowerCase()
    .trim();
  if (text.startsWith('react')) return 'react';
  if (text.startsWith('act')) return 'act';
  if (text.startsWith('proact')) return 'proact';
  return 'silent';
}
