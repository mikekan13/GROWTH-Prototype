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

const CLASSIFIER_MIN_INTERVAL_MS = 1_500;
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
export async function maybeFireClassifier(
  ctx: ClassifierActorContext,
): Promise<{ verdict: Verdict; throttled: boolean } | undefined> {
  const now = Date.now();
  const last = lastFireByCampaign.get(ctx.campaignId) ?? 0;
  if (now - last < CLASSIFIER_MIN_INTERVAL_MS) {
    return { verdict: 'silent', throttled: true };
  }
  lastFireByCampaign.set(ctx.campaignId, now);

  let verdict: Verdict = 'silent';
  let reasoning = '';
  try {
    const out = await classify(ctx.campaignId);
    verdict = out.verdict;
    reasoning = out.reasoning;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classifier] failed:', err);
    return { verdict: 'silent', throttled: false };
  }

  // eslint-disable-next-line no-console
  console.log(`[classifier] campaign=${ctx.campaignId} verdict=${verdict}${reasoning ? ` (${reasoning})` : ''}`);

  // Stamp the verdict onto the most recent ambient message so the chip
  // can show why JEWL stayed silent (or fired). Lightweight diagnostic
  // surface — no UI yet, but the data is queryable.
  try {
    const latest = await prisma.copilotMessage.findFirst({
      where: { campaignId: ctx.campaignId, username: '[ambient]' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, actions: true },
    });
    if (latest) {
      let existing: Record<string, unknown> = {};
      try {
        existing = latest.actions ? JSON.parse(latest.actions) : {};
      } catch { /* ignore */ }
      await prisma.copilotMessage.update({
        where: { id: latest.id },
        data: {
          actions: JSON.stringify({
            ...existing,
            classifierVerdict: verdict,
            classifierReasoning: reasoning || undefined,
            classifierAt: new Date().toISOString(),
          }),
        },
      });
    }
  } catch {
    // best-effort diagnostic — don't let it block dispatch
  }

  if (verdict === 'silent') return { verdict, throttled: false };

  const prompt: JewlPrompt = {
    source: 'TABLE_AMBIENT',
    campaignId: ctx.campaignId,
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    actorRole: ctx.actorRole,
    text:
      `Classifier verdict: ${verdict.toUpperCase()}. ` +
      `Review the last ~90s of [ambient] transcripts. Reply, run a tool, voice an NPC, or stay silent (empty output) if the classifier was overeager.`,
  };
  // Fire-and-forget the Sonnet dispatch so the audio-chunk POST can return
  // the verdict immediately. The chip uses the verdict to flip a "thinking"
  // indicator on; the actual reply lands via the 5s history poll.
  void dispatchPrompt(prompt).catch(err => {
    // eslint-disable-next-line no-console
    console.error('[classifier] dispatch failed:', err);
  });
  return { verdict, throttled: false };
}

async function classify(campaignId: string): Promise<{ verdict: Verdict; reasoning: string }> {
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
  if (recent.length === 0) return { verdict: 'silent', reasoning: 'no recent activity' };

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
    'Your job: classify the LATEST [ambient] transcript (the bottommost one)',
    'into ONE of:',
    '',
    '  silent  - the LATEST transcript is genuine silence, table noise, or a',
    '            known Whisper hallucination ("Thank you.", "Thanks for watching.",',
    '            "Bye.", standalone "you", "I", "music", "applause", a list of',
    '            disconnected single proper nouns with no verb/clause, a short',
    '            repeated syllable like "Keter, Kether, Kether").',
    '  react   - the LATEST transcript is real speech with content. Default here.',
    '  act     - the LATEST transcript clearly asks for a tool call (apply damage,',
    '            advance clock, create entity, voice an NPC, move a character).',
    '  proact  - long silence after an unresolved beat that JEWL should check on.',
    '',
    'CRITICAL RULES (apply in this order):',
    '1. Look ONLY at the LATEST [ambient] line. Earlier context is just background.',
    '2. If the latest [ambient] post-dates JEWL\'s last reply AND contains real',
    '   words (a clause, a sentence, a directive), default REACT or ACT.',
    '   "Already replied" suppression applies ONLY when the latest [ambient] is',
    '   a verbatim or near-verbatim repeat of what JEWL just heard.',
    '3. JEWL\'s prior assistant turns are CONTEXT, never grounds for silent. Do',
    '   not classify "GM repeated himself" as silent — assume the GM had a',
    '   reason (often: the UI didn\'t reflect JEWL\'s reply yet).',
    '4. When the GM follows up after JEWL\'s reply (e.g. JEWL asked "who?" and',
    '   the next [ambient] gives a name), that is ALWAYS react or act.',
    '5. Drop silence-hallucinations only when the entire latest line IS the',
    '   hallucination, not when real speech contains a stray hallucinated word.',
    '',
    'OUTPUT FORMAT: one line, verdict word first, optional reason after a colon.',
    '  silent: latest line is just "Thank you."',
    '  react: GM answered the name question ("Valmir")',
    '  act: GM said "advance the clock by an hour"',
    '  proact: 4 min after combat ended, JEWL has not checked in',
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
    max_tokens: 96,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();
  const lower = text.toLowerCase();
  // Capture the optional reason — everything after the first colon.
  const reasonMatch = text.match(/:\s*(.+)$/);
  const reasoning = reasonMatch ? reasonMatch[1].trim() : '';
  let verdict: Verdict = 'silent';
  // Order matters: check 'proact' before 'react' since 'proactive' contains 'react'.
  if (lower.startsWith('proact')) verdict = 'proact';
  else if (lower.startsWith('react')) verdict = 'react';
  else if (lower.startsWith('act')) verdict = 'act';
  else verdict = 'silent';
  return { verdict, reasoning };
}
