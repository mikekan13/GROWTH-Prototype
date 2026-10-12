/**
 * propose_forge_blueprint — JEWL drafts a Forge blueprint and submits it
 * for Kai's evaluation via the existing godhead dispatcher chain.
 *
 * This is JEWL's only creation primitive (for now). He drafts; Kai prices;
 * Et'herling synthesizes; the GM signs off. JEWL does NOT publish directly.
 *
 * See [[forge-vs-jewl-scope-2026-06-07]] (JEWL drafts metaverse content
 * but routes through the chain) and [[forge-chain-recon-2026-06-16]]
 * (the chain is real; this tool is the wiring).
 */

import 'server-only';
import { recomputeCampaignAdultOnlySafe } from '@/services/maturity';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emit } from '@/services/godhead-dispatcher';
import { validateForgeData } from '@/services/forge-schemas';
import { priceBlueprintByType } from '@/services/forge-pricing';
import { getJewlGodHead } from '../jewl-identity';
import { registerJewlTool } from './registry';
import { coerceForgeBlueprintInput, FORGE_BODY_LIMITS } from './forge-blueprint-coerce';
import { ARCHETYPE_LAW, archetypeRejection, checkArchetype, isArchetypeType } from '@/services/block-archetype';
import {
  attachBlockToCharacter,
  findGenesisSession,
  loadArchetypeBans,
  recordArchetypeRejection,
} from '@/services/block-attachment';
import type { JewlTool, JewlToolHandlerResult } from './types';

const FORGE_TYPES = [
  'seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn',
] as const;

const inputSchema = z.object({
  type: z.enum(FORGE_TYPES).describe(
    'Blueprint type. A seed is a character HERITAGE template (what a being ' +
      'is born as); root/branch also shape character creation; skill/item are ' +
      'gameplay primitives; nectar/blossom/thorn are trait variants. There is ' +
      'NO location type — places are not Forge content.',
  ),
  name: z.string().min(1).max(100).describe(
    'Unique within (campaign, type). Use a short, descriptive title.',
  ),
  dataJson: z.string().describe(
    'JSON-encoded blueprint body. Must be valid JSON. Shape varies per type — ' +
      'follow the forge authoring schemas (e.g. skill needs name + governors + description).',
  ),
  // Two notes, two audiences (Mike ruling 2026-08-25): the GM note is
  // NARRATIVE rationale; balance math goes in the chain note for Kai.
  gmNote: z.string().min(1).max(600).describe(
    'GM-facing note — TABLE CRAFT ONLY: why this draft serves the campaign ' +
      '(genre fit, story hooks, how it plays against the other characters). ' +
      'NO KV numbers, anchors, or balance accounting here. Shown on the ' +
      'draft in the Forge panel.',
  ),
  chainNote: z.string().max(600).optional().describe(
    'Godhead-chain note for Kai: grading rationale — anchors compared, KV ' +
      'targets, balance levers, declared-KV justification. Never shown as ' +
      'the primary GM note.',
  ),
  // Two ledgers (2026-08-19 / 2026-10-12): the block is the archetype; the
  // bearer's specifics ride on her link to it.
  characterId: z.string().min(1).max(64).optional().describe(
    'The character this block is for (in a genesis: the [id] in the brief). ' +
      'REQUIRED while a character genesis is building in this campaign.',
  ),
  attachmentStory: z.string().min(1).max(600).optional().describe(
    'REQUIRED with characterId (≤600 chars): the BEARER-SPECIFIC story of this block — ' +
      'who, where, which object, which years. MAY name people and places. Written to ' +
      'the character\'s link to the block, never into the block itself.',
  ),
  localName: z.string().min(1).max(100).optional().describe(
    'Optional NARRATIVE PAINT name for her instance ("Rosemary\'s keepsake") — the block\'s own ' +
      'name stays the archetype ("Silver Butter Knife"). May carry proper nouns.',
  ),
});
// Note: campaignId is taken from the prompt context (the campaign JEWL is
// operating in). Global-catalog promotion is the Forge chain's job — Kai
// evaluates, Et'herling synthesizes, the GM signs off. JEWL never drafts
// directly to the global catalog.

