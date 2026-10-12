/**
 * Ambient-stream classifier — the gatekeeper in front of JEWL.
 *
 * Per [[jewl-always-on-audio-when-active]] JEWL listens continuously while
 * the GM is on a campaign page. After each chunk the classifier asks:
 *
 *     "Given recent activity, should JEWL react RIGHT NOW?"
 *
 * THE WALL (Mike 2026-10-12): the classifier reads the raw mic transcript —
 * content class 'table' — so it runs on the LOCAL lane only (the Spirit
 * pillar, the gatekeeper), never on Claude. In the same call the local model
 * splits each raw mic line into in-character (fiction) or table talk, and
 * pulls the in-character words out of a mixed line. Split lines are stamped:
 * IC → contentClass 'fiction' + icText; OOC → stays 'table'. Only fiction
 * ever reaches a cloud lane afterwards.
 *
 * No local lane, a local error or a timeout → verdict 'silent' and the rows
 * stay 'table'. There is NO cloud fallback.
 *
 * The classifier is rate-limited per campaign so a noisy burst of chunks
 * doesn't fire it on every single one.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { isWithheldRow } from '@/lib/withheld';
import { dispatchPrompt } from './runtime';
import type { JewlPrompt } from './prompts/types';
import { routedChatText } from '@/ai/network';
import { rowContentClass, AMBIENT_USERNAME } from './content-class';
import {
  CLASSIFIER_SYSTEM,
  buildClassifierUser,
  parseClassifierOutput,
  type Verdict,
  type WindowLine,
} from './classifier-format';

const CLASSIFIER_MIN_INTERVAL_MS = 1_500;
const CONTEXT_WINDOW_MS = 90_000; // last 90s of activity feeds the classifier
const MAX_CONTEXT_MESSAGES = 25;
const MAX_LINE_CHARS = 400;
/** The audio-chunk POST awaits the verdict — cap the local call. */
const CLASSIFIER_TIMEOUT_MS = Number(process.env.CLASSIFIER_LOCAL_TIMEOUT_MS ?? 15_000);

// In-process throttle keyed by campaign id. Resets when the Next.js process
// restarts, which is fine — over-firing once during a dev hot reload is
// cheap. Production with multiple instances will lean on this loosely.
const lastFireByCampaign = new Map<string, number>();

export interface ClassifierActorContext {
  campaignId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
}

/**
 * Run the classifier if the campaign hasn't been classified recently. If
 * the verdict is anything other than 'silent', dispatch a full JEWL prompt
 * with source=TABLE_AMBIENT.
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
    // Never the text — only that the local gate failed (no lane / error / timeout).
    // eslint-disable-next-line no-console
    console.error('[classifier] local gate failed; staying silent:', err instanceof Error ? err.name : 'error');
    return { verdict: 'silent', throttled: false };
  }

  // eslint-disable-next-line no-console
  console.log(`[classifier] campaign=${ctx.campaignId} verdict=${verdict}`);

  // Stamp the verdict onto the most recent ambient message so the chip
  // can show why JEWL stayed silent (or fired). Lightweight diagnostic
  // surface — no UI yet, but the data is queryable.
  try {
    const latest = await prisma.copilotMessage.findFirst({
      where: { campaignId: ctx.campaignId, username: AMBIENT_USERNAME },
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

  // The dispatch text is an instruction to JEWL, not transcript. A cloud
  // lane sees only the in-character lines of the history (runtime filter).
  const prompt: JewlPrompt = {
    source: 'TABLE_AMBIENT',
    campaignId: ctx.campaignId,
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    actorRole: ctx.actorRole,
    text:
      `Classifier verdict: ${verdict.toUpperCase()}. ` +
      `Review the latest in-character lines spoken at the table in the recent history. ` +
      `Reply, run a tool, voice an NPC, or stay silent (empty output) if the classifier was overeager. Stay in character.`,
  };
  // Fire-and-forget the dispatch so the audio-chunk POST can return the
  // verdict immediately; the reply lands via the history poll.
  void dispatchPrompt(prompt).catch(err => {
    // eslint-disable-next-line no-console
    console.error('[classifier] dispatch failed:', err instanceof Error ? err.name : 'error');
  });
  return { verdict, throttled: false };
}

type WindowRow = {
  id: string;
  role: string;
  content: string;
  username: string | null;
  actions: string | null;
  contentClass: string | null;
  createdAt: Date;
};

function actionsOf(row: WindowRow): Record<string, unknown> {
  try { return row.actions ? (JSON.parse(row.actions) as Record<string, unknown>) : {}; } catch { return {}; }
}

/** A raw mic line the local model has not split yet. */
function needsSplit(row: WindowRow): boolean {
  if (row.role !== 'user' || row.username !== AMBIENT_USERNAME) return false;
  const a = actionsOf(row);
  if (a.source !== 'TABLE_AMBIENT' || a.localSplit) return false;
  return rowContentClass(row) === 'table';
}

async function classify(campaignId: string): Promise<{ verdict: Verdict; reasoning: string }> {
  const cutoff = new Date(Date.now() - CONTEXT_WINDOW_MS);
  const recent = (await prisma.copilotMessage.findMany({
    where: { campaignId, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
    take: MAX_CONTEXT_MESSAGES,
    select: { id: true, role: true, content: true, username: true, actions: true, contentClass: true, createdAt: true },
  })).filter((r) => !isWithheldRow(r)) as WindowRow[]; // lawfulness: a withheld line never enters the window
  if (recent.length === 0) return { verdict: 'silent', reasoning: 'no recent activity' };

  const rows = recent.reverse();
  const lines: WindowLine[] = rows.map((m, i) => ({
    n: i + 1,
    who: m.role === 'assistant' ? 'JEWL' : (m.username || 'user'),
    ts: m.createdAt.toISOString().slice(11, 19),
    text: m.content.slice(0, MAX_LINE_CHARS),
    split: needsSplit(m),
  }));
  const splitNs = lines.filter((l) => l.split).map((l) => l.n);

  // Class 'table': raw transcript. route() sends it local or throws — never cloud.
  const res = await routedChatText(
    { caller: 'ambient-classifier', lane: 'local', campaignId, contentClass: 'table' },
    {
      system: CLASSIFIER_SYSTEM,
      user: buildClassifierUser(lines),
      maxTokens: 96 + splitNs.length * 120,
      temperature: 0,
      timeoutMs: CLASSIFIER_TIMEOUT_MS,
    },
  );
  const reading = parseClassifierOutput(res.text, splitNs);

  // Persist the split. IC → fiction + icText (the whole line when the model
  // gave no extraction); OOC → stays table. Best-effort per row.
  const splitAt = new Date().toISOString();
  await Promise.all(lines.filter((l) => l.split).map(async (l) => {
    const row = rows[l.n - 1];
    const s = reading.split.get(l.n) ?? { kind: 'ooc' as const };
    const actions = JSON.stringify({ ...actionsOf(row), localSplit: s.kind, localSplitAt: splitAt, ...(reading.parsed ? {} : { localSplitFallback: true }) });
    try {
      await prisma.copilotMessage.update({
        where: { id: row.id },
        data: s.kind === 'ic'
          ? { contentClass: 'fiction', icText: (s.icText ?? row.content).slice(0, 4000), actions }
          : { contentClass: 'table', actions },
      });
    } catch {
      // the row stays 'table' — the safe side
    }
  }));

  return { verdict: reading.verdict, reasoning: reading.reasoning };
}
