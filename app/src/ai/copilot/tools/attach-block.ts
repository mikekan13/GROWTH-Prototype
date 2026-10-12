/**
 * attach_block — reuse first, even when drafting (Mike 2026-10-12: blocks
 * are campaign-agnostic). JEWL attaches an EXISTING block (campaign or stock)
 * to a character with the bearer-specific story, instead of drafting a
 * duplicate archetype. Stock is pulled into the campaign first (free).
 * The story lands on CharacterBlockLink.story — the story ledger of the
 * character's instance ([[story-attachment-two-ledgers-2026-08-19]]).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { attachBlockToCharacter, findGenesisSession, ATTACHMENT_STORY_MAX, LOCAL_NAME_MAX } from '@/services/block-attachment';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const BLOCK_TYPES = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn'] as const;

const inputSchema = z.object({
  characterId: z.string().min(1).max(64).describe('The character the block is for.'),
  block: z.string().min(1).max(200).describe('Block id, or its exact name (this campaign first, then stock).'),
  type: z.enum(BLOCK_TYPES).optional().describe('Disambiguates a name shared across types.'),
  attachmentStory: z.string().min(1).max(ATTACHMENT_STORY_MAX).describe(
    'The bearer-specific story of this block for her (who, where, which object, which years). May name people and places.',
  ),
  localName: z.string().min(1).max(LOCAL_NAME_MAX).optional().describe(
    'Optional local name for her instance ("Rosemary\'s keepsake"); the block keeps its archetype name.',
  ),
});

export const attachBlockTool: JewlTool = {
  name: 'attach_block',
  description:
    'Attach an EXISTING Forge block (this campaign\'s, or stock — pulled free) to a character with ' +
    'her bearer-specific story. Use this BEFORE drafting: if a block already fits the archetype ' +
    '("Raised by Grandmother", "College Degree"), attach it — never draft a duplicate. The block ' +
    'stays generic; attachmentStory carries her specifics.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const ref = p.block.trim();
    const typeWhere = p.type ? { type: p.type } : {};
    let row = await prisma.forgeItem.findFirst({
      where: { campaignId: ctx.campaignId, status: { not: 'superseded' }, OR: [{ id: ref }, { name: ref }], ...typeWhere },
      select: { id: true, name: true, type: true },
    });
    let source: 'campaign' | 'stock' = 'campaign';
    if (!row) {
      const stock = await prisma.forgeItem.findFirst({
        where: { isGlobal: true, OR: [{ id: ref }, { name: ref }], ...typeWhere },
        select: { id: true },
      });
      if (!stock) {
        return { output: { ok: false, reason: `No campaign or stock block "${ref}"${p.type ? ` of type ${p.type}` : ''} — the name must be exact. If none fits, draft a GENERIC one with propose_forge_blueprint.` } };
      }
      const { pullFromGlobalCatalog } = await import('@/services/forge');
      const copy = await pullFromGlobalCatalog(stock.id, ctx.campaignId, ctx.actorId, ctx.actorRole);
      row = { id: copy.id, name: copy.name, type: copy.type };
      source = 'stock';
    }
    const session = await findGenesisSession(ctx.campaignId, p.characterId);
    const link = await attachBlockToCharacter({
      campaignId: ctx.campaignId,
      characterId: p.characterId,
      forgeItemId: row.id,
      story: p.attachmentStory,
      localName: p.localName ?? null,
      sessionId: session?.id ?? null,
      origin: source === 'stock' ? 'pulled from stock and painted' : `existing campaign ${row.type} reused and painted`,
    });
    return {
      output: { ok: true, attachmentId: link.id, blockId: row.id, name: row.name, localName: link.localName, type: row.type, source },
      affected: { characters: [{ id: p.characterId, changes: ['block_attached'] }] },
    };
  },
};

registerJewlTool(attachBlockTool);