export const proposeForgeBlueprintTool: JewlTool = {
  name: 'propose_forge_blueprint',
  description:
    'Draft a REUSABLE gameplay blueprint (character seed/root/branch, skill, item, ' +
    'trait) and submit it to Kai for evaluation. You are recorded as the author. ' +
    'Kai prices, the GM signs off, then it goes live. Returns the draft id so the ' +
    'GM can review it in the Forge panel. Do NOT use this for world-building — ' +
    'rooms, buildings, places of any kind are Locations: use create_location. ' +
    'Do NOT use this to apply existing items — only to propose NEW blueprints. ' +
    'REUSE FIRST: if a stock or campaign block already fits the archetype, attach_block it ' +
    'with the bearer\'s story instead of drafting a duplicate. ' +
    ARCHETYPE_LAW + ' ' +
    FORGE_BODY_LIMITS,
  inputSchema,
  coerce: coerceForgeBlueprintInput,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    // Validate dataJson parses — fail fast rather than storing garbage.
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(parsed.dataJson) as Record<string, unknown>;
    } catch {
      throw new Error('dataJson must be a valid JSON string');
    }

    // Canonical-shape gate (audit X1, 2026-08-17): drafts must validate
    // against the SAME Zod schemas the Forge chain and seeders use — no
    // more freeform shapes (mechanicalEffects blobs etc.). Violations go
    // back to JEWL with the field list so he can re-author in-shape.
    try {
      validateForgeData(parsed.type, body);
    } catch (e) {
      const issues = e instanceof z.ZodError
        ? e.issues.map(i => {
            const path = i.path.join('.') || '(root)';
            // Zod blames the discriminator for ANY failure inside a union
            // variant (cost a full work cycle 2026-08-27) — decode it.
            const hint = /discriminator|union/i.test(i.code) || /discriminator|union/i.test(i.message)
              ? " (NOTE: effects[] discriminator is kind:'persistent'|'triggered'; this error usually means a field INSIDE the entry is wrong — persistent requires modifiers[≥1]; triggered takes no modifiers; duration units are rounds|hours|days|cycles)"
              : '';
            return `${path}: ${i.message}${hint}`;
          }).join('; ')
        : e instanceof Error ? e.message : String(e);
      throw new Error(
        `Blueprint body does not match the canonical ${parsed.type} schema — ${issues}. ` +
        'Re-author using the schema fields for this type (see CHARACTER GENESIS / BUILDING laws).',
      );
    }

    const campaignId = ctx.campaignId;

    // ARCHETYPE LAW at the boundary (Mike 2026-10-12): Forge content is
    // campaign-agnostic — blocks AND items (NARRATIVE PAINT ruling); the
    // bearer's specifics ride on her instance. Locations aren't forged.
    const archetype = isArchetypeType(parsed.type);
    if (archetype) {
      if (parsed.characterId && !parsed.attachmentStory) {
        throw new Error(
          'attachmentStory is required with characterId — the bearer-specific story of this block ' +
            '(who, where, which object, which years; ≤600 chars). It is written to her link to the block.',
        );
      }
      // Items may be drafted for a room, not a person — only character-layer
      // blocks must name their bearer while a genesis builds.
      if (!parsed.characterId && parsed.type !== 'item') {
        const live = await prisma.dayaWorkSession.findMany({
          where: {
            campaignId,
            status: { in: ['active', 'blocked'] },
            goal: { startsWith: 'Character genesis' },
            OR: [{ stage: null }, { stage: 'BUILDING' }],
          },
          select: { goal: true },
        });
        if (live.length) {
          throw new Error(
            `A character genesis is building in this campaign (${live.map(s => s.goal.split(' — ')[0]).join('; ')}). ` +
              'Pass characterId (the [id] in the brief) and attachmentStory (the bearer\'s specifics) with every block you draft for her.',
          );
        }
      }
      const bans = await loadArchetypeBans(campaignId, parsed.characterId);
      const hits = checkArchetype(parsed.name, body, bans);
      if (hits.length) {
        if (parsed.characterId) {
          await recordArchetypeRejection({
            campaignId,
            characterId: parsed.characterId,
            type: parsed.type,
            name: parsed.name,
            tokens: hits.map(h => h.token),
          });
        }
        throw new Error(archetypeRejection(parsed.name, hits));
      }
    }
    const attachTo = archetype && parsed.characterId && parsed.attachmentStory
      ? { characterId: parsed.characterId, story: parsed.attachmentStory }
      : null;
    const attach = async (forgeItemId: string, origin: string) => {
      if (!attachTo) return null;
      const session = await findGenesisSession(campaignId, attachTo.characterId);
      return attachBlockToCharacter({
        campaignId,
        characterId: attachTo.characterId,
        forgeItemId,
        story: attachTo.story,
        localName: parsed.localName ?? null,
        sessionId: session?.id ?? null,
        origin,
      });
    };

    // Stamp both notes into the blueprint body under reserved keys.
    // _proposalNote stays the GM-facing key (Workshop/Panel read it);
    // _chainNote rides to Kai's evaluator with the row.
    const dataWithNote = JSON.stringify({
      ...(JSON.parse(parsed.dataJson) as Record<string, unknown>),
      _proposalNote: parsed.gmNote,
      ...(parsed.chainNote ? { _chainNote: parsed.chainNote } : {}),
    });

    const jewl = await getJewlGodHead();

    // Uniqueness guard — ForgeItem has @@unique([campaignId, name, type]).
    // Superseded tombstones don't get to hold name slots (round-5 review,
    // 2026-08-25): rename the tombstone out of the way and proceed.
    const existing = await prisma.forgeItem.findFirst({
      where: { campaignId, name: parsed.name, type: parsed.type },
      select: { id: true, status: true },
    });
    const reused = (id: string, source: 'campaign' | 'stock') => ({
      output: {
        id,
        type: parsed.type,
        name: parsed.name,
        reused: true,
        source,
        attachedTo: attachTo?.characterId,
        note: `A ${parsed.type} "${parsed.name}" already exists (${source}) — attached it with the bearer's story instead of drafting a duplicate. ` +
          'If your mechanics genuinely differ, it is a different archetype: give it a distinct, legible name.',
      },
    });
    if (existing) {
      if (existing.status === 'superseded') {
        await prisma.forgeItem.update({
          where: { id: existing.id },
          data: { name: `${parsed.name} [w:${existing.id.slice(-4)}]` },
        });
      } else if (attachTo) {
        // Reuse first, even when drafting: the archetype already exists here.
        await attach(existing.id, `existing campaign ${parsed.type} reused and painted`);
        return reused(existing.id, 'campaign');
      } else {
        throw new Error(
          `Blueprint already exists for (campaign=${campaignId}, ` +
            `type=${parsed.type}, name=${parsed.name}): ${existing.id}`,
        );
      }
    }
    if (attachTo) {
      // Stock already holds this archetype → pull it (free) and attach.
      const stock = await prisma.forgeItem.findFirst({
        where: { isGlobal: true, name: parsed.name, type: parsed.type },
        select: { id: true },
      });
      if (stock) {
        const { pullFromGlobalCatalog } = await import('@/services/forge');
        const copy = await pullFromGlobalCatalog(stock.id, campaignId, ctx.actorId, ctx.actorRole);
        await attach(copy.id, `pulled from stock and painted`);
        return reused(copy.id, 'stock');
      }
    }

    // Pre-price with the locked formulas (audit X2) so the draft reaches
    // the GM with a number on it. This is the SUGGESTION — Kai's
    // evaluate_blueprint supersedes it when the chain runs
    // ([[jewl-suggests-godheads-decide-2026-08-17]]).
    const priced = priceBlueprintByType(parsed.type, body);

    const item = await prisma.forgeItem.create({
      data: {
        type: parsed.type,
        name: parsed.name,
        data: dataWithNote,
        status: 'draft',
        campaignId,
        isGlobal: false,
        createdBy: jewl.characterUserId,
        authorUserId: jewl.characterUserId,
        ...(priced ? { karmicValue: BigInt(Math.round(priced.kv)) } : {}),
        ...(priced ? {
          relationshipTags: JSON.stringify({
            evaluation: {
              evaluator: 'formula (pre-Kai)',
              price: priced.kv,
              breakdown: priced.breakdown,
              frequencyCost: priced.frequencyCost ?? null,
            },
          }),
        } : {}),
      },
    });
    await recomputeCampaignAdultOnlySafe(item.campaignId); // `sexual` → 18+ table (2026-10-12)
    const link = await attach(item.id, `drafted for this character by JEWL`);

    // Chain submission is a PAID step (godhead evaluation costs KRMA), so
    // it's opt-in per campaign (Mike 2026-08-21): aiSettings.forge
    // .autoChainSubmit === true enables auto-dispatch to Kai. Default OFF —
    // drafts sit with their formula price and the GM decides what's worth
    // the chain's fee.
    let autoChainSubmit = false;
    try {
      const campaignSettings = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { aiSettings: true },
      });
      if (campaignSettings?.aiSettings) {
        const parsed = JSON.parse(campaignSettings.aiSettings) as { forge?: { autoChainSubmit?: boolean } };
        autoChainSubmit = parsed.forge?.autoChainSubmit === true;
      }
    } catch { /* malformed settings → default off */ }

    const dispatchResult = autoChainSubmit
      ? await emit('blueprint.submitted', {
          forgeItemId: item.id,
          type: item.type,
          name: item.name,
          campaignId: item.campaignId,
          proposedBy: 'JEWL',
          proposingGodHeadId: jewl.godHeadId,
        })
      : { enqueued: 0, skipped: 1 };

    return {
      output: {
        id: item.id,
        type: item.type,
        name: item.name,
        status: item.status,
        campaignId: item.campaignId,
        isGlobal: item.isGlobal,
        proposedBy: 'JEWL',
        ...(link ? { attachedTo: link.characterId, attachmentId: link.id } : {}),
        ...(priced ? { suggestedKV: priced.kv, kvBreakdown: priced.breakdown } : {}),
        dispatcherEnqueued: dispatchResult.enqueued,
        dispatcherSkipped: dispatchResult.skipped,
        ...(autoChainSubmit ? {} : {
          chainSubmission: 'deferred — auto chain submission is off for this campaign (it costs KRMA); the draft carries the formula price and awaits the GM',
        }),
      },
    };
  },
};

registerJewlTool(proposeForgeBlueprintTool);
