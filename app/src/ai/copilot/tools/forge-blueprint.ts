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
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emit } from '@/services/godhead-dispatcher';
import { validateForgeData } from '@/services/forge-schemas';
import { priceBlueprintByType } from '@/services/forge-pricing';
import { getJewlGodHead } from '../jewl-identity';
import { registerJewlTool } from './registry';
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
    'Do NOT use this to apply existing items — only to propose NEW blueprints.',
  inputSchema,
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

    // Stamp both notes into the blueprint body under reserved keys.
    // _proposalNote stays the GM-facing key (Workshop/Panel read it);
    // _chainNote rides to Kai's evaluator with the row.
    const dataWithNote = JSON.stringify({
      ...(JSON.parse(parsed.dataJson) as Record<string, unknown>),
      _proposalNote: parsed.gmNote,
      ...(parsed.chainNote ? { _chainNote: parsed.chainNote } : {}),
    });

    const jewl = await getJewlGodHead();
    const campaignId = ctx.campaignId;

    // Uniqueness guard — ForgeItem has @@unique([campaignId, name, type]).
    // Superseded tombstones don't get to hold name slots (round-5 review,
    // 2026-08-25): rename the tombstone out of the way and proceed.
    const existing = await prisma.forgeItem.findFirst({
      where: { campaignId, name: parsed.name, type: parsed.type },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'superseded') {
        await prisma.forgeItem.update({
          where: { id: existing.id },
          data: { name: `${parsed.name} [w:${existing.id.slice(-4)}]` },
        });
      } else {
        throw new Error(
          `Blueprint already exists for (campaign=${campaignId}, ` +
            `type=${parsed.type}, name=${parsed.name}): ${existing.id}`,
        );
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
