/**
 * JEWL autonomous tick — externally-triggered scheduled reasoning pass.
 *
 * Per [[jewl-full-vision-2026-06-14]] JEWL is autonomous and always-on. This
 * endpoint is the scheduler entry point: a cron / Vercel cron / external
 * trigger POSTs here, the route fans out one JEWL_AUTONOMOUS_TICK prompt
 * per eligible campaign, and the runtime processes them like any other
 * prompt source. There is intentionally NO dev-mode setInterval — hot
 * reload leaks intervals across module reloads and creates duplicates.
 *
 * Auth: admin session OR a matching X-Cron-Secret header against
 * `JEWL_CRON_SECRET` env. The secret path is for unattended schedulers.
 *
 * Body:
 *   { campaignId?: string, lookbackMinutes?: number }
 *
 * If campaignId is provided, tick only that campaign. Otherwise tick every
 * campaign that had any CampaignEvent OR CopilotMessage activity in the
 * lookback window (default 60 minutes). Returns the per-campaign outcome.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import type { JewlPrompt } from '@/ai/copilot/prompts/types';
import { ForbiddenError, ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const DEFAULT_LOOKBACK_MIN = 60;
const MAX_LOOKBACK_MIN = 24 * 60;
const MAX_CAMPAIGNS_PER_TICK = 50;
const JEWL_ACTOR_ID = 'jewl';

export async function POST(request: NextRequest) {
  try {
    // Dual auth path: admin session OR matching shared secret. The secret
    // path is what an external scheduler (Vercel cron / Cloudflare / cron-job.org)
    // will use; the admin path is for ad-hoc manual ticks from a console.
    const secretHeader = request.headers.get('x-cron-secret');
    const configuredSecret = process.env.JEWL_CRON_SECRET;
    const secretMatches =
      !!secretHeader && !!configuredSecret && secretHeader === configuredSecret;

    if (!secretMatches) {
      const session = await requireAuth();
      if (!isAdminRole(session.user.role)) {
        throw new ForbiddenError('Admin only');
      }
    }

    const body = await request.json().catch(() => ({})) as {
      campaignId?: string;
      lookbackMinutes?: number;
    };

    const lookbackMin = clampLookback(body.lookbackMinutes);
    const cutoff = new Date(Date.now() - lookbackMin * 60 * 1000);

    const campaignIds = body.campaignId
      ? [body.campaignId]
      : await findEligibleCampaigns(cutoff);

    if (campaignIds.length === 0) {
      return NextResponse.json({ ticked: [], skipped: [], message: 'no eligible campaigns' });
    }
    if (campaignIds.length > MAX_CAMPAIGNS_PER_TICK) {
      throw new ValidationError(
        `Too many campaigns (${campaignIds.length} > ${MAX_CAMPAIGNS_PER_TICK}); narrow with campaignId`,
      );
    }

    // Tick each campaign sequentially. Each tick is fire-and-await; serial
    // is fine at the current scale and avoids piling concurrent Claude
    // calls onto a single shared rate limit. Scale-out is a later concern.
    const ticked: Array<{ campaignId: string; ok: boolean; error?: string }> = [];
    for (const campaignId of campaignIds) {
      try {
        await tickOneCampaign(campaignId, cutoff);
        ticked.push({ campaignId, ok: true });
      } catch (err) {
        ticked.push({
          campaignId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ticked,
      lookbackMinutes: lookbackMin,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function clampLookback(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_LOOKBACK_MIN;
  if (n < 1) return DEFAULT_LOOKBACK_MIN;
  if (n > MAX_LOOKBACK_MIN) return MAX_LOOKBACK_MIN;
  return n;
}

async function findEligibleCampaigns(cutoff: Date): Promise<string[]> {
  // A campaign is eligible if it has had ANY CampaignEvent or CopilotMessage
  // since the cutoff. Two separate queries → set union; cheaper than a
  // single OR across two relations.
  const [events, messages] = await Promise.all([
    prisma.campaignEvent.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { campaignId: true },
      distinct: ['campaignId'],
    }),
    prisma.copilotMessage.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { campaignId: true },
      distinct: ['campaignId'],
    }),
  ]);
  const seen = new Set<string>();
  for (const e of events) seen.add(e.campaignId);
  for (const m of messages) seen.add(m.campaignId);
  return [...seen];
}

async function tickOneCampaign(campaignId: string, cutoff: Date): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, gmUserId: true },
  });
  if (!campaign) throw new ValidationError('Campaign not found');

  // Compose a brief summary of what happened in the lookback window. JEWL
  // reads this as the prompt body and decides whether anything needs his
  // attention (silent reaction is the default — most ticks are uneventful).
  const [eventCount, copilotCount, recentEvents] = await Promise.all([
    prisma.campaignEvent.count({ where: { campaignId, createdAt: { gte: cutoff } } }),
    prisma.copilotMessage.count({ where: { campaignId, createdAt: { gte: cutoff } } }),
    prisma.campaignEvent.findMany({
      where: { campaignId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { type: true, actorName: true, characterName: true, createdAt: true },
    }),
  ]);

  const recentLines = recentEvents
    .map(e => {
      const who = e.characterName ?? e.actorName ?? 'someone';
      return `  ${e.createdAt.toISOString()} · ${e.type} · ${who}`;
    })
    .join('\n');

  const text = [
    `Autonomous tick — campaign "${campaign.name}".`,
    `Lookback window: since ${cutoff.toISOString()} (≈ ${Math.round((Date.now() - cutoff.getTime()) / 60000)} min).`,
    `Activity: ${eventCount} event(s), ${copilotCount} copilot message(s).`,
    recentLines ? `Recent:\n${recentLines}` : `Recent: (none)`,
    ``,
    `Decide whether anything in this window warrants attention. Stay SILENT by default — emit nothing unless you have a substantive observation to record. If you do react, keep it terse.`,
  ].join('\n');

  const prompt: JewlPrompt = {
    source: 'JEWL_AUTONOMOUS_TICK',
    campaignId,
    actorId: JEWL_ACTOR_ID,
    actorName: 'JEWL',
    actorRole: 'GODHEAD',
    text,
  };

  await dispatchPrompt(prompt);
}
