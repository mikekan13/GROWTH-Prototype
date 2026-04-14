import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { canManageCampaign } from '@/lib/permissions';
import { restShort, restLong } from '@/lib/character-actions';
import { createChangeLogEntry } from '@/services/changelog';
import { createCampaignEvent } from '@/services/campaign-event';
import type { GrowthCharacter } from '@/types/growth';
import type { GameEventPayload } from '@/types/terminal';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    // Verify GM permissions
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, gmUserId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      return NextResponse.json({ error: 'Only the GM can grant rests' }, { status: 403 });
    }

    const body = await request.json();
    const { type, characterIds } = body as {
      type: 'short' | 'long';
      characterIds?: string[];
    };

    if (type !== 'short' && type !== 'long') {
      return NextResponse.json({ error: 'type must be "short" or "long"' }, { status: 400 });
    }

    // Fetch characters — either specific ones or all in campaign
    const where = characterIds?.length
      ? { id: { in: characterIds }, campaignId }
      : { campaignId };

    const characters = await prisma.character.findMany({
      where,
      select: { id: true, name: true, data: true },
    });

    if (characters.length === 0) {
      return NextResponse.json({ error: 'No characters found' }, { status: 404 });
    }

    // Apply rest to each character
    const results: Array<{
      characterId: string;
      name: string;
      applied: boolean;
      reason?: string;
      changes: Record<string, { from: number; to: number }>;
    }> = [];

    for (const char of characters) {
      const charData = JSON.parse(char.data) as GrowthCharacter;
      const restFn = type === 'short' ? restShort : restLong;
      const result = restFn(charData);

      if (result.applied) {
        // Save updated character
        await prisma.character.update({
          where: { id: char.id },
          data: { data: JSON.stringify(result.character) },
        });

        // Build changes map for response
        const changesMap: Record<string, { from: number; to: number }> = {};
        for (const change of result.changes) {
          const match = change.match(/^(\w+): (\d+) → (\d+)$/);
          if (match) {
            changesMap[match[1]] = { from: parseInt(match[2]), to: parseInt(match[3]) };
          }
        }

        // Changelog (async, non-blocking)
        createChangeLogEntry({
          campaignId,
          characterId: char.id,
          characterName: char.name,
          actor: 'gm',
          actorUserId: session.user.id,
          source: `${type}_rest`,
          beforeData: charData as unknown as Record<string, unknown>,
          afterData: result.character as unknown as Record<string, unknown>,
        }).catch(() => {});

        results.push({
          characterId: char.id,
          name: char.name,
          applied: true,
          changes: changesMap,
        });
      } else {
        results.push({
          characterId: char.id,
          name: char.name,
          applied: false,
          reason: result.reason,
          changes: {},
        });
      }
    }

    // Create campaign event for the rest
    const appliedNames = results.filter(r => r.applied).map(r => r.name);
    const skippedEntries = results.filter(r => !r.applied).map(r => `${r.name} (${r.reason})`);

    let description = `${type === 'short' ? 'Short' : 'Long'} Rest granted`;
    if (appliedNames.length > 0) {
      description += `: ${appliedNames.join(', ')} restored`;
    }
    if (skippedEntries.length > 0) {
      description += `. Skipped: ${skippedEntries.join(', ')}`;
    }

    const eventPayload: GameEventPayload = {
      kind: 'game_event',
      eventType: type === 'short' ? 'short_rest' : 'long_rest',
      description,
    };

    await createCampaignEvent({
      campaignId,
      type: 'game_event',
      actor: 'gm',
      actorUserId: session.user.id,
      actorName: session.user.username,
      payload: eventPayload,
    });

    return NextResponse.json({ restType: type, results }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
